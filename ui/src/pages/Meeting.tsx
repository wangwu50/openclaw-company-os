import { useEffect, useRef, useState } from "react";
import type { Employee } from "../types.js";
import { streamChatWithEmployee } from "../hooks/useApi.js";

type EmployeeReply = {
  employeeId: string;
  text: string | null; // null = waiting
  error?: string;
};

type Round = {
  id: string;
  message: string; // CEO's message for this round
  replies: EmployeeReply[];
  done: boolean;
};

type MeetingSession = {
  id: string;
  topic: string; // first message, used as session title
  createdAt: Date;
  rounds: Round[];
};

type MeetingProps = {
  employees: Employee[];
};

const STORAGE_KEY = "company-meeting-sessions-v2";

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
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {}
  }, [sessions]);

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, running]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  const runRound = async (sessionId: string, roundId: string, message: string, allPriorRounds: Round[]) => {
    const priorReplies: Array<{ name: string; role: string; text: string }> = [];

    for (const emp of employees) {
      // Build context: include all prior rounds + current round's prior speakers
      const priorRoundsContext = allPriorRounds
        .filter((r) => r.done)
        .map((r) => {
          const roundReplies = r.replies
            .filter((rp) => rp.text)
            .map((rp) => {
              const e = employees.find((e) => e.id === rp.employeeId);
              return `${e?.name ?? rp.employeeId}（${e?.role ?? ""}）：${rp.text}`;
            })
            .join("\n");
          return `【CEO】：${r.message}\n${roundReplies}`;
        })
        .join("\n\n---\n\n");

      let msgParts = `全员会议`;
      if (priorRoundsContext) msgParts += `\n\n【历史记录】\n${priorRoundsContext}\n\n---`;
      msgParts += `\n\n【CEO 新问题】：${message}`;

      if (priorReplies.length === 0) {
        msgParts += `\n\n你是第一位发言者，请给出你的看法和建议（3-5句话）。`;
      } else {
        const currentContext = priorReplies
          .map((r) => `${r.name}（${r.role}）：${r.text}`)
          .join("\n\n");
        msgParts += `\n\n本轮前面同事的发言：\n${currentContext}\n\n请结合以上发言，给出你的补充或不同意见（3-5句话）。`;
      }

      // Mark this employee as now speaking
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                rounds: s.rounds.map((r) =>
                  r.id === roundId
                    ? { ...r, replies: r.replies.map((rp) => rp.employeeId === emp.id ? { ...rp, text: "" } : rp) }
                    : r,
                ),
              }
            : s,
        ),
      );

      let fullText = "";
      try {
        await streamChatWithEmployee(emp.id, msgParts, (chunk) => {
          fullText += chunk;
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    rounds: s.rounds.map((r) =>
                      r.id === roundId
                        ? {
                            ...r,
                            replies: r.replies.map((rp) =>
                              rp.employeeId === emp.id ? { ...rp, text: (rp.text ?? "") + chunk } : rp,
                            ),
                          }
                        : r,
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
            s.id === sessionId
              ? {
                  ...s,
                  rounds: s.rounds.map((r) =>
                    r.id === roundId
                      ? {
                          ...r,
                          replies: r.replies.map((rp) =>
                            rp.employeeId === emp.id
                              ? { ...rp, text: "", error: e instanceof Error ? e.message : String(e) }
                              : rp,
                          ),
                        }
                      : r,
                  ),
                }
              : s,
          ),
        );
      }
    }

    // Mark round as done
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, rounds: s.rounds.map((r) => r.id === roundId ? { ...r, done: true } : r) }
          : s,
      ),
    );
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setRunning(true);

    const roundId = crypto.randomUUID();
    const newRound: Round = {
      id: roundId,
      message: text,
      replies: employees.map((e) => ({ employeeId: e.id, text: null })),
      done: false,
    };

    if (!activeSession) {
      // New session
      const sessionId = crypto.randomUUID();
      const session: MeetingSession = {
        id: sessionId,
        topic: text,
        createdAt: new Date(),
        rounds: [newRound],
      };
      setSessions((prev) => [session, ...prev]);
      setActiveId(sessionId);
      await runRound(sessionId, roundId, text, []);
    } else {
      // Add round to existing session
      const priorRounds = activeSession.rounds;
      setSessions((prev) =>
        prev.map((s) => s.id === activeSession.id ? { ...s, rounds: [...s.rounds, newRound] } : s),
      );
      await runRound(activeSession.id, roundId, text, priorRounds);
    }

    setRunning(false);
  };

  const isRunning = running;
  const placeholder = activeSession
    ? "继续追问… (Enter 发送)"
    : "向所有员工发起议题… (Enter 发送)";
  const buttonLabel = isRunning ? "进行中…" : activeSession ? "追问" : "召开会议";

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
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
            padding: "var(--space-3) var(--space-4)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
            会议记录
          </span>
          <button
            onClick={() => setActiveId(null)}
            title="新会议"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-xs)",
              padding: "2px 8px",
              cursor: "pointer",
              lineHeight: 1.5,
            }}
          >
            + 新会议
          </button>
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
          sessions.map((s) => {
            const lastRound = s.rounds[s.rounds.length - 1];
            const isActive = activeId === s.id;
            const inProgress = lastRound && !lastRound.done;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                style={{
                  background: isActive ? "var(--bg-card)" : "transparent",
                  border: "none",
                  borderLeft: isActive ? "2px solid var(--accent-agent)" : "2px solid transparent",
                  padding: "var(--space-3) var(--space-4)",
                  textAlign: "left",
                  cursor: "pointer",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontSize: "var(--text-sm)",
                  transition: "background var(--transition-fast)",
                  display: "block",
                  width: "100%",
                }}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
                  {s.topic}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {s.createdAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  {" · "}{s.rounds.length} 轮
                  {inProgress && (
                    <span style={{ marginLeft: "var(--space-2)", color: "var(--accent-urgent)" }}>•</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Right panel */}
      <main role="main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {activeSession ? (
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "var(--space-6)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-6)",
            }}
          >
            {activeSession.rounds.map((round, roundIndex) => (
              <RoundBlock
                key={round.id}
                round={round}
                roundIndex={roundIndex}
                employees={employees}
                session={activeSession}
              />
            ))}
            <div ref={bottomRef} />
          </div>
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
            <div style={{ fontSize: "var(--text-sm)" }}>发起全员会议，让每位员工参与讨论</div>
          </div>
        )}

        {/* Input */}
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) void sendMessage();
              }}
              disabled={isRunning}
              placeholder={placeholder}
              aria-label="会议输入"
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
              onClick={() => void sendMessage()}
              disabled={!input.trim() || isRunning}
              style={{
                background: isRunning ? "var(--border)" : "var(--accent-agent)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#fff",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                padding: "var(--space-2) var(--space-4)",
                cursor: !input.trim() || isRunning ? "not-allowed" : "pointer",
                opacity: !input.trim() || isRunning ? 0.5 : 1,
                transition: "opacity var(--transition-fast)",
                whiteSpace: "nowrap",
              }}
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function RoundBlock({
  round,
  roundIndex,
  employees,
  session,
}: {
  round: Round;
  roundIndex: number;
  employees: Employee[];
  session: MeetingSession;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {/* CEO message */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderLeft: "3px solid var(--accent-agent)",
          borderRadius: "var(--radius)",
          padding: "var(--space-3) var(--space-4)",
        }}
      >
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 4 }}>
          🎤 {roundIndex === 0
            ? `会议发起 · ${session.createdAt.toLocaleString("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
            : `第 ${roundIndex + 1} 轮追问`}
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 600 }}>
          {round.message}
        </div>
      </div>

      {/* Employee replies */}
      {round.replies.map((reply) => {
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
              opacity: isPending || isStreaming ? 0.75 : 1,
              transition: "opacity var(--transition-fast)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
              <span style={{ fontSize: "16px" }}>{emp.emoji}</span>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>{emp.name}</span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{emp.role}</span>
            </div>
            {isPending ? (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>等待发言…</span>
            ) : isStreaming ? (
              <MiniWave color={emp.accentColor} />
            ) : isError ? (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--accent-error)" }}>[错误] {reply.error}</p>
            ) : (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", lineHeight: "var(--leading-normal)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {reply.text}
              </p>
            )}
          </div>
        );
      })}
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
