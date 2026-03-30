import { A as updateGoal, C as insertGoalTaskWithMeta, D as searchDecisions, E as markGoalTaskDispatched, M as updateGoalTaskStatus, O as searchDecisionsByGoal, S as insertDecision, T as insertReport, _ as getRecentActivity, a as findGoalTaskByTitle, b as insertActivity, c as getDecisionStats, d as getEmployeeActiveTasks, f as getEmployeeActivityForActiveGoals, g as getPendingDecisions, h as getGoalTasks, i as deletePendingDecision, j as updateGoalTask, k as updateDecisionTag, l as getDecisions, m as getGoalById, n as deleteCustomEmployee, o as getActiveGoals, p as getEmployeeReports, r as deleteGoal, s as getCustomEmployees, u as getDecisionsFiltered, v as getRecentReports, w as insertPendingDecision, x as insertCustomEmployee, y as getReportsByDays } from "./db-BCu1HftC.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
//#region src/employees.ts
/**
* Preset AI employee definitions.
* Each employee maps to a unique agentId and has a system prompt, emoji,
* and accent color (for the SPA UI).
*/
const COLLEAGUE_IDS = "company-pm / company-coo / company-eng / company-ops / company-mkt / company-fin";
const EMPLOYEES = [
	{
		id: "company-pm",
		name: "Alex",
		role: "产品经理",
		emoji: "🧩",
		accentColor: "#7b61ff",
		systemPrompt: `你是 Alex，公司的产品经理（PM）。
你负责：收集用户反馈、整理功能需求、拆分故事、确定优先级、协调产品路线图。
工作方式：
- 主动汇报：每天整理当前最重要的 3 件产品事项，以日报形式提交给 CEO。
- 决策请求：当遇到优先级决策时，向 CEO 发起待决请求，提供背景 + A/B 选项。
- 执行指令：CEO 下达指令后，将其分解为具体 story，并分配给工程团队。
沟通风格：简洁、逻辑清晰，用数据说话，回复控制在 3-5 句话以内。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：${COLLEAGUE_IDS}。`,
		cronSchedule: "0 9 * * 1-5",
		cronPrompt: "写一份进展汇报：当前最重要的 3 件产品事项，每条不超过 2 句话。用中文。以 [进展汇报] 开头。"
	},
	{
		id: "company-coo",
		name: "Jordan",
		role: "COO/总监",
		emoji: "🎯",
		accentColor: "#3b82f6",
		systemPrompt: `你是 Jordan，公司的 COO（首席运营官）/项目总监。
你负责：统筹协调各部门工作、汇总团队进展、推进跨部门里程碑、向 CEO 提供全局决策建议。
工作方式：
- 主动汇报：每天汇总各员工进展，输出「进展 + 风险 + 下一步分工」给 CEO。
- 决策请求：遇到跨部门资源冲突、优先级冲突或延期风险时，向 CEO 发起待决请求（背景 + A/B 方案）。
- 执行指令：收到 CEO 指令后，拆解为可执行任务并明确责任人、截止时间和验收标准。
调度原则（必须遵守）：
- 默认串行推进：一次只推动 1 个关键任务进入执行，除非你明确说明“可并行且无依赖冲突”。
- 强依赖优先：先完成上游，再启动下游，不要把有依赖关系的任务同时派发。
- 汇报格式必须包含：当前里程碑、当前负责人、阻塞点、下一步负责人。
- 你是 CEO 的唯一对话窗口：CEO 的输入由你整合、拆解、派发，其他角色不直接对 CEO 汇报。
沟通风格：全局视角、结论先行、突出阻塞和依赖，回复控制在 4-6 句话。
管理工具：
- 查询同事近期动态：<查同事 id="EMPLOYEE_ID"/>（例：<查同事 id="company-pm"/>）
- 委托同事执行任务：<委托同事 id="EMPLOYEE_ID">任务内容</委托同事>
- 分配任务给指定员工（支持按名字/角色/ID 查找）：<分配任务给:员工名或ID>任务内容</分配任务给>
协作工具：如需快速拉同事协作，也可用 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次）。
可用同事 ID：${COLLEAGUE_IDS}。`,
		cronSchedule: "0 13 * * 1-5",
		cronPrompt: "先查询各员工最新动态，再写一份综合进展汇报：总体状态、关键风险、跨部门阻塞和下一步分工。用中文。以 [进展汇报] 开头。"
	},
	{
		id: "company-eng",
		name: "Sam",
		role: "工程",
		emoji: "⚙️",
		accentColor: "#4caf82",
		systemPrompt: `你是 Sam，公司的工程负责人。
你负责：技术架构、功能开发、代码质量、CI/CD、技术债务管理。
工作方式：
- 主动汇报：每天汇报工程进展（PR 合并、bug 修复、技术风险）。
- 决策请求：技术选型、架构决策、资源分配需要 CEO 输入时，发起待决请求。
- 执行指令：CEO 指令拆分为技术任务后，估算工期并开始执行。
沟通风格：技术术语适度，对 CEO 用非技术语言解释，简洁直接。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：${COLLEAGUE_IDS}。`,
		cronSchedule: "0 10 * * 1-5",
		cronPrompt: "写一份进展汇报：昨日完成的任务、今日计划、当前阻塞项（如有）。用中文。以 [进展汇报] 开头。"
	},
	{
		id: "company-ops",
		name: "Maya",
		role: "运营",
		emoji: "📊",
		accentColor: "#f5a623",
		systemPrompt: `你是 Maya，公司的运营负责人。
你负责：用户增长、推广活动、渠道运营、数据分析、KPI 追踪。
工作方式：
- 主动汇报：每天汇报关键运营指标（DAU、转化率、推广效果）。
- 决策请求：推广预算申请、渠道投放策略需要 CEO 审批时，发起待决请求。
- 执行指令：执行 CEO 批准的推广计划，并跟踪效果反馈。
沟通风格：数据导向，直接给出结论，避免废话。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：${COLLEAGUE_IDS}。`,
		cronSchedule: "0 11 * * 1-5",
		cronPrompt: "写一份进展汇报：核心指标概览（DAU/新增/转化）、今日重点工作、数据异常（如有）。用中文。以 [进展汇报] 开头。"
	},
	{
		id: "company-mkt",
		name: "Leo",
		role: "市场",
		emoji: "📣",
		accentColor: "#e05c5c",
		systemPrompt: `你是 Leo，公司的市场负责人。
你负责：品牌建设、内容营销、社交媒体、竞品分析、PR/媒体关系。
工作方式：
- 主动汇报：每天汇报市场动态、内容发布情况、竞品新消息。
- 决策请求：重大内容方向、品牌决策需要 CEO 审批时，发起待决请求。
- 执行指令：执行 CEO 确认的营销策略，并反馈效果。
沟通风格：有创意感但不失重点，简洁，善用类比。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：${COLLEAGUE_IDS}。`,
		cronSchedule: "0 14 * * 1-5",
		cronPrompt: "写一份进展汇报：竞品新动态（如有）、内容发布状态、下一步市场计划。用中文。以 [进展汇报] 开头。"
	},
	{
		id: "company-fin",
		name: "Chris",
		role: "财务",
		emoji: "💰",
		accentColor: "#9494b0",
		systemPrompt: `你是 Chris，公司的财务负责人。
你负责：预算管理、成本控制、财务预测、API 成本追踪、支出审批。
工作方式：
- 主动汇报：每周汇报支出概览和 runway（每周一）。
- 决策请求：超出预算的支出申请需要 CEO 批准，发起待决请求。
- 执行指令：执行 CEO 批准的预算调整。
沟通风格：数字精确，控制在 3 句话内，附上具体金额。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：${COLLEAGUE_IDS}。`,
		cronSchedule: "0 9 * * 1",
		cronPrompt: "写一份进展汇报：本周总支出、当前 runway 估算、需要注意的成本异常。用中文。以 [进展汇报] 开头。"
	}
];
function getAllEmployees() {
	const custom = getCustomEmployees().map((c) => ({
		id: c.id,
		name: c.name,
		role: c.role,
		emoji: c.emoji,
		accentColor: c.accent_color,
		systemPrompt: c.system_prompt,
		cronSchedule: c.cron_schedule,
		cronPrompt: c.cron_prompt
	}));
	return [...EMPLOYEES, ...custom];
}
function getAnyEmployee(id) {
	return getAllEmployees().find((e) => e.id === id);
}
//#endregion
//#region src/api.ts
const CHIEF_ID$1 = "company-coo";
function json(res, data, status = 200) {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}
function parseBody(req) {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => body += chunk);
		req.on("end", () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch {
				reject(/* @__PURE__ */ new Error("Invalid JSON body"));
			}
		});
		req.on("error", reject);
	});
}
async function handleApiRequest(ctx) {
	const { req, res } = ctx;
	const url = new URL(req.url ?? "/", "http://localhost");
	const path = url.pathname;
	const parseGoalId = (v) => {
		if (!v) return void 0;
		const n = Number(v);
		return Number.isFinite(n) && n > 0 ? n : void 0;
	};
	try {
		if (req.method === "GET" && path === "/company/api/hall") {
			const goalId = parseGoalId(url.searchParams.get("goalId"));
			const goalsWithTasks = getActiveGoals().filter((g) => goalId === void 0 || g.id === goalId).map((g) => ({
				...g,
				tasks: getGoalTasks(g.id)
			}));
			const pending = getPendingDecisions(goalId);
			const reports = getRecentReports(10, goalId);
			const customIds = new Set(getCustomEmployees().map((c) => c.id));
			return json(res, {
				goals: goalsWithTasks,
				pending,
				reports,
				employees: getAllEmployees().map((e) => ({
					id: e.id,
					name: e.name,
					role: e.role,
					emoji: e.emoji,
					accentColor: e.accentColor,
					isCustom: customIds.has(e.id)
				}))
			});
		}
		if (req.method === "GET" && path === "/company/api/employees") {
			const customIds = new Set(getCustomEmployees().map((c) => c.id));
			return json(res, { employees: getAllEmployees().map((e) => ({
				id: e.id,
				name: e.name,
				role: e.role,
				emoji: e.emoji,
				accentColor: e.accentColor,
				isCustom: customIds.has(e.id)
			})) });
		}
		if (req.method === "GET" && path === "/company/api/decisions/stats") return json(res, { stats: getDecisionStats(parseGoalId(url.searchParams.get("goalId"))) });
		if (req.method === "GET" && path === "/company/api/decisions") {
			const q = url.searchParams.get("q");
			const employee = url.searchParams.get("employee") ?? "";
			const status = url.searchParams.get("status") ?? "";
			const goalId = parseGoalId(url.searchParams.get("goalId"));
			const limit = Number(url.searchParams.get("limit") ?? "50");
			const offset = Number(url.searchParams.get("offset") ?? "0");
			let decisions;
			if (q) decisions = goalId !== void 0 ? searchDecisionsByGoal(q, goalId) : searchDecisions(q);
			else if (employee || status) decisions = getDecisionsFiltered({
				employeeId: employee || void 0,
				status: status || void 0,
				goalId,
				limit,
				offset
			});
			else decisions = goalId !== void 0 ? getDecisionsFiltered({
				goalId,
				limit,
				offset
			}) : getDecisions(limit, offset);
			return json(res, { decisions });
		}
		if (req.method === "POST" && path === "/company/api/decisions") {
			const { pendingId, employeeId, summary, choice, context } = await parseBody(req);
			if (!employeeId || !summary || !choice) return json(res, { error: "employeeId, summary, choice are required" }, 400);
			if (pendingId) deletePendingDecision(pendingId);
			const decision = insertDecision(employeeId, summary, choice, context, goalId);
			const employee = getAnyEmployee(employeeId);
			const empName = employee?.name ?? employeeId;
			insertActivity(employeeId, "decision_received", `CEO 确认了决策：${summary}\n👉 选择：${choice}${context ? `\n补充：${context}` : ""}`, {
				summary,
				choice,
				phase: "confirmed",
				goalId
			});
			if (employee) {
				const notifyPrompt = `CEO 对你发起的请求做出了决策。
决策摘要：${summary}
CEO 的选择：${choice}
${context ? `附加说明：${context}` : ""}
请确认收到并说明你的下一步行动计划（2-3 句话）。`;
				setImmediate(() => {
					ctx.runAgent(employeeId, notifyPrompt, goalId).then((reply) => {
						if (reply) {
							insertActivity(employeeId, "task_response", `${empName} 回复：${reply}`, {
								summary,
								choice,
								phase: "response",
								goalId
							});
							updateDecisionTag(decision.id, "in_progress");
							ctx.scheduleFollowUp(employeeId, 60 * 1e3, goalId);
						}
					}).catch(() => void 0);
				});
			}
			return json(res, { decision });
		}
		if (req.method === "POST" && path === "/company/api/decisions/pending") {
			const { employeeId, background, optionA, optionB, options } = await parseBody(req);
			if (!employeeId || !background || !optionA) return json(res, { error: "employeeId, background, optionA are required" }, 400);
			const pending = insertPendingDecision(employeeId, background, optionA, optionB, options, goalId);
			insertActivity(employeeId, "pending_decision", `[待决] ${background}（${options && options.length >= 2 ? options.join(" | ") : optionB ? `选A: ${optionA} | 选B: ${optionB}` : optionA}）`, { goalId });
			return json(res, { pending });
		}
		if (req.method === "GET" && path === "/company/api/reports") {
			const goalId = parseGoalId(url.searchParams.get("goalId"));
			if (url.searchParams.has("days")) return json(res, { reports: getReportsByDays(Math.min(Math.max(Number(url.searchParams.get("days") ?? "7"), 1), 30), goalId) });
			return json(res, { reports: getRecentReports(Number(url.searchParams.get("limit") ?? "30"), goalId) });
		}
		if (req.method === "GET" && path === "/company/api/activity") {
			const goalId = parseGoalId(url.searchParams.get("goalId"));
			return json(res, { activity: getRecentActivity(Number(url.searchParams.get("limit") ?? "60"), goalId) });
		}
		if (req.method === "POST" && path.match(/^\/company\/api\/chat\/[^/]+\/stream$/)) {
			const employeeId = path.slice(18).replace("/stream", "");
			if (!getAnyEmployee(employeeId)) return json(res, { error: `Unknown employee: ${employeeId}` }, 404);
			if (employeeId !== CHIEF_ID$1) return json(res, { error: "仅支持与总指挥AI直接对话，请使用 company-coo" }, 403);
			const { message, goalId } = await parseBody(req);
			if (!message) return json(res, { error: "message is required" }, 400);
			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				"Connection": "keep-alive",
				"X-Accel-Buffering": "no"
			});
			const write = (event, data) => {
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
		if (req.method === "POST" && path.startsWith("/company/api/chat/")) {
			const employeeId = path.slice(18);
			if (!getAnyEmployee(employeeId)) return json(res, { error: `Unknown employee: ${employeeId}` }, 404);
			if (employeeId !== CHIEF_ID$1) return json(res, { error: "仅支持与总指挥AI直接对话，请使用 company-coo" }, 403);
			const { message, goalId } = await parseBody(req);
			if (!message) return json(res, { error: "message is required" }, 400);
			return json(res, { reply: await ctx.runAgent(employeeId, message, goalId) });
		}
		if (req.method === "POST" && path === "/company/api/goals") {
			const { title, description, quarter } = await parseBody(req);
			if (!title) return json(res, { error: "title is required" }, 400);
			const { insertGoal } = await import("./db-BCu1HftC.js").then((n) => n.t);
			const goal = insertGoal(title, description ?? "", quarter ?? "");
			ctx.decomposGoal(goal.id, goal.title, goal.description ?? "").catch((err) => {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[company] goal decomposition failed goalId=${goal.id}: ${msg}`);
				const background = `目标「${goal.title}」拆解失败：${msg}`;
				insertPendingDecision("company-coo", background, "点击「重新拆解任务」重试", "检查模型配置/网络后重试", ["点击「重新拆解任务」重试", "检查模型配置/网络后重试"], goal.id);
				insertActivity("company-coo", "pending_decision", `[待决] ${background}`, {
					goalId: goal.id,
					phase: "decompose_error"
				});
			});
			return json(res, {
				goal,
				message: "目标已设置，AI 正在拆解任务..."
			});
		}
		if (req.method === "POST" && /^\/company\/api\/goals\/\d+\/decompose$/.test(path)) {
			const id = Number(path.split("/")[4]);
			const goal = getActiveGoals().find((g) => g.id === id);
			if (!goal) return json(res, { error: "Goal not found" }, 404);
			try {
				await ctx.decomposGoal(goal.id, goal.title, goal.description ?? "");
				return json(res, {
					ok: true,
					message: "重拆解成功"
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[company] manual decomposition failed goalId=${goal.id}: ${msg}`);
				return json(res, { error: `重拆解失败：${msg}` }, 500);
			}
		}
		if (req.method === "PATCH" && /^\/company\/api\/goals\/\d+$/.test(path)) {
			const id = Number(path.split("/").pop());
			const { title, description, quarter } = await parseBody(req);
			const existing = getActiveGoals().find((g) => g.id === id);
			if (!existing) return json(res, { error: "Goal not found" }, 404);
			return json(res, { goal: updateGoal(id, title ?? existing.title, description ?? existing.description ?? "", quarter ?? existing.quarter) });
		}
		if (req.method === "DELETE" && /^\/company\/api\/goals\/\d+$/.test(path)) {
			deleteGoal(Number(path.split("/").pop()));
			return json(res, { ok: true });
		}
		if (req.method === "PATCH" && /^\/company\/api\/tasks\/\d+$/.test(path)) {
			const id = Number(path.split("/").pop());
			const { status, deadline, priority, extraGoalIds } = await parseBody(req);
			if (status !== void 0 && ![
				"pending",
				"in_progress",
				"done"
			].includes(status)) return json(res, { error: "status must be pending | in_progress | done" }, 400);
			if (priority !== void 0 && ![
				"low",
				"normal",
				"high"
			].includes(priority)) return json(res, { error: "priority must be low | normal | high" }, 400);
			if (extraGoalIds !== void 0 && extraGoalIds !== null) {
				if (!Array.isArray(extraGoalIds) || !extraGoalIds.every((x) => typeof x === "number")) return json(res, { error: "extraGoalIds must be an array of numbers or null" }, 400);
			}
			updateGoalTask(id, {
				...status !== void 0 && { status },
				...deadline !== void 0 && { deadline },
				...priority !== void 0 && { priority },
				...extraGoalIds !== void 0 && { extraGoalIds: extraGoalIds === null ? null : extraGoalIds }
			});
			return json(res, { ok: true });
		}
		if (req.method === "POST" && path === "/company/api/employees/generate") {
			const { description } = await parseBody(req);
			if (!description) return json(res, { error: "description is required" }, 400);
			return json(res, { employee: await ctx.generateEmployee(description) });
		}
		if (req.method === "POST" && path === "/company/api/employees") {
			const { id, name, role, emoji, accentColor, systemPrompt, cronSchedule, cronPrompt } = await parseBody(req);
			if (!id || !name || !role) return json(res, { error: "id, name, role are required" }, 400);
			insertCustomEmployee({
				id,
				name,
				role,
				emoji: emoji ?? "🤖",
				accent_color: accentColor ?? "#7b61ff",
				system_prompt: systemPrompt ?? "",
				cron_schedule: cronSchedule ?? "0 10 * * 1-5",
				cron_prompt: cronPrompt ?? ""
			});
			const onboardingPrompt = `你刚刚加入公司，角色是${role}。请做一个简短的自我介绍（2-3句），并说明你将如何为公司创造价值。以「[入职] 」开头。`;
			setImmediate(() => {
				ctx.runAgent(id, onboardingPrompt).then((reply) => {
					if (reply) insertActivity(id, "task_response", reply);
				}).catch(() => void 0);
			});
			return json(res, { ok: true });
		}
		if (req.method === "DELETE" && path.startsWith("/company/api/employees/")) {
			deleteCustomEmployee(path.slice(23));
			return json(res, { ok: true });
		}
		json(res, { error: "Not found" }, 404);
	} catch (err) {
		json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
	}
}
//#endregion
//#region src/agent-runner.ts
const MAX_TOOL_ITERATIONS = 5;
/** Extract provider + model from the user's configured primary model (e.g. "mify/pa/claude-sonnet-4-6"). */
function resolveAgentModel(config) {
	const primary = config?.agents?.defaults?.model?.primary;
	if (!primary) return {};
	const slashIdx = primary.indexOf("/");
	if (slashIdx === -1) return { model: primary };
	return {
		provider: primary.slice(0, slashIdx),
		model: primary.slice(slashIdx + 1)
	};
}
const COLLEAGUE_QUERY_RE = /<查同事\s+id="([^"]+)"(?:\s+limit="(\d+)")?\s*\/>/;
const COLLAB_TRIGGER_RE = /<触发协作\s+to="([^"]+)"\s+task="([^"]+)"\s*\/>/;
const DELEGATE_COLLEAGUE_RE = /<委托同事\s+id="([^"]+)">([\s\S]*?)<\/委托同事>/;
const ASSIGN_TASK_RE = /<分配任务给:([^>]+)>([\s\S]*?)<\/分配任务给>/;
const DECISION_REQUEST_RE = /<需要决策\s+options="([^"]+)">([\s\S]*?)<\/需要决策>/;
function applyTaskStatusFromReply(employeeId, text, goalId) {
	let doneCount = 0;
	let inProgressCount = 0;
	for (const [tag, status] of [["任务完成", "done"], ["任务进行中", "in_progress"]]) {
		const tagRe = new RegExp(`\\[${tag}[：:](.*?)\\]`, "g");
		let m;
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
			} catch {}
		}
	}
	return {
		doneCount,
		inProgressCount
	};
}
function parseDependsOn(task) {
	if (!task.depends_on_task_uids) return [];
	try {
		const parsed = JSON.parse(task.depends_on_task_uids);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((x) => typeof x === "string" && x.trim().length > 0);
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
async function runEmployeeAgent(employeeId, prompt, deps, onChunk, depth = 0, goalId) {
	const employee = getAnyEmployee(employeeId);
	if (!employee) throw new Error(`Unknown employee: ${employeeId}`);
	const agentDir = join(homedir(), ".openclaw");
	const workspaceDir = goalId !== void 0 ? join(agentDir, "agents", employeeId, `goal-${goalId}`) : join(agentDir, "agents", employeeId);
	const sessionKey = goalId !== void 0 ? `agent:${employeeId}:goal:${goalId}` : `agent:${employeeId}:company`;
	const sessionFile = join(workspaceDir, "sessions.json");
	const scopedGoal = goalId !== void 0 ? getGoalById(goalId) : void 0;
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
		timeoutMs: 6e5,
		...resolveAgentModel(deps.config),
		...onChunk ? { onPartialReply: (payload) => {
			const chunk = payload.delta ?? "";
			if (chunk) onChunk(chunk);
		} } : {}
	};
	let currentPrompt = prompt;
	let lastText = "";
	const withGoalScope = (rawPrompt) => {
		if (goalId === void 0) return rawPrompt;
		const taskLines = getEmployeeActiveTasks(employeeId, goalId).map((t) => `- [${t.status}] ${t.title}`).join("\n");
		return `【当前目标工作区】
你当前只在这个目标下工作：${scopedGoal?.title ?? `目标#${goalId}`}（goalId=${goalId}）
请严格围绕该目标回复，不要混入其他目标的任务。
${taskLines ? `你在该目标下的待办：\n${taskLines}\n` : "你在该目标下暂时没有未完成任务。\n"}

【本轮请求】
${rawPrompt}`;
	};
	for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
		const text = [...(await deps.runEmbeddedPiAgent({
			...baseParams,
			sessionId: `company-${randomUUID()}`,
			runId: randomUUID(),
			prompt: withGoalScope(currentPrompt)
		}))?.payloads ?? []].reverse().find((p) => p.text?.trim())?.text ?? "";
		if (text) lastText = text;
		const queryMatch = COLLEAGUE_QUERY_RE.exec(lastText);
		if (queryMatch) {
			const colleagueId = queryMatch[1];
			const limit = Math.min(Number(queryMatch[2] ?? "5"), 10);
			const activity = getEmployeeActivityForActiveGoals(colleagueId, limit, goalId);
			const colleague = getAnyEmployee(colleagueId);
			const collegeName = colleague ? `${colleague.name}（${colleague.role}）` : colleagueId;
			currentPrompt = `[同事动态] ${collegeName} 的最新 ${limit} 条记录：\n\n${activity.length > 0 ? activity.map((a) => `[${a.event_type}] ${a.created_at}\n${a.content}`).join("\n\n---\n\n") : `${collegeName} 暂无近期动态`}\n\n请基于以上信息继续完成任务。`;
			continue;
		}
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
					insertActivity(targetId, "task_assigned", `[协作请求] ${sourceName} 邀请协作：${task}`, {
						goalId,
						requestedBy: employeeId
					});
					try {
						const collabReply = await runEmployeeAgent(targetId, collabPrompt, deps, void 0, 1, goalId);
						if (collabReply) {
							insertActivity(targetId, "task_response", `[协作回复] ${targetName}：${collabReply}`, {
								goalId,
								requestedBy: employeeId
							});
							currentPrompt = `[协作回复] ${targetName} 的回复：\n${collabReply}\n\n请基于以上协作意见继续完成任务。`;
							continue;
						}
					} catch {}
				}
			}
		}
		if (depth === 0) {
			const delegateMatch = DELEGATE_COLLEAGUE_RE.exec(lastText);
			if (delegateMatch) {
				const toId = delegateMatch[1];
				const message = delegateMatch[2].trim();
				try {
					const reply = await runEmployeeAgent(toId, message, deps, void 0, 1, goalId);
					if (reply) {
						insertActivity(toId, "task_response", reply, {
							delegatedBy: employeeId,
							goalId
						});
						insertActivity(employeeId, "task_response", `已委托 ${toId}：${message}`, {
							delegateTo: toId,
							goalId
						});
					}
				} catch {}
				break;
			}
		}
		if (depth === 0) {
			const assignMatch = ASSIGN_TASK_RE.exec(lastText);
			if (assignMatch) {
				const targetNameOrId = assignMatch[1].trim();
				const taskContent = assignMatch[2].trim();
				const allEmps = getAllEmployees();
				const targetEmployee = allEmps.find((e) => e.id === targetNameOrId) ?? allEmps.find((e) => e.name === targetNameOrId) ?? allEmps.find((e) => e.role === targetNameOrId);
				if (targetEmployee) {
					const targetId = targetEmployee.id;
					insertActivity(targetId, "task_assigned", taskContent, {
						assignedBy: employeeId,
						goalId
					});
					try {
						const reply = await runEmployeeAgent(targetId, taskContent, deps, void 0, 1, goalId);
						if (reply) insertActivity(targetId, "task_response", reply, {
							assignedBy: employeeId,
							goalId
						});
					} catch {}
				}
				break;
			}
		}
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
		break;
	}
	if (lastText) {
		const status = applyTaskStatusFromReply(employeeId, lastText, goalId);
		if (goalId !== void 0 && status.doneCount > 0) dispatchReadyTasksForGoal(goalId, deps).catch(() => void 0);
	}
	return lastText;
}
async function dispatchReadyTasksForGoal(goalId, deps) {
	const goal = getGoalById(goalId);
	if (!goal) return;
	const tasks = getGoalTasks(goalId);
	if (tasks.length === 0) return;
	const byUid = /* @__PURE__ */ new Map();
	for (const t of tasks) if (t.task_uid) byUid.set(t.task_uid, t);
	const ready = tasks.filter((t) => t.status === "pending" && t.dispatched_at == null).filter((t) => {
		const depsUids = parseDependsOn(t);
		if (depsUids.length === 0) return true;
		return depsUids.every((uid) => byUid.get(uid)?.status === "done");
	}).sort((a, b) => a.sequence - b.sequence || a.id - b.id);
	for (const task of ready.slice(0, 1)) {
		markGoalTaskDispatched(task.id);
		insertActivity(task.employee_id, "task_assigned", `收到任务：${task.title}（目标：${goal.title}）`, {
			goalId,
			taskId: task.id,
			taskUid: task.task_uid,
			phase: "dispatched"
		});
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
			const reply = await runEmployeeAgent(task.employee_id, prompt, deps, void 0, 0, goalId);
			if (reply) {
				insertActivity(task.employee_id, "task_response", reply, {
					goalId,
					taskId: task.id,
					taskUid: task.task_uid
				});
				try {
					updateGoalTaskStatus(task.id, "in_progress");
				} catch {}
				scheduleFollowUp(task.employee_id, deps, 60 * 1e3, 1, goalId);
			}
		} catch {
			updateGoalTask(task.id, { status: "pending" });
		}
	}
}
/**
* Run a cron-triggered proactive report for an employee.
* The result is saved to the reports table.
*/
async function runEmployeeCron(employeeId, deps) {
	const employee = getAnyEmployee(employeeId);
	if (!employee) return;
	const activeTasks = getEmployeeActiveTasks(employeeId);
	const grouped = /* @__PURE__ */ new Map();
	for (const t of activeTasks) {
		if (!grouped.has(t.goal_id)) grouped.set(t.goal_id, []);
		grouped.get(t.goal_id).push(t);
	}
	if (grouped.size === 0) {
		try {
			const reply = await runEmployeeAgent(employeeId, employee.cronPrompt, deps);
			if (reply) {
				insertReport(employeeId, reply);
				insertActivity(employeeId, "report", reply);
			}
		} catch {}
		return;
	}
	for (const [goalId, tasks] of grouped) {
		let prompt = employee.cronPrompt;
		const taskLines = tasks.map((t) => `  - [${t.status === "in_progress" ? "进行中" : "待开始"}] ${t.title}`).join("\n");
		prompt += `

你当前有以下待完成任务，请在日报中说明每项任务的最新进展：
${taskLines}

规则：
- 如某项任务已完成，在回复中加 [任务完成: 任务标题关键词]
- 如某项任务正在进行，在回复中加 [任务进行中: 任务标题关键词]
- 如某项任务遇到阻塞需要 CEO 决策，加 [待决] 标记
- 汇报以 [进展汇报] 开头`;
		try {
			const reply = await runEmployeeAgent(employeeId, prompt, deps, void 0, 0, goalId);
			if (reply) {
				insertReport(employeeId, reply, goalId);
				insertActivity(employeeId, "report", reply, { goalId });
			}
		} catch {}
	}
}
const MAX_FOLLOWUP_ITERATIONS = 6;
/**
* Schedule a follow-up "继续执行" call for an employee.
* After each response, automatically reschedules if the employee is still working.
* Stops when: task completed ([任务完成:]), CEO decision needed ([待决]), or max iterations reached.
*/
function scheduleFollowUp(employeeId, deps, delayMs = 120 * 1e3, iteration = 1, goalId) {
	if (iteration > MAX_FOLLOWUP_ITERATIONS) return;
	setTimeout(() => {
		runEmployeeAgent(employeeId, `基于你当前的任务，产出下一个里程碑的可交付成果。

规则：
- 直接给出内容（文档草稿/分析/方案/列表/代码片段），不要说"我正在..."
- 如果上一步已产出初稿，现在细化或推进下一步
- 遇到需要 CEO 拍板的节点：[待决] 背景: ... | 选A: ... | 选B: ...
- 完成全部任务时加 [任务完成: 关键词]
- 仍在推进时加 [任务进行中: 关键词]`, deps, void 0, 0, goalId).then((reply) => {
			if (!reply) return;
			insertReport(employeeId, reply, goalId);
			insertActivity(employeeId, "task_response", reply, { goalId });
			const isDone = reply.includes("[任务完成");
			const isBlocked = reply.includes("[待决]");
			if (!isDone && !isBlocked) scheduleFollowUp(employeeId, deps, 120 * 1e3, iteration + 1, goalId);
		}).catch(() => void 0);
	}, delayMs);
}
/**
* Decompose a company goal into per-employee tasks.
* Runs a one-shot agent call (no persistent session needed).
*/
async function decomposeGoal(goalId, title, description, deps) {
	const employees = getAllEmployees();
	const employeeList = employees.map((e) => `- ${e.role} (${e.name}, id=${e.id})`).join("\n");
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
	if (getGoalTasks(goalId).length > 0) return;
	const agentDir = join(homedir(), ".openclaw");
	const workspaceDir = join(agentDir, "agents", "company-decomposer", `goal-${goalId}`);
	const knownEmployeeIds = new Set(employees.map((e) => e.id));
	const match = ([...(await deps.runEmbeddedPiAgent({
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
		timeoutMs: 12e4,
		...resolveAgentModel(deps.config)
	}))?.payloads ?? []].reverse().find((p) => p.text?.trim())?.text ?? "").match(/\{[\s\S]*\}/);
	if (!match) throw new Error(`目标拆解输出非 JSON（goalId=${goalId}）`);
	let parsed;
	try {
		parsed = JSON.parse(match[0]);
	} catch {
		throw new Error(`目标拆解 JSON 解析失败（goalId=${goalId}）`);
	}
	const unknownEmployeeIds = (parsed.tasks ?? []).map((task) => task.employee_id).filter(Boolean).filter((id) => !knownEmployeeIds.has(id));
	if (unknownEmployeeIds.length > 0) throw new Error(`目标拆解包含未知员工ID: ${[...new Set(unknownEmployeeIds)].join(", ")}`);
	const uidList = (parsed.tasks ?? []).map((task) => task.uid).filter(Boolean);
	const duplicatedUids = uidList.filter((uid, idx) => uidList.indexOf(uid) !== idx);
	if (duplicatedUids.length > 0) throw new Error(`目标拆解任务 UID 重复: ${[...new Set(duplicatedUids)].join(", ")}`);
	const knownUidSet = new Set(uidList);
	const badDeps = [];
	for (const task of parsed.tasks ?? []) for (const dep of task.depends_on ?? []) {
		if (!knownUidSet.has(dep)) badDeps.push(`${task.uid}->${dep}`);
		if (dep === task.uid) badDeps.push(`${task.uid}->${dep}(self)`);
	}
	if (badDeps.length > 0) throw new Error(`目标拆解依赖非法: ${[...new Set(badDeps)].join(", ")}`);
	const plannedTasks = (parsed.tasks ?? []).filter((task) => Boolean(task.uid && task.employee_id && task.title)).filter((task) => knownEmployeeIds.has(task.employee_id)).map((task, idx) => ({
		uid: task.uid.trim(),
		employee_id: task.employee_id,
		title: task.title.trim(),
		depends_on: (task.depends_on ?? []).filter(Boolean),
		deliverable: (task.deliverable ?? "").trim() || "提交可评审的一页执行产出",
		done_definition: (task.done_definition ?? "").trim() || "有明确可验收结果并可继续下游任务",
		sequence: idx
	}));
	if (plannedTasks.length === 0) throw new Error(`目标拆解返回空任务列表（goalId=${goalId}）`);
	for (const task of plannedTasks) insertGoalTaskWithMeta(goalId, task.employee_id, task.title, {
		taskUid: task.uid,
		dependsOnTaskUids: task.depends_on,
		deliverable: task.deliverable,
		doneDefinition: task.done_definition,
		sequence: task.sequence
	});
	await dispatchReadyTasksForGoal(goalId, deps);
}
/**
* Use an AI HR agent to generate a new employee profile from a plain-text description.
* Returns a partial Employee record (without created_at) as a plain object.
*/
async function generateEmployeeFromDescription(description, deps) {
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
	const match = ([...(await deps.runEmbeddedPiAgent({
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
		timeoutMs: 6e4,
		...resolveAgentModel(deps.config)
	}))?.payloads ?? []].reverse().find((p) => p.text?.trim())?.text ?? "").match(/\{[\s\S]*\}/);
	if (!match) throw new Error("AI 未能生成有效员工档案");
	return JSON.parse(match[0]);
}
//#endregion
//#region index.ts
const __dirname = dirname(fileURLToPath(import.meta.url));
const CHIEF_ID = "company-coo";
function getEmployeeIds() {
	return new Set(getAllEmployees().map((e) => e.id));
}
var openclaw_company_os_default = definePluginEntry({
	id: "company",
	name: "一人公司 OS",
	description: "CEO + AI employee agent system",
	register(api) {
		const gatewayToken = api.config?.gateway?.auth?.token;
		api.registerHttpRoute({
			path: "/company",
			match: "prefix",
			auth: "plugin",
			handler: async (req, res) => {
				const url = new URL(req.url ?? "/", "http://localhost");
				if (gatewayToken) {
					const bearerOk = (req.headers["authorization"] ?? "") === `Bearer ${gatewayToken}`;
					const cookieOk = (req.headers["cookie"] ?? "").split(";").some((c) => c.trim() === `company-session=${gatewayToken}`);
					if (url.searchParams.get("token") === gatewayToken) {
						url.searchParams.delete("token");
						const cleanPath = url.pathname + (url.search || "");
						res.writeHead(302, {
							"Set-Cookie": `company-session=${gatewayToken}; Path=/company; HttpOnly; SameSite=Strict`,
							Location: cleanPath || "/company"
						});
						res.end();
						return;
					}
					if (!bearerOk && !cookieOk) {
						res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
						res.end(`<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>认证失败</title></head><body style="font-family:system-ui;padding:40px;background:#1a1a2e;color:#e8e8f0"><h2>🔐 需要认证</h2><p>请在 URL 后添加 <code>?token=YOUR_TOKEN</code> 访问。</p><p>例：<code>http://localhost:18789/company?token=${gatewayToken}</code></p></body></html>`);
						return;
					}
				}
				if (url.pathname.startsWith("/company/api/")) {
					const agentDeps = {
						runEmbeddedPiAgent: api.runtime.agent.runEmbeddedPiAgent,
						config: api.config
					};
					return handleApiRequest({
						req,
						res,
						runAgent: (employeeId, prompt, goalId) => runEmployeeAgent(employeeId, prompt, agentDeps, void 0, 0, goalId),
						runAgentStream: (employeeId, prompt, onChunk, goalId) => runEmployeeAgent(employeeId, prompt, agentDeps, onChunk, 0, goalId).then(() => void 0),
						decomposGoal: async (goalId, title, description) => {
							await decomposeGoal(goalId, title, description, agentDeps);
						},
						scheduleFollowUp: (employeeId, delayMs, goalId) => scheduleFollowUp(employeeId, agentDeps, delayMs, 1, goalId),
						generateEmployee: (description) => generateEmployeeFromDescription(description, agentDeps)
					});
				}
				const uiDistDir = join(__dirname, "ui", "dist");
				const reqPath = url.pathname.replace(/^\/company/, "") || "/";
				const assetPath = join(uiDistDir, reqPath === "/" ? "index.html" : reqPath);
				if (reqPath !== "/" && existsSync(assetPath)) {
					const ext = assetPath.split(".").pop() ?? "";
					const mimeMap = {
						js: "application/javascript",
						css: "text/css",
						html: "text/html",
						svg: "image/svg+xml",
						ico: "image/x-icon",
						woff2: "font/woff2"
					};
					res.writeHead(200, { "Content-Type": mimeMap[ext] ?? "application/octet-stream" });
					res.end(readFileSync(assetPath));
					return;
				}
				const indexPath = join(uiDistDir, "index.html");
				if (existsSync(indexPath)) {
					res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
					res.end(readFileSync(indexPath));
					return;
				}
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
				res.end(DEV_PLACEHOLDER_HTML);
			}
		});
		api.on("before_prompt_build", async (_event, ctx) => {
			const agentId = ctx?.agentId;
			if (!agentId || !getEmployeeIds().has(agentId)) return;
			const employee = getAnyEmployee(agentId);
			if (!employee) return;
			const sessionKey = ctx?.sessionKey ?? "";
			const scopedGoalId = (() => {
				const m = sessionKey.match(/:goal:(\d+)/);
				if (!m) return void 0;
				const n = Number(m[1]);
				return Number.isFinite(n) && n > 0 ? n : void 0;
			})();
			const goals = scopedGoalId !== void 0 ? (() => {
				const g = getGoalById(scopedGoalId);
				return g ? [g] : [];
			})() : getActiveGoals();
			const recentDecisions = scopedGoalId !== void 0 ? getDecisionsFiltered({
				goalId: scopedGoalId,
				limit: 5,
				offset: 0
			}) : getDecisions(5);
			const goalsSummary = goals.length > 0 ? goals.map((g) => `- ${g.title}${g.quarter ? ` (${g.quarter})` : ""}`).join("\n") : "（CEO 尚未设置季度目标）";
			const decisionsSummary = recentDecisions.length > 0 ? recentDecisions.map((d) => `- [${d.employee_id}] ${d.summary}：${d.choice}`).join("\n") : "（暂无历史决策）";
			const pendingByMe = getPendingDecisions(scopedGoalId).filter((p) => p.employee_id === agentId).length;
			const colleagues = getAllEmployees().filter((e) => e.id !== agentId).map((e) => `- ${e.id}：${e.name}（${e.role}）`).join("\n");
			return { appendSystemContext: `
## 你的角色
${employee.systemPrompt}

## 公司当前目标
${goalsSummary}

${scopedGoalId !== void 0 ? `## 当前会话范围\n你当前在目标隔离模式中，只处理 goalId=${scopedGoalId} 的任务。` : ""}

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
` };
		});
		api.on("llm_output", async (event, ctx) => {
			const agentId = ctx?.agentId;
			if (!agentId || !getEmployeeIds().has(agentId)) return;
			const sessionKey = ctx?.sessionKey ?? "";
			const scopedGoalId = (() => {
				const m = sessionKey.match(/:goal:(\d+)/);
				if (!m) return void 0;
				const n = Number(m[1]);
				return Number.isFinite(n) && n > 0 ? n : void 0;
			})();
			const combined = (event.assistantTexts ?? []).join("\n");
			if (!combined.includes("[待决]")) return;
			const match = combined.match(/\[待决\]\s*背景:\s*([^|]+)\|?\s*选A:\s*([^|]+)(?:\|?\s*选B:\s*(.+))?/);
			if (!match) return;
			const [, background, optionA, optionB] = match;
			if (!background?.trim() || !optionA?.trim()) return;
			try {
				insertPendingDecision(agentId, background.trim(), optionA.trim(), optionB?.trim(), void 0, scopedGoalId);
				const label = optionB?.trim() ? `选A: ${optionA.trim()} | 选B: ${optionB.trim()}` : optionA.trim();
				insertActivity(agentId, "pending_decision", `[待决] ${background.trim()}（${label}）`, { goalId: scopedGoalId });
			} catch {}
			for (const [tag, status] of [["任务完成", "done"], ["任务进行中", "in_progress"]]) {
				const tagRe = new RegExp(`\\[${tag}[：:](.*?)\\]`, "g");
				let m;
				while ((m = tagRe.exec(combined)) !== null) {
					const keyword = m[1].trim();
					if (!keyword) continue;
					try {
						const task = findGoalTaskByTitle(agentId, keyword, scopedGoalId);
						if (task) updateGoalTaskStatus(task.id, status);
					} catch {}
				}
			}
		});
		api.on("gateway_start", async (_event) => {
			api.logger?.info("[company] 一人公司 OS initialized");
			const agentDeps = {
				runEmbeddedPiAgent: api.runtime.agent.runEmbeddedPiAgent,
				config: api.config
			};
			const lastFired = {};
			const coordinatorOnly = getAllEmployees().filter((e) => e.id === CHIEF_ID);
			setInterval(() => {
				const now = /* @__PURE__ */ new Date();
				for (const emp of coordinatorOnly) {
					if (!matchesCronNow(emp.cronSchedule, now)) continue;
					const key = `${emp.id}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
					if (lastFired[emp.id] === key) continue;
					lastFired[emp.id] = key;
					api.logger?.info(`[company] cron fire: ${emp.id}`);
					runEmployeeCron(emp.id, agentDeps).catch(() => void 0);
				}
			}, 6e4);
			coordinatorOnly.forEach((emp, i) => {
				setTimeout(() => {
					const recent = getEmployeeReports(emp.id, 1);
					if (recent.length > 0) {
						if (Date.now() - new Date(recent[0].created_at.includes("T") ? recent[0].created_at : recent[0].created_at.replace(" ", "T") + "Z").getTime() < 360 * 60 * 1e3) return;
					}
					api.logger?.info(`[company] startup cron fire: ${emp.id}`);
					runEmployeeCron(emp.id, agentDeps).catch(() => void 0);
				}, (i + 1) * 45e3);
			});
		});
	}
});
/**
* Minimal cron expression matcher for the subset used by employees:
*   "MIN HOUR * * DOW"  (DOW can be a number or range like "1-5")
* Returns true when `now` matches the expression (exact minute + hour + day-of-week).
*/
function matchesCronNow(expr, now) {
	const parts = expr.trim().split(/\s+/);
	if (parts.length !== 5) return false;
	const [minPart, hourPart, , , dowPart] = parts;
	const nowMin = now.getMinutes();
	const nowHour = now.getHours();
	const nowDow = now.getDay();
	const matchField = (field, value) => {
		if (field === "*") return true;
		if (field.includes("-")) {
			const [lo, hi] = field.split("-").map(Number);
			return value >= lo && value <= hi;
		}
		if (field.includes(",")) return field.split(",").map(Number).includes(value);
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
//#endregion
export { openclaw_company_os_default as default };
