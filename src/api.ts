import type { IncomingMessage, ServerResponse } from "node:http";
import {
  deletePendingDecision,
  getActiveGoals,
  getDecisions,
  getDecisionsFiltered,
  getDecisionStats,
  getGoalTasks,
  getPendingDecisions,
  getRecentReports,
  getReportsByDays,
  insertDecision,
  updateDecisionTag,
  insertPendingDecision,
  searchDecisions,
  searchDecisionsByGoal,
  updateGoal,
  deleteGoal,
  insertActivity,
  getRecentActivity,
  updateGoalTaskStatus,
  updateGoalTask,
  insertCustomEmployee,
  deleteCustomEmployee,
  getCustomEmployees,
} from "./db.js";
import { getAllEmployees, getAnyEmployee } from "./employees.js";

const CHIEF_ID = "company-coo";

type RouteContext = {
  req: IncomingMessage;
  res: ServerResponse;
  runAgent: (employeeId: string, prompt: string, goalId?: number, streaming?: boolean) => Promise<string>;
  runAgentStream: (employeeId: string, prompt: string, onChunk: (text: string) => void, goalId?: number) => Promise<void>;
  decomposGoal: (goalId: number, title: string, description: string) => Promise<void>;
  scheduleFollowUp: (employeeId: string, delayMs?: number, goalId?: number) => void;
  generateEmployee: (description: string) => Promise<Record<string, string>>;
};

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export async function handleApiRequest(ctx: RouteContext): Promise<void> {
  const { req, res } = ctx;
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const parseGoalId = (v: string | null): number | undefined => {
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  try {
    // GET /company/api/hall
    if (req.method === "GET" && path === "/company/api/hall") {
      const goalId = parseGoalId(url.searchParams.get("goalId"));
      const goals = getActiveGoals().filter((g) => goalId === undefined || g.id === goalId);
      const goalsWithTasks = goals.map((g) => ({
        ...g,
        tasks: getGoalTasks(g.id),
      }));
      const pending = getPendingDecisions(goalId);
      const reports = getRecentReports(10, goalId);
      const customIds = new Set(getCustomEmployees().map((c) => c.id));
      const employees = getAllEmployees().map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        emoji: e.emoji,
        accentColor: e.accentColor,
        isCustom: customIds.has(e.id),
      }));
      return json(res, { goals: goalsWithTasks, pending, reports, employees });
    }

    // GET /company/api/employees
    if (req.method === "GET" && path === "/company/api/employees") {
      const customIds = new Set(getCustomEmployees().map((c) => c.id));
      return json(res, {
        employees: getAllEmployees().map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          emoji: e.emoji,
          accentColor: e.accentColor,
          isCustom: customIds.has(e.id),
        })),
      });
    }

    // GET /company/api/decisions/stats — 各状态数量汇总（放在 /decisions 之前避免路由歧义）
    if (req.method === "GET" && path === "/company/api/decisions/stats") {
      const goalId = parseGoalId(url.searchParams.get("goalId"));
      return json(res, { stats: getDecisionStats(goalId) });
    }

    // GET /company/api/decisions
    if (req.method === "GET" && path === "/company/api/decisions") {
      const q = url.searchParams.get("q");
      const employee = url.searchParams.get("employee") ?? "";
      const status = url.searchParams.get("status") ?? "";
      const goalId = parseGoalId(url.searchParams.get("goalId"));
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const offset = Number(url.searchParams.get("offset") ?? "0");
      let decisions;
      if (q) {
        decisions = goalId !== undefined ? searchDecisionsByGoal(q, goalId) : searchDecisions(q);
      } else if (employee || status) {
        decisions = getDecisionsFiltered({ employeeId: employee || undefined, status: status || undefined, goalId, limit, offset });
      } else {
        decisions = goalId !== undefined
          ? getDecisionsFiltered({ goalId, limit, offset })
          : getDecisions(limit, offset);
      }
      return json(res, { decisions });
    }

    // POST /company/api/decisions — CEO makes a decision
    if (req.method === "POST" && path === "/company/api/decisions") {
      const body = await parseBody(req);
      const { pendingId, employeeId, summary, choice, context } = body as {
        pendingId?: number;
        employeeId: string;
        summary: string;
        choice: string;
        context?: string;
        goalId?: number;
      };
      if (!employeeId || !summary || !choice) {
        return json(res, { error: "employeeId, summary, choice are required" }, 400);
      }
      // Remove from pending list
      if (pendingId) deletePendingDecision(pendingId);
      // Record in ledger
      const decision = insertDecision(employeeId, summary, choice, context, goalId);
      // Immediately log the decision so user sees feedback right away
      const employee = getAnyEmployee(employeeId);
      const empName = employee?.name ?? employeeId;
      insertActivity(
        employeeId,
        "decision_received",
        `CEO 确认了决策：${summary}\n👉 选择：${choice}${context ? `\n补充：${context}` : ""}`,
        { summary, choice, phase: "confirmed", goalId },
      );
      // Notify the employee async — use setImmediate to detach from HTTP handler
      // so the response returns instantly without competing for the agent lane
      if (employee) {
        const notifyPrompt = `CEO 对你发起的请求做出了决策。
决策摘要：${summary}
CEO 的选择：${choice}
${context ? `附加说明：${context}` : ""}
请确认收到并说明你的下一步行动计划（2-3 句话）。`;
        setImmediate(() => {
          void ctx.runAgent(employeeId, notifyPrompt, goalId).then((reply) => {
            if (reply) {
              insertActivity(employeeId, "task_response", `${empName} 回复：${reply}`, { summary, choice, phase: "response", goalId });
              // Employee acknowledged → mark as in_progress
              updateDecisionTag(decision.id, "in_progress");
              // Schedule follow-up so employee actually executes instead of just acknowledging
              ctx.scheduleFollowUp(employeeId, 60 * 1000, goalId);
            }
          }).catch(() => void 0);
        });
      }
      return json(res, { decision });
    }

    // POST /company/api/decisions/pending — employee files a decision request
    if (req.method === "POST" && path === "/company/api/decisions/pending") {
      const body = await parseBody(req);
      const { employeeId, background, optionA, optionB, options } = body as {
        employeeId: string;
        background: string;
        optionA: string;
        optionB?: string;
        options?: string[];
        goalId?: number;
      };
      if (!employeeId || !background || !optionA) {
        return json(res, { error: "employeeId, background, optionA are required" }, 400);
      }
      const pending = insertPendingDecision(employeeId, background, optionA, optionB, options, goalId);
      // Log to activity
      const label = options && options.length >= 2 ? options.join(" | ") : (optionB ? `选A: ${optionA} | 选B: ${optionB}` : optionA);
      insertActivity(employeeId, "pending_decision", `[待决] ${background}（${label}）`, { goalId });
      return json(res, { pending });
    }

    // GET /company/api/reports — 返回员工汇报记录；支持 days（按时间范围）或 limit（按数量）
    if (req.method === "GET" && path === "/company/api/reports") {
      const goalId = parseGoalId(url.searchParams.get("goalId"));
      if (url.searchParams.has("days")) {
        const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "7"), 1), 30);
        const reports = getReportsByDays(days, goalId);
        return json(res, { reports });
      }
      const limit = Number(url.searchParams.get("limit") ?? "30");
      const reports = getRecentReports(limit, goalId);
      return json(res, { reports });
    }

    // GET /company/api/activity
    if (req.method === "GET" && path === "/company/api/activity") {
      const goalId = parseGoalId(url.searchParams.get("goalId"));
      const limit = Number(url.searchParams.get("limit") ?? "60");
      const activity = getRecentActivity(limit, goalId);
      return json(res, { activity });
    }

    // POST /company/api/chat/:employeeId/stream — streaming SSE chat
    if (req.method === "POST" && path.match(/^\/company\/api\/chat\/[^/]+\/stream$/)) {
      const employeeId = path.slice("/company/api/chat/".length).replace("/stream", "");
      const employee = getAnyEmployee(employeeId);
      if (!employee) {
        return json(res, { error: `Unknown employee: ${employeeId}` }, 404);
      }
      if (employeeId !== CHIEF_ID) {
        return json(res, { error: "仅支持与总指挥AI直接对话，请使用 company-coo" }, 403);
      }
      const body = await parseBody(req);
      const { message, goalId } = body as { message: string; goalId?: number };
      if (!message) {
        return json(res, { error: "message is required" }, 400);
      }

      // SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const write = (event: string, data: string) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        await ctx.runAgentStream(employeeId, message, (chunk) => {
          write("chunk", chunk);
        }, goalId);
        write("done", "");
      } catch (err) {
        write("error", err instanceof Error ? err.message : String(err));
      }
      res.end();
      return;
    }

    // POST /company/api/chat/:employeeId — CEO sends a message to an employee
    if (req.method === "POST" && path.startsWith("/company/api/chat/")) {
      const employeeId = path.slice("/company/api/chat/".length);
      const employee = getAnyEmployee(employeeId);
      if (!employee) {
        return json(res, { error: `Unknown employee: ${employeeId}` }, 404);
      }
      if (employeeId !== CHIEF_ID) {
        return json(res, { error: "仅支持与总指挥AI直接对话，请使用 company-coo" }, 403);
      }
      const body = await parseBody(req);
      const { message, goalId } = body as { message: string; goalId?: number };
      if (!message) {
        return json(res, { error: "message is required" }, 400);
      }
      const reply = await ctx.runAgent(employeeId, message, goalId);
      return json(res, { reply });
    }

    // POST /company/api/goals — CEO sets a goal and triggers decomposition
    if (req.method === "POST" && path === "/company/api/goals") {
      const body = await parseBody(req);
      const { title, description, quarter } = body as {
        title: string;
        description?: string;
        quarter?: string;
      };
      if (!title) {
        return json(res, { error: "title is required" }, 400);
      }
      const { insertGoal } = await import("./db.js");
      const goal = insertGoal(title, description ?? "", quarter ?? "");
      // Trigger async goal decomposition — don't await
      void ctx.decomposGoal(goal.id, goal.title, goal.description ?? "").catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[company] goal decomposition failed goalId=${goal.id}: ${msg}`);
        const background = `目标「${goal.title}」拆解失败：${msg}`;
        insertPendingDecision(
          "company-coo",
          background,
          "点击「重新拆解任务」重试",
          "检查模型配置/网络后重试",
          ["点击「重新拆解任务」重试", "检查模型配置/网络后重试"],
          goal.id,
        );
        insertActivity("company-coo", "pending_decision", `[待决] ${background}`, { goalId: goal.id, phase: "decompose_error" });
      });
      return json(res, { goal, message: "目标已设置，AI 正在拆解任务..." });
    }

    // POST /company/api/goals/:id/decompose — rerun decomposition for an existing goal
    if (req.method === "POST" && /^\/company\/api\/goals\/\d+\/decompose$/.test(path)) {
      const id = Number(path.split("/")[4]);
      const goal = getActiveGoals().find((g) => g.id === id);
      if (!goal) return json(res, { error: "Goal not found" }, 404);
      try {
        await ctx.decomposGoal(goal.id, goal.title, goal.description ?? "");
        return json(res, { ok: true, message: "重拆解成功" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[company] manual decomposition failed goalId=${goal.id}: ${msg}`);
        return json(res, { error: `重拆解失败：${msg}` }, 500);
      }
    }

    // PATCH /company/api/goals/:id — update a goal
    if (req.method === "PATCH" && /^\/company\/api\/goals\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const { title, description, quarter } = body as {
        title?: string;
        description?: string;
        quarter?: string;
      };
      const goals = getActiveGoals();
      const existing = goals.find((g) => g.id === id);
      if (!existing) return json(res, { error: "Goal not found" }, 404);
      const updated = updateGoal(
        id,
        title ?? existing.title,
        description ?? existing.description ?? "",
        quarter ?? existing.quarter,
      );
      return json(res, { goal: updated });
    }

    // DELETE /company/api/goals/:id — delete a goal
    if (req.method === "DELETE" && /^\/company\/api\/goals\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop());
      deleteGoal(id);
      return json(res, { ok: true });
    }

    // PATCH /company/api/tasks/:id — update task status / deadline / priority / extraGoalIds
    if (req.method === "PATCH" && /^\/company\/api\/tasks\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const { status, deadline, priority, extraGoalIds } = body as {
        status?: "pending" | "in_progress" | "done";
        deadline?: string | null;
        priority?: string;
        extraGoalIds?: unknown;
      };
      if (status !== undefined && !["pending", "in_progress", "done"].includes(status)) {
        return json(res, { error: "status must be pending | in_progress | done" }, 400);
      }
      if (priority !== undefined && !["low", "normal", "high"].includes(priority)) {
        return json(res, { error: "priority must be low | normal | high" }, 400);
      }
      if (extraGoalIds !== undefined && extraGoalIds !== null) {
        if (!Array.isArray(extraGoalIds) || !(extraGoalIds as unknown[]).every((x) => typeof x === "number")) {
          return json(res, { error: "extraGoalIds must be an array of numbers or null" }, 400);
        }
      }
      updateGoalTask(id, {
        ...(status !== undefined && { status }),
        ...(deadline !== undefined && { deadline }),
        ...(priority !== undefined && { priority: priority as "low" | "normal" | "high" }),
        ...(extraGoalIds !== undefined && { extraGoalIds: extraGoalIds === null ? null : (extraGoalIds as number[]) }),
      });
      return json(res, { ok: true });
    }

    // POST /company/api/employees/generate — AI generates employee from description
    if (req.method === "POST" && path === "/company/api/employees/generate") {
      const body = await parseBody(req);
      const { description } = body as { description: string };
      if (!description) return json(res, { error: "description is required" }, 400);
      const generated = await ctx.generateEmployee(description);
      return json(res, { employee: generated });
    }

    // POST /company/api/employees — save a custom employee
    if (req.method === "POST" && path === "/company/api/employees") {
      const body = await parseBody(req);
      const { id, name, role, emoji, accentColor, systemPrompt, cronSchedule, cronPrompt } = body as {
        id: string; name: string; role: string; emoji: string;
        accentColor: string; systemPrompt: string; cronSchedule: string; cronPrompt: string;
      };
      if (!id || !name || !role) return json(res, { error: "id, name, role are required" }, 400);
      insertCustomEmployee({
        id,
        name,
        role,
        emoji: emoji ?? "🤖",
        accent_color: accentColor ?? "#7b61ff",
        system_prompt: systemPrompt ?? "",
        cron_schedule: cronSchedule ?? "0 10 * * 1-5",
        cron_prompt: cronPrompt ?? "",
      });
      // 异步触发入职引导，不阻塞响应
      const onboardingPrompt = `你刚刚加入公司，角色是${role}。请做一个简短的自我介绍（2-3句），并说明你将如何为公司创造价值。以「[入职] 」开头。`;
      setImmediate(() => {
        void ctx.runAgent(id, onboardingPrompt).then((reply) => {
          if (reply) insertActivity(id, "task_response", reply);
        }).catch(() => void 0);
      });
      return json(res, { ok: true });
    }

    // DELETE /company/api/employees/:id — delete a custom employee
    if (req.method === "DELETE" && path.startsWith("/company/api/employees/")) {
      const empId = path.slice("/company/api/employees/".length);
      deleteCustomEmployee(empId);
      return json(res, { ok: true });
    }

    json(res, { error: "Not found" }, 404);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}
