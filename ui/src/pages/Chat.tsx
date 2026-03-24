import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { ActivityEvent, Employee } from "../types.js";
import { streamChatWithEmployee, useActivity } from "../hooks/useApi.js";

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
};

export function Chat({ employees }: ChatProps) {
  const { employeeId } = useParams<{ employeeId: string }>();
  const emp = employees.find((e) => e.id === employeeId);
  const allActivity = useActivity(5_000);
  const empActivity = allActivity.filter((a) => a.employee_id === employeeId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which employee's messages are currently loaded, so saves never cross-contaminate
  const saveKeyRef = useRef<string | undefined>(undefined);

  // Load persisted messages when switching employees, save key so saves go to right slot
  useEffect(() => {
    saveKeyRef.current = undefined; // pause saving during load
    const stored = localStorage.getItem(`chat:${employeeId ?? ""}`);
    setMessages(stored ? (JSON.parse(stored) as Message[]) : []);
    setInput("");
    setThinking(false);
    setTimedOut(false);
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    saveKeyRef.current = employeeId; // resume saving for this employee
  }, [employeeId]);

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
      await streamChatWithEmployee(emp.id, text, (chunk) => {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, text: m.text + chunk } : m),
        );
        // Clear the "thinking" state on first chunk
        setThinking(false);
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      });
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
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
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
          <div style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>
            {emp.name}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {emp.role}
          </div>
        </div>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent-done)",
            marginLeft: "auto",
          }}
          title="在线"
        />
      </div>

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
        {empActivity.length > 0 && (
          <ActivityFeed activity={empActivity} emp={emp} />
        )}

        {messages.length === 0 && !thinking && empActivity.length === 0 && (
          <div
            style={{
              margin: "auto",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: "var(--space-3)" }}>
              {emp.emoji}
            </div>
            <div style={{ fontSize: "var(--text-sm)" }}>
              和 {emp.name} 开始对话
            </div>
          </div>
        )}

        {messages.length === 0 && empActivity.length > 0 && !thinking && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "var(--text-xs)", padding: "var(--space-4) 0" }}>
            ↓ 在此发消息，直接和 {emp.name} 对话
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} emp={emp} />
        ))}

        {thinking && <ThinkingBubble emp={emp} timedOut={timedOut} />}        <div ref={bottomRef} />
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
            placeholder={`给 ${emp.name} 发消息… (Enter 发送，Shift+Enter 换行)`}
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

function MessageBubble({
  msg,
  emp,
}: {
  msg: Message;
  emp: Employee;
}) {
  const isUser = msg.role === "user";

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

      {/* Bubble */}
      <div
        style={{
          maxWidth: "70%",
          background: isUser ? "var(--accent-agent)" : "var(--bg-card)",
          border: isUser ? "none" : "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-3) var(--space-4)",
          fontSize: "var(--text-sm)",
          color: isUser ? "#fff" : "var(--text-primary)",
          lineHeight: "var(--leading-normal)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.text}
      </div>
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
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {emp.name} 的工作动态
        </span>
        {activity.length > 3 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-agent)", fontSize: "var(--text-xs)", padding: 0 }}
          >
            {expanded ? "收起" : `显示全部 ${activity.length} 条`}
          </button>
        )}
      </div>
      {shown.map((event) => (
        <div key={event.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <span style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", fontSize: "10px", color: "var(--text-muted)" }}>
              {EVENT_ICONS[event.event_type] ?? "•"} {EVENT_LABELS[event.event_type] ?? event.event_type}
            </span>
            <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{formatTimeAgo(event.created_at)}</span>
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {event.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const utcStr = dateStr.includes("T") || dateStr.endsWith("Z") ? dateStr : dateStr.replace(" ", "T") + "Z";
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
