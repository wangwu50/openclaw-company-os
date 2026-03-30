import { useActivity } from "../hooks/useApi.js";
import type { HallData, ActivityEvent } from "../types.js";

type TeamProps = {
  data: HallData;
};

const EVENT_LABELS: Record<string, string> = {
  task_assigned: "收到任务",
  task_response: "任务响应",
  report: "进展汇报",
  pending_decision: "待决",
  decision_received: "决策确认",
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  done: "完成",
};

const TASK_STATUS_DOT: Record<string, string> = {
  pending: "var(--text-muted)",
  in_progress: "var(--accent-urgent)",
  done: "var(--accent-done)",
};

export function Team({ data }: TeamProps) {
  const activity = useActivity(5_000);

  // Build per-employee task list from goals
  const tasksByEmployee: Record<string, HallData["goals"][0]["tasks"]> = {};
  for (const goal of data.goals) {
    for (const task of goal.tasks) {
      if (!tasksByEmployee[task.employee_id]) tasksByEmployee[task.employee_id] = [];
      tasksByEmployee[task.employee_id].push(task);
    }
  }

  // Build per-employee recent activity (last 5)
  const activityByEmployee: Record<string, ActivityEvent[]> = {};
  for (const event of activity) {
    if (!activityByEmployee[event.employee_id]) activityByEmployee[event.employee_id] = [];
    if (activityByEmployee[event.employee_id].length < 5) {
      activityByEmployee[event.employee_id].push(event);
    }
  }

  return (
    <main
      role="main"
      style={{
        flex: 1,
        overflow: "auto",
        padding: "var(--space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
      }}
    >
      <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>员工动态</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        {data.employees.map((emp) => {
          const tasks = tasksByEmployee[emp.id] ?? [];
          const recentActivity = activityByEmployee[emp.id] ?? [];
          const activeTasks = tasks.filter((t) => t.status !== "done");
          const doneTasks = tasks.filter((t) => t.status === "done");
          const latestEvent = recentActivity[0];

          return (
            <div
              key={emp.id}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderTop: `3px solid ${emp.accentColor}`,
                borderRadius: "var(--radius)",
                padding: "var(--space-4)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <span style={{ fontSize: 24 }}>{emp.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    {emp.name}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                    {emp.role}
                  </div>
                </div>
                {/* NEW badge — 自定义员工且尚无任何活动记录时显示 */}
                {emp.isCustom && recentActivity.length === 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      background: `${emp.accentColor}22`,
                      color: "var(--accent-agent)",
                      border: "1px solid var(--accent-agent)",
                      borderRadius: 10,
                      padding: "1px 7px",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                    }}
                  >
                    NEW
                  </span>
                )}
                {/* Status pill */}
                <StatusPill tasks={tasks} />
              </div>

              {/* Latest activity blurb */}
              {latestEvent ? (
                <div
                  style={{
                    background: "var(--bg-base)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-2) var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--text-secondary)",
                    lineHeight: "1.5",
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-muted)",
                      marginRight: 6,
                      fontWeight: 600,
                    }}
                  >
                    {EVENT_LABELS[latestEvent.event_type] ?? latestEvent.event_type}
                  </span>
                  <span
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {latestEvent.content}
                  </span>
                  <span style={{ color: "var(--text-muted)", marginLeft: 6, whiteSpace: "nowrap" }}>
                    {formatTimeAgo(latestEvent.created_at)}
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  暂无近期动态
                </div>
              )}

              {/* Active tasks */}
              {activeTasks.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: "var(--text-xs)",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: "var(--space-1)",
                    }}
                  >
                    进行中任务
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {activeTasks.map((t) => (
                      <div
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          fontSize: "var(--text-xs)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: TASK_STATUS_DOT[t.status] ?? "var(--text-muted)",
                            flexShrink: 0,
                            marginTop: 4,
                          }}
                        />
                        <span style={{ lineHeight: "1.4" }}>
                          {t.title}
                          <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                            · {TASK_STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Done count */}
              {doneTasks.length > 0 && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--accent-done)" }}>
                  ✓ 已完成 {doneTasks.length} 项任务
                </div>
              )}

              {tasks.length === 0 && (
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  尚未分配任务
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

function StatusPill({ tasks }: { tasks: HallData["goals"][0]["tasks"] }) {
  const total = tasks.length;
  if (total === 0) return null;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const allDone = done === total;
  const color = allDone
    ? "var(--accent-done)"
    : inProgress > 0
      ? "var(--accent-urgent)"
      : "var(--text-muted)";
  const label = allDone
    ? "全完成"
    : inProgress > 0
      ? `${inProgress} 进行中`
      : `${total - done} 待开始`;

  return (
    <span
      style={{
        fontSize: "10px",
        color,
        border: `1px solid ${color}`,
        borderRadius: 10,
        padding: "1px 7px",
        whiteSpace: "nowrap",
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function formatTimeAgo(dateStr: string): string {
  const utcStr =
    dateStr.includes("T") || dateStr.endsWith("Z") ? dateStr : dateStr.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(utcStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return new Date(utcStr).toLocaleDateString("zh-CN");
}
