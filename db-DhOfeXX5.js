import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
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
	getDecisions: () => getDecisions,
	getEmployeeActiveTasks: () => getEmployeeActiveTasks,
	getEmployeeActivity: () => getEmployeeActivity,
	getEmployeeReports: () => getEmployeeReports,
	getGoalTasks: () => getGoalTasks,
	getPendingDecisions: () => getPendingDecisions,
	getRecentActivity: () => getRecentActivity,
	getRecentReports: () => getRecentReports,
	insertActivity: () => insertActivity,
	insertCustomEmployee: () => insertCustomEmployee,
	insertDecision: () => insertDecision,
	insertGoal: () => insertGoal,
	insertGoalTask: () => insertGoalTask,
	insertPendingDecision: () => insertPendingDecision,
	insertReport: () => insertReport,
	searchDecisions: () => searchDecisions,
	updateGoal: () => updateGoal,
	updateGoalTaskStatus: () => updateGoalTaskStatus
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
      title       TEXT    NOT NULL,
      status      TEXT    NOT NULL DEFAULT 'pending',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT    NOT NULL,
      summary     TEXT    NOT NULL,
      context     TEXT,
      choice      TEXT    NOT NULL,
      result_tag  TEXT    NOT NULL DEFAULT 'pending',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_decisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT    NOT NULL,
      background  TEXT    NOT NULL,
      option_a    TEXT    NOT NULL,
      option_b    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employee_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT    NOT NULL,
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
	_db = db;
	return db;
}
function getActiveGoals() {
	return getDb().prepare("SELECT * FROM goals ORDER BY created_at DESC").all();
}
function insertGoal(title, description, quarter) {
	return getDb().prepare("INSERT INTO goals (title, description, quarter) VALUES (?, ?, ?) RETURNING *").get(title, description, quarter);
}
function updateGoal(id, title, description, quarter) {
	return getDb().prepare("UPDATE goals SET title = ?, description = ?, quarter = ?, updated_at = datetime('now') WHERE id = ? RETURNING *").get(title, description, quarter, id);
}
function deleteGoal(id) {
	getDb().prepare("DELETE FROM goals WHERE id = ?").run(id);
}
function insertGoalTask(goalId, employeeId, title) {
	return getDb().prepare("INSERT INTO goal_tasks (goal_id, employee_id, title) VALUES (?, ?, ?) RETURNING *").get(goalId, employeeId, title);
}
function getGoalTasks(goalId) {
	return getDb().prepare("SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY employee_id").all(goalId);
}
function getEmployeeActiveTasks(employeeId) {
	return getDb().prepare(`SELECT gt.*, g.title as goal_title
       FROM goal_tasks gt
       JOIN goals g ON g.id = gt.goal_id
       WHERE gt.employee_id = ? AND gt.status != 'done'
       ORDER BY gt.created_at`).all(employeeId);
}
function updateGoalTaskStatus(id, status) {
	getDb().prepare("UPDATE goal_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}
function findGoalTaskByTitle(employeeId, titleFragment) {
	return getDb().prepare("SELECT * FROM goal_tasks WHERE employee_id = ? AND title LIKE ? AND status != 'done' LIMIT 1").get(employeeId, `%${titleFragment}%`);
}
function getPendingDecisions() {
	return getDb().prepare("SELECT * FROM pending_decisions ORDER BY created_at DESC").all();
}
function insertPendingDecision(employeeId, background, optionA, optionB) {
	return getDb().prepare("INSERT INTO pending_decisions (employee_id, background, option_a, option_b) VALUES (?, ?, ?, ?) RETURNING *").get(employeeId, background, optionA, optionB ?? null);
}
function deletePendingDecision(id) {
	getDb().prepare("DELETE FROM pending_decisions WHERE id = ?").run(id);
}
function insertDecision(employeeId, summary, choice, context) {
	return getDb().prepare("INSERT INTO decisions (employee_id, summary, choice, context) VALUES (?, ?, ?, ?) RETURNING *").get(employeeId, summary, choice, context ?? null);
}
function getDecisions(limit = 50, offset = 0) {
	return getDb().prepare("SELECT * FROM decisions ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
}
function searchDecisions(q) {
	const like = `%${q}%`;
	return getDb().prepare("SELECT * FROM decisions WHERE summary LIKE ? OR context LIKE ? OR choice LIKE ? ORDER BY created_at DESC LIMIT 50").all(like, like, like);
}
function insertReport(employeeId, content) {
	return getDb().prepare("INSERT INTO employee_reports (employee_id, content) VALUES (?, ?) RETURNING *").get(employeeId, content);
}
function getRecentReports(limit = 20) {
	return getDb().prepare("SELECT * FROM employee_reports ORDER BY created_at DESC LIMIT ?").all(limit);
}
function getEmployeeReports(employeeId, limit = 10) {
	return getDb().prepare("SELECT * FROM employee_reports WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?").all(employeeId, limit);
}
function getCustomEmployees() {
	return getDb().prepare("SELECT * FROM custom_employees ORDER BY created_at").all();
}
function insertCustomEmployee(emp) {
	getDb().prepare(`INSERT INTO custom_employees (id, name, role, emoji, accent_color, system_prompt, cron_schedule, cron_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(emp.id, emp.name, emp.role, emp.emoji, emp.accent_color, emp.system_prompt, emp.cron_schedule, emp.cron_prompt);
	return getDb().prepare("SELECT * FROM custom_employees WHERE id = ?").get(emp.id);
}
function deleteCustomEmployee(id) {
	getDb().prepare("DELETE FROM custom_employees WHERE id = ?").run(id);
}
function insertActivity(employeeId, eventType, content, meta) {
	return getDb().prepare("INSERT INTO activity_log (employee_id, event_type, content, meta) VALUES (?, ?, ?, ?) RETURNING *").get(employeeId, eventType, content, meta ? JSON.stringify(meta) : null);
}
function getRecentActivity(limit = 50) {
	return getDb().prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?").all(limit);
}
function getEmployeeActivity(employeeId, limit = 5) {
	return getDb().prepare("SELECT * FROM activity_log WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?").all(employeeId, limit);
}
//#endregion
export { updateGoalTaskStatus as C, updateGoal as S, insertCustomEmployee as _, findGoalTaskByTitle as a, insertReport as b, getDecisions as c, getEmployeeReports as d, getGoalTasks as f, insertActivity as g, getRecentReports as h, deletePendingDecision as i, getEmployeeActiveTasks as l, getRecentActivity as m, deleteCustomEmployee as n, getActiveGoals as o, getPendingDecisions as p, deleteGoal as r, getCustomEmployees as s, db_exports as t, getEmployeeActivity as u, insertDecision as v, searchDecisions as x, insertPendingDecision as y };
