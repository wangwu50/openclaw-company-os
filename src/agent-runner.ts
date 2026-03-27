import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getAnyEmployee, getAllEmployees } from "./employees.js";
import { insertReport, insertActivity, getEmployeeActiveTasks, getEmployeeActivityForActiveGoals, insertPendingDecision } from "./db.js";

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
): Promise<string> {
  const employee = getAnyEmployee(employeeId);
  if (!employee) throw new Error(`Unknown employee: ${employeeId}`);

  const agentDir = join(homedir(), ".openclaw");
  const workspaceDir = join(agentDir, "agents", employeeId);
  const sessionKey = `agent:${employeeId}:company`;
  const sessionFile = join(workspaceDir, "sessions.json");

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

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const result = await deps.runEmbeddedPiAgent({
      ...baseParams,
      sessionId: `company-${randomUUID()}`,
      runId: randomUUID(),
      prompt: currentPrompt,
    });

    const payloads = result?.payloads ?? [];
    const text = [...payloads].reverse().find((p) => p.text?.trim())?.text ?? "";
    if (text) lastText = text;

    // ① Detect <查同事 id="company-pm"/> tag — LLM autonomously requests colleague data
    const queryMatch = COLLEAGUE_QUERY_RE.exec(lastText);
    if (queryMatch) {
      const colleagueId = queryMatch[1];
      const limit = Math.min(Number(queryMatch[2] ?? "5"), 10);
      const activity = getEmployeeActivityForActiveGoals(colleagueId, limit);
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
          insertActivity(targetId, "task_assigned", `[协作请求] ${sourceName} 邀请协作：${task}`);

          try {
            const collabReply = await runEmployeeAgent(targetId, collabPrompt, deps, undefined, 1);
            if (collabReply) {
              insertActivity(targetId, "task_response", `[协作回复] ${targetName}：${collabReply}`);
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
          const reply = await runEmployeeAgent(toId, message, deps, undefined, 1);
          if (reply) {
            insertActivity(toId, "task_response", reply, { delegatedBy: employeeId });
            insertActivity(employeeId, "task_response", `已委托 ${toId}：${message}`, { delegateTo: toId });
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
          insertActivity(targetId, "task_assigned", taskContent, { assignedBy: employeeId });
          try {
            const reply = await runEmployeeAgent(targetId, taskContent, deps, undefined, 1);
            if (reply) {
              insertActivity(targetId, "task_response", reply, { assignedBy: employeeId });
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
          insertPendingDecision(employeeId, background, options[0], options[1], options);
          insertActivity(employeeId, "pending_decision", `[待决] ${background}（${options.join(" | ")}）`);
        }
        break;
      }
    }

    break; // 无任何工具标签 → 完成
  }

  return lastText;
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

  // Inject current task context so the report is goal-driven
  const activeTasks = getEmployeeActiveTasks(employeeId);
  let prompt = employee.cronPrompt;
  if (activeTasks.length > 0) {
    const taskLines = activeTasks
      .map((t) => `  - [${t.status === "in_progress" ? "进行中" : "待开始"}] ${t.title}（目标：${t.goal_title}）`)
      .join("\n");
    prompt += `

你当前有以下待完成任务，请在日报中说明每项任务的最新进展：
${taskLines}

规则：
- 如某项任务已完成，在回复中加 [任务完成: 任务标题关键词]
- 如某项任务正在进行，在回复中加 [任务进行中: 任务标题关键词]
- 如某项任务遇到阻塞需要 CEO 决策，加 [待决] 标记
- 汇报以 [进展汇报] 开头`;
  }

  try {
    const reply = await runEmployeeAgent(employeeId, prompt, deps);
    if (reply) {
      insertReport(employeeId, reply);
      insertActivity(employeeId, "report", reply);
    }
  } catch {
    // cron failures are silent — will retry next scheduled run
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

    void runEmployeeAgent(employeeId, followUpPrompt, deps)
      .then((reply) => {
        if (!reply) return;
        insertReport(employeeId, reply);
        insertActivity(employeeId, "task_response", reply);

        const isDone = reply.includes("[任务完成");
        const isBlocked = reply.includes("[待决]");
        // Continue the work loop if still in progress and not blocked
        if (!isDone && !isBlocked) {
          scheduleFollowUp(employeeId, deps, 2 * 60 * 1000, iteration + 1);
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
  const employeeList = getAllEmployees().map(
    (e) => `- ${e.role} (${e.name}, id=${e.id})`,
  ).join("\n");

  const decompositionPrompt = `你是公司的 AI 目标分解助手。
CEO 设置了以下季度目标：
标题：${title}
${description ? `描述：${description}` : ""}

员工列表：
${employeeList}

请将这个目标分解为每个员工需要承担的具体任务。
按以下 JSON 格式输出（只输出 JSON，不要其他文字）：
{
  "tasks": [
    { "employee_id": "company-pm", "title": "任务标题（一句话）" },
    { "employee_id": "company-eng", "title": "任务标题" },
    ...
  ]
}`;

  const { insertGoalTask, updateGoalTaskStatus } = await import("./db.js");
  const agentDir = join(homedir(), ".openclaw");
  // Use a per-goal workspaceDir so each decomposition starts with a clean context
  // and doesn't inherit growing history from previous goals.
  const workspaceDir = join(agentDir, "agents", "company-decomposer", `goal-${goalId}`);

  try {
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
    // Extract JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as {
      tasks: Array<{ employee_id: string; title: string }>;
    };
    const insertedTasks: Array<{ employee_id: string; title: string; id: number }> = [];
    for (const task of parsed.tasks ?? []) {
      if (task.employee_id && task.title) {
        const inserted = insertGoalTask(goalId, task.employee_id, task.title);
        insertedTasks.push({ ...task, id: inserted.id });
        // Log the assignment to activity
        insertActivity(task.employee_id, "task_assigned", `收到任务：${task.title}（目标：${title}）`, { goalId, taskTitle: task.title });
      }
    }

    // Notify each assigned employee serially with a delay between calls
    // to avoid saturating the agent lane (all parallel calls compete for lane=main)
    if (insertedTasks.length > 0) {
      void (async () => {
        for (const task of insertedTasks) {
          await new Promise((r) => setTimeout(r, 2_000)); // 2s gap between employees
          try {
            const prompt = `CEO 刚刚设置了新的季度目标，你被分配了一项任务。请立即开始执行并输出第一份可交付成果。

目标：${title}${description ? `\n目标描述：${description}` : ""}
你的任务：${task.title}

要求：
1. 不要只写"我会做"——直接输出你作为${task.employee_id.replace("company-", "")}能立刻产出的内容（草稿、方案、分析、列表等）
2. 哪怕信息不完整，也先给出最佳假设下的初稿，让CEO看到实质内容
3. 如果某个关键方向必须CEO拍板才能继续，在末尾加 [待决] 背景: ... | 选A: ... | 选B: ...
4. 如果已开始执行，加 [任务进行中: ${task.title.substring(0, 10)}]`;
            const reply = await runEmployeeAgent(task.employee_id, prompt, deps);
            if (reply) {
              insertActivity(task.employee_id, "task_response", reply, { goalId, taskTitle: task.title });
              // Employee acknowledged → mark task as in_progress
              try { updateGoalTaskStatus(task.id, "in_progress"); } catch { /* non-fatal */ }
              // Schedule follow-up so employee executes instead of just acknowledging
              scheduleFollowUp(task.employee_id, deps, 60 * 1000);
            }
          } catch {
            // non-fatal
          }
        }
      })();
    }
  } catch {
    // decomposition failure is non-fatal
  }
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
