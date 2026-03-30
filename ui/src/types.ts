export type Employee = {
  id: string;
  name: string;
  role: string;
  emoji: string;
  accentColor: string;
  isCustom?: boolean;
};

export type Goal = {
  id: number;
  title: string;
  description: string | null;
  quarter: string;
  created_at: string;
  tasks: GoalTask[];
};

export type GoalTask = {
  id: number;
  goal_id: number;
  employee_id: string;
  task_uid: string | null;
  depends_on_task_uids: string | null;
  deliverable: string | null;
  done_definition: string | null;
  sequence: number;
  dispatched_at: string | null;
  title: string;
  status: "pending" | "in_progress" | "done";
  deadline: string | null;
  priority: "low" | "normal" | "high";
  extra_goal_ids: string | null;
};

export type PendingDecision = {
  id: number;
  employee_id: string;
  goal_id: number | null;
  background: string;
  option_a: string;
  option_b: string | null;
  options: string | null;
  created_at: string;
};

export type Decision = {
  id: number;
  employee_id: string;
  goal_id: number | null;
  summary: string;
  context: string | null;
  choice: string;
  result_tag: "pending" | "in_progress" | "done" | "closed";
  created_at: string;
};

export type EmployeeReport = {
  id: number;
  employee_id: string;
  goal_id: number | null;
  content: string;
  created_at: string;
};

export type ActivityEvent = {
  id: number;
  employee_id: string;
  event_type:
    | "task_assigned"
    | "task_response"
    | "report"
    | "pending_decision"
    | "decision_received";
  content: string;
  meta: string | null;
  created_at: string;
};

export type HallData = {
  goals: Goal[];
  pending: PendingDecision[];
  reports: EmployeeReport[];
  employees: Employee[];
};
