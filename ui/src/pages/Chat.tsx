import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Md } from "../components/Markdown.js";
import {
  clearChatSession,
  sendDecision,
  streamChatWithEmployee,
  useActivity,
} from "../hooks/useApi.js";
import type { ActivityEvent, Employee, Goal } from "../types.js";

// Detect one or more <需要决策 options="A|B|C">background</需要决策> tags in assistant messages
type SingleDecision = { background: string; options: string[] };

type ParsedDecisions = {
  decisions: SingleDecision[];
  cleanText: string;
};

function parsePendingDecisions(text: string): ParsedDecisions | null {
  const re = /<需要决策\s+options="([^"]+)">([\s\S]*?)<\/需要决策>/g;
  const decisions: SingleDecision[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const options = m[1]
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length >= 2) decisions.push({ background: m[2].trim(), options });
  }
  if (decisions.length === 0) return null;
  const cleanText = text.replace(/<需要决策\s+options="[^"]+">[\s\S]*?<\/需要决策>/g, "").trim();
  return { decisions, cleanText };
}

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

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ChatProps = {
  employees: Employee[];
  goals: Goal[];
};

export function Chat({ employees, goals }: ChatProps) {
  const { employeeId } = useParams<{ employeeId: string }>();
  const emp = employees.find((e) => e.id === employeeId);
  const isChief = employeeId === "company-coo";
  const [goalId, setGoalId] = useState<number | undefined>(undefined);
  const allActivity = useActivity(5_000, goalId);
  const empActivity = allActivity.filter((a) => a.employee_id === employeeId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which employee's messages are currently loaded, so saves never cross-contaminate
  const saveKeyRef = useRef<string | undefined>(undefined);
  const scopeKey = goalId === undefined ? "all" : String(goalId);

  const goalsForEmp = goals.filter((g) => g.tasks.some((t) => t.employee_id === employeeId));
  const activeGoal = goalId === undefined ? null : (goals.find((g) => g.id === goalId) ?? null);

  // Load persisted goal scope per employee
  useEffect(() => {
    if (!employeeId) return;
    const raw = localStorage.getItem(`chat-scope:${employeeId}`);
    const parsed = raw ? Number(raw) : NaN;
    if (
      Number.isFinite(parsed) &&
      goals.some((g) => g.id === parsed) &&
      goals.some((g) => g.id === parsed && g.tasks.some((t) => t.employee_id === employeeId))
    ) {
      setGoalId(parsed);
    } else {
      setGoalId(undefined);
    }
  }, [employeeId, goals]);

  useEffect(() => {
    if (!employeeId) return;
    if (goalId === undefined) localStorage.removeItem(`chat-scope:${employeeId}`);
    else localStorage.setItem(`chat-scope:${employeeId}`, String(goalId));
  }, [employeeId, goalId]);

  // Load persisted messages when switching employees, save key so saves go to right slot
  useEffect(() => {
    saveKeyRef.current = undefined; // pause saving during load
    const stored = localStorage.getItem(`chat:${employeeId ?? ""}:goal:${scopeKey}`);
    setMessages(stored ? (JSON.parse(stored) as Message[]) : []);
    setInput("");
    setThinking(false);
    setTimedOut(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    saveKeyRef.current = `${employeeId ?? ""}:goal:${scopeKey}`; // resume saving for this scope
  }, [employeeId, scopeKey]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    const key = saveKeyRef.current;
    if (!key) return;
    localStorage.setItem(`chat:${key}`, JSON.stringify(messages));
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!emp) {
    return (
      <main role="main" style={mainStyle}>
        <p style={{ color: "var(--text-muted)" }}>未找到该员工</p>
      </main>
    );
  }

  if (!isChief) {
    return (
      <main role="main" style={mainStyle}>
        <p style={{ color: "var(--text-muted)", padding: "var(--space-8)" }}>
          该角色仅可由总指挥 AI 调度。请从侧边栏进入总指挥会话。
        </p>
      </main>
    );
  }

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || thinking) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);
    setTimedOut(false);

    // 30s timeout indicator
    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
    }, 30_000);

    // Add an empty assistant message that we'll fill in as chunks arrive
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "" }]);

    try {
      await streamChatWithEmployee(
        emp.id,
        text,
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m)),
          );
          // Clear the "thinking" state on first chunk
          setThinking(false);
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        },
        goalId,
      );
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: `[错误] ${e instanceof Error ? e.message : String(e)}` }
            : m,
        ),
      );
    } finally {
      setThinking(false);
      setTimedOut(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  };

  return (
    <main role="main" style={mainStyle}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-sidebar)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "22px" }}>{emp.emoji}</span>
        <div>
          <div style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>{emp.name}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{emp.role}</div>
        </div>
        <div
          style={{
            marginLeft: "var(--space-3)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>目标隔离</span>
          <select
            value={goalId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setGoalId(v ? Number(v) : undefined);
            }}
            aria-label="目标作用域"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "var(--text-xs)",
              padding: "2px 8px",
              outline: "none",
            }}
          >
            <option value="">公司全局</option>
            {goalsForEmp.map((g) => (
              <option key={g.id} value={g.id}>
                #{g.id} {g.title}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                localStorage.removeItem(`chat:${employeeId ?? ""}:goal:${scopeKey}`);
                void clearChatSession(employeeId ?? "").catch(() => void 0);
              }}
              title="清空聊天记录"
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-muted)",
                fontSize: "var(--text-xs)",
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              清空
            </button>
          )}
          <span
            style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-done)" }}
            title="在线"
          />
        </div>
      </div>
      {activeGoal && (
        <div
          style={{
            padding: "6px var(--space-6)",
            borderBottom: "1px dashed var(--border)",
            fontSize: "var(--text-xs)",
            color: "var(--text-secondary)",
            background: "var(--bg-sidebar)",
          }}
        >
          当前仅处理目标：#{activeGoal.id} {activeGoal.title}
        </div>
      )}

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {/* Activity feed — work history from the employee */}
        {empActivity.length > 0 && <ActivityFeed activity={empActivity} emp={emp} />}
        {messages.length === 0 && !thinking && empActivity.length === 0 && (
          <div
            style={{
              margin: "auto",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: "var(--space-3)" }}>{emp.emoji}</div>
            <div style={{ fontSize: "var(--text-sm)" }}>和 {emp.name} 开始对话</div>
          </div>
        )}
        {messages.length === 0 && empActivity.length > 0 && !thinking && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "var(--text-xs)",
              padding: "var(--space-4) 0",
            }}
          >
            ↓ 在此发消息，直接和 {emp.name} 对话
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} emp={emp} goalId={goalId} />
        ))}
        {thinking && <ThinkingBubble emp={emp} timedOut={timedOut} />} <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-sidebar)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            disabled={thinking}
            placeholder={`给 ${emp.name} 发消息… ${activeGoal ? `(目标 #${activeGoal.id}) ` : ""}(Enter 发送，Shift+Enter 换行)`}
            aria-label="消息输入"
            style={{
              flex: 1,
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: "var(--text-sm)",
              padding: "var(--space-2) var(--space-3)",
              outline: "none",
              resize: "none",
              lineHeight: "var(--leading-normal)",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || thinking}
            style={{
              background: thinking ? "var(--border)" : "var(--accent-agent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#fff",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              padding: "var(--space-2) var(--space-4)",
              cursor: thinking || !input.trim() ? "not-allowed" : "pointer",
              opacity: !input.trim() || thinking ? 0.5 : 1,
              transition: "opacity var(--transition-fast), background var(--transition-fast)",
              whiteSpace: "nowrap",
            }}
          >
            发送
          </button>
        </div>
      </div>
    </main>
  );
}

function MessageBubble({ msg, emp, goalId }: { msg: Message; emp: Employee; goalId?: number }) {
  const isUser = msg.role === "user";
  const parsed = !isUser ? parsePendingDecisions(msg.text) : null;
  const displayText = parsed ? parsed.cleanText : msg.text;

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: isUser ? "var(--accent-agent)" : "var(--bg-card)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          flexShrink: 0,
        }}
      >
        {isUser ? "你" : emp.emoji}
      </div>

      {/* Bubble + optional inline decision card */}
      <div
        style={{ maxWidth: "70%", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
      >
        {displayText && (
          <div
            style={{
              background: isUser ? "var(--accent-agent)" : "var(--bg-card)",
              border: isUser ? "none" : "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "var(--space-3) var(--space-4)",
              fontSize: "var(--text-sm)",
              color: isUser ? "#fff" : "var(--text-primary)",
            }}
          >
            {isUser ? (
              <span
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  lineHeight: "var(--leading-normal)",
                }}
              >
                {displayText}
              </span>
            ) : (
              <Md>{displayText}</Md>
            )}
          </div>
        )}
        {parsed &&
          parsed.decisions.map((decision, i) => (
            <InlinePendingDecisionCard
              key={i}
              decision={decision}
              employeeId={emp.id}
              goalId={goalId}
            />
          ))}
      </div>
    </div>
  );
}

function InlinePendingDecisionCard({
  decision,
  employeeId,
  goalId,
}: {
  decision: SingleDecision;
  employeeId: string;
  goalId?: number;
}) {
  const [decided, setDecided] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecide = async (choice: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await sendDecision({ employeeId, summary: decision.background, choice, goalId });
      setDecided(choice);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--accent-urgent, #f5a623)",
        borderRadius: "var(--radius)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        opacity: submitting ? 0.7 : 1,
        transition: "opacity 150ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span style={{ fontSize: "12px" }}>⚡</span>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          待决请求
        </span>
      </div>
      <p
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-primary)",
          lineHeight: "1.5",
          margin: 0,
        }}
      >
        {decision.background}
      </p>
      {decided ? (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--accent-done, #4caf82)",
            fontWeight: 600,
          }}
        >
          ✅ 已选：{decided}
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {decision.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => void handleDecide(opt)}
              disabled={submitting}
              style={{
                background: i === 0 ? "var(--accent-urgent, #f5a623)" : "var(--bg-base)",
                border: `1px solid ${i === 0 ? "var(--accent-urgent, #f5a623)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm, 6px)",
                color: i === 0 ? "#fff" : "var(--text-secondary)",
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                padding: "4px 12px",
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--accent-error, #e05c5c)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function ThinkingBubble({ emp, timedOut }: { emp: Employee; timedOut: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        alignItems: "flex-start",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          flexShrink: 0,
        }}
      >
        {emp.emoji}
      </div>

      {/* Thinking bubble */}
      <div
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${emp.accentColor}44`,
          borderRadius: "var(--radius)",
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
        }}
      >
        {timedOut ? (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {emp.name} 正在深度思考…
          </span>
        ) : (
          <WaveAnimation color={emp.accentColor} />
        )}
      </div>
    </div>
  );
}

function WaveAnimation({ color }: { color: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 3,
        alignItems: "center",
        height: 16,
      }}
      aria-label="思考中"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
            animation: `wave 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ActivityFeed({ activity, emp }: { activity: ActivityEvent[]; emp: Employee }) {
  const [expanded, setExpanded] = useState(false);
  const reversed = [...activity].reverse();
  const shown = expanded ? reversed : reversed.slice(-3);

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${emp.accentColor}44`,
        borderRadius: "var(--radius)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        marginBottom: "var(--space-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {emp.name} 的工作动态
        </span>
        {activity.length > 3 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--accent-agent)",
              fontSize: "var(--text-xs)",
              padding: 0,
            }}
          >
            {expanded ? "收起" : `显示全部 ${activity.length} 条`}
          </button>
        )}
      </div>
      {shown.map((event) => (
        <div key={event.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <span
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: "10px",
                color: "var(--text-muted)",
              }}
            >
              {EVENT_ICONS[event.event_type] ?? "•"}{" "}
              {EVENT_LABELS[event.event_type] ?? event.event_type}
            </span>
            <span
              style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}
            >
              {formatTimeAgo(event.created_at)}
            </span>
          </div>
          <Md compact style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
            {event.content}
          </Md>
        </div>
      ))}
    </div>
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

const mainStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  minWidth: 0,
};
