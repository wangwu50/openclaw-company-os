import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
  let target = {};
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
    });
  if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
  return target;
};
//#endregion
//#region src/db.ts
var db_exports = /* @__PURE__ */ __exportAll({
  deleteCustomEmployee: () => deleteCustomEmployee,
  deleteGoal: () => deleteGoal,
  deletePendingDecision: () => deletePendingDecision,
  findGoalTaskByTitle: () => findGoalTaskByTitle,
  getActiveGoals: () => getActiveGoals,
  getCustomEmployees: () => getCustomEmployees,
  getDb: () => getDb,
  getDecisionStats: () => getDecisionStats,
  getDecisions: () => getDecisions,
  getDecisionsFiltered: () => getDecisionsFiltered,
  getEmployeeActiveTasks: () => getEmployeeActiveTasks,
  getEmployeeActivity: () => getEmployeeActivity,
  getEmployeeActivityForActiveGoals: () => getEmployeeActivityForActiveGoals,
  getEmployeeReports: () => getEmployeeReports,
  getGoalById: () => getGoalById,
  getGoalTasks: () => getGoalTasks,
  getPendingDecisions: () => getPendingDecisions,
  getRecentActivity: () => getRecentActivity,
  getRecentReports: () => getRecentReports,
  getReportsByDays: () => getReportsByDays,
  insertActivity: () => insertActivity,
  insertCustomEmployee: () => insertCustomEmployee,
  insertDecision: () => insertDecision,
  insertGoal: () => insertGoal,
  insertGoalTaskWithMeta: () => insertGoalTaskWithMeta,
  insertPendingDecision: () => insertPendingDecision,
  insertReport: () => insertReport,
  markGoalTaskDispatched: () => markGoalTaskDispatched,
  searchDecisions: () => searchDecisions,
  searchDecisionsByGoal: () => searchDecisionsByGoal,
  updateDecisionTag: () => updateDecisionTag,
  updateGoal: () => updateGoal,
  updateGoalTask: () => updateGoalTask,
  updateGoalTaskStatus: () => updateGoalTaskStatus,
});
let _db = null;
function getDb() {
  if (_db) return _db;
  const dir = join(homedir(), ".openclaw", "company");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "company.db"));
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
  ])
    try {
      db.exec(sql);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("duplicate column")) throw e;
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
  return getDb()
    .prepare("INSERT INTO goals (title, description, quarter) VALUES (?, ?, ?) RETURNING *")
    .get(title, description, quarter);
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
function insertGoalTaskWithMeta(goalId, employeeId, title, meta) {
  return getDb()
    .prepare(
      "INSERT INTO goal_tasks (goal_id, employee_id, task_uid, depends_on_task_uids, deliverable, done_definition, sequence, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
    )
    .get(
      goalId,
      employeeId,
      meta?.taskUid ?? null,
      meta?.dependsOnTaskUids ? JSON.stringify(meta.dependsOnTaskUids) : null,
      meta?.deliverable ?? null,
      meta?.doneDefinition ?? null,
      meta?.sequence ?? 0,
      title,
    );
}
function getGoalTasks(goalId) {
  return getDb()
    .prepare("SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY sequence, id")
    .all(goalId);
}
function getEmployeeActiveTasks(employeeId, goalId) {
  if (goalId !== void 0)
    return getDb()
      .prepare(`SELECT gt.*, g.title as goal_title
         FROM goal_tasks gt
         JOIN goals g ON g.id = gt.goal_id
         WHERE gt.employee_id = ? AND gt.status != 'done' AND gt.goal_id = ?
         ORDER BY gt.created_at`)
      .all(employeeId, goalId);
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
function updateGoalTask(id, fields) {
  const sets = [];
  const params = [];
  if (fields.status !== void 0) {
    sets.push("status = ?");
    params.push(fields.status);
  }
  if (fields.deadline !== void 0) {
    sets.push("deadline = ?");
    params.push(fields.deadline);
  }
  if (fields.priority !== void 0) {
    sets.push("priority = ?");
    params.push(fields.priority);
  }
  if (fields.extraGoalIds !== void 0) {
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
function findGoalTaskByTitle(employeeId, titleFragment, goalId) {
  if (goalId !== void 0)
    return getDb()
      .prepare(
        "SELECT * FROM goal_tasks WHERE employee_id = ? AND goal_id = ? AND title LIKE ? AND status != 'done' LIMIT 1",
      )
      .get(employeeId, goalId, `%${titleFragment}%`);
  return getDb()
    .prepare(
      "SELECT * FROM goal_tasks WHERE employee_id = ? AND title LIKE ? AND status != 'done' LIMIT 1",
    )
    .get(employeeId, `%${titleFragment}%`);
}
function getPendingDecisions(goalId) {
  if (goalId !== void 0)
    return getDb()
      .prepare("SELECT * FROM pending_decisions WHERE goal_id = ? ORDER BY created_at DESC")
      .all(goalId);
  return getDb().prepare("SELECT * FROM pending_decisions ORDER BY created_at DESC").all();
}
function insertPendingDecision(employeeId, background, optionA, optionB, options, goalId) {
  return getDb()
    .prepare(
      "INSERT INTO pending_decisions (employee_id, goal_id, background, option_a, option_b, options) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
    )
    .get(
      employeeId,
      goalId ?? null,
      background,
      optionA,
      optionB ?? null,
      options ? JSON.stringify(options) : null,
    );
}
function deletePendingDecision(id) {
  getDb().prepare("DELETE FROM pending_decisions WHERE id = ?").run(id);
}
function insertDecision(employeeId, summary, choice, context, goalId) {
  return getDb()
    .prepare(
      "INSERT INTO decisions (employee_id, goal_id, summary, choice, context) VALUES (?, ?, ?, ?, ?) RETURNING *",
    )
    .get(employeeId, goalId ?? null, summary, choice, context ?? null);
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
  if (opts.goalId !== void 0) {
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
function getDecisionStats(goalId) {
  const rows =
    goalId !== void 0
      ? getDb()
          .prepare(
            "SELECT result_tag, COUNT(*) as cnt FROM decisions WHERE goal_id = ? GROUP BY result_tag",
          )
          .all(goalId)
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
function searchDecisionsByGoal(q, goalId) {
  const like = `%${q}%`;
  return getDb()
    .prepare(
      "SELECT * FROM decisions WHERE goal_id = ? AND (summary LIKE ? OR context LIKE ? OR choice LIKE ?) ORDER BY created_at DESC LIMIT 50",
    )
    .all(goalId, like, like, like);
}
function updateDecisionTag(id, tag) {
  getDb().prepare("UPDATE decisions SET result_tag = ? WHERE id = ?").run(tag, id);
}
function insertReport(employeeId, content, goalId) {
  return getDb()
    .prepare(
      "INSERT INTO employee_reports (employee_id, goal_id, content) VALUES (?, ?, ?) RETURNING *",
    )
    .get(employeeId, goalId ?? null, content);
}
function getRecentReports(limit = 20, goalId) {
  if (goalId !== void 0)
    return getDb()
      .prepare("SELECT * FROM employee_reports WHERE goal_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(goalId, limit);
  return getDb()
    .prepare("SELECT * FROM employee_reports ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}
function getReportsByDays(days, goalId) {
  if (goalId !== void 0)
    return getDb()
      .prepare(
        "SELECT * FROM employee_reports WHERE goal_id = ? AND created_at >= datetime('now', ? ) ORDER BY created_at DESC LIMIT 200",
      )
      .all(goalId, `-${days} days`);
  return getDb()
    .prepare(
      "SELECT * FROM employee_reports WHERE created_at >= datetime('now', ? ) ORDER BY created_at DESC LIMIT 200",
    )
    .all(`-${days} days`);
}
function getEmployeeReports(employeeId, limit = 10, goalId) {
  if (goalId !== void 0)
    return getDb()
      .prepare(
        "SELECT * FROM employee_reports WHERE employee_id = ? AND goal_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(employeeId, goalId, limit);
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
function getRecentActivity(limit = 50, goalId) {
  if (goalId !== void 0)
    return getDb()
      .prepare(
        "SELECT * FROM activity_log WHERE json_extract(meta, '$.goalId') = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(goalId, limit);
  return getDb().prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?").all(limit);
}
function getEmployeeActivity(employeeId, limit = 5, goalId) {
  if (goalId !== void 0)
    return getDb()
      .prepare(
        "SELECT * FROM activity_log WHERE employee_id = ? AND json_extract(meta, '$.goalId') = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(employeeId, goalId, limit);
  return getDb()
    .prepare("SELECT * FROM activity_log WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(employeeId, limit);
}
function getEmployeeActivityForActiveGoals(employeeId, limit = 5, goalId) {
  if (goalId !== void 0) return getEmployeeActivity(employeeId, limit, goalId);
  const activeGoalIds = getActiveGoals().map((g) => g.id);
  if (activeGoalIds.length === 0) return getEmployeeActivity(employeeId, limit);
  const placeholders = activeGoalIds.map(() => "?").join(", ");
  return getDb()
    .prepare(
      `SELECT * FROM activity_log WHERE employee_id = ? AND (meta IS NULL OR json_extract(meta, '$.goalId') IS NULL OR json_extract(meta, '$.goalId') IN (${placeholders})) ORDER BY created_at DESC LIMIT ?`,
    )
    .all(employeeId, ...activeGoalIds, limit);
}
//#endregion
export {
  updateGoal as A,
  insertGoalTaskWithMeta as C,
  searchDecisions as D,
  markGoalTaskDispatched as E,
  updateGoalTaskStatus as M,
  searchDecisionsByGoal as O,
  insertDecision as S,
  insertReport as T,
  getRecentActivity as _,
  findGoalTaskByTitle as a,
  insertActivity as b,
  getDecisionStats as c,
  getEmployeeActiveTasks as d,
  getEmployeeActivityForActiveGoals as f,
  getPendingDecisions as g,
  getGoalTasks as h,
  deletePendingDecision as i,
  updateGoalTask as j,
  updateDecisionTag as k,
  getDecisions as l,
  getGoalById as m,
  deleteCustomEmployee as n,
  getActiveGoals as o,
  getEmployeeReports as p,
  deleteGoal as r,
  getCustomEmployees as s,
  db_exports as t,
  getDecisionsFiltered as u,
  getRecentReports as v,
  insertPendingDecision as w,
  insertCustomEmployee as x,
  getReportsByDays as y,
};
