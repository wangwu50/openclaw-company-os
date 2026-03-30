import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getAnyEmployee, getAllEmployees } from "./employees.js";
import {
  findGoalTaskByTitle,
  getEmployeeActiveTasks,
  getEmployeeActivityForActiveGoals,
  getGoalById,
  getGoalTasks,
  insertActivity,
  insertGoalTaskWithMeta,
  insertPendingDecision,
  insertReport,
  markGoalTaskDispatched,
  updateGoalTask,
  updateGoalTaskStatus,
} from "./db.js";

type RunAgentDeps = {
  runEmbeddedPiAgent: (
    params: Record<string, unknown>,
  ) => Promise<{
    payloads?: Array<{ text?: string }>;
    meta?: {
      stopReason?: string;
      pendingToolCalls?: Array<{ id: string; name: string; arguments: string }>;
    };
  }>;
  config: OpenClawConfig;
};

const MAX_TOOL_ITERATIONS = 5;

/** Extract provider + model from the user's configured primary model (e.g. "mify/pa/claude-sonnet-4-6"). */
function resolveAgentModel(config: OpenClawConfig): { provider?: string; model?: string } {
  const primary = (config as unknown as { agents?: { defaults?: { model?: { primary?: string } } } })
    ?.agents?.defaults?.model?.primary;
  if (!primary) return {};
  const slashIdx = primary.indexOf("/");
  if (slashIdx === -1) return { model: primary };
  return { provider: primary.slice(0, slashIdx), model: primary.slice(slashIdx + 1) };
}

// Pattern the LLM outputs when it wants to query a colleague's activity.
// Using XML-style tag so the LLM can place it anywhere in its response text,
// and we detect + execute it locally then re-run with the real data.
// Format: <查同事 id="company-pm"/> or <查同事 id="company-pm" limit="8"/>
const COLLEAGUE_QUERY_RE = /<查同事\s+id="([^"]+)"(?:\s+limit="(\d+)")?\s*\/>/;

// Pattern the LLM outputs when it wants to trigger collaboration with a colleague.
// Format: <触发协作 to="company-eng" task="任务描述"/>
// Only processed at depth=0 to prevent recursive collaboration chains.
const COLLAB_TRIGGER_RE = /<触发协作\s+to="([^"]+)"\s+task="([^"]+)"\s*\/>/;

// Pattern the LLM outputs when it wants to delegate a task directly to a colleague.
// Format: <委托同事 id="company-eng">具体委托内容</委托同事>
// Only processed at depth=0 to prevent recursive delegation chains.
const DELEGATE_COLLEAGUE_RE = /<委托同事\s+id="([^"]+)">([\s\S]*?)<\/委托同事>/;

// Pattern the LLM outputs when it wants to assign a task to a colleague by name/role/id.
// Format: <分配任务给:员工名或ID>任务内容</分配任务给>
// Only processed at depth=0 to prevent recursive assignment chains.
const ASSIGN_TASK_RE = /<分配任务给:([^>]+)>([\s\S]*?)<\/分配任务给>/;

// Pattern the LLM outputs when it wants to submit a multi-option decision request to the CEO.
// Format: <需要决策 options="方案A|方案B|方案C">背景说明</需要决策>
// Only processed at depth=0.
const DECISION_REQUEST_RE = /<需要决策\s+options="([^"]+)">([\s\S]*?)<\/需要决策>/;

function applyTaskStatusFromReply(
  employeeId: string,
  text: string,
  goalId?: number,
): { doneCount: number; inProgressCount: number } {
  let doneCount = 0;
  let inProgressCount = 0;
  for (const [tag, status] of [["任务完成", "done"], ["任务进行中", "in_progress"]] as const) {
    const tagRe = new RegExp(`\\[${tag}[：:](.*?)\\]`, "g");
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(text)) !== null) {
      const keyword = m[1].trim();
      if (!keyword) continue;
      try {
        const task = findGoalTaskByTitle(employeeId, keyword, goalId);
        if (task) {
          updateGoalTaskStatus(task.id, status);
          if (status === "done") doneCount += 1;
          if (status === "in_progress") inProgressCount += 1;
        }
      } catch {
        // non-fatal
      }
    }
  }
  return { doneCount, inProgressCount };
}

function parseDependsOn(task: { depends_on_task_uids?: string | null }): string[] {
  if (!task.depends_on_task_uids) return [];
  try {
    const parsed = JSON.parse(task.depends_on_task_uids) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Run an agent call for a company employee, supporting multi-turn tool use.
 * The employee can call `get_colleague_activity` to look up a peer's recent
 * activity on demand; we execute the tool locally and re-run up to
 * MAX_TOOL_ITERATIONS times before returning the final text.
 *
 * Session key is stable per employee so memory persists across calls.
 */
export async function runEmployeeAgent(
  employeeId: string,
  prompt: string,
  deps: RunAgentDeps,
  onChunk?: (text: string) => void,
  depth = 0,
  goalId?: number,
): Promise<string> {
  const employee = getAnyEmployee(employeeId);
  if (!employee) throw new Error(`Unknown employee: ${employeeId}`);

  const agentDir = join(homedir(), ".openclaw");
  const workspaceDir = goalId !== undefined
    ? join(agentDir, "agents", employeeId, `goal-${goalId}`)
    : join(agentDir, "agents", employeeId);
  const sessionKey = goalId !== undefined
    ? `agent:${employeeId}:goal:${goalId}`
    : `agent:${employeeId}:company`;
  const sessionFile = join(workspaceDir, "sessions.json");
  const scopedGoal = goalId !== undefined ? getGoalById(goalId) : undefined;

  const baseParams = {
    sessionKey,
    agentId: employeeId,
    sessionFile,
    workspaceDir,
    agentDir,
    config: deps.config,
    trigger: "user",
    senderIsOwner: true,
    disableMessageTool: true,
    timeoutMs: 600_000,
    ...resolveAgentModel(deps.config),
    ...(onChunk
      ? {
          onPartialReply: (payload: { text?: string; delta?: string }) => {
            const chunk = payload.delta ?? "";
            if (chunk) onChunk(chunk);
          },
        }
      : {}),
  };

  let currentPrompt = prompt;
  let lastText = "";

  const withGoalScope = (rawPrompt: string): string => {
    if (goalId === undefined) return rawPrompt;
    const taskLines = getEmployeeActiveTasks(employeeId, goalId)
      .map((t) => `- [${t.status}] ${t.title}`)
      .join("\n");
    const goalTitle = scopedGoal?.title ?? `目标#${goalId}`;
    return `【当前目标工作区】
你当前只在这个目标下工作：${goalTitle}（goalId=${goalId}）
请严格围绕该目标回复，不要混入其他目标的任务。
${taskLines ? `你在该目标下的待办：\n${taskLines}\n` : "你在该目标下暂时没有未完成任务。\n"}

【本轮请求】
${rawPrompt}`;
  };

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const result = await deps.runEmbeddedPiAgent({
      ...baseParams,
      sessionId: `company-${randomUUID()}`,
      runId: randomUUID(),
      prompt: withGoalScope(currentPrompt),
    });

    const payloads = result?.payloads ?? [];
    const text = [...payloads].reverse().find((p) => p.text?.trim())?.text ?? "";
    if (text) lastText = text;

    // ① Detect <查同事 id="company-pm"/> tag — LLM autonomously requests colleague data
    const queryMatch = COLLEAGUE_QUERY_RE.exec(lastText);
    if (queryMatch) {
      const colleagueId = queryMatch[1];
      const limit = Math.min(Number(queryMatch[2] ?? "5"), 10);
      const activity = getEmployeeActivityForActiveGoals(colleagueId, limit, goalId);
      const colleague = getAnyEmployee(colleagueId);
      const collegeName = colleague ? `${colleague.name}（${colleague.role}）` : colleagueId;

      const dataBlock =
        activity.length > 0
          ? activity
              .map((a) => `[${a.event_type}] ${a.created_at}\n${a.content}`)
              .join("\n\n---\n\n")
          : `${collegeName} 暂无近期动态`;

      // Feed real data back; same sessionKey carries conversation history
      currentPrompt = `[同事动态] ${collegeName} 的最新 ${limit} 条记录：\n\n${dataBlock}\n\n请基于以上信息继续完成任务。`;
      continue;
    }

    // ② Detect <触发协作 to="TARGET_ID" task="TASK"/> — LLM triggers peer collaboration
    // 仅在 depth=0 时处理，防止被协作方再次触发，形成无限递归
    if (depth === 0) {
      const collabMatch = COLLAB_TRIGGER_RE.exec(lastText);
      if (collabMatch) {
        const targetId = collabMatch[1];
        const task = collabMatch[2];
        const targetEmployee = getAnyEmployee(targetId);

        if (targetEmployee) {
          const sourceName = `${employee.name}（${employee.role}）`;
          const targetName = `${targetEmployee.name}（${targetEmployee.role}）`;
          const collabPrompt = `「${sourceName}」请求协作：${task}\n\n请基于你的职能给出具体建议（3-5句）。`;

          // 记录协作请求到活动日志
          insertActivity(targetId, "task_assigned", `[协作请求] ${sourceName} 邀请协作：${task}`, { goalId, requestedBy: employeeId });

          try {
            const collabReply = await runEmployeeAgent(targetId, collabPrompt, deps, undefined, 1, goalId);
            if (collabReply) {
              insertActivity(targetId, "task_response", `[协作回复] ${targetName}：${collabReply}`, { goalId, requestedBy: employeeId });
              // 将协作回复注入当前员工的下一轮提示
              currentPrompt = `[协作回复] ${targetName} 的回复：\n${collabReply}\n\n请基于以上协作意见继续完成任务。`;
              continue;
            }
          } catch {
            // 协作调用失败时静默跳过，不影响主流程
          }
        }
        // 目标员工不存在或协作失败，视为无标签，退出循环
      }
    }

    // ③ Detect <委托同事 id="TARGET_ID">message</委托同事> — delegate a task directly to a colleague
    // 仅在 depth=0 时处理，防止被委托方再次触发，形成无限递归
    if (depth === 0) {
      const delegateMatch = DELEGATE_COLLEAGUE_RE.exec(lastText);
      if (delegateMatch) {
        const toId = delegateMatch[1];
        const message = delegateMatch[2].trim();
        try {
          const reply = await runEmployeeAgent(toId, message, deps, undefined, 1, goalId);
          if (reply) {
            insertActivity(toId, "task_response", reply, { delegatedBy: employeeId, goalId });
            insertActivity(employeeId, "task_response", `已委托 ${toId}：${message}`, { delegateTo: toId, goalId });
          }
        } catch {
          // 目标员工不存在或调用失败时静默忽略，不影响主流程
        }
        break;
      }
    }

    // ④ Detect <分配任务给:员工名或ID>任务内容</分配任务给> — COO/supervisor assigns task to a colleague
    // 仅在 depth=0 时处理，防止被分配方再次触发，形成无限递归
    // 支持按 id / 名字 / 角色三种方式查找目标员工
    if (depth === 0) {
      const assignMatch = ASSIGN_TASK_RE.exec(lastText);
      if (assignMatch) {
        const targetNameOrId = assignMatch[1].trim();
        const taskContent = assignMatch[2].trim();
        const allEmps = getAllEmployees();
        const targetEmployee =
          allEmps.find((e) => e.id === targetNameOrId) ??
          allEmps.find((e) => e.name === targetNameOrId) ??
          allEmps.find((e) => e.role === targetNameOrId);
        if (targetEmployee) {
          const targetId = targetEmployee.id;
          insertActivity(targetId, "task_assigned", taskContent, { assignedBy: employeeId, goalId });
          try {
            const reply = await runEmployeeAgent(targetId, taskContent, deps, undefined, 1, goalId);
            if (reply) {
              insertActivity(targetId, "task_response", reply, { assignedBy: employeeId, goalId });
            }
          } catch {
            // 目标员工调用失败时静默忽略，不影响主流程
          }
        }
        break;
      }
    }

    // ⑤ Detect <需要决策 options="A|B|C">背景</需要决策> — employee submits multi-option decision request
    // Only processed at depth=0.
    if (depth === 0) {
      const decisionMatch = DECISION_REQUEST_RE.exec(lastText);
      if (decisionMatch) {
        const options = decisionMatch[1].split("|").map((s) => s.trim()).filter(Boolean);
        const background = decisionMatch[2].trim();
        if (options.length >= 2) {
          insertPendingDecision(employeeId, background, options[0], options[1], options, goalId);
          insertActivity(employeeId, "pending_decision", `[待决] ${background}（${options.join(" | ")}）`, { goalId });
        }
        break;
      }
    }

    break; // 无任何工具标签 → 完成
  }

  if (lastText) {
    const status = applyTaskStatusFromReply(employeeId, lastText, goalId);
    if (goalId !== undefined && status.doneCount > 0) {
      void dispatchReadyTasksForGoal(goalId, deps).catch(() => void 0);
    }
  }
  return lastText;
}

export async function dispatchReadyTasksForGoal(
  goalId: number,
  deps: RunAgentDeps,
): Promise<void> {
  const goal = getGoalById(goalId);
  if (!goal) return;
  const tasks = getGoalTasks(goalId);
  if (tasks.length === 0) return;

  const byUid = new Map<string, (typeof tasks)[number]>();
  for (const t of tasks) if (t.task_uid) byUid.set(t.task_uid, t);

  const ready = tasks
    .filter((t) => t.status === "pending" && t.dispatched_at == null)
    .filter((t) => {
      const depsUids = parseDependsOn(t);
      if (depsUids.length === 0) return true;
      return depsUids.every((uid) => byUid.get(uid)?.status === "done");
    })
    .sort((a, b) => (a.sequence - b.sequence) || (a.id - b.id));

  // Sequential by default: one active dispatch at a time.
  const maxParallel = 1;
  for (const task of ready.slice(0, maxParallel)) {
    markGoalTaskDispatched(task.id);
    insertActivity(
      task.employee_id,
      "task_assigned",
      `收到任务：${task.title}（目标：${goal.title}）`,
      { goalId, taskId: task.id, taskUid: task.task_uid, phase: "dispatched" },
    );
    try {
      const prompt = `CEO 下发了目标内任务，请直接产出首版可交付物。

目标：${goal.title}${goal.description ? `\n目标描述：${goal.description}` : ""}
任务：${task.title}
${task.deliverable ? `可交付物：${task.deliverable}` : ""}
${task.done_definition ? `完成标准：${task.done_definition}` : ""}

要求：
1. 直接给出可交付内容，不要只说“我会做”
2. 若有阻塞，使用 [待决] 背景: ... | 选A: ... | 选B: ...
3. 已启动请加 [任务进行中: ${task.title.slice(0, 12)}]
4. 全部完成请加 [任务完成: ${task.title.slice(0, 12)}]`;
      const reply = await runEmployeeAgent(task.employee_id, prompt, deps, undefined, 0, goalId);
      if (reply) {
        insertActivity(task.employee_id, "task_response", reply, { goalId, taskId: task.id, taskUid: task.task_uid });
        try { updateGoalTaskStatus(task.id, "in_progress"); } catch { /* non-fatal */ }
        scheduleFollowUp(task.employee_id, deps, 60 * 1000, 1, goalId);
      }
    } catch {
      // Expose failure by reopening task for manual retry.
      updateGoalTask(task.id, { status: "pending" });
    }
  }
}

/**
 * Run a cron-triggered proactive report for an employee.
 * The result is saved to the reports table.
 */
export async function runEmployeeCron(
  employeeId: string,
  deps: RunAgentDeps,
): Promise<void> {
  const employee = getAnyEmployee(employeeId);
  if (!employee) return;

  // 每个目标单独汇报，避免多目标串上下文
  const activeTasks = getEmployeeActiveTasks(employeeId);
  const grouped = new Map<number, Array<(typeof activeTasks)[number]>>();
  for (const t of activeTasks) {
    if (!grouped.has(t.goal_id)) grouped.set(t.goal_id, []);
    grouped.get(t.goal_id)!.push(t);
  }

  if (grouped.size === 0) {
    try {
      const reply = await runEmployeeAgent(employeeId, employee.cronPrompt, deps);
      if (reply) {
        insertReport(employeeId, reply);
        insertActivity(employeeId, "report", reply);
      }
    } catch {
      // cron failures are silent — will retry next scheduled run
    }
    return;
  }

  for (const [goalId, tasks] of grouped) {
    let prompt = employee.cronPrompt;
    const taskLines = tasks
      .map((t) => `  - [${t.status === "in_progress" ? "进行中" : "待开始"}] ${t.title}`)
      .join("\n");
    prompt += `

你当前有以下待完成任务，请在日报中说明每项任务的最新进展：
${taskLines}

规则：
- 如某项任务已完成，在回复中加 [任务完成: 任务标题关键词]
- 如某项任务正在进行，在回复中加 [任务进行中: 任务标题关键词]
- 如某项任务遇到阻塞需要 CEO 决策，加 [待决] 标记
- 汇报以 [进展汇报] 开头`;

    try {
      const reply = await runEmployeeAgent(employeeId, prompt, deps, undefined, 0, goalId);
      if (reply) {
        insertReport(employeeId, reply, goalId);
        insertActivity(employeeId, "report", reply, { goalId });
      }
    } catch {
      // cron failures are silent — will retry next scheduled run
    }
  }
}

const MAX_FOLLOWUP_ITERATIONS = 6; // safety cap to prevent runaway loops

/**
 * Schedule a follow-up "继续执行" call for an employee.
 * After each response, automatically reschedules if the employee is still working.
 * Stops when: task completed ([任务完成:]), CEO decision needed ([待决]), or max iterations reached.
 */
export function scheduleFollowUp(
  employeeId: string,
  deps: RunAgentDeps,
  delayMs = 2 * 60 * 1000,
  iteration = 1,
  goalId?: number,
): void {
  if (iteration > MAX_FOLLOWUP_ITERATIONS) return;

  setTimeout(() => {
    const followUpPrompt = `基于你当前的任务，产出下一个里程碑的可交付成果。

规则：
- 直接给出内容（文档草稿/分析/方案/列表/代码片段），不要说"我正在..."
- 如果上一步已产出初稿，现在细化或推进下一步
- 遇到需要 CEO 拍板的节点：[待决] 背景: ... | 选A: ... | 选B: ...
- 完成全部任务时加 [任务完成: 关键词]
- 仍在推进时加 [任务进行中: 关键词]`;

    void runEmployeeAgent(employeeId, followUpPrompt, deps, undefined, 0, goalId)
      .then((reply) => {
        if (!reply) return;
        insertReport(employeeId, reply, goalId);
        insertActivity(employeeId, "task_response", reply, { goalId });

        const isDone = reply.includes("[任务完成");
        const isBlocked = reply.includes("[待决]");
        // Continue the work loop if still in progress and not blocked
        if (!isDone && !isBlocked) {
          scheduleFollowUp(employeeId, deps, 2 * 60 * 1000, iteration + 1, goalId);
        }
      })
      .catch(() => void 0);
  }, delayMs);
}

/**
 * Decompose a company goal into per-employee tasks.
 * Runs a one-shot agent call (no persistent session needed).
 */
export async function decomposeGoal(
  goalId: number,
  title: string,
  description: string,
  deps: RunAgentDeps,
): Promise<void> {
  const employees = getAllEmployees();
  const employeeList = employees.map(
    (e) => `- ${e.role} (${e.name}, id=${e.id})`,
  ).join("\n");

  const decompositionPrompt = `你是公司的 AI 目标分解助手。
CEO 设置了以下季度目标：
标题：${title}
${description ? `描述：${description}` : ""}

员工列表：
${employeeList}

请将这个目标分解为“有依赖关系”的执行计划，要求：
1. 每条任务必须可验证，不要泛泛描述
2. 明确依赖：后续任务必须依赖前置任务（不要所有任务都并行）
3. 默认串行推进：尽量只有第一个任务无依赖，其他任务依赖前序任务

按以下 JSON 格式输出（只输出 JSON，不要其他文字）：
{
  "tasks": [
    {
      "uid": "T1",
      "employee_id": "company-pm",
      "title": "任务标题（一句话）",
      "depends_on": [],
      "deliverable": "交付物描述（可检查）",
      "done_definition": "完成定义（可验收）"
    }
  ]
}`;

  // Idempotency guard: avoid duplicate decomposition for the same goal.
  if (getGoalTasks(goalId).length > 0) return;

  const agentDir = join(homedir(), ".openclaw");
  // Use a per-goal workspaceDir so each decomposition starts with a clean context
  // and doesn't inherit growing history from previous goals.
  const workspaceDir = join(agentDir, "agents", "company-decomposer", `goal-${goalId}`);
  const knownEmployeeIds = new Set(employees.map((e) => e.id));
  const result = await deps.runEmbeddedPiAgent({
    sessionId: `decompose-${randomUUID()}`,
    sessionKey: `agent:company-decomposer:goal-${goalId}`,
    agentId: "company-decomposer",
    sessionFile: join(workspaceDir, "sessions.json"),
    workspaceDir,
    agentDir,
    config: deps.config,
    prompt: decompositionPrompt,
    trigger: "user",
    senderIsOwner: true,
    disableMessageTool: true,
    disableTools: true,
    runId: randomUUID(),
    timeoutMs: 120_000, // 2 minutes for decomposition
    ...resolveAgentModel(deps.config),
  });

  // Extract text from payloads (same as runEmployeeAgent)
  const payloads = result?.payloads ?? [];
  const text = [...payloads].reverse().find((p) => p.text?.trim())?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`目标拆解输出非 JSON（goalId=${goalId}）`);
  }

  let parsed: {
    tasks: Array<{
      uid: string;
      employee_id: string;
      title: string;
      depends_on?: string[];
      deliverable?: string;
      done_definition?: string;
    }>;
  };
  try {
    parsed = JSON.parse(match[0]) as {
      tasks: Array<{
        uid: string;
        employee_id: string;
        title: string;
        depends_on?: string[];
        deliverable?: string;
        done_definition?: string;
      }>;
    };
  } catch {
    throw new Error(`目标拆解 JSON 解析失败（goalId=${goalId}）`);
  }

  const unknownEmployeeIds = (parsed.tasks ?? [])
    .map((task) => task.employee_id)
    .filter(Boolean)
    .filter((id) => !knownEmployeeIds.has(id));
  if (unknownEmployeeIds.length > 0) {
    throw new Error(`目标拆解包含未知员工ID: ${[...new Set(unknownEmployeeIds)].join(", ")}`);
  }

  const uidList = (parsed.tasks ?? []).map((task) => task.uid).filter(Boolean);
  const duplicatedUids = uidList.filter((uid, idx) => uidList.indexOf(uid) !== idx);
  if (duplicatedUids.length > 0) {
    throw new Error(`目标拆解任务 UID 重复: ${[...new Set(duplicatedUids)].join(", ")}`);
  }

  const knownUidSet = new Set(uidList);
  const badDeps: string[] = [];
  for (const task of parsed.tasks ?? []) {
    for (const dep of (task.depends_on ?? [])) {
      if (!knownUidSet.has(dep)) badDeps.push(`${task.uid}->${dep}`);
      if (dep === task.uid) badDeps.push(`${task.uid}->${dep}(self)`);
    }
  }
  if (badDeps.length > 0) {
    throw new Error(`目标拆解依赖非法: ${[...new Set(badDeps)].join(", ")}`);
  }

  const plannedTasks: Array<{
    uid: string;
    employee_id: string;
    title: string;
    depends_on: string[];
    deliverable: string;
    done_definition: string;
    sequence: number;
  }> = (parsed.tasks ?? [])
    .filter((task) => Boolean(task.uid && task.employee_id && task.title))
    .filter((task) => knownEmployeeIds.has(task.employee_id))
    .map((task, idx) => ({
      uid: task.uid.trim(),
      employee_id: task.employee_id,
      title: task.title.trim(),
      depends_on: (task.depends_on ?? []).filter(Boolean),
      deliverable: (task.deliverable ?? "").trim() || "提交可评审的一页执行产出",
      done_definition: (task.done_definition ?? "").trim() || "有明确可验收结果并可继续下游任务",
      sequence: idx,
    }));
  if (plannedTasks.length === 0) {
    throw new Error(`目标拆解返回空任务列表（goalId=${goalId}）`);
  }

  for (const task of plannedTasks) {
    insertGoalTaskWithMeta(goalId, task.employee_id, task.title, {
      taskUid: task.uid,
      dependsOnTaskUids: task.depends_on,
      deliverable: task.deliverable,
      doneDefinition: task.done_definition,
      sequence: task.sequence,
    });
  }

  // Start execution by dispatching the first ready tasks (sequential mode by default).
  await dispatchReadyTasksForGoal(goalId, deps);
}

/**
 * Use an AI HR agent to generate a new employee profile from a plain-text description.
 * Returns a partial Employee record (without created_at) as a plain object.
 */
export async function generateEmployeeFromDescription(
  description: string,
  deps: RunAgentDeps,
): Promise<Record<string, string>> {
  const currentEmployees = getAllEmployees();
  const employeeList = currentEmployees.map((e) => `- ${e.role} (${e.name}, id=${e.id})`).join("\n");
  const existingNames = currentEmployees.map((e) => e.name).join("、");
  const existingIds = currentEmployees.map((e) => e.id).join("、");
  const agentDir = join(homedir(), ".openclaw");
  const workspaceDir = join(agentDir, "agents", "company-hr");

  const prompt = `你是公司 HR 助手。根据以下描述，为这个职位生成一个 AI 员工档案。

描述：${description}

现有员工（避免重复角色和名字）：
${employeeList}

⚠️ 重要限制：
- 名字（name字段）不得与以下已有名字重复：${existingNames}
- id不得与以下已有id重复：${existingIds}

输出严格 JSON（不要其他文字）：
{
  "id": "company-{英文简写，如company-designer}",
  "name": "英文名（如 Jamie）",
  "role": "中文职位名（如 设计师）",
  "emoji": "最贴切的单个emoji",
  "accentColor": "#十六进制颜色",
  "systemPrompt": "中文系统提示词，描述这个员工的职责、工作方式、沟通风格（3-5句）",
  "cronSchedule": "cron表达式（工作日某时间，避开9-11点已有员工的时间段）",
  "cronPrompt": "中文，以[进展汇报]开头，定时触发时让员工汇报的内容（一句话）"
}`;

  const result = await deps.runEmbeddedPiAgent({
    sessionId: `hr-${randomUUID()}`,
    sessionKey: `agent:company-hr:generate`,
    agentId: "company-hr",
    sessionFile: join(workspaceDir, "sessions.json"),
    workspaceDir,
    agentDir,
    config: deps.config,
    prompt,
    trigger: "user",
    senderIsOwner: true,
    disableMessageTool: true,
    disableTools: true,
    runId: randomUUID(),
    timeoutMs: 60_000,
    ...resolveAgentModel(deps.config),
  });

  const payloads = result?.payloads ?? [];
  const text = [...payloads].reverse().find((p) => p.text?.trim())?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 未能生成有效员工档案");
  return JSON.parse(match[0]) as Record<string, string>;
}
