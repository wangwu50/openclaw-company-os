import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ActivityEvent, HallData, PendingDecision } from "../types.js";
import { sendDecision, setGoal, updateGoal, deleteGoal, updateTask, useActivity } from "../hooks/useApi.js";

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

export function Hall({ data, onRefresh }: HallProps) {
  const activity = useActivity(4_000);
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (data.pending.length === 0 && activity.length === 0 && data.goals.length === 0) {
    return <HallEmpty onGoalSet={async (title) => { await setGoal({ title }); onRefresh(); }} />;
  }

  // Build per-employee task list from goals
  const tasksByEmployee: Record<string, HallData["goals"][0]["tasks"]> = {};
  for (const goal of data.goals) {
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
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{today}</span>
      </div>

      {/* Pending decisions (full-width, priority) */}
      {data.pending.length > 0 && (
        <section aria-label="待决事项">
          <SectionLabel label={`⚡ 待决事项 (${data.pending.length})`} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {data.pending.map((p) => (
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
        {/* LEFT: Activity feed */}
        <section aria-label="员工动态" style={{ minWidth: 0 }}>
          <SectionLabel label="实时动态" />
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
        </section>

        {/* RIGHT: Goals + Employee status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {/* Goals */}
          <section aria-label="公司目标">
            <GoalsPanel goals={data.goals} onRefresh={onRefresh} />
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
                  onOpen={() => navigate(`/chat/${emp.id}`)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

    </main>
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
          <span style={{ marginLeft: "auto" }}>
            {formatTimeAgo(event.created_at)}
          </span>
        </div>
        <div
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-primary)",
            lineHeight: "var(--leading-normal)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            ...(isLong && !expanded
              ? {
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                }
              : {}),
          }}
        >
          {event.content}
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

const TASK_STATUS_DOT: Record<string, string> = {
  pending: "var(--text-muted)",
  in_progress: "var(--accent-urgent)",
  done: "var(--accent-done)",
};

function EmployeeStatusCard({
  emp,
  tasks,
  latestEvent,
  onOpen,
}: {
  emp: HallData["employees"][0];
  tasks: HallData["goals"][0]["tasks"];
  latestEvent?: ActivityEvent;
  onOpen: () => void;
}) {
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const statusColor = tasks.length === 0
    ? "var(--text-muted)"
    : done === tasks.length
    ? "var(--accent-done)"
    : inProgress > 0
    ? "var(--accent-urgent)"
    : "var(--text-muted)";
  const statusLabel = tasks.length === 0
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
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${emp.accentColor}`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-2) var(--space-3)",
        cursor: "pointer",
        transition: "background var(--transition-fast)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card-hover, var(--bg-base))"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: latestEvent || activeTasks.length > 0 ? "var(--space-1)" : 0 }}>
        <span style={{ fontSize: "14px" }}>{emp.emoji}</span>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-primary)", flex: 1, minWidth: 0 }}>
          {emp.name}
          <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>{emp.role}</span>
        </span>
        <span style={{ fontSize: "10px", color: statusColor, border: `1px solid ${statusColor}`, borderRadius: 8, padding: "1px 6px", whiteSpace: "nowrap", fontWeight: 600, flexShrink: 0 }}>
          {statusLabel}
        </span>
      </div>

      {/* Latest activity snippet */}
      {latestEvent && (
        <div style={{
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          lineHeight: "1.4",
          marginBottom: activeTasks.length > 0 ? "var(--space-1)" : 0,
          wordBreak: "break-word",
        }}>
          {latestEvent.content}
        </div>
      )}

      {/* Active tasks */}
      {activeTasks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
          {activeTasks.slice(0, 2).map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 4, fontSize: "10px", color: "var(--text-secondary)" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: TASK_STATUS_DOT[t.status], flexShrink: 0, marginTop: 3 }} />
              <span style={{ lineHeight: "1.4", wordBreak: "break-word" }}>{t.title}</span>
            </div>
          ))}
          {activeTasks.length > 2 && (
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>+{activeTasks.length - 2} 项</div>
          )}
        </div>
      )}
    </div>
  );
}

const TASK_STATUS_LABEL: Record<string, string> = { pending: "待开始", in_progress: "进行中", done: "完成" };

const PRESET_GOALS = [
  "完成 MVP 并公开上线",
  "月活用户突破 1000",
  "产品营收达到 10 万",
  "建立内容矩阵，社媒粉丝增长 5000",
  "完成融资准备，搭建投资人管道",
  "用户留存率提升至 60%",
];

function GoalsPanel({
  goals,
  onRefresh,
}: {
  goals: HallData["goals"];
  onRefresh: () => void;
}) {
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
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
                onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); if (e.key === "Escape") { setAdding(false); setNewTitle(""); } }}
                autoFocus
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => void handleAdd()} disabled={!newTitle.trim() || saving} style={smallBtnStyle("var(--accent-agent)")}>
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
            <GoalRow key={g.id} goal={g} onRefresh={onRefresh} />
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

function GoalRow({ goal, onRefresh }: { goal: HallData["goals"][0]; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [title, setTitle] = useState(goal.title);
  const [saving, setSaving] = useState(false);
  const done = goal.tasks.filter((t) => t.status === "done").length;
  const pct = goal.tasks.length > 0 ? Math.round((done / goal.tasks.length) * 100) : 0;

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
    await updateTask(taskId, next);
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
              if (e.key === "Escape") { setEditing(false); setTitle(goal.title); }
            }}
            autoFocus
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={() => void handleSave()} disabled={saving} style={smallBtnStyle("var(--accent-agent)")}>✓</button>
          <button onClick={() => { setEditing(false); setTitle(goal.title); }} style={smallBtnStyle("var(--border)")}>✕</button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                {goal.tasks.length > 0 && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "10px", color: "var(--text-muted)" }}
                  >
                    {expanded ? "▾" : "▸"}
                  </button>
                )}
                {goal.title}
              </div>
              {goal.quarter && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: 3 }}>{goal.quarter}</div>
              )}
              {goal.tasks.length > 0 && (
                <div>
                  <div style={{ height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent-done)", transition: "width 400ms ease" }} />
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>{done}/{goal.tasks.length} 完成</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => setEditing(true)} style={iconBtnStyle} title="编辑">✏️</button>
              <button onClick={() => void handleDelete()} style={iconBtnStyle} title="删除">🗑️</button>
            </div>
          </div>

          {/* Task list */}
          {expanded && goal.tasks.length > 0 && (
            <div style={{ marginTop: "var(--space-2)", display: "flex", flexDirection: "column", gap: 4 }}>
              {goal.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => void handleTaskClick(t.id, t.status)}
                  title={`点击切换到：${TASK_STATUS_LABEL[TASK_STATUS_CYCLE[t.status] ?? "pending"]}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 0",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span style={{ flexShrink: 0, fontSize: "12px", marginTop: 1 }}>
                    {TASK_STATUS_ICON[t.status] ?? "⬜"}
                  </span>
                  <span style={{
                    fontSize: "var(--text-xs)",
                    color: t.status === "done" ? "var(--text-muted)" : "var(--text-secondary)",
                    textDecoration: t.status === "done" ? "line-through" : "none",
                    lineHeight: "1.4",
                  }}>
                    {t.title}
                    <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                      · {t.employee_id.replace("company-", "")}
                    </span>
                  </span>
                </button>
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

      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: "var(--leading-normal)" }}>
        {pending.background}
      </p>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
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
      </div>

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
          <button onClick={() => void handleDecide("custom", custom.trim())} disabled={submitting} style={choiceButtonStyle("var(--accent-agent)")}>
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
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-2)" }}>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", justifyContent: "center" }}>
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
    <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", textAlign: "center", padding: "var(--space-4) 0" }}>
      {text}
    </p>
  );
}

function formatTimeAgo(dateStr: string): string {
  // SQLite datetime('now') stores UTC without timezone suffix; append Z so JS parses correctly
  const utcStr = dateStr.includes("T") || dateStr.endsWith("Z") ? dateStr : dateStr.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(utcStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return new Date(utcStr).toLocaleDateString("zh-CN");
}
