import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { Employee } from "../types.js";
import { generateEmployee, createEmployee, deleteEmployee } from "../hooks/useApi.js";

type GeneratedEmployee = Employee & {
  systemPrompt?: string;
  cronSchedule?: string;
  cronPrompt?: string;
};

type SidebarProps = {
  employees: Employee[];
  pendingCount: number;
  onEmployeeChange?: () => void;
};

const NAV_ITEMS = [
  { to: "/", icon: "🏢", label: "大厅", exact: true },
  { to: "/meeting", icon: "🎤", label: "全员会议" },
  { to: "/decisions", icon: "📋", label: "决策台账" },
];

export function Sidebar({ employees, pendingCount, onEmployeeChange }: SidebarProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <nav
        aria-label="主导航"
        style={{
          width: "var(--sidebar-width)",
          minWidth: "var(--sidebar-width)",
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "var(--space-4) 0",
          gap: 0,
          height: "100vh",
          position: "sticky",
          top: 0,
          overflowY: "auto",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "var(--space-2) var(--space-4) var(--space-6)",
            fontSize: "var(--text-sm)",
            color: "var(--text-secondary)",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          🏢 一人公司 OS
        </div>

        {/* Main nav */}
        {NAV_ITEMS.map(({ to, icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            style={({ isActive }) => navItemStyle(isActive)}
          >
            <span style={{ fontSize: "16px" }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {label === "大厅" && pendingCount > 0 && (
              <Badge count={pendingCount} color="var(--accent-urgent)" />
            )}
          </NavLink>
        ))}

        {/* Employees section */}
        <div
          style={{
            padding: "var(--space-6) var(--space-4) var(--space-2)",
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>员工</span>
          <button
            onClick={() => setShowModal(true)}
            title="添加自定义员工"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "16px",
              lineHeight: 1,
              padding: "0 2px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
            }}
          >
            +
          </button>
        </div>
        {employees.map((emp) => (
          <div key={emp.id} style={{ display: "flex", alignItems: "center", position: "relative" }}>
            <NavLink
              to={`/chat/${emp.id}`}
              style={({ isActive }) => ({ ...navItemStyle(isActive), flex: 1 })}
            >
              <span style={{ fontSize: "16px" }}>{emp.emoji}</span>
              <span style={{ flex: 1 }}>
                {emp.name}
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    marginLeft: "4px",
                  }}
                >
                  {emp.role}
                </span>
              </span>
              {/* Online indicator */}
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--accent-done)",
                  flexShrink: 0,
                }}
                title="在线"
              />
            </NavLink>
            {emp.isCustom && (
              <button
                onClick={async () => {
                  if (!confirm(`确认删除员工 ${emp.name}？`)) return;
                  await deleteEmployee(emp.id);
                  onEmployeeChange?.();
                }}
                title="删除员工"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: "0 var(--space-2)",
                  flexShrink: 0,
                  opacity: 0.6,
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent-error, #e05c5c)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.6"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </nav>

      {showModal && (
        <AddEmployeeModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            onEmployeeChange?.();
          }}
        />
      )}
    </>
  );
}

type AddEmployeeModalProps = {
  onClose: () => void;
  onCreated: () => void;
};

function AddEmployeeModal({ onClose, onCreated }: AddEmployeeModalProps) {
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState<GeneratedEmployee | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    setGenerated(null);
    try {
      const emp = await generateEmployee(description.trim());
      setGenerated(emp as GeneratedEmployee);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generated) return;
    setSaving(true);
    setError(null);
    try {
      await createEmployee(generated as Employee & {
        systemPrompt?: string;
        cronSchedule?: string;
        cronPrompt?: string;
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md, 10px)",
          padding: "var(--space-6)",
          width: "min(480px, 90vw)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--text-primary)" }}>
          ✨ 添加自定义员工
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            描述职位需求（AI 将自动生成档案）
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例：我需要一个负责客户支持和用户反馈收集的员工"
            rows={3}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 6px)",
              color: "var(--text-primary)",
              fontSize: "var(--text-sm)",
              padding: "var(--space-3)",
              resize: "vertical",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>

        <button
          onClick={() => void handleGenerate()}
          disabled={generating || !description.trim()}
          style={{
            background: "var(--accent-agent, #7b61ff)",
            border: "none",
            borderRadius: "var(--radius-sm, 6px)",
            color: "#fff",
            fontSize: "var(--text-sm)",
            padding: "var(--space-2) var(--space-4)",
            cursor: generating || !description.trim() ? "not-allowed" : "pointer",
            opacity: generating || !description.trim() ? 0.6 : 1,
            fontWeight: 600,
          }}
        >
          {generating ? "AI 生成中…" : "AI 生成"}
        </button>

        {error && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--accent-error, #e05c5c)" }}>
            {error}
          </div>
        )}

        {generated && (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 6px)",
              padding: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
              预览
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <span style={{ fontSize: "28px" }}>{generated.emoji}</span>
              <div>
                <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--text-primary)" }}>
                  {generated.name}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  {generated.role}
                </div>
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  background: generated.accentColor ?? "#7b61ff",
                  borderRadius: "20px",
                  padding: "2px 10px",
                  fontSize: "var(--text-xs)",
                  color: "#fff",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {generated.accentColor ?? "#7b61ff"}
              </div>
            </div>
            {generated.systemPrompt && (
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {generated.systemPrompt}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 6px)",
              color: "var(--text-secondary)",
              fontSize: "var(--text-sm)",
              padding: "var(--space-2) var(--space-4)",
              cursor: "pointer",
            }}
          >
            取消
          </button>
          {generated && (
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                background: "var(--accent-done, #4caf82)",
                border: "none",
                borderRadius: "var(--radius-sm, 6px)",
                color: "#fff",
                fontSize: "var(--text-sm)",
                padding: "var(--space-2) var(--space-4)",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
                fontWeight: 600,
              }}
            >
              {saving ? "保存中…" : "确认添加"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function navItemStyle(isActive: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-2) var(--space-4)",
    fontSize: "var(--text-sm)",
    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
    background: isActive ? "var(--bg-card)" : "transparent",
    borderLeft: isActive ? "2px solid var(--accent-agent)" : "2px solid transparent",
    textDecoration: "none",
    transition: "background var(--transition-fast), color var(--transition-fast)",
    cursor: "pointer",
  };
}

function Badge({ count, color }: { count: number; color: string }) {
  return (
    <span
      style={{
        background: color,
        color: "#fff",
        borderRadius: "10px",
        padding: "1px 7px",
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        lineHeight: "1.6",
        flexShrink: 0,
      }}
    >
      {count}
    </span>
  );
}
