import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { handleApiRequest } from "./src/api.js";
import { decomposeGoal, generateEmployeeFromDescription, runEmployeeAgent, runEmployeeCron, scheduleFollowUp } from "./src/agent-runner.js";
import { getAllEmployees, getAnyEmployee } from "./src/employees.js";
import {
  getActiveGoals,
  getDecisions,
  getPendingDecisions,
  insertPendingDecision,
  insertActivity,
  getEmployeeReports,
  findGoalTaskByTitle,
  updateGoalTaskStatus,
} from "./src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic set of all employee agentIds (includes custom employees)
function getEmployeeIds(): Set<string> {
  return new Set(getAllEmployees().map((e) => e.id));
}

export default definePluginEntry({
  id: "company",
  name: "一人公司 OS",
  description: "CEO + AI employee agent system",

  register(api) {
    // ── 1. HTTP routes — SPA + REST API ──────────────────────────────────────

    // Read the gateway token for plugin-level auth check
    const gatewayToken: string | undefined =
      (api.config as unknown as { gateway?: { auth?: { token?: string } } })?.gateway?.auth?.token;

    api.registerHttpRoute({
      path: "/company",
      match: "prefix",
      auth: "plugin",
      handler: async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        // ── Auth check ──────────────────────────────────────────────────────
        // Accept: Authorization header, ?token= query param, or session cookie.
        if (gatewayToken) {
          const authHeader = req.headers["authorization"] ?? "";
          const bearerOk = authHeader === `Bearer ${gatewayToken}`;

          const cookieHeader = req.headers["cookie"] ?? "";
          const cookieOk = cookieHeader
            .split(";")
            .some((c) => c.trim() === `company-session=${gatewayToken}`);

          const queryToken = url.searchParams.get("token");
          if (queryToken === gatewayToken) {
            // Exchange token for session cookie, then redirect to clean URL
            url.searchParams.delete("token");
            const cleanPath = url.pathname + (url.search || "");
            res.writeHead(302, {
              "Set-Cookie": `company-session=${gatewayToken}; Path=/company; HttpOnly; SameSite=Strict`,
              Location: cleanPath || "/company",
            });
            res.end();
            return;
          }

          if (!bearerOk && !cookieOk) {
            res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>认证失败</title></head>` +
              `<body style="font-family:system-ui;padding:40px;background:#1a1a2e;color:#e8e8f0">` +
              `<h2>🔐 需要认证</h2>` +
              `<p>请在 URL 后添加 <code>?token=YOUR_TOKEN</code> 访问。</p>` +
              `<p>例：<code>http://localhost:18789/company?token=${gatewayToken}</code></p>` +
              `</body></html>`,
            );
            return;
          }
        }

        if (url.pathname.startsWith("/company/api/")) {
          // Cast through unknown: the real type takes full RunEmbeddedPiAgentParams
          // but agent-runner only uses a loose subset; the cast is intentional.
          type RunFn = (
            params: Record<string, unknown>,
          ) => Promise<{ payloads?: Array<{ text?: string }> }>;
          const runFn = api.runtime.agent.runEmbeddedPiAgent as unknown as RunFn;
          const agentDeps = { runEmbeddedPiAgent: runFn, config: api.config };

          return handleApiRequest({
            req,
            res,
            runAgent: (employeeId, prompt) => runEmployeeAgent(employeeId, prompt, agentDeps),
            runAgentStream: (employeeId, prompt, onChunk) =>
              runEmployeeAgent(employeeId, prompt, agentDeps, onChunk).then(() => void 0),
            decomposGoal: async (title, description) => {
              const goals = getActiveGoals();
              const goal = goals.find((g) => g.title === title);
              if (!goal) return;
              void decomposeGoal(goal.id, title, description, agentDeps).catch(() => void 0);
            },
            scheduleFollowUp: (employeeId, delayMs) => scheduleFollowUp(employeeId, agentDeps, delayMs),
            generateEmployee: (description) => generateEmployeeFromDescription(description, agentDeps),
          });
        }

        // SPA static assets: serve dist/ if built, otherwise show placeholder
        const uiDistDir = join(__dirname, "ui", "dist");
        const reqPath = url.pathname.replace(/^\/company/, "") || "/";
        const assetPath = join(uiDistDir, reqPath === "/" ? "index.html" : reqPath);

        if (reqPath !== "/" && existsSync(assetPath)) {
          const ext = assetPath.split(".").pop() ?? "";
          const mimeMap: Record<string, string> = {
            js: "application/javascript",
            css: "text/css",
            html: "text/html",
            svg: "image/svg+xml",
            ico: "image/x-icon",
            woff2: "font/woff2",
          };
          res.writeHead(200, {
            "Content-Type": mimeMap[ext] ?? "application/octet-stream",
          });
          res.end(readFileSync(assetPath));
          return;
        }

        // SPA fallback (index.html for all routes)
        const indexPath = join(uiDistDir, "index.html");
        if (existsSync(indexPath)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(readFileSync(indexPath));
          return;
        }

        // Dev placeholder — shown before `pnpm build` in ui/
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(DEV_PLACEHOLDER_HTML);
      },
    });

    // ── 2. before_prompt_build — inject company context into employee runs ───

    api.on("before_prompt_build", async (_event, ctx) => {
      const agentId = ctx?.agentId;
      if (!agentId || !getEmployeeIds().has(agentId)) return;

      const employee = getAnyEmployee(agentId);
      if (!employee) return;

      const goals = getActiveGoals();
      const recentDecisions = getDecisions(5);

      const goalsSummary =
        goals.length > 0
          ? goals.map((g) => `- ${g.title}${g.quarter ? ` (${g.quarter})` : ""}`).join("\n")
          : "（CEO 尚未设置季度目标）";

      const decisionsSummary =
        recentDecisions.length > 0
          ? recentDecisions
              .map((d) => `- [${d.employee_id}] ${d.summary}：${d.choice}`)
              .join("\n")
          : "（暂无历史决策）";

      const pendingByMe = getPendingDecisions().filter(
        (p) => p.employee_id === agentId,
      ).length;

      // Build colleague roster (all employees except self)
      const colleagues = getAllEmployees()
        .filter((e) => e.id !== agentId)
        .map((e) => `- ${e.id}：${e.name}（${e.role}）`)
        .join("\n");

      const appendSystemContext = `
## 你的角色
${employee.systemPrompt}

## 公司当前目标
${goalsSummary}

## CEO 近期决策（供参考）
${decisionsSummary}

## 你发起的待 CEO 决策事项数
${pendingByMe} 项

## 同事名单
${colleagues}

当你需要了解某位同事的最新工作动态时，在回复中任意位置加入 XML 标签：<查同事 id="同事的id"/>
例如：<查同事 id="company-pm"/> 或 <查同事 id="company-eng" limit="8"/>
系统会自动获取并在下一轮对话中提供给你。

## 行为规范
- 如需 CEO 决策，**必须**在回复末尾加 [待决] 标记，格式：[待决] 背景: ... | 选A: ... | 选B: ...
- 只要你在执行任务时遇到需要 CEO 指引才能继续的节点（方向不明确、需要优先级裁定、需要预算审批），都必须主动发 [待决]，不要只在口头上提到"等 CEO 指示"
- 进展汇报以 [进展汇报] 开头
- 紧急事项以 [紧急] 开头
- 回复不超过 5 句（除非 CEO 要求详细）
`;
      return { appendSystemContext };
    });

    // ── 3. llm_output — parse [待决] tags from employee replies ──────────────

    api.on("llm_output", async (event, ctx) => {
      const agentId = ctx?.agentId;
      if (!agentId || !getEmployeeIds().has(agentId)) return;

      const texts = event.assistantTexts ?? [];
      const combined = texts.join("\n");
      if (!combined.includes("[待决]")) return;

      // Parse: [待决] 背景: xxx | 选A: xxx | 选B: xxx
      const match = combined.match(
        /\[待决\]\s*背景:\s*([^|]+)\|?\s*选A:\s*([^|]+)(?:\|?\s*选B:\s*(.+))?/,
      );
      if (!match) return;

      const [, background, optionA, optionB] = match;
      if (!background?.trim() || !optionA?.trim()) return;

      try {
        insertPendingDecision(
          agentId,
          background.trim(),
          optionA.trim(),
          optionB?.trim(),
        );
        const label = optionB?.trim() ? `选A: ${optionA.trim()} | 选B: ${optionB.trim()}` : optionA.trim();
        insertActivity(agentId, "pending_decision", `[待决] ${background.trim()}（${label}）`);
      } catch {
        // non-fatal
      }

      // Parse task status updates: [任务完成: keyword] and [任务进行中: keyword]
      for (const [tag, status] of [["任务完成", "done"], ["任务进行中", "in_progress"]] as const) {
        const tagRe = new RegExp(`\\[${tag}[：:](.*?)\\]`, "g");
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(combined)) !== null) {
          const keyword = m[1].trim();
          if (!keyword) continue;
          try {
            const task = findGoalTaskByTitle(agentId, keyword);
            if (task) updateGoalTaskStatus(task.id, status);
          } catch {
            // non-fatal
          }
        }
      }
    });

    // ── 4. gateway_start — log startup + start cron scheduler ─────────────────

    api.on("gateway_start", async (_event) => {
      api.logger?.info("[company] 一人公司 OS initialized");

      type RunFn2 = (params: Record<string, unknown>) => Promise<{ payloads?: Array<{ text?: string }> }>;
      const runFn2 = api.runtime.agent.runEmbeddedPiAgent as unknown as RunFn2;
      const agentDeps = { runEmbeddedPiAgent: runFn2, config: api.config };

      // Track last-fired minute per employee to avoid double-firing
      const lastFired: Record<string, string> = {};

      // Scheduled cron: check every minute, fire when time matches
      setInterval(() => {
        const now = new Date();
        for (const emp of getAllEmployees()) {
          if (!matchesCronNow(emp.cronSchedule, now)) continue;
          const key = `${emp.id}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
          if (lastFired[emp.id] === key) continue;
          lastFired[emp.id] = key;
          api.logger?.info(`[company] cron fire: ${emp.id}`);
          void runEmployeeCron(emp.id, agentDeps).catch(() => void 0);
        }
      }, 60_000); // check every minute

      // Startup one-shot: fire each employee's cron staggered after boot
      // so the CEO sees proactive reports without waiting for scheduled times.
      // Only fires if the employee hasn't reported in the last 6 hours.
      // Stagger by 45s per employee to avoid lane saturation.
      getAllEmployees().forEach((emp, i) => {
        setTimeout(() => {
          const recent = getEmployeeReports(emp.id, 1);
          if (recent.length > 0) {
            const lastMs = Date.now() - new Date(recent[0].created_at.includes("T") ? recent[0].created_at : recent[0].created_at.replace(" ", "T") + "Z").getTime();
            if (lastMs < 6 * 60 * 60 * 1000) return; // reported within 6h, skip
          }
          api.logger?.info(`[company] startup cron fire: ${emp.id}`);
          void runEmployeeCron(emp.id, agentDeps).catch(() => void 0);
        }, (i + 1) * 45_000); // 45s, 90s, 135s, 180s, 225s
      });
    });

  },
});

/**
 * Minimal cron expression matcher for the subset used by employees:
 *   "MIN HOUR * * DOW"  (DOW can be a number or range like "1-5")
 * Returns true when `now` matches the expression (exact minute + hour + day-of-week).
 */
function matchesCronNow(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minPart, hourPart, , , dowPart] = parts;

  const nowMin = now.getMinutes();
  const nowHour = now.getHours();
  const nowDow = now.getDay(); // 0=Sun … 6=Sat

  const matchField = (field: string, value: number): boolean => {
    if (field === "*") return true;
    if (field.includes("-")) {
      const [lo, hi] = field.split("-").map(Number);
      return value >= lo && value <= hi;
    }
    if (field.includes(",")) {
      return field.split(",").map(Number).includes(value);
    }
    return Number(field) === value;
  };

  return matchField(minPart, nowMin) && matchField(hourPart, nowHour) && matchField(dowPart, nowDow);
}

const DEV_PLACEHOLDER_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>一人公司 OS</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#1a1a2e;color:#e8e8f0;font-family:system-ui,-apple-system,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:20px;padding:32px}
  h1{font-size:28px;font-weight:700}
  .sub{color:#9494b0;font-size:14px;text-align:center;line-height:1.6}
  .links{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:8px}
  a{color:#7b61ff;text-decoration:none;font-size:13px;padding:6px 12px;
    border:1px solid #2a2d4a;border-radius:6px}
  a:hover{background:#2a2d4a}
  code{background:#0f0f1a;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:12px}
</style>
</head>
<body>
<h1>🏢 一人公司 OS</h1>
<p class="sub">后端已启动。UI 尚未构建。<br>
在 <code>extensions/company/ui/</code> 目录下运行 <code>pnpm build</code> 生成 SPA。</p>
<div class="links">
  <a href="/company/api/hall">GET /api/hall</a>
  <a href="/company/api/employees">GET /api/employees</a>
  <a href="/company/api/decisions">GET /api/decisions</a>
</div>
</body>
</html>`;
