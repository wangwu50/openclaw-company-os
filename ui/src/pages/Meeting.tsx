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

// 将会议 session 格式化为 markdown 纪要（纯函数，无副作用）
function exportMarkdown(session: MeetingSession, employees: Employee[]): string {
  const dateStr = session.createdAt.toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  let md = `# 会议纪要：${session.topic}\n\n日期：${dateStr}\n`;
  for (let i = 0; i < session.rounds.length; i++) {
    const round = session.rounds[i];
    md += `\n## 第 ${i + 1} 轮\n\n**CEO**：${round.message}\n`;
    for (const reply of round.replies) {
      if (!reply.text) continue;
      const emp = employees.find((e) => e.id === reply.employeeId);
      const label = emp ? `${emp.name}（${emp.role}）` : reply.employeeId;
      md += `\n**${label}**：${reply.text}\n`;
    }
  }
  return md;
}

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
  const [exportMd, setExportMd] = useState<string | null>(null);
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
    const shuffled = [...employees].sort(() => Math.random() - 0.5);

    for (const emp of shuffled) {
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
      <main role="main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* 导出纪要覆盖层 */}
        {exportMd !== null && (
          <ExportOverlay
            markdown={exportMd}
            topic={activeSession?.topic ?? "会议纪要"}
            onClose={() => setExportMd(null)}
          />
        )}

        {activeSession ? (
          <>
            {/* 会议标题栏 */}
            <div
              style={{
                padding: "var(--space-3) var(--space-6)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  marginRight: "var(--space-3)",
                }}
              >
                {activeSession.topic}
              </span>
              {/* 仅当所有轮次均完成时显示导出按钮 */}
              {activeSession.rounds.length > 0 && activeSession.rounds.every((r) => r.done) && (
                <button
                  onClick={() => setExportMd(exportMarkdown(activeSession, employees))}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-secondary)",
                    fontSize: "var(--text-xs)",
                    padding: "3px 10px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  导出纪要
                </button>
              )}
            </div>

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
          </>
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

function ExportOverlay({
  markdown,
  topic,
  onClose,
}: {
  markdown: string;
  topic: string;
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
    // 用会议主题前20字作为文件名，过滤非法字符
    const safeName = topic.slice(0, 20).replace(/[\\/:*?"<>|]/g, "_");
    a.href = url;
    a.download = `会议纪要-${safeName}.md`;
    a.click();
    // 立即释放对象 URL，避免内存泄漏
    URL.revokeObjectURL(url);
  };

  return (
    // 半透明遮罩，点击关闭
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      {/* 内容卡片，阻止点击冒泡到遮罩 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-5)",
          width: "min(640px, 90%)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        {/* 标题栏 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
            会议纪要预览
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "16px",
              lineHeight: 1,
              padding: "2px 4px",
            }}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Markdown 只读预览 */}
        <textarea
          readOnly
          value={markdown}
          style={{
            flex: 1,
            minHeight: 300,
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "var(--text-xs)",
            fontFamily: "monospace",
            lineHeight: 1.6,
            padding: "var(--space-3)",
            resize: "vertical",
            outline: "none",
          }}
        />

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <button
            onClick={() => void handleCopy()}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: copied ? "var(--accent-done)" : "var(--text-secondary)",
              fontSize: "var(--text-xs)",
              padding: "4px 12px",
              cursor: "pointer",
              transition: "color var(--transition-fast)",
            }}
          >
            {copied ? "已复制 ✓" : "复制"}
          </button>
          <button
            onClick={handleDownload}
            style={{
              background: "var(--accent-agent)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#fff",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              padding: "4px 12px",
              cursor: "pointer",
            }}
          >
            下载 .md
          </button>
        </div>
      </div>
    </div>
  );
}
