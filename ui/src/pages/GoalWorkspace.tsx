import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { HallData, PendingDecision } from "../types.js";
import { reDecomposeGoal, sendDecision, useActivity } from "../hooks/useApi.js";

type GoalWorkspaceProps = {
  data: HallData;
  onRefresh: () => void;
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  done: "完成",
};

const TASK_STATUS_COLOR: Record<string, string> = {
  pending: "var(--text-muted)",
  in_progress: "var(--accent-agent)",
  done: "var(--accent-done)",
};

const EVENT_ICONS: Record<string, string> = {
  task_assigned: "📋",
  task_response: "💬",
  report: "📊",
  pending_decision: "⚡",
  decision_received: "✅",
};

const EVENT_LABELS: Record<string, string> = {
  task_assigned: "收到任务",
  task_response: "任务响应",
  report: "进展汇报",
  pending_decision: "待决请求",
  decision_received: "确认决策",
};

export function GoalWorkspace({ data, onRefresh }: GoalWorkspaceProps) {
  const [goalScope, setGoalScope] = useState<string>("");
  const scopedGoalId = goalScope ? Number(goalScope) : undefined;
  const activity = useActivity(4_000, scopedGoalId);
  const [rebuilding, setRebuilding] = useState(false);

  const goals = scopedGoalId === undefined
    ? data.goals
    : data.goals.filter((g) => g.id === scopedGoalId);
  const pending = scopedGoalId === undefined
    ? data.pending
    : data.pending.filter((p) => p.goal_id === scopedGoalId);

  const selectedGoal = scopedGoalId === undefined
    ? null
    : data.goals.find((g) => g.id === scopedGoalId) ?? null;

  const tasksByEmployee = useMemo(() => {
    const map = new Map<string, Array<(typeof goals)[number]["tasks"][number]>>();
    for (const g of goals) {
      for (const t of g.tasks) {
        if (!map.has(t.employee_id)) map.set(t.employee_id, []);
        map.get(t.employee_id)!.push(t);
      }
    }
    return map;
  }, [goals]);

  const overview = useMemo(() => {
    const allTasks = goals.flatMap((g) => g.tasks);
    const done = allTasks.filter((t) => t.status === "done").length;
    const inProgress = allTasks.filter((t) => t.status === "in_progress").length;
    return {
      goals: goals.length,
      tasks: allTasks.length,
      done,
      inProgress,
      pendingDecisions: pending.length,
    };
  }, [goals, pending]);

  return (
    <main
      role="main"
      style={{
        flex: 1,
        overflow: "auto",
        padding: "var(--space-6) var(--space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
        minWidth: 0,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>目标工作台</h1>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 4 }}>
            进入目标隔离模式后，待决事项、动态和任务只显示当前目标。
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>目标范围</span>
          <select
            value={goalScope}
            onChange={(e) => setGoalScope(e.target.value)}
            aria-label="选择目标范围"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "var(--text-sm)",
              padding: "var(--space-2) var(--space-3)",
              outline: "none",
              minWidth: 260,
            }}
          >
            <option value="">全部目标</option>
            {data.goals.map((g) => (
              <option key={g.id} value={g.id}>
                #{g.id} {g.title}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section
        aria-label="隔离范围信息"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
          gap: "var(--space-3)",
        }}
      >
        <MetricCard label="目标" value={String(overview.goals)} />
        <MetricCard label="任务总数" value={String(overview.tasks)} />
        <MetricCard label="进行中" value={String(overview.inProgress)} />
        <MetricCard label="已完成" value={String(overview.done)} />
        <MetricCard label="待决事项" value={String(overview.pendingDecisions)} highlight />
      </section>

      {selectedGoal && (
        <section
          aria-label="当前目标"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "var(--space-3) var(--space-4)",
            fontSize: "var(--text-sm)",
            color: "var(--text-primary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <span>当前目标：#{selectedGoal.id} {selectedGoal.title}</span>
            <button
              onClick={() => {
                setRebuilding(true);
                void reDecomposeGoal(selectedGoal.id)
                  .then(() => onRefresh())
                  .finally(() => setRebuilding(false));
              }}
              disabled={rebuilding}
              style={{
                marginLeft: "auto",
                background: rebuilding ? "var(--border)" : "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                fontSize: "var(--text-xs)",
                padding: "4px 10px",
                cursor: rebuilding ? "not-allowed" : "pointer",
              }}
            >
              {rebuilding ? "重拆解中…" : "重新拆解任务"}
            </button>
          </div>
        </section>
      )}

      <section aria-label="待决事项">
        <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--space-2)" }}>
          待决事项（已隔离）
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {pending.length === 0 && (
            <Empty text={scopedGoalId === undefined ? "当前没有待决事项" : `目标 #${scopedGoalId} 当前没有待决事项`} />
          )}
          {pending.map((p) => (
            <PendingCard key={p.id} pending={p} employees={data.employees} onRefresh={onRefresh} />
          ))}
        </div>
      </section>

      <section
        aria-label="工作区内容"
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: "var(--space-4)",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "var(--space-4)",
          }}
        >
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginBottom: "var(--space-3)" }}>
            任务看板（按员工）
          </h3>
          {data.employees.map((emp) => {
            const tasks = tasksByEmployee.get(emp.id) ?? [];
            if (tasks.length === 0) return null;
            return (
              <div key={emp.id} style={{ borderTop: "1px solid var(--border)", padding: "var(--space-3) 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                  <span>{emp.emoji}</span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 600 }}>
                    {emp.name}（{emp.role}）
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    {tasks.filter((t) => t.status === "done").length}/{tasks.length} 完成
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {tasks.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          marginTop: 5,
                          background: TASK_STATUS_COLOR[t.status] ?? "var(--text-muted)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
                        <span style={{ color: "var(--text-primary)" }}>{t.title}</span>
                        <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                          {TASK_STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {goals.flatMap((g) => g.tasks).length === 0 && (
            <Empty text={scopedGoalId === undefined ? "当前范围下没有任务" : `目标 #${scopedGoalId} 还没有任务`} />
          )}
        </div>

        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "var(--space-4)",
          }}
        >
          <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginBottom: "var(--space-3)" }}>
            实时动态（已隔离）
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activity.length === 0 && (
              <Empty text={scopedGoalId === undefined ? "暂无动态" : `目标 #${scopedGoalId} 暂无动态`} />
            )}
            {activity.map((evt) => {
              const emp = data.employees.find((e) => e.id === evt.employee_id);
              return (
                <div key={evt.id} style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span style={{ fontSize: 12 }}>{EVENT_ICONS[evt.event_type] ?? "•"}</span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {EVENT_LABELS[evt.event_type] ?? evt.event_type}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "auto" }}>
                      {formatTimeAgo(evt.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
                    <strong style={{ color: "var(--text-primary)" }}>{emp ? `${emp.emoji} ${emp.name}` : evt.employee_id}</strong>
                    <span>：{evt.content}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${highlight ? "var(--accent-urgent)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "var(--space-3) var(--space-4)",
      }}
    >
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: highlight ? "var(--accent-urgent)" : "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: "var(--text-xs)",
        color: "var(--text-muted)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
      }}
    >
      {text}
    </div>
  );
}

function PendingCard({
  pending,
  employees,
  onRefresh,
}: {
  pending: PendingDecision;
  employees: HallData["employees"];
  onRefresh: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const emp = employees.find((e) => e.id === pending.employee_id);

  const handle = async (choice: string, freeText?: string) => {
    setSubmitting(true);
    try {
      await sendDecision({
        pendingId: pending.id,
        employeeId: pending.employee_id,
        summary: pending.background,
        choice: freeText ?? choice,
        goalId: pending.goal_id ?? undefined,
      });
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  let parsedOptions: string[] | null = null;
  try {
    const parsed = JSON.parse(pending.options ?? "null") as unknown;
    if (Array.isArray(parsed) && parsed.length >= 2) parsedOptions = parsed as string[];
  } catch {
    parsedOptions = null;
  }

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--accent-urgent)",
        borderRadius: "var(--radius)",
        padding: "var(--space-3) var(--space-4)",
        opacity: submitting ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {emp ? `${emp.emoji} ${emp.name}（${emp.role}）` : pending.employee_id}
          {pending.goal_id !== null && <span style={{ marginLeft: 8 }}>目标 #{pending.goal_id}</span>}
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{formatTimeAgo(pending.created_at)}</div>
      </div>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: 1.6, marginBottom: "var(--space-2)" }}>
        {pending.background}
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {parsedOptions
          ? parsedOptions.map((opt, i) => (
              <button
                key={i}
                onClick={() => void handle(String(i + 1), opt)}
                disabled={submitting}
                style={decisionBtn(i === 0)}
              >
                {opt}
              </button>
            ))
          : (
            <>
              <button onClick={() => void handle("A", pending.option_a)} disabled={submitting} style={decisionBtn(true)}>
                走 A：{pending.option_a}
              </button>
              {pending.option_b && (
                <button onClick={() => void handle("B", pending.option_b!)} disabled={submitting} style={decisionBtn(false)}>
                  走 B：{pending.option_b}
                </button>
              )}
            </>
          )}
      </div>
    </div>
  );
}

function decisionBtn(primary: boolean): CSSProperties {
  return {
    background: primary ? "var(--accent-urgent)" : "var(--bg-base)",
    color: primary ? "#fff" : "var(--text-secondary)",
    border: primary ? "none" : "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    fontSize: "var(--text-xs)",
    padding: "var(--space-2) var(--space-3)",
    cursor: "pointer",
  };
}

function formatTimeAgo(dateStr: string): string {
  const utcStr = dateStr.includes("T") || dateStr.endsWith("Z") ? dateStr : `${dateStr.replace(" ", "T")}Z`;
  const diff = Date.now() - new Date(utcStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return new Date(utcStr).toLocaleDateString("zh-CN");
}
