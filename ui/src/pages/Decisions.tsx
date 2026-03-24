import type { Decision } from "../types.js";
import { useDecisions } from "../hooks/useApi.js";

export function Decisions() {
  const { decisions, loading, error, query, setQuery } = useDecisions();

  return (
    <main
      role="main"
      style={{
        flex: 1,
        height: 0,
        overflow: "auto",
        padding: "var(--space-8)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--space-4)",
        }}
      >
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>
          决策台账
        </h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索决策…"
          aria-label="搜索决策"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: "var(--text-sm)",
            padding: "var(--space-2) var(--space-3)",
            outline: "none",
            width: 220,
          }}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
          加载中…
        </div>
      ) : error ? (
        <div style={{ color: "var(--accent-error)", fontSize: "var(--text-sm)" }}>
          加载失败：{error}
        </div>
      ) : decisions.length === 0 ? (
        <EmptyDecisions hasQuery={query.length > 0} />
      ) : (
        <DecisionTable decisions={decisions} />
      )}
    </main>
  );
}

function EmptyDecisions({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-4)",
        paddingTop: "var(--space-12)",
        color: "var(--text-muted)",
      }}
    >
      <div style={{ fontSize: 40 }}>📋</div>
      <p style={{ fontSize: "var(--text-sm)", textAlign: "center" }}>
        {hasQuery ? "没有匹配的决策记录" : "还没有决策记录"}
      </p>
    </div>
  );
}

function DecisionTable({ decisions }: { decisions: Decision[] }) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}
    >
      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 100px 80px 130px",
          gap: 0,
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {["决策内容", "执行选项", "状态", "时间"].map((h) => (
          <div
            key={h}
            style={{
              padding: "var(--space-3) var(--space-4)",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {decisions.map((d) => (
        <DecisionRow key={d.id} decision={d} />
      ))}
    </div>
  );
}

function DecisionRow({ decision: d }: { decision: Decision }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 80px 130px",
        gap: 0,
        borderBottom: "1px solid var(--border)",
        transition: "background var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Summary + context */}
      <div style={{ padding: "var(--space-3) var(--space-4)" }}>
        <div
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-primary)",
            marginBottom: d.context ? 2 : 0,
          }}
        >
          {d.summary}
        </div>
        {d.context && (
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
            }}
          >
            {d.context}
          </div>
        )}
      </div>

      {/* Choice */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {d.choice}
        </span>
      </div>

      {/* Status badge */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <StatusBadge tag={d.result_tag} />
      </div>

      {/* Time */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {new Date((d.created_at.includes("T") || d.created_at.endsWith("Z") ? d.created_at : d.created_at.replace(" ", "T") + "Z")).toLocaleString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

const TAG_CONFIG: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  pending: {
    label: "待执行",
    bg: "var(--accent-urgent)22",
    color: "var(--accent-urgent)",
  },
  in_progress: {
    label: "进行中",
    bg: "var(--accent-agent)22",
    color: "var(--accent-agent)",
  },
  done: {
    label: "已完成",
    bg: "var(--accent-done)22",
    color: "var(--accent-done)",
  },
  closed: {
    label: "已关闭",
    bg: "var(--border)",
    color: "var(--text-muted)",
  },
};

function StatusBadge({ tag }: { tag: string }) {
  const cfg = TAG_CONFIG[tag] ?? TAG_CONFIG.closed;
  return (
    <span
      style={{
        background: cfg.bg,
        color: cfg.color,
        borderRadius: "10px",
        padding: "2px 8px",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        whiteSpace: "nowrap",
        border: `1px solid ${cfg.color}44`,
      }}
    >
      {cfg.label}
    </span>
  );
}
