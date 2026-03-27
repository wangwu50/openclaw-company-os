import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Goal = {
  id: number;
  title: string;
  description: string | null;
  quarter: string;
  created_at: string;
  updated_at: string;
};

export type GoalTask = {
  id: number;
  goal_id: number;
  employee_id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  deadline: string | null;
  priority: "low" | "normal" | "high";
  extra_goal_ids: string | null;
  created_at: string;
  updated_at: string;
};

export type Decision = {
  id: number;
  employee_id: string;
  summary: string;
  context: string | null;
  choice: string;
  result_tag: "pending" | "in_progress" | "done" | "closed";
  created_at: string;
};

export type PendingDecision = {
  id: number;
  employee_id: string;
  background: string;
  option_a: string;
  option_b: string | null;
  options: string | null;
  created_at: string;
};

export type EmployeeReport = {
  id: number;
  employee_id: string;
  content: string;
  created_at: string;
};

export type ActivityEvent = {
  id: number;
  employee_id: string;
  event_type: "task_assigned" | "task_response" | "report" | "pending_decision" | "decision_received";
  content: string;
  meta: string | null; // JSON string for extra data
  created_at: string;
};

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  const dir = join(homedir(), ".openclaw", "company");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, "company.db");
  const db = new DatabaseSync(dbPath);

  // WAL mode for concurrent reads + writes
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

  // 幂等地添加新列：SQLite 不支持 ADD COLUMN IF NOT EXISTS，用 try/catch 捕获重复列错误
  for (const sql of [
    "ALTER TABLE goal_tasks ADD COLUMN deadline TEXT",
    "ALTER TABLE goal_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'",
    "ALTER TABLE goal_tasks ADD COLUMN extra_goal_ids TEXT",
    "ALTER TABLE pending_decisions ADD COLUMN options TEXT",
  ]) {
    try {
      db.exec(sql);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("duplicate column")) throw e;
    }
  }

  _db = db;
  return db;
}

// Goals
export function getActiveGoals(): Goal[] {
  return getDb().prepare("SELECT * FROM goals ORDER BY created_at DESC").all() as Goal[];
}

export function insertGoal(title: string, description: string, quarter: string): Goal {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO goals (title, description, quarter) VALUES (?, ?, ?) RETURNING *",
    )
    .get(title, description, quarter) as Goal;
  return result;
}

export function updateGoal(id: number, title: string, description: string, quarter: string): Goal | undefined {
  return getDb()
    .prepare(
      "UPDATE goals SET title = ?, description = ?, quarter = ?, updated_at = datetime('now') WHERE id = ? RETURNING *",
    )
    .get(title, description, quarter, id) as Goal | undefined;
}

export function deleteGoal(id: number): void {
  getDb().prepare("DELETE FROM goals WHERE id = ?").run(id);
}

export function insertGoalTask(goalId: number, employeeId: string, title: string): GoalTask {
  return getDb()
    .prepare(
      "INSERT INTO goal_tasks (goal_id, employee_id, title) VALUES (?, ?, ?) RETURNING *",
    )
    .get(goalId, employeeId, title) as GoalTask;
}

export function getGoalTasks(goalId: number): GoalTask[] {
  return getDb()
    .prepare("SELECT * FROM goal_tasks WHERE goal_id = ? ORDER BY employee_id")
    .all(goalId) as GoalTask[];
}

export function getEmployeeActiveTasks(employeeId: string): Array<GoalTask & { goal_title: string }> {
  return getDb()
    .prepare(
      `SELECT gt.*, g.title as goal_title
       FROM goal_tasks gt
       JOIN goals g ON g.id = gt.goal_id
       WHERE gt.employee_id = ? AND gt.status != 'done'
       ORDER BY gt.created_at`,
    )
    .all(employeeId) as Array<GoalTask & { goal_title: string }>;
}

export function updateGoalTaskStatus(id: number, status: GoalTask["status"]): void {
  getDb()
    .prepare("UPDATE goal_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
}

export function updateGoalTask(
  id: number,
  fields: { status?: GoalTask["status"]; deadline?: string | null; priority?: GoalTask["priority"]; extraGoalIds?: number[] | null },
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.status !== undefined) { sets.push("status = ?"); params.push(fields.status); }
  if (fields.deadline !== undefined) { sets.push("deadline = ?"); params.push(fields.deadline); }
  if (fields.priority !== undefined) { sets.push("priority = ?"); params.push(fields.priority); }
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

export function findGoalTaskByTitle(employeeId: string, titleFragment: string): GoalTask | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM goal_tasks WHERE employee_id = ? AND title LIKE ? AND status != 'done' LIMIT 1",
    )
    .get(employeeId, `%${titleFragment}%`) as GoalTask | undefined;
}

// Pending decisions
export function getPendingDecisions(): PendingDecision[] {
  return getDb()
    .prepare("SELECT * FROM pending_decisions ORDER BY created_at DESC")
    .all() as PendingDecision[];
}

export function insertPendingDecision(
  employeeId: string,
  background: string,
  optionA: string,
  optionB?: string,
  options?: string[],
): PendingDecision {
  return getDb()
    .prepare(
      "INSERT INTO pending_decisions (employee_id, background, option_a, option_b, options) VALUES (?, ?, ?, ?, ?) RETURNING *",
    )
    .get(employeeId, background, optionA, optionB ?? null, options ? JSON.stringify(options) : null) as PendingDecision;
}

export function deletePendingDecision(id: number): void {
  getDb().prepare("DELETE FROM pending_decisions WHERE id = ?").run(id);
}

// Decisions (ledger)
export function insertDecision(
  employeeId: string,
  summary: string,
  choice: string,
  context?: string,
): Decision {
  return getDb()
    .prepare(
      "INSERT INTO decisions (employee_id, summary, choice, context) VALUES (?, ?, ?, ?) RETURNING *",
    )
    .get(employeeId, summary, choice, context ?? null) as Decision;
}

export function getDecisions(limit = 50, offset = 0): Decision[] {
  return getDb()
    .prepare("SELECT * FROM decisions ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Decision[];
}

export function getDecisionsFiltered(opts: {
  employeeId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Decision[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.employeeId) { conditions.push("employee_id = ?"); params.push(opts.employeeId); }
  if (opts.status) { conditions.push("result_tag = ?"); params.push(opts.status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(opts.limit ?? 50);
  params.push(opts.offset ?? 0);
  return getDb()
    .prepare(`SELECT * FROM decisions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params) as Decision[];
}

export function getDecisionStats(): Record<string, number> {
  const rows = getDb()
    .prepare("SELECT result_tag, COUNT(*) as cnt FROM decisions GROUP BY result_tag")
    .all() as Array<{ result_tag: string; cnt: number }>;
  return Object.fromEntries(rows.map((r) => [r.result_tag, r.cnt]));
}

export function searchDecisions(q: string): Decision[] {
  const like = `%${q}%`;
  return getDb()
    .prepare(
      "SELECT * FROM decisions WHERE summary LIKE ? OR context LIKE ? OR choice LIKE ? ORDER BY created_at DESC LIMIT 50",
    )
    .all(like, like, like) as Decision[];
}

export function updateDecisionTag(id: number, tag: Decision["result_tag"]): void {
  getDb()
    .prepare("UPDATE decisions SET result_tag = ? WHERE id = ?")
    .run(tag, id);
}

// Reports
export function insertReport(employeeId: string, content: string): EmployeeReport {
  return getDb()
    .prepare("INSERT INTO employee_reports (employee_id, content) VALUES (?, ?) RETURNING *")
    .get(employeeId, content) as EmployeeReport;
}

export function getRecentReports(limit = 20): EmployeeReport[] {
  return getDb()
    .prepare("SELECT * FROM employee_reports ORDER BY created_at DESC LIMIT ?")
    .all(limit) as EmployeeReport[];
}

export function getReportsByDays(days: number): EmployeeReport[] {
  return getDb()
    .prepare(
      "SELECT * FROM employee_reports WHERE created_at >= datetime('now', ? ) ORDER BY created_at DESC LIMIT 200",
    )
    .all(`-${days} days`) as EmployeeReport[];
}

export function getEmployeeReports(employeeId: string, limit = 10): EmployeeReport[] {
  return getDb()
    .prepare(
      "SELECT * FROM employee_reports WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(employeeId, limit) as EmployeeReport[];
}

// Custom employees
export type CustomEmployee = {
  id: string;
  name: string;
  role: string;
  emoji: string;
  accent_color: string;
  system_prompt: string;
  cron_schedule: string;
  cron_prompt: string;
  created_at: string;
};

export function getCustomEmployees(): CustomEmployee[] {
  return getDb().prepare("SELECT * FROM custom_employees ORDER BY created_at").all() as CustomEmployee[];
}

export function insertCustomEmployee(emp: Omit<CustomEmployee, "created_at">): CustomEmployee {
  getDb()
    .prepare(
      `INSERT INTO custom_employees (id, name, role, emoji, accent_color, system_prompt, cron_schedule, cron_prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(emp.id, emp.name, emp.role, emp.emoji, emp.accent_color, emp.system_prompt, emp.cron_schedule, emp.cron_prompt);
  return getDb().prepare("SELECT * FROM custom_employees WHERE id = ?").get(emp.id) as CustomEmployee;
}

export function deleteCustomEmployee(id: string): void {
  getDb().prepare("DELETE FROM custom_employees WHERE id = ?").run(id);
}

// Activity log
export function insertActivity(
  employeeId: string,
  eventType: ActivityEvent["event_type"],
  content: string,
  meta?: Record<string, unknown>,
): ActivityEvent {
  return getDb()
    .prepare(
      "INSERT INTO activity_log (employee_id, event_type, content, meta) VALUES (?, ?, ?, ?) RETURNING *",
    )
    .get(employeeId, eventType, content, meta ? JSON.stringify(meta) : null) as ActivityEvent;
}

export function getRecentActivity(limit = 50): ActivityEvent[] {
  return getDb()
    .prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ActivityEvent[];
}

export function getEmployeeActivity(employeeId: string, limit = 5): ActivityEvent[] {
  return getDb()
    .prepare("SELECT * FROM activity_log WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(employeeId, limit) as ActivityEvent[];
}

export function getEmployeeActivityForActiveGoals(employeeId: string, limit = 5): ActivityEvent[] {
  const activeGoalIds = getActiveGoals().map((g) => g.id);
  if (activeGoalIds.length === 0) {
    return getEmployeeActivity(employeeId, limit);
  }
  const placeholders = activeGoalIds.map(() => "?").join(", ");
  return getDb()
    .prepare(
      `SELECT * FROM activity_log WHERE employee_id = ? AND (meta IS NULL OR json_extract(meta, '$.goalId') IS NULL OR json_extract(meta, '$.goalId') IN (${placeholders})) ORDER BY created_at DESC LIMIT ?`,
    )
    .all(employeeId, ...activeGoalIds, limit) as ActivityEvent[];
}
