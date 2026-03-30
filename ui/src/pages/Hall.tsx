import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Md } from "../components/Markdown.js";
import {
  clearAllSessions,
  resetAll,
  sendDecision,
  setGoal,
  updateGoal,
  deleteGoal,
  updateTask,
  useActivity,
  fetchReports,
} from "../hooks/useApi.js";
import { useNotification } from "../hooks/useNotification.js";
import type { ActivityEvent, EmployeeReport, HallData, PendingDecision } from "../types.js";

type HallProps = {
  data: HallData;
  onRefresh: () => void;
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

// 生成员工报告汇总 Markdown，按员工分组（纯函数，无副作用）
function exportReportsMd(
  reports: EmployeeReport[],
  employees: HallData["employees"],
  days: number,
): string {
  const now = new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const rangeLabel = days === 1 ? "今日" : `近 ${days} 天`;
  const lines: string[] = [`# 员工报告汇总（${rangeLabel}）`, ``, `导出时间：${now}`, ``];

  // 按 employee_id 分组（保持首次出现顺序）
  const grouped = new Map<string, EmployeeReport[]>();
  for (const r of reports) {
    if (!grouped.has(r.employee_id)) grouped.set(r.employee_id, []);
    grouped.get(r.employee_id)!.push(r);
  }

  if (grouped.size === 0) {
    lines.push("_暂无员工汇报记录_");
  } else {
    for (const [empId, empReports] of grouped) {
      const emp = employees.find((e) => e.id === empId);
      const empName = emp ? `${emp.emoji} ${emp.name}（${emp.role}）` : empId;
      lines.push(`## ${empName}`, ``);
      for (const r of empReports) {
        // SQLite UTC 时间补 Z 后再格式化
        const utcStr =
          r.created_at.includes("T") || r.created_at.endsWith("Z")
            ? r.created_at
            : r.created_at.replace(" ", "T") + "Z";
        const dateLabel = new Date(utcStr).toLocaleString("zh-CN");
        lines.push(`### ${dateLabel}`, ``, r.content, ``);
      }
    }
  }

  return lines.join("\n");
}

export function Hall({ data, onRefresh }: HallProps) {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [goalScope, setGoalScope] = useState<string>("");
  const scopedGoalId = goalScope ? Number(goalScope) : undefined;
  const activity = useActivity(4_000, scopedGoalId);
  const [activeTab, setActiveTab] = useState<"activity" | "results">("activity");
  const [reportDays, setReportDays] = useState<1 | 7>(7);
  const [reportExportMd, setReportExportMd] = useState<string | null>(null);
  const [focusedEmp, setFocusedEmp] = useState<HallData["employees"][0] | null>(null);
  // 追踪上一次的待决请求列表，用于检测新增项
  const prevPendingRef = useRef<PendingDecision[]>([]);

  useEffect(() => {
    const prev = prevPendingRef.current;
    const prevIds = new Set(prev.map((p) => p.id));
    const newItems = data.pending.filter((p) => !prevIds.has(p.id));
    if (newItems.length > 0) {
      for (const item of newItems) {
        const emp = data.employees.find((e) => e.id === item.employee_id);
        const empName = emp ? `${emp.emoji} ${emp.name}` : item.employee_id;
        notify("新待决请求", `${empName}：${item.background.slice(0, 50)}`);
      }
    }
    prevPendingRef.current = data.pending;
  }, [data.pending, data.employees, notify]);

  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const scopedGoals =
    scopedGoalId === undefined ? data.goals : data.goals.filter((g) => g.id === scopedGoalId);
  const scopedPending =
    scopedGoalId === undefined
      ? data.pending
      : data.pending.filter((p) => p.goal_id === scopedGoalId);

  if (scopedPending.length === 0 && activity.length === 0 && scopedGoals.length === 0) {
    return (
      <HallEmpty
        onGoalSet={async (title) => {
          await setGoal({ title });
          onRefresh();
        }}
      />
    );
  }

  // Build per-employee task list from goals
  const tasksByEmployee: Record<string, HallData["goals"][0]["tasks"]> = {};
  for (const goal of scopedGoals) {
    for (const task of goal.tasks) {
      if (!tasksByEmployee[task.employee_id]) tasksByEmployee[task.employee_id] = [];
      tasksByEmployee[task.employee_id].push(task);
    }
  }
  // Build per-employee latest activity
  const latestByEmployee: Record<string, ActivityEvent> = {};
  for (const event of activity) {
    if (!latestByEmployee[event.employee_id]) latestByEmployee[event.employee_id] = event;
  }

  // 近 7 天汇报次数：统计 activity 中 event_type === 'report' 且在 7 天内的条数
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const reportCountByEmployee: Record<string, number> = {};
  for (const event of activity) {
    if (event.event_type !== "report") continue;
    const utcStr =
      event.created_at.includes("T") || event.created_at.endsWith("Z")
        ? event.created_at
        : event.created_at.replace(" ", "T") + "Z";
    if (new Date(utcStr).getTime() >= sevenDaysAgo) {
      reportCountByEmployee[event.employee_id] =
        (reportCountByEmployee[event.employee_id] ?? 0) + 1;
    }
  }

  // 任务完成率：从 tasksByEmployee 计算 done 数量和总数
  const completionRateByEmployee: Record<string, { done: number; total: number }> = {};
  for (const [empId, tasks] of Object.entries(tasksByEmployee)) {
    completionRateByEmployee[empId] = {
      done: tasks.filter((t) => t.status === "done").length,
      total: tasks.length,
    };
  }

  return (
    <main
      role="main"
      style={{
        flex: 1,
        overflow: "auto",
        padding: "var(--space-6) var(--space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>公司大厅</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <select
            value={goalScope}
            onChange={(e) => setGoalScope(e.target.value)}
            aria-label="大厅目标范围"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-xs)",
              padding: "2px 8px",
              outline: "none",
            }}
          >
            <option value="">全部目标</option>
            {data.goals.map((g) => (
              <option key={g.id} value={g.id}>
                #{g.id} {g.title}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              const label = scopedGoalId !== undefined ? `目标 #${scopedGoalId}` : "全部";
              if (
                !confirm(
                  `完全重置 ${label}？\n\n这将清除：\n• 所有待决事项\n• 所有决策记录\n• 活动日志\n• 员工汇报\n• 所有 AI 会话记忆\n\n此操作不可撤销。`,
                )
              )
                return;
              if (scopedGoalId !== undefined) {
                // goal-scoped: only clear sessions for that goal
                await clearAllSessions(scopedGoalId);
              } else {
                // full reset: clear DB transient data + all session files
                await resetAll();
              }
              // Clear localStorage chat history
              for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k?.startsWith("chat:")) localStorage.removeItem(k);
              }
              onRefresh();
            }}
            title={`完全重置${scopedGoalId !== undefined ? ` 目标#${scopedGoalId}` : "全部数据"}`}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-muted)",
              fontSize: "var(--text-xs)",
              padding: "2px 10px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            🗑 完全重置
          </button>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {today}
          </span>
        </div>
      </div>

      {/* Pending decisions (full-width, priority) */}
      {scopedPending.length > 0 && (
        <section aria-label="待决事项">
          <SectionLabel label={`⚡ 待决事项 (${scopedPending.length})`} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {scopedPending.map((p) => (
              <DecisionCard
                key={p.id}
                pending={p}
                employees={data.employees}
                onDecide={async (choice, custom) => {
                  await sendDecision({
                    pendingId: p.id,
                    employeeId: p.employee_id,
                    summary: p.background,
                    choice: custom ?? choice,
                    goalId: p.goal_id ?? undefined,
                  });
                  onRefresh();
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Main two-column body */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: "var(--space-5)",
          alignItems: "start",
          minWidth: 0,
        }}
      >
        {/* LEFT: Activity feed / Results board */}
        <section aria-label="员工动态" style={{ minWidth: 0 }}>
          {/* Tab header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--space-2)",
            }}
          >
            {/* Tab buttons */}
            <div style={{ display: "flex", gap: 2 }}>
              {(["activity", "results"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: activeTab === tab ? "var(--bg-card)" : "none",
                    border: activeTab === tab ? "1px solid var(--border)" : "1px solid transparent",
                    borderRadius: "var(--radius-sm)",
                    color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                    fontSize: "var(--text-xs)",
                    fontWeight: activeTab === tab ? 600 : 400,
                    padding: "2px 10px",
                    cursor: "pointer",
                    letterSpacing: "0.04em",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  {tab === "activity" ? "实时动态" : "成果看板"}
                </button>
              ))}
            </div>
            {/* Report export controls — only shown in activity tab */}
            {activeTab === "activity" && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <select
                  value={reportDays}
                  onChange={(e) => setReportDays(Number(e.target.value) as 1 | 7)}
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-xs)",
                    padding: "2px 4px",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value={1}>今日</option>
                  <option value={7}>近7天</option>
                </select>
                <button
                  onClick={() => {
                    void fetchReports(reportDays, scopedGoalId).then((reports) => {
                      setReportExportMd(exportReportsMd(reports, data.employees, reportDays));
                    });
                  }}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-xs)",
                    padding: "2px 8px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  导出报告
                </button>
              </div>
            )}
          </div>

          {/* 报告导出覆盖层 */}
          {reportExportMd !== null && (
            <ReportExportOverlay
              markdown={reportExportMd}
              days={reportDays}
              onClose={() => setReportExportMd(null)}
            />
          )}

          {activeTab === "activity" ? (
            <Card>
              {activity.length === 0 ? (
                <EmptyNote text="暂无员工动态，设置目标后员工会开始响应" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {activity.map((event) => (
                    <ActivityRow key={event.id} event={event} employees={data.employees} />
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <ResultsBoard activity={activity} employees={data.employees} />
          )}
        </section>

        {/* RIGHT: Goals + Employee status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {/* Goals */}
          <section aria-label="公司目标">
            <GoalsPanel goals={scopedGoals} onRefresh={onRefresh} />
          </section>

          {/* Employee status */}
          <section aria-label="员工状态">
            <SectionLabel label="员工状态" />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {data.employees.map((emp) => (
                <EmployeeStatusCard
                  key={emp.id}
                  emp={emp}
                  tasks={tasksByEmployee[emp.id] ?? []}
                  latestEvent={latestByEmployee[emp.id]}
                  reportCount={reportCountByEmployee[emp.id] ?? 0}
                  completion={completionRateByEmployee[emp.id]}
                  onOpen={() =>
                    emp.id === "company-coo" ? navigate(`/chat/${emp.id}`) : setFocusedEmp(emp)
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {focusedEmp && (
        <EmployeeActivityModal
          emp={focusedEmp}
          activity={activity.filter((a) => a.employee_id === focusedEmp.id)}
          onClose={() => setFocusedEmp(null)}
        />
      )}
    </main>
  );
}

function EmployeeActivityModal({
  emp,
  activity,
  onClose,
}: {
  emp: HallData["employees"][0];
  activity: ActivityEvent[];
  onClose: () => void;
}) {
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
  const recent = [...activity].reverse().slice(0, 20);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-base)",
          borderLeft: "1px solid var(--border)",
          width: "min(420px, 90vw)",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-sidebar)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "20px" }}>{emp.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{emp.name}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{emp.role}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "18px",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Activity list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--space-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          {recent.length === 0 ? (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "var(--text-sm)",
                textAlign: "center",
                paddingTop: "var(--space-8)",
              }}
            >
              暂无活动记录
            </div>
          ) : (
            recent.map((event) => (
              <div key={event.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                  <span
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: "1px 6px",
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {EVENT_ICONS[event.event_type] ?? "•"}{" "}
                    {EVENT_LABELS[event.event_type] ?? event.event_type}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "var(--text-xs)",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatTimeAgo(event.created_at)}
                  </span>
                </div>
                <Md compact style={{ fontSize: "var(--text-xs)", color: "var(--text-primary)" }}>
                  {event.content}
                </Md>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({
  event,
  employees,
}: {
  event: ActivityEvent;
  employees: HallData["employees"];
}) {
  const [expanded, setExpanded] = useState(false);
  const emp = employees.find((e) => e.id === event.employee_id);
  const icon = EVENT_ICONS[event.event_type] ?? "•";
  const label = EVENT_LABELS[event.event_type] ?? event.event_type;
  const isLong = event.content.length > 100;

  return (
    <div
      style={{
        padding: "var(--space-3) 0",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        gap: "var(--space-2)",
        alignItems: "flex-start",
      }}
    >
      <span style={{ fontSize: "14px", flexShrink: 0, marginTop: 1 }}>{emp?.emoji ?? "👤"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            marginBottom: 3,
            display: "flex",
            gap: "var(--space-2)",
            alignItems: "center",
          }}
        >
          <span style={{ color: emp?.accentColor ?? "var(--text-secondary)", fontWeight: 600 }}>
            {emp?.name ?? event.employee_id}
          </span>
          <span
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "1px 5px",
              fontSize: "10px",
            }}
          >
            {icon} {label}
          </span>
          <span style={{ marginLeft: "auto" }}>{formatTimeAgo(event.created_at)}</span>
        </div>
        <div
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-primary)",
            ...(isLong && !expanded
              ? {
                  overflow: "hidden",
                  maxHeight: "4.8em",
                  maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
                }
              : {}),
          }}
        >
          <Md compact>{event.content}</Md>
        </div>
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-agent)",
              fontSize: "var(--text-xs)",
              cursor: "pointer",
              padding: "2px 0",
              marginTop: 2,
            }}
          >
            {expanded ? "收起" : "展开全文"}
          </button>
        )}
      </div>
    </div>
  );
}

function ResultsBoard({
  activity,
  employees,
}: {
  activity: ActivityEvent[];
  employees: HallData["employees"];
}) {
  // expandedMap: empId -> whether all results are shown (default: show latest 1)
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  // Show task_response events only, newest-first, grouped by employee
  const responses = activity.filter((e) => e.event_type === "task_response");

  if (responses.length === 0) {
    return (
      <Card>
        <EmptyNote text="暂无任务成果，任务完成后成果会在这里汇总" />
      </Card>
    );
  }

  // Group by employee, preserving employee order from employees list
  const byEmployee = new Map<string, ActivityEvent[]>();
  for (const emp of employees) byEmployee.set(emp.id, []);
  for (const event of responses) {
    if (!byEmployee.has(event.employee_id)) byEmployee.set(event.employee_id, []);
    byEmployee.get(event.employee_id)!.push(event);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {[...byEmployee.entries()]
        .filter(([, events]) => events.length > 0)
        .map(([empId, events]) => {
          const emp = employees.find((e) => e.id === empId);
          const expanded = !!expandedMap[empId];
          const shownEvents = expanded ? events : events.slice(0, 1);

          return (
            <div key={empId}>
              {/* Employee header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  marginBottom: "var(--space-2)",
                }}
              >
                <span style={{ fontSize: "14px" }}>{emp?.emoji ?? "👤"}</span>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    color: emp?.accentColor ?? "var(--text-secondary)",
                  }}
                >
                  {emp?.name ?? empId}
                </span>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {emp?.role}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    marginLeft: "auto",
                  }}
                >
                  {events.length} 份成果
                </span>
              </div>

              {shownEvents.map((event) => (
                <div
                  key={event.id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${emp?.accentColor ?? "var(--border)"}`,
                    borderRadius: "var(--radius)",
                    padding: "var(--space-4)",
                    marginBottom: "var(--space-2)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--text-muted)",
                        background: "var(--bg-base)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      💬 任务成果
                    </span>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                      {formatTimeAgo(event.created_at)}
                    </span>
                  </div>
                  <Md style={{ fontSize: "var(--text-sm)" }}>{event.content}</Md>
                </div>
              ))}

              {events.length > 1 && (
                <button
                  onClick={() => setExpandedMap((m) => ({ ...m, [empId]: !m[empId] }))}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-agent)",
                    fontSize: "var(--text-xs)",
                    cursor: "pointer",
                    padding: "2px 0",
                    marginTop: 2,
                  }}
                >
                  {expanded ? "收起历史成果" : `查看全部 ${events.length} 份成果`}
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}

const TASK_STATUS_DOT: Record<string, string> = {
  pending: "var(--text-muted)",
  in_progress: "var(--accent-urgent)",
  done: "var(--accent-done)",
};

function EmployeeStatusCard({
  emp,
  tasks,
  latestEvent,
  reportCount = 0,
  completion,
  onOpen,
}: {
  emp: HallData["employees"][0];
  tasks: HallData["goals"][0]["tasks"];
  latestEvent?: ActivityEvent;
  reportCount?: number;
  completion?: { done: number; total: number };
  onOpen: () => void;
}) {
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const statusColor =
    tasks.length === 0
      ? "var(--text-muted)"
      : done === tasks.length
        ? "var(--accent-done)"
        : inProgress > 0
          ? "var(--accent-urgent)"
          : "var(--text-muted)";
  const statusLabel =
    tasks.length === 0
      ? "待分配"
      : done === tasks.length
        ? "全完成"
        : inProgress > 0
          ? `${inProgress} 进行中`
          : `${tasks.length - done} 待开始`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${emp.accentColor}`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-2) var(--space-3)",
        cursor: "pointer",
        transition: "background var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background =
          "var(--bg-card-hover, var(--bg-base))";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: latestEvent || activeTasks.length > 0 ? "var(--space-1)" : 0,
        }}
      >
        <span style={{ fontSize: "14px" }}>{emp.emoji}</span>
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            color: "var(--text-primary)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {emp.name}
          <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>
            {emp.role}
          </span>
        </span>
        <span
          style={{
            fontSize: "10px",
            color: statusColor,
            border: `1px solid ${statusColor}`,
            borderRadius: 8,
            padding: "1px 6px",
            whiteSpace: "nowrap",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Latest activity snippet */}
      {latestEvent && (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: "1.4",
            marginBottom: activeTasks.length > 0 ? "var(--space-1)" : 0,
            wordBreak: "break-word",
          }}
        >
          {latestEvent.content}
        </div>
      )}

      {/* 活跃度指标：7天汇报次数 + 任务完成率（始终显示，无数据时也展示基准值） */}
      <div
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
          marginTop: "var(--space-1)",
          marginBottom: activeTasks.length > 0 ? "var(--space-1)" : 0,
        }}
      >
        {"📊 7天 "}
        {reportCount}
        {"报"}
        {completion && completion.total > 0 && (
          <>
            {" · 完成率 "}
            {Math.round((completion.done / completion.total) * 100)}
            {"%"}
          </>
        )}
      </div>

      {/* Active tasks */}
      {activeTasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
          {activeTasks.slice(0, 2).map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 4,
                fontSize: "10px",
                color: "var(--text-secondary)",
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: TASK_STATUS_DOT[t.status],
                  flexShrink: 0,
                  marginTop: 3,
                }}
              />
              <span style={{ lineHeight: "1.4", wordBreak: "break-word" }}>{t.title}</span>
            </div>
          ))}
          {activeTasks.length > 2 && (
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
              +{activeTasks.length - 2} 项
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "待开始",
  in_progress: "进行中",
  done: "完成",
};

const PRESET_GOALS = [
  "完成 MVP 并公开上线",
  "月活用户突破 1000",
  "产品营收达到 10 万",
  "建立内容矩阵，社媒粉丝增长 5000",
  "完成融资准备，搭建投资人管道",
  "用户留存率提升至 60%",
];

function GoalsPanel({ goals, onRefresh }: { goals: HallData["goals"]; onRefresh: () => void }) {
  const allGoals = goals;
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await setGoal({ title: newTitle.trim() });
      setNewTitle("");
      setAdding(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-2)",
        }}
      >
        <SectionLabel label="季度目标" />
        <button
          onClick={() => setAdding((v) => !v)}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-secondary)",
            fontSize: "var(--text-xs)",
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          + 新目标
        </button>
      </div>
      <Card>
        {adding && (
          <div style={{ marginBottom: "var(--space-3)" }}>
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
              <input
                type="text"
                placeholder="目标标题..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewTitle("");
                  }
                }}
                autoFocus
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => void handleAdd()}
                disabled={!newTitle.trim() || saving}
                style={smallBtnStyle("var(--accent-agent)")}
              >
                保存
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
              {PRESET_GOALS.map((p) => (
                <button
                  key={p}
                  onClick={() => setNewTitle(p)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-xs)",
                    padding: "2px 8px",
                    cursor: "pointer",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {goals.length === 0 && !adding ? (
          <EmptyNote text="尚未设置季度目标" />
        ) : (
          goals.map((g) => (
            <GoalRow key={g.id} goal={g} allGoals={allGoals} onRefresh={onRefresh} />
          ))
        )}
      </Card>
    </>
  );
}

const TASK_STATUS_CYCLE: Record<string, "pending" | "in_progress" | "done"> = {
  pending: "in_progress",
  in_progress: "done",
  done: "pending",
};
const TASK_STATUS_ICON: Record<string, string> = { pending: "⬜", in_progress: "🔄", done: "✅" };
const PRIORITY_ICON: Record<string, string> = { high: "🔴", normal: "🟡", low: "🔵" };
const PRIORITY_CYCLE: Record<string, "low" | "normal" | "high"> = {
  high: "normal",
  normal: "low",
  low: "high",
};

function GoalRow({
  goal,
  allGoals,
  onRefresh,
}: {
  goal: HallData["goals"][0];
  allGoals: HallData["goals"];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [title, setTitle] = useState(goal.title);
  const [saving, setSaving] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<number | null>(null);
  const done = goal.tasks.filter((t) => t.status === "done").length;
  const pct = goal.tasks.length > 0 ? Math.round((done / goal.tasks.length) * 100) : 0;

  const handlePriorityClick = async (taskId: number, currentPriority: string) => {
    const next = PRIORITY_CYCLE[currentPriority] ?? "normal";
    await updateTask(taskId, { priority: next });
    onRefresh();
  };

  const handleDeadlineChange = async (taskId: number, value: string) => {
    await updateTask(taskId, { deadline: value || null });
    setEditingDeadlineId(null);
    onRefresh();
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await updateGoal(goal.id, { title: title.trim() });
      setEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确认删除目标"${goal.title}"？`)) return;
    await deleteGoal(goal.id);
    onRefresh();
  };

  const handleTaskClick = async (taskId: number, currentStatus: string) => {
    const next = TASK_STATUS_CYCLE[currentStatus] ?? "pending";
    await updateTask(taskId, { status: next });
    onRefresh();
  };

  return (
    <div style={{ padding: "var(--space-2) 0", borderBottom: "1px solid var(--border)" }}>
      {editing ? (
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSave();
              if (e.key === "Escape") {
                setEditing(false);
                setTitle(goal.title);
              }
            }}
            autoFocus
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            style={smallBtnStyle("var(--accent-agent)")}
          >
            ✓
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setTitle(goal.title);
            }}
            style={smallBtnStyle("var(--border)")}
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {goal.tasks.length > 0 && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: "10px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {expanded ? "▾" : "▸"}
                  </button>
                )}
                {goal.title}
              </div>
              {goal.quarter && (
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-secondary)",
                    marginBottom: 3,
                  }}
                >
                  {goal.quarter}
                </div>
              )}
              {goal.tasks.length > 0 && (
                <div>
                  <div
                    style={{
                      height: 3,
                      background: "var(--border)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: "var(--accent-done)",
                        transition: "width 400ms ease",
                      }}
                    />
                  </div>
                  <div
                    style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}
                  >
                    {done}/{goal.tasks.length} 完成
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => setEditing(true)} style={iconBtnStyle} title="编辑">
                ✏️
              </button>
              <button onClick={() => void handleDelete()} style={iconBtnStyle} title="删除">
                🗑️
              </button>
            </div>
          </div>

          {/* Task list */}
          {expanded && goal.tasks.length > 0 && (
            <div
              style={{
                marginTop: "var(--space-2)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {goal.tasks.map((t) => (
                <div
                  key={t.id}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "10px" }}
                >
                  {/* 状态切换按钮 */}
                  <button
                    onClick={() => void handleTaskClick(t.id, t.status)}
                    title={`点击切换到：${TASK_STATUS_LABEL[TASK_STATUS_CYCLE[t.status] ?? "pending"]}`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: "12px",
                      flexShrink: 0,
                    }}
                  >
                    {TASK_STATUS_ICON[t.status] ?? "⬜"}
                  </button>

                  {/* 任务标题 + 员工 + 额外目标徽章 */}
                  <span
                    style={{
                      flex: 1,
                      color: t.status === "done" ? "var(--text-muted)" : "var(--text-secondary)",
                      textDecoration: t.status === "done" ? "line-through" : "none",
                      lineHeight: "1.4",
                      wordBreak: "break-word",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    {t.title}
                    <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                      · {t.employee_id.replace("company-", "")}
                    </span>
                    {(() => {
                      if (!t.extra_goal_ids) return null;
                      let ids: number[] = [];
                      try {
                        ids = JSON.parse(t.extra_goal_ids) as number[];
                      } catch {
                        return null;
                      }
                      return ids.map((gid) => {
                        const g = allGoals.find((ag) => ag.id === gid);
                        if (!g) return null;
                        return (
                          <span
                            key={gid}
                            style={{
                              marginLeft: 4,
                              fontSize: "10px",
                              background: "var(--accent-agent, #7b61ff)22",
                              color: "var(--accent-agent, #7b61ff)",
                              borderRadius: 4,
                              padding: "0 4px",
                              whiteSpace: "nowrap",
                              display: "inline-block",
                            }}
                          >
                            + {g.title.slice(0, 10)}
                          </span>
                        );
                      });
                    })()}
                  </span>

                  {/* 优先级徽章，点击循环切换 */}
                  <button
                    onClick={() => void handlePriorityClick(t.id, t.priority ?? "normal")}
                    title={`优先级：${t.priority ?? "normal"}，点击切换`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0 2px",
                      fontSize: "10px",
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                  >
                    {PRIORITY_ICON[t.priority ?? "normal"]}
                  </button>

                  {/* 截止日期：点击切换为日期选择器 */}
                  {editingDeadlineId === t.id ? (
                    <input
                      type="date"
                      defaultValue={t.deadline ?? ""}
                      autoFocus
                      onBlur={(e) => void handleDeadlineChange(t.id, e.currentTarget.value)}
                      onChange={(e) => void handleDeadlineChange(t.id, e.currentTarget.value)}
                      style={{
                        fontSize: "10px",
                        background: "var(--bg-base)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-primary)",
                        padding: "1px 3px",
                        width: 100,
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => setEditingDeadlineId(t.id)}
                      title="点击设置截止日期"
                      style={{
                        color: t.deadline ? "var(--text-secondary)" : "var(--text-muted)",
                        cursor: "pointer",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.deadline ? t.deadline : "📅"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DecisionCard({
  pending,
  employees,
  onDecide,
}: {
  pending: PendingDecision;
  employees: HallData["employees"];
  onDecide: (choice: string, custom?: string) => Promise<void>;
}) {
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emp = employees.find((e) => e.id === pending.employee_id);

  const handleDecide = async (choice: string, freeText?: string) => {
    setSubmitting(true);
    try {
      await onDecide(choice, freeText);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--accent-urgent)",
        borderRadius: "var(--radius)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        opacity: submitting ? 0.6 : 1,
        transition: "opacity var(--transition-fast)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <span style={{ fontSize: "16px" }}>{emp?.emoji ?? "👤"}</span>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {emp?.name ?? pending.employee_id} · {emp?.role}
          </span>
        </div>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {formatTimeAgo(pending.created_at)}
        </span>
      </div>

      <p
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-primary)",
          lineHeight: "var(--leading-normal)",
        }}
      >
        {pending.background}
      </p>

      {(() => {
        const parsedOptions: string[] | null = (() => {
          try {
            const o = JSON.parse(pending.options ?? "") as unknown;
            return Array.isArray(o) && (o as unknown[]).length >= 2 ? (o as string[]) : null;
          } catch {
            return null;
          }
        })();
        return (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {parsedOptions ? (
              parsedOptions.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => void handleDecide(String(i + 1), opt)}
                  disabled={submitting}
                  style={choiceButtonStyle(i === 0 ? "var(--accent-urgent)" : "var(--border)")}
                >
                  {opt}
                </button>
              ))
            ) : (
              <>
                <button
                  onClick={() => void handleDecide("A", pending.option_a)}
                  disabled={submitting}
                  style={choiceButtonStyle("var(--accent-urgent)")}
                >
                  走 A：{pending.option_a}
                </button>
                {pending.option_b && (
                  <button
                    onClick={() => void handleDecide("B", pending.option_b!)}
                    disabled={submitting}
                    style={choiceButtonStyle("var(--border)")}
                  >
                    走 B：{pending.option_b}
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <input
          type="text"
          placeholder="或直接输入指令..."
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) void handleDecide("custom", custom.trim());
          }}
          disabled={submitting}
          style={inputStyle}
          aria-label="自定义指令"
        />
        {custom.trim() && (
          <button
            onClick={() => void handleDecide("custom", custom.trim())}
            disabled={submitting}
            style={choiceButtonStyle("var(--accent-agent)")}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}

function HallEmpty({ onGoalSet }: { onGoalSet: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <main
      role="main"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "var(--space-6)",
        padding: "var(--space-8)",
      }}
    >
      <div style={{ fontSize: 48 }}>🏢</div>
      <div style={{ textAlign: "center" }}>
        <h1
          style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-2)" }}
        >
          欢迎，CEO
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          你的公司尚未开始运转。设置第一个季度目标，员工会立即收到任务并开始响应。
        </p>
      </div>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <input
            type="text"
            placeholder="Q2 目标：达到月活 5000..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                setSaving(true);
                void onGoalSet(title.trim()).finally(() => setSaving(false));
              }
            }}
            style={{ ...inputStyle, flex: 1 }}
            autoFocus
            aria-label="季度目标"
          />
          <button
            disabled={!title.trim() || saving}
            onClick={() => {
              setSaving(true);
              void onGoalSet(title.trim()).finally(() => setSaving(false));
            }}
            style={{
              ...choiceButtonStyle("var(--accent-agent)"),
              opacity: !title.trim() || saving ? 0.5 : 1,
            }}
          >
            {saving ? "设置中…" : "设置目标"}
          </button>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-1)",
            justifyContent: "center",
          }}
        >
          {PRESET_GOALS.map((p) => (
            <button
              key={p}
              onClick={() => setTitle(p)}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                fontSize: "var(--text-xs)",
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

// Shared styles
const inputStyle: React.CSSProperties = {
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
  padding: "var(--space-2) var(--space-3)",
  outline: "none",
  width: "100%",
};

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px 4px",
  fontSize: "13px",
  opacity: 0.6,
  lineHeight: 1,
};

function smallBtnStyle(color: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${color}`,
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    fontSize: "var(--text-xs)",
    padding: "var(--space-1) var(--space-2)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };
}

function choiceButtonStyle(borderColor: string): React.CSSProperties {
  return {
    background: "transparent",
    border: `1px solid ${borderColor}`,
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    fontSize: "var(--text-sm)",
    padding: "var(--space-2) var(--space-3)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background var(--transition-fast)",
  };
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: "var(--text-xs)",
        color: "var(--text-secondary)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: "var(--space-2)",
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "var(--space-4)",
      }}
    >
      {children}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p
      style={{
        fontSize: "var(--text-sm)",
        color: "var(--text-muted)",
        textAlign: "center",
        padding: "var(--space-4) 0",
      }}
    >
      {text}
    </p>
  );
}

function formatTimeAgo(dateStr: string): string {
  // SQLite datetime('now') stores UTC without timezone suffix; append Z so JS parses correctly
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

function ReportExportOverlay({
  markdown,
  days,
  onClose,
}: {
  markdown: string;
  days: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-${days === 1 ? "today" : `${days}days`}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-5)",
          width: "100%",
          maxWidth: 680,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
            员工报告导出（{days === 1 ? "今日" : `近 ${days} 天`}）
          </span>
          <button onClick={onClose} style={{ ...iconBtnStyle, fontSize: "16px" }}>
            ✕
          </button>
        </div>
        <textarea
          readOnly
          value={markdown}
          style={{
            flex: 1,
            minHeight: 320,
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "var(--text-xs)",
            fontFamily: "monospace",
            padding: "var(--space-3)",
            resize: "vertical",
            outline: "none",
            lineHeight: "1.6",
          }}
        />
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <button onClick={() => void handleCopy()} style={smallBtnStyle("var(--border)")}>
            {copied ? "✓ 已复制" : "复制"}
          </button>
          <button onClick={handleDownload} style={smallBtnStyle("var(--accent-agent)")}>
            下载 .md
          </button>
        </div>
      </div>
    </div>
  );
}
