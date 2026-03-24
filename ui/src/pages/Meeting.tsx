import { useEffect, useRef, useState } from "react";
import type { Employee } from "../types.js";
import { streamChatWithEmployee } from "../hooks/useApi.js";

type EmployeeReply = {
  employeeId: string;
  text: string | null; // null = thinking
  error?: string;
};

type MeetingSession = {
  id: string;
  topic: string;
  createdAt: Date;
  replies: EmployeeReply[];
  done: boolean;
};

type MeetingProps = {
  employees: Employee[];
};

const STORAGE_KEY = "company-meeting-sessions";

export function Meeting({ employees }: MeetingProps) {
  const [sessions, setSessions] = useState<MeetingSession[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Array<Omit<MeetingSession, "createdAt"> & { createdAt: string }>;
      return parsed.map((s) => ({ ...s, createdAt: new Date(s.createdAt) }));
    } catch {
      return [];
    }
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Persist sessions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {}
  }, [sessions]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  const startMeeting = async () => {
    const text = topic.trim();
    if (!text || running) return;

    const id = crypto.randomUUID();
    const session: MeetingSession = {
      id,
      topic: text,
      createdAt: new Date(),
      replies: employees.map((e) => ({ employeeId: e.id, text: null })),
      done: false,
    };
    setSessions((prev) => [session, ...prev]);
    setActiveId(id);
    setTopic("");
    setRunning(true);

    // Send message to each employee serially so each can see prior replies
    const priorReplies: Array<{ name: string; role: string; text: string }> = [];
    for (const emp of employees) {
      // Build context-aware prompt
      let message: string;
      if (priorReplies.length === 0) {
        message = `全员会议议题：${text}\n\n你是第一位发言者，请给出你的看法和建议（3-5句话）。`;
      } else {
        const context = priorReplies
          .map((r) => `${r.name}（${r.role}）：${r.text}`)
          .join("\n\n");
        message = `全员会议议题：${text}\n\n前面同事的发言：\n${context}\n\n请结合以上发言，给出你的补充或不同意见（3-5句话）。`;
      }

      // Mark this employee as now speaking (empty string = streaming)
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, replies: s.replies.map((r) => r.employeeId === emp.id ? { ...r, text: "" } : r) }
            : s,
        ),
      );

      let fullText = "";
      try {
        await streamChatWithEmployee(emp.id, message, (chunk) => {
          fullText += chunk;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === id
                ? {
                    ...s,
                    replies: s.replies.map((r) =>
                      r.employeeId === emp.id ? { ...r, text: (r.text ?? "") + chunk } : r,
                    ),
                  }
                : s,
            ),
          );
        });
        if (fullText) priorReplies.push({ name: emp.name, role: emp.role, text: fullText });
      } catch (e) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id
              ? {
                  ...s,
                  replies: s.replies.map((r) =>
                    r.employeeId === emp.id
                      ? { ...r, text: "", error: e instanceof Error ? e.message : String(e) }
                      : r,
                  ),
                }
              : s,
          ),
        );
      }
    }

    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, done: true } : s)),
    );
    setRunning(false);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* Left panel: session list */}
      <div
        style={{
          width: 220,
          minWidth: 220,
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "var(--space-4)",
            borderBottom: "1px solid var(--border)",
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          会议记录
        </div>

        {sessions.length === 0 ? (
          <div
            style={{
              padding: "var(--space-6) var(--space-4)",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            还没有会议记录
          </div>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              style={{
                background: activeId === s.id ? "var(--bg-card)" : "transparent",
                border: "none",
                borderLeft:
                  activeId === s.id
                    ? "2px solid var(--accent-agent)"
                    : "2px solid transparent",
                padding: "var(--space-3) var(--space-4)",
                textAlign: "left",
                cursor: "pointer",
                color:
                  activeId === s.id
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                fontSize: "var(--text-sm)",
                transition: "background var(--transition-fast)",
                display: "block",
                width: "100%",
              }}
            >
              <div
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 2,
                }}
              >
                {s.topic}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                {s.createdAt.toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {!s.done && (
                  <span
                    style={{
                      marginLeft: "var(--space-2)",
                      color: "var(--accent-urgent)",
                    }}
                  >
                    •
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Right panel: meeting content */}
      <main
        role="main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {activeSession ? (
          <ActiveMeeting
            session={activeSession}
            employees={employees}
            bottomRef={bottomRef}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: "var(--space-4)",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 36 }}>🎤</div>
            <div style={{ fontSize: "var(--text-sm)" }}>
              发起全员会议，让每位员工参与讨论
            </div>
          </div>
        )}

        {/* New meeting input */}
        <div
          style={{
            padding: "var(--space-4) var(--space-6)",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-sidebar)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && topic.trim()) {
                  void startMeeting();
                }
              }}
              disabled={running}
              placeholder="向所有员工发起议题… (Enter 发送)"
              aria-label="会议议题"
              style={{
                flex: 1,
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "var(--text-sm)",
                padding: "var(--space-2) var(--space-3)",
                outline: "none",
              }}
            />
            <button
              onClick={() => void startMeeting()}
              disabled={!topic.trim() || running}
              style={{
                background: running ? "var(--border)" : "var(--accent-agent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#fff",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                padding: "var(--space-2) var(--space-4)",
                cursor: !topic.trim() || running ? "not-allowed" : "pointer",
                opacity: !topic.trim() || running ? 0.5 : 1,
                transition: "opacity var(--transition-fast)",
                whiteSpace: "nowrap",
              }}
            >
              {running ? "进行中…" : "召开会议"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ActiveMeeting({
  session,
  employees,
  bottomRef,
}: {
  session: MeetingSession;
  employees: Employee[];
  bottomRef: React.RefObject<HTMLDivElement>;
}) {
  return (
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
      {/* Topic header */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderLeft: "3px solid var(--accent-agent)",
          borderRadius: "var(--radius)",
          padding: "var(--space-4)",
        }}
      >
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            marginBottom: "var(--space-1)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          🎤 会议议题 ·{" "}
          {session.createdAt.toLocaleString("zh-CN", {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div
          style={{
            fontSize: "var(--text-base)",
            color: "var(--text-primary)",
            fontWeight: 600,
          }}
        >
          {session.topic}
        </div>
      </div>

      {/* Employee replies */}
      {session.replies.map((reply) => {
        const emp = employees.find((e) => e.id === reply.employeeId);
        if (!emp) return null;

        const isPending = reply.text === null;
        const isStreaming = reply.text === "" && !reply.error;
        const isError = reply.error != null;

        return (
          <div
            key={reply.employeeId}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderLeft: `3px solid ${emp.accentColor}`,
              borderRadius: "var(--radius)",
              padding: "var(--space-4)",
              opacity: isPending || isStreaming ? 0.85 : 1,
              transition: "opacity var(--transition-fast)",
            }}
          >
            {/* Employee header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                marginBottom: "var(--space-3)",
              }}
            >
              <span style={{ fontSize: "16px" }}>{emp.emoji}</span>
              <span
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {emp.name}
              </span>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--text-muted)",
                }}
              >
                {emp.role}
              </span>
            </div>

            {/* Reply content */}
            {isPending ? (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>等待发言…</span>
            ) : isStreaming ? (
              <MiniWave color={emp.accentColor} />
            ) : isError ? (
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--accent-error)",
                }}
              >
                [错误] {reply.error}
              </p>
            ) : (
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--text-primary)",
                  lineHeight: "var(--leading-normal)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {reply.text}
              </p>
            )}
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}

function MiniWave({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", height: 14 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
            animation: "wave 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes wave {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
