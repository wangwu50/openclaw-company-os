import { createRequire } from "node:module";
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name),
    });
};
var __esm = (fn, res) => () => (fn && (res = fn((fn = 0))), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/db.ts
var exports_db = {};
__export(exports_db, {
  updateGoalTaskStatus: () => updateGoalTaskStatus,
  updateGoalTask: () => updateGoalTask,
  updateGoal: () => updateGoal,
  updateDecisionTag: () => updateDecisionTag,
  searchDecisionsByGoal: () => searchDecisionsByGoal,
  searchDecisions: () => searchDecisions,
  resetPendingDispatches: () => resetPendingDispatches,
  markGoalTaskDispatched: () => markGoalTaskDispatched,
  insertReport: () => insertReport,
  insertPendingDecision: () => insertPendingDecision,
  insertGoalTaskWithMeta: () => insertGoalTaskWithMeta,
  insertGoalTask: () => insertGoalTask,
  insertGoal: () => insertGoal,
  insertDecision: () => insertDecision,
  insertCustomEmployee: () => insertCustomEmployee,
  insertActivity: () => insertActivity,
  getReportsByDays: () => getReportsByDays,
  getRecentReports: () => getRecentReports,
  getRecentActivity: () => getRecentActivity,
  getPendingDecisions: () => getPendingDecisions,
  getGoalTasks: () => getGoalTasks,
  getGoalById: () => getGoalById,
  getEmployeeReports: () => getEmployeeReports,
  getEmployeeActivityForActiveGoals: () => getEmployeeActivityForActiveGoals,
  getEmployeeActivity: () => getEmployeeActivity,
  getEmployeeActiveTasks: () => getEmployeeActiveTasks,
  getDispatchedActiveTasks: () => getDispatchedActiveTasks,
  getDecisionsFiltered: () => getDecisionsFiltered,
  getDecisions: () => getDecisions,
  getDecisionStats: () => getDecisionStats,
  getDb: () => getDb,
  getCustomEmployees: () => getCustomEmployees,
  getActiveGoals: () => getActiveGoals,
  findGoalTaskByTitle: () => findGoalTaskByTitle,
  deletePendingDecision: () => deletePendingDecision,
  deleteGoal: () => deleteGoal,
  deleteCustomEmployee: () => deleteCustomEmployee,
  clearAllTransientData: () => clearAllTransientData,
});
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
function getDb() {
  if (_db) return _db;
  const dir = join(homedir(), ".openclaw", "company");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "company.db");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT,
      quarter     TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS goal_tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id     INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      employee_id TEXT    NOT NULL,
      task_uid    TEXT,
      depends_on_task_uids TEXT,
      deliverable TEXT,
      done_definition TEXT,
      sequence    INTEGER NOT NULL DEFAULT 0,
      dispatched_at TEXT,
      title       TEXT    NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'pending',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT    NOT NULL,
      goal_id     INTEGER,
      summary     TEXT    NOT NULL,
      context     TEXT,
      choice      TEXT    NOT NULL,
      result_tag  TEXT    NOT NULL DEFAULT 'pending',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_decisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT    NOT NULL,
      goal_id     INTEGER,
      background  TEXT    NOT NULL,
      option_a    TEXT    NOT NULL,
      option_b    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employee_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT    NOT NULL,
      goal_id     INTEGER,
      content     TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT    NOT NULL,
      event_type  TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      meta        TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_decisions_employee ON decisions(employee_id);
    CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_employee ON employee_reports(employee_id);
    CREATE INDEX IF NOT EXISTS idx_reports_created ON employee_reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pending_employee ON pending_decisions(employee_id);

    CREATE TABLE IF NOT EXISTS custom_employees (
      id           TEXT    PRIMARY KEY,
      name         TEXT    NOT NULL,
      role         TEXT    NOT NULL,
      emoji        TEXT    NOT NULL,
      accent_color TEXT    NOT NULL,
      system_prompt TEXT   NOT NULL,
      cron_schedule TEXT   NOT NULL,
      cron_prompt   TEXT   NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  for (const sql of [
    "ALTER TABLE goal_tasks ADD COLUMN deadline TEXT",
    "ALTER TABLE goal_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'",
    "ALTER TABLE goal_tasks ADD COLUMN extra_goal_ids TEXT",
    "ALTER TABLE goal_tasks ADD COLUMN task_uid TEXT",
    "ALTER TABLE goal_tasks ADD COLUMN depends_on_task_uids TEXT",
    "ALTER TABLE goal_tasks ADD COLUMN deliverable TEXT",
    "ALTER TABLE goal_tasks ADD COLUMN done_definition TEXT",
    "ALTER TABLE goal_tasks ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE goal_tasks ADD COLUMN dispatched_at TEXT",
    "ALTER TABLE pending_decisions ADD COLUMN options TEXT",
    "ALTER TABLE decisions ADD COLUMN goal_id INTEGER",
    "ALTER TABLE pending_decisions ADD COLUMN goal_id INTEGER",
    "ALTER TABLE employee_reports ADD COLUMN goal_id INTEGER",
  ]) {
    try {
      db.exec(sql);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("duplicate column")) throw e;
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_decisions_goal ON decisions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_pending_goal ON pending_decisions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_reports_goal ON employee_reports(goal_id);
  `);
  _db = db;
  return db;
}
function getActiveGoals() {
  return getDb().prepare("SELECT * FROM goals ORDER BY created_at DESC").all();
}
function getGoalById(id) {
  return getDb().prepare("SELECT * FROM goals WHERE id = ? LIMIT 1").get(id);
}
function insertGoal(title, description, quarter) {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO goals (title, description, quarter) VALUES (?, ?, ?) RETURNING *")
    .get(title, description, quarter);
  return result;
}
function updateGoal(id, title, description, quarter) {
  return getDb()
    .prepare(
      "UPDATE goals SET title = ?, description = ?, quarter = ?, updated_at = datetime('now') WHERE id = ? RETURNING *",
    )
    .get(title, description, quarter, id);
}
function deleteGoal(id) {
  getDb().prepare("DELETE FROM goals WHERE id = ?").run(id);
}
function insertGoalTask(goalId2, employeeId, title) {
  return insertGoalTaskWithMeta(goalId2, employeeId, title);
}
function insertGoalTaskWithMeta(goalId2, employeeId, title, meta) {
  return getDb()
    .prepare(
      "INSERT INTO goal_tasks (goal_id, employee_id, task_uid, depends_on_task_uids, deliverable, done_definition, sequence, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
    )
    .get(
      goalId2,
      employeeId,
      meta?.taskUid ?? null,
      meta?.dependsOnTaskUids ? JSON.stringify(meta.dependsOnTaskUids) : null,
      meta?.deliverable ?? null,
      meta?.doneDefinition ?? null,
      meta?.sequence ?? 0,
      title,
    );
}
function getGoalTasks(goalId2) {
  return getDb()
    .prepare("SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY sequence, id")
    .all(goalId2);
}
function getEmployeeActiveTasks(employeeId, goalId2) {
  if (goalId2 !== undefined) {
    return getDb()
      .prepare(`SELECT gt.*, g.title as goal_title
         FROM goal_tasks gt
         JOIN goals g ON g.id = gt.goal_id
         WHERE gt.employee_id = ? AND gt.status != 'done' AND gt.goal_id = ?
         ORDER BY gt.created_at`)
      .all(employeeId, goalId2);
  }
  return getDb()
    .prepare(`SELECT gt.*, g.title as goal_title
       FROM goal_tasks gt
       JOIN goals g ON g.id = gt.goal_id
       WHERE gt.employee_id = ? AND gt.status != 'done'
       ORDER BY gt.created_at`)
    .all(employeeId);
}
function updateGoalTaskStatus(id, status) {
  getDb()
    .prepare("UPDATE goal_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
}
function markGoalTaskDispatched(id) {
  getDb()
    .prepare(
      "UPDATE goal_tasks SET dispatched_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND dispatched_at IS NULL",
    )
    .run(id);
}
function getDispatchedActiveTasks(employeeId, goalId2) {
  return getDb()
    .prepare(
      "SELECT * FROM goal_tasks WHERE employee_id = ? AND goal_id = ? AND dispatched_at IS NOT NULL AND status != 'done'",
    )
    .all(employeeId, goalId2);
}
function resetPendingDispatches(goalId2) {
  getDb()
    .prepare(
      "UPDATE goal_tasks SET dispatched_at = NULL, status = 'pending' WHERE goal_id = ? AND status != 'done'",
    )
    .run(goalId2);
}
function updateGoalTask(id, fields) {
  const sets = [];
  const params = [];
  if (fields.status !== undefined) {
    sets.push("status = ?");
    params.push(fields.status);
  }
  if (fields.deadline !== undefined) {
    sets.push("deadline = ?");
    params.push(fields.deadline);
  }
  if (fields.priority !== undefined) {
    sets.push("priority = ?");
    params.push(fields.priority);
  }
  if (fields.extraGoalIds !== undefined) {
    sets.push("extra_goal_ids = ?");
    params.push(fields.extraGoalIds === null ? null : JSON.stringify(fields.extraGoalIds));
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb()
    .prepare(`UPDATE goal_tasks SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
}
function findGoalTaskByTitle(employeeId, titleFragment, goalId2) {
  if (goalId2 !== undefined) {
    return getDb()
      .prepare(
        "SELECT * FROM goal_tasks WHERE employee_id = ? AND goal_id = ? AND title LIKE ? AND status != 'done' LIMIT 1",
      )
      .get(employeeId, goalId2, `%${titleFragment}%`);
  }
  return getDb()
    .prepare(
      "SELECT * FROM goal_tasks WHERE employee_id = ? AND title LIKE ? AND status != 'done' LIMIT 1",
    )
    .get(employeeId, `%${titleFragment}%`);
}
function getPendingDecisions(goalId2) {
  if (goalId2 !== undefined) {
    return getDb()
      .prepare("SELECT * FROM pending_decisions WHERE goal_id = ? ORDER BY created_at DESC")
      .all(goalId2);
  }
  return getDb().prepare("SELECT * FROM pending_decisions ORDER BY created_at DESC").all();
}
function insertPendingDecision(employeeId, background, optionA, optionB, options, goalId2) {
  return getDb()
    .prepare(
      "INSERT INTO pending_decisions (employee_id, goal_id, background, option_a, option_b, options) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
    )
    .get(
      employeeId,
      goalId2 ?? null,
      background,
      optionA,
      optionB ?? null,
      options ? JSON.stringify(options) : null,
    );
}
function deletePendingDecision(id) {
  getDb().prepare("DELETE FROM pending_decisions WHERE id = ?").run(id);
}
function insertDecision(employeeId, summary, choice, context, goalId2) {
  return getDb()
    .prepare(
      "INSERT INTO decisions (employee_id, goal_id, summary, choice, context) VALUES (?, ?, ?, ?, ?) RETURNING *",
    )
    .get(employeeId, goalId2 ?? null, summary, choice, context ?? null);
}
function getDecisions(limit = 50, offset = 0) {
  return getDb()
    .prepare("SELECT * FROM decisions ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset);
}
function getDecisionsFiltered(opts) {
  const conditions = [];
  const params = [];
  if (opts.employeeId) {
    conditions.push("employee_id = ?");
    params.push(opts.employeeId);
  }
  if (opts.status) {
    conditions.push("result_tag = ?");
    params.push(opts.status);
  }
  if (opts.goalId !== undefined) {
    conditions.push("goal_id = ?");
    params.push(opts.goalId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(opts.limit ?? 50);
  params.push(opts.offset ?? 0);
  return getDb()
    .prepare(`SELECT * FROM decisions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params);
}
function getDecisionStats(goalId2) {
  const rows =
    goalId2 !== undefined
      ? getDb()
          .prepare(
            "SELECT result_tag, COUNT(*) as cnt FROM decisions WHERE goal_id = ? GROUP BY result_tag",
          )
          .all(goalId2)
      : getDb()
          .prepare("SELECT result_tag, COUNT(*) as cnt FROM decisions GROUP BY result_tag")
          .all();
  return Object.fromEntries(rows.map((r) => [r.result_tag, r.cnt]));
}
function searchDecisions(q) {
  const like = `%${q}%`;
  return getDb()
    .prepare(
      "SELECT * FROM decisions WHERE summary LIKE ? OR context LIKE ? OR choice LIKE ? ORDER BY created_at DESC LIMIT 50",
    )
    .all(like, like, like);
}
function searchDecisionsByGoal(q, goalId2) {
  const like = `%${q}%`;
  return getDb()
    .prepare(
      "SELECT * FROM decisions WHERE goal_id = ? AND (summary LIKE ? OR context LIKE ? OR choice LIKE ?) ORDER BY created_at DESC LIMIT 50",
    )
    .all(goalId2, like, like, like);
}
function updateDecisionTag(id, tag) {
  getDb().prepare("UPDATE decisions SET result_tag = ? WHERE id = ?").run(tag, id);
}
function insertReport(employeeId, content, goalId2) {
  return getDb()
    .prepare(
      "INSERT INTO employee_reports (employee_id, goal_id, content) VALUES (?, ?, ?) RETURNING *",
    )
    .get(employeeId, goalId2 ?? null, content);
}
function getRecentReports(limit = 20, goalId2) {
  if (goalId2 !== undefined) {
    return getDb()
      .prepare("SELECT * FROM employee_reports WHERE goal_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(goalId2, limit);
  }
  return getDb()
    .prepare("SELECT * FROM employee_reports ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}
function getReportsByDays(days, goalId2) {
  if (goalId2 !== undefined) {
    return getDb()
      .prepare(
        "SELECT * FROM employee_reports WHERE goal_id = ? AND created_at >= datetime('now', ? ) ORDER BY created_at DESC LIMIT 200",
      )
      .all(goalId2, `-${days} days`);
  }
  return getDb()
    .prepare(
      "SELECT * FROM employee_reports WHERE created_at >= datetime('now', ? ) ORDER BY created_at DESC LIMIT 200",
    )
    .all(`-${days} days`);
}
function getEmployeeReports(employeeId, limit = 10, goalId2) {
  if (goalId2 !== undefined) {
    return getDb()
      .prepare(
        "SELECT * FROM employee_reports WHERE employee_id = ? AND goal_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(employeeId, goalId2, limit);
  }
  return getDb()
    .prepare(
      "SELECT * FROM employee_reports WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(employeeId, limit);
}
function getCustomEmployees() {
  return getDb().prepare("SELECT * FROM custom_employees ORDER BY created_at").all();
}
function insertCustomEmployee(emp) {
  getDb()
    .prepare(
      `INSERT INTO custom_employees (id, name, role, emoji, accent_color, system_prompt, cron_schedule, cron_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      emp.id,
      emp.name,
      emp.role,
      emp.emoji,
      emp.accent_color,
      emp.system_prompt,
      emp.cron_schedule,
      emp.cron_prompt,
    );
  return getDb().prepare("SELECT * FROM custom_employees WHERE id = ?").get(emp.id);
}
function deleteCustomEmployee(id) {
  getDb().prepare("DELETE FROM custom_employees WHERE id = ?").run(id);
}
function insertActivity(employeeId, eventType, content, meta) {
  return getDb()
    .prepare(
      "INSERT INTO activity_log (employee_id, event_type, content, meta) VALUES (?, ?, ?, ?) RETURNING *",
    )
    .get(employeeId, eventType, content, meta ? JSON.stringify(meta) : null);
}
function getRecentActivity(limit = 50, goalId2) {
  if (goalId2 !== undefined) {
    return getDb()
      .prepare(
        "SELECT * FROM activity_log WHERE json_extract(meta, '$.goalId') = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(goalId2, limit);
  }
  return getDb().prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?").all(limit);
}
function getEmployeeActivity(employeeId, limit = 5, goalId2) {
  if (goalId2 !== undefined) {
    return getDb()
      .prepare(
        "SELECT * FROM activity_log WHERE employee_id = ? AND json_extract(meta, '$.goalId') = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(employeeId, goalId2, limit);
  }
  return getDb()
    .prepare("SELECT * FROM activity_log WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(employeeId, limit);
}
function clearAllTransientData() {
  const db = getDb();
  db.exec("DELETE FROM pending_decisions");
  db.exec("DELETE FROM decisions");
  db.exec("DELETE FROM activity_log");
  db.exec("DELETE FROM employee_reports");
}
function getEmployeeActivityForActiveGoals(employeeId, limit = 5, goalId2) {
  if (goalId2 !== undefined) {
    return getEmployeeActivity(employeeId, limit, goalId2);
  }
  const activeGoalIds = getActiveGoals().map((g) => g.id);
  if (activeGoalIds.length === 0) {
    return getEmployeeActivity(employeeId, limit);
  }
  const placeholders = activeGoalIds.map(() => "?").join(", ");
  return getDb()
    .prepare(
      `SELECT * FROM activity_log WHERE employee_id = ? AND (meta IS NULL OR json_extract(meta, '$.goalId') IS NULL OR json_extract(meta, '$.goalId') IN (${placeholders})) ORDER BY created_at DESC LIMIT ?`,
    )
    .all(employeeId, ...activeGoalIds, limit);
}
var _db = null;
var init_db = () => {};

import { readFileSync, existsSync as existsSync2 } from "node:fs";
import { dirname, join as join3 } from "node:path";
// index.ts
import { fileURLToPath } from "node:url";
import { definePluginEntry } from "openclaw/plugin-sdk/core";

// src/api.ts
init_db();

// src/employees.ts
init_db();
var COLLEAGUE_IDS =
  "company-pm / company-coo / company-eng / company-ops / company-mkt / company-fin";
var EMPLOYEES = [
  {
    id: "company-coo",
    name: "Jordan",
    role: "COO/总监",
    emoji: "\uD83C\uDFAF",
    accentColor: "#3b82f6",
    systemPrompt: `你是 Jordan，公司的 COO（首席运营官）/项目总监。你拥有充分的授权，可以自主做绝大多数决策。

核心原则：先行动，后汇报。遇到问题先自己判断并推进，不要等 CEO 拍板。

你负责：统筹协调各部门工作、汇总团队进展、推进跨部门里程碑、独立处理日常运营决策。

自主决策权限（以下情况自己决定，不需要找 CEO）：
- 跨部门资源调配和优先级排序
- 延期、计划调整、方案选型
- 任务分配、人员调度
- 日常预算内支出（合理范围内）
- 供应商、合作方的初步沟通

仅在以下情况才上报 CEO（用 <需要决策> 标签）：
- 影响公司战略方向的重大转变
- 大额不可逆支出（超过合理预算上限）
- 对外重大合作/雇用决策
- 你评估后仍存在真实的重大风险且无法独立解决
上报格式（系统自动渲染为可点击卡片）：
  <需要决策 options="选项A|选项B">背景：XXX；你的建议：XXX；需要 CEO 最终确认的原因：XXX</需要决策>

调度原则（必须遵守）：
- 默认串行推进：一次只推动 1 个关键任务进入执行，除非明确无依赖冲突。
- 强依赖优先：先完成上游，再启动下游。
- 你是 CEO 的唯一对话窗口：其他角色通过你向 CEO 传递信息。

沟通风格：结论先行、简洁务实，回复控制在 4-6 句话。汇报时说明：当前里程碑、负责人、阻塞点、下一步。

管理工具：
- 查询同事近期动态：<查同事 id="EMPLOYEE_ID"/>
- 委托同事执行任务：<委托同事 id="EMPLOYEE_ID">任务内容</委托同事>
- 分配任务给指定员工：<分配任务给:员工名或ID>任务内容</分配任务给>
- 协作触发（最多一次）：<触发协作 to="EMPLOYEE_ID" task="简要任务描述"/>
可用同事 ID：${COLLEAGUE_IDS}。`,
    cronSchedule: "0 13 * * 1-5",
    cronPrompt:
      "先查询各员工最新动态，再写一份综合进展汇报：总体状态、关键风险、跨部门阻塞和下一步分工。如有需要上报 CEO 的重大风险，用 <需要决策> 标签列出，否则自己给出处理建议。用中文。以 [进展汇报] 开头。",
  },
  {
    id: "company-pm",
    name: "Alex",
    role: "产品经理",
    emoji: "\uD83E\uDDE9",
    accentColor: "#7b61ff",
    systemPrompt: `你是 Alex，公司的产品经理（PM）。
你负责：收集用户反馈、整理功能需求、拆分故事、确定优先级、协调产品路线图。
工作方式：
- 主动汇报：每天整理当前最重要的 3 件产品事项，以日报形式汇报。
- 自主决策：优先级排序、需求取舍、版本规划等产品决策由你自主判断并执行，不需要逐一请示。
- 如遇跨部门资源冲突或重大路线分歧，向 Jordan（COO，company-coo）协调，不直接找 CEO。
- 执行指令：收到指令后，分解为具体 story，协调工程团队执行。
沟通风格：简洁、逻辑清晰，用数据说话，回复控制在 3-5 句话以内。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事。可用同事 ID：${COLLEAGUE_IDS}。`,
    cronSchedule: "0 9 * * 1-5",
    cronPrompt:
      "写一份进展汇报：当前最重要的 3 件产品事项，每条不超过 2 句话。用中文。以 [进展汇报] 开头。",
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
- 自主决策：技术选型、架构方案、工期估算由你自主判断并执行，不需要逐一请示。
- 如遇资源不足或跨部门阻塞，向 Jordan（COO，company-coo）反映，不直接找 CEO。
- 执行指令：收到任务后，估算工期、拆分子任务、推进落地。
沟通风格：用非技术语言向团队解释，简洁直接。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事。可用同事 ID：${COLLEAGUE_IDS}。`,
    cronSchedule: "0 10 * * 1-5",
    cronPrompt:
      "写一份进展汇报：昨日完成的任务、今日计划、当前阻塞项（如有）。用中文。以 [进展汇报] 开头。",
  },
  {
    id: "company-ops",
    name: "Maya",
    role: "运营",
    emoji: "\uD83D\uDCCA",
    accentColor: "#f5a623",
    systemPrompt: `你是 Maya，公司的运营负责人。
你负责：用户增长、推广活动、渠道运营、数据分析、KPI 追踪。
工作方式：
- 主动汇报：每天汇报关键运营指标（DAU、转化率、推广效果）。
- 自主决策：日常推广策略、渠道运营、活动方案由你自主制定并执行，不需要逐一请示。
- 如遇超出常规预算的大额投入，向 Jordan（COO，company-coo）反映，由 COO 判断是否需要上报。
- 执行指令：收到任务后，制定计划、执行并追踪效果。
沟通风格：数据导向，直接给出结论，避免废话。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事。可用同事 ID：${COLLEAGUE_IDS}。`,
    cronSchedule: "0 11 * * 1-5",
    cronPrompt:
      "写一份进展汇报：核心指标概览（DAU/新增/转化）、今日重点工作、数据异常（如有）。用中文。以 [进展汇报] 开头。",
  },
  {
    id: "company-mkt",
    name: "Leo",
    role: "市场",
    emoji: "\uD83D\uDCE3",
    accentColor: "#e05c5c",
    systemPrompt: `你是 Leo，公司的市场负责人。
你负责：品牌建设、内容营销、社交媒体、竞品分析、PR/媒体关系。
工作方式：
- 主动汇报：每天汇报市场动态、内容发布情况、竞品新消息。
- 自主决策：内容方向、日常营销策略、社媒发布计划由你自主制定并执行，不需要逐一请示。
- 如遇影响品牌定位的重大方向转变，向 Jordan（COO，company-coo）沟通，由 COO 判断是否需要上报。
- 执行指令：收到任务后，制定策略并落地执行，反馈效果数据。
沟通风格：有创意感但不失重点，简洁，善用类比。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事。可用同事 ID：${COLLEAGUE_IDS}。`,
    cronSchedule: "0 14 * * 1-5",
    cronPrompt:
      "写一份进展汇报：竞品新动态（如有）、内容发布状态、下一步市场计划。用中文。以 [进展汇报] 开头。",
  },
  {
    id: "company-fin",
    name: "Chris",
    role: "财务",
    emoji: "\uD83D\uDCB0",
    accentColor: "#9494b0",
    systemPrompt: `你是 Chris，公司的财务负责人。
你负责：预算管理、成本控制、财务预测、API 成本追踪、支出审批。
工作方式：
- 主动汇报：每周汇报支出概览和 runway（每周一）。
- 自主决策：日常支出审批、预算调配、成本控制措施由你自主决定并执行，不需要逐一请示。
- 如遇可能影响公司 runway 的重大不可逆支出，向 Jordan（COO，company-coo）反映，由 COO 判断是否需要上报。
- 执行指令：收到预算相关指令后，落地执行并追踪结果。
沟通风格：数字精确，控制在 3 句话内，附上具体金额。
协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事。可用同事 ID：${COLLEAGUE_IDS}。`,
    cronSchedule: "0 9 * * 1",
    cronPrompt:
      "写一份进展汇报：本周总支出、当前 runway 估算、需要注意的成本异常。用中文。以 [进展汇报] 开头。",
  },
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
    cronPrompt: c.cron_prompt,
  }));
  return [...EMPLOYEES, ...custom];
}
function getAnyEmployee(id) {
  return getAllEmployees().find((e) => e.id === id);
}

// src/api.ts
var CHIEF_ID = "company-coo";
function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function parseBody(req) {
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
async function handleApiRequest(ctx) {
  const { req, res } = ctx;
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const parseGoalId = (v) => {
    if (!v) return;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  try {
    if (req.method === "GET" && path === "/company/api/hall") {
      const goalId2 = parseGoalId(url.searchParams.get("goalId"));
      const goals = getActiveGoals().filter((g) => goalId2 === undefined || g.id === goalId2);
      const goalsWithTasks = goals.map((g) => ({
        ...g,
        tasks: getGoalTasks(g.id),
      }));
      const pending = getPendingDecisions(goalId2);
      const reports = getRecentReports(10, goalId2);
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
    if (req.method === "GET" && path === "/company/api/decisions/stats") {
      const goalId2 = parseGoalId(url.searchParams.get("goalId"));
      return json(res, { stats: getDecisionStats(goalId2) });
    }
    if (req.method === "GET" && path === "/company/api/decisions") {
      const q = url.searchParams.get("q");
      const employee = url.searchParams.get("employee") ?? "";
      const status = url.searchParams.get("status") ?? "";
      const goalId2 = parseGoalId(url.searchParams.get("goalId"));
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const offset = Number(url.searchParams.get("offset") ?? "0");
      let decisions;
      if (q) {
        decisions = goalId2 !== undefined ? searchDecisionsByGoal(q, goalId2) : searchDecisions(q);
      } else if (employee || status) {
        decisions = getDecisionsFiltered({
          employeeId: employee || undefined,
          status: status || undefined,
          goalId: goalId2,
          limit,
          offset,
        });
      } else {
        decisions =
          goalId2 !== undefined
            ? getDecisionsFiltered({ goalId: goalId2, limit, offset })
            : getDecisions(limit, offset);
      }
      return json(res, { decisions });
    }
    if (req.method === "POST" && path === "/company/api/decisions") {
      const body = await parseBody(req);
      const { pendingId, employeeId, summary, choice, context, goalId: goalId2 } = body;
      if (!employeeId || !summary || !choice) {
        return json(res, { error: "employeeId, summary, choice are required" }, 400);
      }
      if (pendingId) deletePendingDecision(pendingId);
      const decision = insertDecision(employeeId, summary, choice, context, goalId2);
      const employee = getAnyEmployee(employeeId);
      const empName = employee?.name ?? employeeId;
      insertActivity(
        employeeId,
        "decision_received",
        `CEO 确认了决策：${summary}
\uD83D\uDC49 选择：${choice}${
          context
            ? `
补充：${context}`
            : ""
        }`,
        { summary, choice, phase: "confirmed", goalId: goalId2 },
      );
      if (employee) {
        const notifyPrompt = `CEO 对你发起的请求做出了决策。
决策摘要：${summary}
CEO 的选择：${choice}
${context ? `附加说明：${context}` : ""}
请确认收到并说明你的下一步行动计划（2-3 句话）。`;
        setImmediate(() => {
          ctx
            .runAgent(employeeId, notifyPrompt, goalId2)
            .then((reply) => {
              if (reply) {
                insertActivity(employeeId, "task_response", `${empName} 回复：${reply}`, {
                  summary,
                  choice,
                  phase: "response",
                  goalId: goalId2,
                });
                updateDecisionTag(decision.id, "in_progress");
                ctx.scheduleFollowUp(employeeId, 60 * 1000, goalId2);
              }
            })
            .catch(() => {
              return;
            });
        });
      }
      return json(res, { decision });
    }
    if (req.method === "POST" && path === "/company/api/decisions/pending") {
      const body = await parseBody(req);
      const { employeeId, background, optionA, optionB, options } = body;
      if (!employeeId || !background || !optionA) {
        return json(res, { error: "employeeId, background, optionA are required" }, 400);
      }
      if (employeeId !== CHIEF_ID) {
        return json(res, { error: "只有 COO 可以向 CEO 提交待决事项" }, 403);
      }
      const pending = insertPendingDecision(
        employeeId,
        background,
        optionA,
        optionB,
        options,
        goalId,
      );
      const label =
        options && options.length >= 2
          ? options.join(" | ")
          : optionB
            ? `选A: ${optionA} | 选B: ${optionB}`
            : optionA;
      insertActivity(employeeId, "pending_decision", `[待决] ${background}（${label}）`, {
        goalId,
      });
      return json(res, { pending });
    }
    if (req.method === "GET" && path === "/company/api/reports") {
      const goalId2 = parseGoalId(url.searchParams.get("goalId"));
      if (url.searchParams.has("days")) {
        const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "7"), 1), 30);
        const reports2 = getReportsByDays(days, goalId2);
        return json(res, { reports: reports2 });
      }
      const limit = Number(url.searchParams.get("limit") ?? "30");
      const reports = getRecentReports(limit, goalId2);
      return json(res, { reports });
    }
    if (req.method === "GET" && path === "/company/api/activity") {
      const goalId2 = parseGoalId(url.searchParams.get("goalId"));
      const limit = Number(url.searchParams.get("limit") ?? "60");
      const activity = getRecentActivity(limit, goalId2);
      return json(res, { activity });
    }
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
      const { message, goalId: goalId2 } = body;
      if (!message) {
        return json(res, { error: "message is required" }, 400);
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const write = (event, data) => {
        res.write(`event: ${event}
data: ${JSON.stringify(data)}

`);
      };
      try {
        await ctx.runAgentStream(
          employeeId,
          message,
          (chunk) => {
            write("chunk", chunk);
          },
          goalId2,
        );
        write("done", "");
      } catch (err) {
        write("error", err instanceof Error ? err.message : String(err));
      }
      res.end();
      return;
    }
    if (req.method === "DELETE" && path === "/company/api/sessions") {
      const goalId2 = parseGoalId(url.searchParams.get("goalId"));
      const { join: join2 } = await import("node:path");
      const { homedir: homedir2 } = await import("node:os");
      const { existsSync: existsSync2, unlinkSync, readdirSync } = await import("node:fs");
      const agentDir = join2(homedir2(), ".openclaw", "agents");
      for (const emp of getAllEmployees()) {
        const empDir = join2(agentDir, emp.id);
        if (!existsSync2(empDir)) continue;
        if (goalId2 !== undefined) {
          const f = join2(empDir, `goal-${goalId2}`, "sessions.json");
          if (existsSync2(f)) unlinkSync(f);
        } else {
          const f = join2(empDir, "sessions", "sessions.json");
          if (existsSync2(f)) unlinkSync(f);
          for (const entry of readdirSync(empDir)) {
            if (entry.startsWith("goal-")) {
              const gf = join2(empDir, entry, "sessions.json");
              if (existsSync2(gf)) unlinkSync(gf);
            }
          }
        }
      }
      return json(res, { ok: true });
    }
    if (req.method === "DELETE" && path.match(/^\/company\/api\/chat\/[^/]+\/session$/)) {
      const employeeId = path.slice("/company/api/chat/".length).replace("/session", "");
      const { join: join2 } = await import("node:path");
      const { homedir: homedir2 } = await import("node:os");
      const { existsSync: existsSync2, unlinkSync } = await import("node:fs");
      const agentDir = join2(homedir2(), ".openclaw", "agents", employeeId);
      const sessionFile = join2(agentDir, "sessions", "sessions.json");
      if (existsSync2(sessionFile)) unlinkSync(sessionFile);
      return json(res, { ok: true });
    }
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
      const { message, goalId: goalId2 } = body;
      if (!message) {
        return json(res, { error: "message is required" }, 400);
      }
      const reply = await ctx.runAgent(employeeId, message, goalId2);
      return json(res, { reply });
    }
    if (req.method === "POST" && path === "/company/api/goals") {
      const body = await parseBody(req);
      const { title, description, quarter } = body;
      if (!title) {
        return json(res, { error: "title is required" }, 400);
      }
      const { insertGoal: insertGoal2 } = await Promise.resolve().then(
        () => (init_db(), exports_db),
      );
      const goal = insertGoal2(title, description ?? "", quarter ?? "");
      ctx.decomposGoal(goal.id, goal.title, goal.description ?? "").catch((err) => {
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
        insertActivity("company-coo", "pending_decision", `[待决] ${background}`, {
          goalId: goal.id,
          phase: "decompose_error",
        });
      });
      return json(res, { goal, message: "目标已设置，AI 正在拆解任务..." });
    }
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
    if (req.method === "PATCH" && /^\/company\/api\/goals\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const { title, description, quarter } = body;
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
    if (req.method === "DELETE" && /^\/company\/api\/goals\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop());
      deleteGoal(id);
      return json(res, { ok: true });
    }
    if (req.method === "PATCH" && /^\/company\/api\/tasks\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop());
      const body = await parseBody(req);
      const { status, deadline, priority, extraGoalIds } = body;
      if (status !== undefined && !["pending", "in_progress", "done"].includes(status)) {
        return json(res, { error: "status must be pending | in_progress | done" }, 400);
      }
      if (priority !== undefined && !["low", "normal", "high"].includes(priority)) {
        return json(res, { error: "priority must be low | normal | high" }, 400);
      }
      if (extraGoalIds !== undefined && extraGoalIds !== null) {
        if (!Array.isArray(extraGoalIds) || !extraGoalIds.every((x) => typeof x === "number")) {
          return json(res, { error: "extraGoalIds must be an array of numbers or null" }, 400);
        }
      }
      updateGoalTask(id, {
        ...(status !== undefined && { status }),
        ...(deadline !== undefined && { deadline }),
        ...(priority !== undefined && { priority }),
        ...(extraGoalIds !== undefined && {
          extraGoalIds: extraGoalIds === null ? null : extraGoalIds,
        }),
      });
      return json(res, { ok: true });
    }
    if (req.method === "POST" && path === "/company/api/employees/generate") {
      const body = await parseBody(req);
      const { description } = body;
      if (!description) return json(res, { error: "description is required" }, 400);
      const generated = await ctx.generateEmployee(description);
      return json(res, { employee: generated });
    }
    if (req.method === "POST" && path === "/company/api/employees") {
      const body = await parseBody(req);
      const { id, name, role, emoji, accentColor, systemPrompt, cronSchedule, cronPrompt } = body;
      if (!id || !name || !role) return json(res, { error: "id, name, role are required" }, 400);
      insertCustomEmployee({
        id,
        name,
        role,
        emoji: emoji ?? "\uD83E\uDD16",
        accent_color: accentColor ?? "#7b61ff",
        system_prompt: systemPrompt ?? "",
        cron_schedule: cronSchedule ?? "0 10 * * 1-5",
        cron_prompt: cronPrompt ?? "",
      });
      const onboardingPrompt = `你刚刚加入公司，角色是${role}。请做一个简短的自我介绍（2-3句），并说明你将如何为公司创造价值。以「[入职] 」开头。`;
      setImmediate(() => {
        ctx
          .runAgent(id, onboardingPrompt)
          .then((reply) => {
            if (reply) insertActivity(id, "task_response", reply);
          })
          .catch(() => {
            return;
          });
      });
      return json(res, { ok: true });
    }
    if (req.method === "DELETE" && path.startsWith("/company/api/employees/")) {
      const empId = path.slice("/company/api/employees/".length);
      deleteCustomEmployee(empId);
      return json(res, { ok: true });
    }
    if (req.method === "DELETE" && path === "/company/api/reset") {
      clearAllTransientData();
      const { join: join2 } = await import("node:path");
      const { homedir: homedir2 } = await import("node:os");
      const {
        existsSync: existsSync2,
        unlinkSync,
        readdirSync,
        statSync,
      } = await import("node:fs");
      const agentsRoot = join2(homedir2(), ".openclaw", "agents");
      if (existsSync2(agentsRoot)) {
        for (const agentId of readdirSync(agentsRoot)) {
          const empDir = join2(agentsRoot, agentId);
          try {
            if (!statSync(empDir).isDirectory()) continue;
          } catch {
            continue;
          }
          const rootSession = join2(empDir, "sessions.json");
          if (existsSync2(rootSession)) unlinkSync(rootSession);
          for (const sub of readdirSync(empDir)) {
            const subPath = join2(empDir, sub, "sessions.json");
            if (existsSync2(subPath)) unlinkSync(subPath);
          }
        }
      }
      return json(res, { ok: true });
    }
    json(res, { error: "Not found" }, 404);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    json(res, { error: msg }, 500);
  }
}

import { randomUUID } from "node:crypto";
// src/agent-runner.ts
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
init_db();
var MAX_TOOL_ITERATIONS = 5;
function resolveAgentModel(config) {
  const agentsCfg = config?.agents?.defaults?.model;
  const primary = typeof agentsCfg === "string" ? agentsCfg : agentsCfg?.primary;
  if (!primary) return {};
  const slashIdx = primary.indexOf("/");
  if (slashIdx === -1) return { model: primary };
  return { provider: primary.slice(0, slashIdx), model: primary.slice(slashIdx + 1) };
}
var COLLEAGUE_QUERY_RE = /<查同事\s+id="([^"]+)"(?:\s+limit="(\d+)")?\s*\/>/;
var COLLAB_TRIGGER_RE = /<触发协作\s+to="([^"]+)"\s+task="([^"]+)"\s*\/>/;
var DELEGATE_COLLEAGUE_RE = /<委托同事\s+id="([^"]+)">([\s\S]*?)<\/委托同事>/;
var ASSIGN_TASK_RE = /<分配任务给:([^>]+)>([\s\S]*?)<\/分配任务给>/;
var DECISION_REQUEST_RE = /<需要决策\s+options="([^"]+)">([\s\S]*?)<\/需要决策>/;
function applyTaskStatusFromReply(employeeId, text, goalId2) {
  let doneCount = 0;
  let inProgressCount = 0;
  for (const [tag, status] of [
    ["任务完成", "done"],
    ["任务进行中", "in_progress"],
  ]) {
    const tagRe = new RegExp(`\\[${tag}[：:](.*?)\\]`, "g");
    let m;
    while ((m = tagRe.exec(text)) !== null) {
      const keyword = m[1].trim();
      if (!keyword) continue;
      try {
        const task = findGoalTaskByTitle(employeeId, keyword, goalId2);
        if (task) {
          updateGoalTaskStatus(task.id, status);
          if (status === "done") doneCount += 1;
          if (status === "in_progress") inProgressCount += 1;
        }
      } catch {}
    }
  }
  return { doneCount, inProgressCount };
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
async function runEmployeeAgent(employeeId, prompt, deps, onChunk, depth = 0, goalId2) {
  const employee = getAnyEmployee(employeeId);
  if (!employee) throw new Error(`Unknown employee: ${employeeId}`);
  const agentDir = join2(homedir2(), ".openclaw");
  const workspaceDir =
    goalId2 !== undefined
      ? join2(agentDir, "agents", employeeId, `goal-${goalId2}`)
      : join2(agentDir, "agents", employeeId);
  const sessionKey =
    goalId2 !== undefined ? `agent:${employeeId}:goal:${goalId2}` : `agent:${employeeId}:company`;
  const sessionFile = join2(workspaceDir, "sessions.json");
  const scopedGoal = goalId2 !== undefined ? getGoalById(goalId2) : undefined;
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
    timeoutMs: 600000,
    ...resolveAgentModel(deps.config),
    ...(onChunk
      ? {
          onPartialReply: (payload) => {
            const chunk = payload.delta ?? "";
            if (chunk) onChunk(chunk);
          },
        }
      : {}),
  };
  let currentPrompt = prompt;
  let lastText = "";
  const withGoalScope = (rawPrompt) => {
    if (goalId2 === undefined) return rawPrompt;
    const taskLines = getEmployeeActiveTasks(employeeId, goalId2).map(
      (t) => `- [${t.status}] ${t.title}`,
    ).join(`
`);
    const goalTitle = scopedGoal?.title ?? `目标#${goalId2}`;
    return `【当前目标工作区】
你当前只在这个目标下工作：${goalTitle}（goalId=${goalId2}）
请严格围绕该目标回复，不要混入其他目标的任务。
${
  taskLines
    ? `你在该目标下的待办：
${taskLines}
`
    : `你在该目标下暂时没有未完成任务。
`
}

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
    const queryMatch = COLLEAGUE_QUERY_RE.exec(lastText);
    if (queryMatch) {
      const colleagueId = queryMatch[1];
      const limit = Math.min(Number(queryMatch[2] ?? "5"), 10);
      const activity = getEmployeeActivityForActiveGoals(colleagueId, limit, goalId2);
      const colleague = getAnyEmployee(colleagueId);
      const collegeName = colleague ? `${colleague.name}（${colleague.role}）` : colleagueId;
      const dataBlock =
        activity.length > 0
          ? activity.map(
              (a) => `[${a.event_type}] ${a.created_at}
${a.content}`,
            ).join(`

---

`)
          : `${collegeName} 暂无近期动态`;
      currentPrompt = `[同事动态] ${collegeName} 的最新 ${limit} 条记录：

${dataBlock}

请基于以上信息继续完成任务。`;
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
          const collabPrompt = `「${sourceName}」请求协作：${task}

请基于你的职能给出具体建议（3-5句）。`;
          insertActivity(targetId, "task_assigned", `[协作请求] ${sourceName} 邀请协作：${task}`, {
            goalId: goalId2,
            requestedBy: employeeId,
          });
          try {
            const collabReply = await runEmployeeAgent(
              targetId,
              collabPrompt,
              deps,
              undefined,
              1,
              goalId2,
            );
            if (collabReply) {
              insertActivity(
                targetId,
                "task_response",
                `[协作回复] ${targetName}：${collabReply}`,
                { goalId: goalId2, requestedBy: employeeId },
              );
              currentPrompt = `[协作回复] ${targetName} 的回复：
${collabReply}

请基于以上协作意见继续完成任务。`;
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
        const dbTask =
          goalId2 !== undefined ? getDispatchedActiveTasks(toId, goalId2)[0] : undefined;
        const keyword = dbTask ? dbTask.title.slice(0, 20) : message.slice(0, 20);
        const taskPrompt = `${message}

任务状态标记（必须输出）：开始执行时输出 [任务进行中: ${keyword}]，全部完成时输出 [任务完成: ${keyword}]。`;
        try {
          const reply = await runEmployeeAgent(toId, taskPrompt, deps, undefined, 1, goalId2);
          if (reply) {
            insertActivity(toId, "task_response", reply, {
              delegatedBy: employeeId,
              goalId: goalId2,
            });
            insertActivity(employeeId, "task_response", `已委托 ${toId}：${message}`, {
              delegateTo: toId,
              goalId: goalId2,
            });
            if (goalId2 !== undefined && reply.includes("[任务完成")) {
              const dispatched = getDispatchedActiveTasks(toId, goalId2);
              for (const dt of dispatched) updateGoalTaskStatus(dt.id, "done");
              if (dispatched.length > 0)
                dispatchReadyTasksForGoal(goalId2, deps).catch(() => {
                  return;
                });
            }
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
        const targetEmployee =
          allEmps.find((e) => e.id === targetNameOrId) ??
          allEmps.find((e) => e.name === targetNameOrId) ??
          allEmps.find((e) => e.role === targetNameOrId);
        if (targetEmployee) {
          const targetId = targetEmployee.id;
          const dbTask =
            goalId2 !== undefined ? getDispatchedActiveTasks(targetId, goalId2)[0] : undefined;
          const keyword = dbTask ? dbTask.title.slice(0, 20) : taskContent.slice(0, 20);
          const taskPrompt = `${taskContent}

任务状态标记（必须输出）：开始执行时输出 [任务进行中: ${keyword}]，全部完成时输出 [任务完成: ${keyword}]。`;
          insertActivity(targetId, "task_assigned", taskContent, {
            assignedBy: employeeId,
            goalId: goalId2,
          });
          try {
            const reply = await runEmployeeAgent(targetId, taskPrompt, deps, undefined, 1, goalId2);
            if (reply) {
              insertActivity(targetId, "task_response", reply, {
                assignedBy: employeeId,
                goalId: goalId2,
              });
              if (goalId2 !== undefined && reply.includes("[任务完成")) {
                const dispatched = getDispatchedActiveTasks(targetId, goalId2);
                for (const dt of dispatched) updateGoalTaskStatus(dt.id, "done");
                if (dispatched.length > 0)
                  dispatchReadyTasksForGoal(goalId2, deps).catch(() => {
                    return;
                  });
              }
            }
          } catch {}
        }
        break;
      }
    }
    if (depth === 0 && employeeId === "company-coo") {
      const decisionMatch = DECISION_REQUEST_RE.exec(lastText);
      if (decisionMatch) {
        const options = decisionMatch[1]
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
        const background = decisionMatch[2].trim();
        if (options.length >= 2) {
          insertPendingDecision(employeeId, background, options[0], options[1], options, goalId2);
          insertActivity(
            employeeId,
            "pending_decision",
            `[待决] ${background}（${options.join(" | ")}）`,
            { goalId: goalId2 },
          );
        }
        break;
      }
    }
    break;
  }
  if (lastText) {
    const status = applyTaskStatusFromReply(employeeId, lastText, goalId2);
    if (goalId2 !== undefined && status.doneCount > 0) {
      dispatchReadyTasksForGoal(goalId2, deps).catch(() => {
        return;
      });
    }
  }
  return lastText;
}
async function dispatchReadyTasksForGoal(goalId2, deps) {
  const goal = getGoalById(goalId2);
  if (!goal) return;
  const tasks = getGoalTasks(goalId2);
  if (tasks.length === 0) return;
  const byUid = new Map();
  for (const t of tasks) if (t.task_uid) byUid.set(t.task_uid, t);
  const ready = tasks
    .filter((t) => t.status !== "done" && t.dispatched_at == null)
    .filter((t) => {
      const depsUids = parseDependsOn(t);
      if (depsUids.length === 0) return true;
      return depsUids.every((uid) => byUid.get(uid)?.status === "done");
    })
    .sort((a, b) => a.sequence - b.sequence || a.id - b.id);
  const toDispatch = ready.slice(0, 1);
  if (toDispatch.length === 0) return;
  const task = toDispatch[0];
  markGoalTaskDispatched(task.id);
  const allTaskLines = tasks.map((t, i) => {
    const s = t.status === "done" ? "✅" : t.dispatched_at ? "⏳" : "⬜";
    return `${s} [${t.task_uid ?? `T${i + 1}`}] ${t.title}（${t.employee_id}）`;
  }).join(`
`);
  const cooPrompt = `目标「${goal.title}」任务推进：以下任务的依赖已完成，请你立即分配执行：

任务：${task.title}
负责人：${task.employee_id}
${task.deliverable ? `可交付物：${task.deliverable}` : ""}
${task.done_definition ? `完成标准：${task.done_definition}` : ""}

目标整体进度：
${allTaskLines}

请现在输出 <分配任务给:${task.employee_id}>任务具体要求</分配任务给>，启动这个任务。`;
  try {
    if (task.employee_id === "company-coo") {
      const keyword = task.title.slice(0, 20);
      const cooExecPrompt = `目标「${goal.title}」指定由你直接执行以下任务：

任务：${task.title}
${task.deliverable ? `可交付物：${task.deliverable}` : ""}
${task.done_definition ? `完成标准：${task.done_definition}` : ""}

目标整体进度：
${allTaskLines}

请直接产出可交付物。完成后输出 [任务完成: ${keyword}]。`;
      const reply = await runEmployeeAgent(
        "company-coo",
        cooExecPrompt,
        deps,
        undefined,
        0,
        goalId2,
      );
      if (reply) {
        insertActivity("company-coo", "task_response", reply, { goalId: goalId2, taskId: task.id });
      }
    } else {
      const reply = await runEmployeeAgent("company-coo", cooPrompt, deps, undefined, 0, goalId2);
      if (reply) {
        insertActivity(
          "company-coo",
          "task_assigned",
          `[COO分配] ${task.title} → ${task.employee_id}`,
          { goalId: goalId2, taskId: task.id },
        );
      }
    }
  } catch {
    updateGoalTask(task.id, { status: "pending" });
  }
}
async function runEmployeeCron(employeeId, deps) {
  const employee = getAnyEmployee(employeeId);
  if (!employee) return;
  const activeTasks = getEmployeeActiveTasks(employeeId);
  const grouped = new Map();
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
  for (const [goalId2, tasks] of grouped) {
    let prompt = employee.cronPrompt;
    const taskLines = tasks.map(
      (t) => `  - [${t.status === "in_progress" ? "进行中" : "待开始"}] ${t.title}`,
    ).join(`
`);
    prompt += `

你当前有以下待完成任务，请在日报中说明每项任务的最新进展：
${taskLines}

规则：
- 如某项任务已完成，在回复中加 [任务完成: 任务标题关键词]
- 如某项任务正在进行，在回复中加 [任务进行中: 任务标题关键词]
- 如某项任务遇到阻塞需要 CEO 决策，加 [待决] 标记
- 汇报以 [进展汇报] 开头`;
    try {
      const reply = await runEmployeeAgent(employeeId, prompt, deps, undefined, 0, goalId2);
      if (reply) {
        insertReport(employeeId, reply, goalId2);
        insertActivity(employeeId, "report", reply, { goalId: goalId2 });
      }
    } catch {}
  }
}
var MAX_FOLLOWUP_ITERATIONS = 6;
function scheduleFollowUp(employeeId, deps, delayMs = 2 * 60 * 1000, iteration = 1, goalId2) {
  if (iteration > MAX_FOLLOWUP_ITERATIONS) return;
  setTimeout(() => {
    const followUpPrompt = `基于你当前的任务，产出下一个里程碑的可交付成果。

规则：
- 直接给出内容（文档草稿/分析/方案/列表/代码片段），不要说"我正在..."
- 如果上一步已产出初稿，现在细化或推进下一步
- 遇到阻塞或资源冲突，向 Jordan（COO，company-coo）反映，不要自行上报 CEO
- 完成全部任务时加 [任务完成: 关键词]
- 仍在推进时加 [任务进行中: 关键词]`;
    runEmployeeAgent(employeeId, followUpPrompt, deps, undefined, 0, goalId2)
      .then((reply) => {
        if (!reply) return;
        insertReport(employeeId, reply, goalId2);
        insertActivity(employeeId, "task_response", reply, { goalId: goalId2 });
        const isDone = reply.includes("[任务完成");
        const isBlocked = reply.includes("[待决]");
        if (!isDone && !isBlocked) {
          scheduleFollowUp(employeeId, deps, 2 * 60 * 1000, iteration + 1, goalId2);
        }
      })
      .catch(() => {
        return;
      });
  }, delayMs);
}
async function decomposeGoal(goalId2, title, description, deps) {
  const employees = getAllEmployees().filter((e) => e.id !== "company-coo");
  const employeeList = employees.map((e) => `- ${e.role} (${e.name}, id=${e.id})`).join(`
`);
  const decompositionPrompt = `你是公司的 AI 目标分解助手。
CEO 设置了以下季度目标：
标题：${title}
${description ? `描述：${description}` : ""}

员工列表：
${employeeList}

请将这个目标分解为"有依赖关系"的执行计划，要求：
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
  if (getGoalTasks(goalId2).length > 0) return;
  const agentDir = join2(homedir2(), ".openclaw");
  const workspaceDir = join2(agentDir, "agents", "company-decomposer", `goal-${goalId2}`);
  const knownEmployeeIds = new Set(employees.map((e) => e.id));
  const result = await deps.runEmbeddedPiAgent({
    sessionId: `decompose-${randomUUID()}`,
    sessionKey: `agent:company-decomposer:goal-${goalId2}`,
    agentId: "company-decomposer",
    sessionFile: join2(workspaceDir, "sessions.json"),
    workspaceDir,
    agentDir,
    config: deps.config,
    prompt: decompositionPrompt,
    trigger: "user",
    senderIsOwner: true,
    disableMessageTool: true,
    disableTools: true,
    runId: randomUUID(),
    timeoutMs: 120000,
    ...resolveAgentModel(deps.config),
  });
  const payloads = result?.payloads ?? [];
  const text = [...payloads].reverse().find((p) => p.text?.trim())?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`目标拆解输出非 JSON（goalId=${goalId2}）`);
  }
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error(`目标拆解 JSON 解析失败（goalId=${goalId2}）`);
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
  const badDeps = [];
  for (const task of parsed.tasks ?? []) {
    for (const dep of task.depends_on ?? []) {
      if (!knownUidSet.has(dep)) badDeps.push(`${task.uid}->${dep}`);
      if (dep === task.uid) badDeps.push(`${task.uid}->${dep}(self)`);
    }
  }
  if (badDeps.length > 0) {
    throw new Error(`目标拆解依赖非法: ${[...new Set(badDeps)].join(", ")}`);
  }
  const plannedTasks = (parsed.tasks ?? [])
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
    throw new Error(`目标拆解返回空任务列表（goalId=${goalId2}）`);
  }
  for (const task of plannedTasks) {
    insertGoalTaskWithMeta(goalId2, task.employee_id, task.title, {
      taskUid: task.uid,
      dependsOnTaskUids: task.depends_on,
      deliverable: task.deliverable,
      doneDefinition: task.done_definition,
      sequence: task.sequence,
    });
  }
  const allTasks = getGoalTasks(goalId2);
  const taskPlan = allTasks.map((t, i) => {
    const taskDeps = parseDependsOn(t);
    return `[${t.task_uid ?? `T${i + 1}`}] ${t.title}
  负责人：${t.employee_id}
  依赖：${taskDeps.length ? taskDeps.join(", ") : "无"}
  可交付：${t.deliverable ?? "提交可评审产出"}`;
  }).join(`

`);
  const firstTask = allTasks[0];
  const cooKickoffPrompt = `CEO 刚设置了新目标「${title}」${
    description
      ? `
描述：${description}`
      : ""
  }

我已为你生成完整执行计划（共 ${allTasks.length} 个任务，串行依赖）：

${taskPlan}

当前「${firstTask.title}」无依赖，可以立即执行，负责人是 ${firstTask.employee_id}。

请用 <分配任务给:${firstTask.employee_id}>任务具体要求</分配任务给> 启动第一个任务。`;
  await runEmployeeAgent("company-coo", cooKickoffPrompt, deps, undefined, 0, goalId2);
}
async function generateEmployeeFromDescription(description, deps) {
  const currentEmployees = getAllEmployees();
  const employeeList = currentEmployees.map((e) => `- ${e.role} (${e.name}, id=${e.id})`).join(`
`);
  const existingNames = currentEmployees.map((e) => e.name).join("、");
  const existingIds = currentEmployees.map((e) => e.id).join("、");
  const agentDir = join2(homedir2(), ".openclaw");
  const workspaceDir = join2(agentDir, "agents", "company-hr");
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
    sessionFile: join2(workspaceDir, "sessions.json"),
    workspaceDir,
    agentDir,
    config: deps.config,
    prompt,
    trigger: "user",
    senderIsOwner: true,
    disableMessageTool: true,
    disableTools: true,
    runId: randomUUID(),
    timeoutMs: 60000,
    ...resolveAgentModel(deps.config),
  });
  const payloads = result?.payloads ?? [];
  const text = [...payloads].reverse().find((p) => p.text?.trim())?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 未能生成有效员工档案");
  return JSON.parse(match[0]);
}

// index.ts
init_db();
var __filename2 = fileURLToPath(import.meta.url);
var __dirname2 = dirname(__filename2);
var CHIEF_ID2 = "company-coo";
function getEmployeeIds() {
  return new Set(getAllEmployees().map((e) => e.id));
}
var company_default = definePluginEntry({
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
          const authHeader = req.headers["authorization"] ?? "";
          const bearerOk = authHeader === `Bearer ${gatewayToken}`;
          const cookieHeader = req.headers["cookie"] ?? "";
          const cookieOk = cookieHeader
            .split(";")
            .some((c) => c.trim() === `company-session=${gatewayToken}`);
          const queryToken = url.searchParams.get("token");
          if (queryToken === gatewayToken) {
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
                `<h2>\uD83D\uDD10 需要认证</h2>` +
                `<p>请在 URL 后添加 <code>?token=YOUR_TOKEN</code> 访问。</p>` +
                `<p>例：<code>http://localhost:18789/company?token=${gatewayToken}</code></p>` +
                `</body></html>`,
            );
            return;
          }
        }
        if (url.pathname.startsWith("/company/api/")) {
          const runFn = api.runtime.agent.runEmbeddedPiAgent;
          const agentDeps = { runEmbeddedPiAgent: runFn, config: api.config };
          return handleApiRequest({
            req,
            res,
            runAgent: (employeeId, prompt, goalId2) =>
              runEmployeeAgent(employeeId, prompt, agentDeps, undefined, 0, goalId2),
            runAgentStream: (employeeId, prompt, onChunk, goalId2) =>
              runEmployeeAgent(employeeId, prompt, agentDeps, onChunk, 0, goalId2).then(() => {
                return;
              }),
            decomposGoal: async (goalId2, title, description) => {
              await decomposeGoal(goalId2, title, description, agentDeps);
            },
            scheduleFollowUp: (employeeId, delayMs, goalId2) =>
              scheduleFollowUp(employeeId, agentDeps, delayMs, 1, goalId2),
            generateEmployee: (description) =>
              generateEmployeeFromDescription(description, agentDeps),
          });
        }
        const uiDistDir = join3(__dirname2, "ui", "dist");
        const reqPath = url.pathname.replace(/^\/company/, "") || "/";
        const assetPath = join3(uiDistDir, reqPath === "/" ? "index.html" : reqPath);
        if (reqPath !== "/" && existsSync2(assetPath)) {
          const ext = assetPath.split(".").pop() ?? "";
          const mimeMap = {
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
        const indexPath = join3(uiDistDir, "index.html");
        if (existsSync2(indexPath)) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(readFileSync(indexPath));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(DEV_PLACEHOLDER_HTML);
      },
    });
    api.on("before_prompt_build", async (_event, ctx) => {
      const agentId = ctx?.agentId;
      if (!agentId || !getEmployeeIds().has(agentId)) return;
      const employee = getAnyEmployee(agentId);
      if (!employee) return;
      const sessionKey = ctx?.sessionKey ?? "";
      const scopedGoalId = (() => {
        const m = sessionKey.match(/:goal:(\d+)/);
        if (!m) return;
        const n = Number(m[1]);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })();
      const goals =
        scopedGoalId !== undefined
          ? (() => {
              const g = getGoalById(scopedGoalId);
              return g ? [g] : [];
            })()
          : getActiveGoals();
      const recentDecisions =
        scopedGoalId !== undefined
          ? getDecisionsFiltered({ goalId: scopedGoalId, limit: 5, offset: 0 })
          : getDecisions(5);
      const goalsSummary =
        goals.length > 0
          ? goals.map((g) => `- ${g.title}${g.quarter ? ` (${g.quarter})` : ""}`).join(`
`)
          : "（CEO 尚未设置季度目标）";
      const decisionsSummary =
        recentDecisions.length > 0
          ? recentDecisions.map((d) => `- [${d.employee_id}] ${d.summary}：${d.choice}`).join(`
`)
          : "（暂无历史决策）";
      const pendingByMe = getPendingDecisions(scopedGoalId).filter(
        (p) => p.employee_id === agentId,
      ).length;
      const colleagues = getAllEmployees()
        .filter((e) => e.id !== agentId)
        .map((e) => `- ${e.id}：${e.name}（${e.role}）`).join(`
`);
      const appendSystemContext = `
## 你的角色
${employee.systemPrompt}

## 公司当前目标
${goalsSummary}

${
  scopedGoalId !== undefined
    ? `## 当前会话范围
你当前在目标隔离模式中，只处理 goalId=${scopedGoalId} 的任务。`
    : ""
}

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
    api.on("llm_output", async (event, ctx) => {
      const agentId = ctx?.agentId;
      if (!agentId || !getEmployeeIds().has(agentId) || agentId !== "company-coo") return;
      const sessionKey = ctx?.sessionKey ?? "";
      const scopedGoalId = (() => {
        const m = sessionKey.match(/:goal:(\d+)/);
        if (!m) return;
        const n = Number(m[1]);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })();
      const texts = event.assistantTexts ?? [];
      const combined = texts.join(`
`);
      if (!combined.includes("[待决]")) return;
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
          undefined,
          scopedGoalId,
        );
        const label = optionB?.trim()
          ? `选A: ${optionA.trim()} | 选B: ${optionB.trim()}`
          : optionA.trim();
        insertActivity(agentId, "pending_decision", `[待决] ${background.trim()}（${label}）`, {
          goalId: scopedGoalId,
        });
      } catch {}
      for (const [tag, status] of [
        ["任务完成", "done"],
        ["任务进行中", "in_progress"],
      ]) {
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
      const runFn2 = api.runtime.agent.runEmbeddedPiAgent;
      const agentDeps = { runEmbeddedPiAgent: runFn2, config: api.config };
      const lastFired = {};
      const coordinatorOnly = getAllEmployees().filter((e) => e.id === CHIEF_ID2);
      setInterval(() => {
        const now = new Date();
        for (const emp of coordinatorOnly) {
          if (!matchesCronNow(emp.cronSchedule, now)) continue;
          const key = `${emp.id}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
          if (lastFired[emp.id] === key) continue;
          lastFired[emp.id] = key;
          api.logger?.info(`[company] cron fire: ${emp.id}`);
          runEmployeeCron(emp.id, agentDeps).catch(() => {
            return;
          });
        }
      }, 60000);
      coordinatorOnly.forEach((emp, i) => {
        setTimeout(
          () => {
            const recent = getEmployeeReports(emp.id, 1);
            if (recent.length > 0) {
              const lastMs =
                Date.now() -
                new Date(
                  recent[0].created_at.includes("T")
                    ? recent[0].created_at
                    : recent[0].created_at.replace(" ", "T") + "Z",
                ).getTime();
              if (lastMs < 6 * 60 * 60 * 1000) return;
            }
            api.logger?.info(`[company] startup cron fire: ${emp.id}`);
            runEmployeeCron(emp.id, agentDeps).catch(() => {
              return;
            });
          },
          (i + 1) * 45000,
        );
      });
      setTimeout(() => {
        const activeGoals = getActiveGoals();
        for (const goal of activeGoals) {
          api.logger?.info(`[company] startup dispatch recovery: goal #${goal.id}`);
          resetPendingDispatches(goal.id);
          dispatchReadyTasksForGoal(goal.id, agentDeps).catch(() => {
            return;
          });
        }
      }, 15000);
    });
  },
});
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
    if (field.includes(",")) {
      return field.split(",").map(Number).includes(value);
    }
    return Number(field) === value;
  };
  return (
    matchField(minPart, nowMin) && matchField(hourPart, nowHour) && matchField(dowPart, nowDow)
  );
}
var DEV_PLACEHOLDER_HTML = `<!DOCTYPE html>
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
<h1>\uD83C\uDFE2 一人公司 OS</h1>
<p class="sub">后端已启动。UI 尚未构建。<br>
在 <code>extensions/company/ui/</code> 目录下运行 <code>pnpm build</code> 生成 SPA。</p>
<div class="links">
  <a href="/company/api/hall">GET /api/hall</a>
  <a href="/company/api/employees">GET /api/employees</a>
  <a href="/company/api/decisions">GET /api/decisions</a>
</div>
</body>
</html>`;
export { company_default as default };
