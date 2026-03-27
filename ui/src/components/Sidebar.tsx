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

type RoleTemplate = Omit<GeneratedEmployee, "id" | "isCustom"> & { label: string };

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    label: "产品经理",
    name: "Alex",
    emoji: "🧩",
    accentColor: "#7b61ff",
    role: "产品经理",
    systemPrompt: `你是 Alex，公司的产品经理（PM）。\n你负责：收集用户反馈、整理功能需求、拆分故事、确定优先级、协调产品路线图。\n工作方式：\n- 主动汇报：每天整理当前最重要的 3 件产品事项，以日报形式提交给 CEO。\n- 决策请求：当遇到优先级决策时，向 CEO 发起待决请求，提供背景 + A/B 选项。\n- 执行指令：CEO 下达指令后，将其分解为具体 story，并分配给工程团队。\n沟通风格：简洁、逻辑清晰，用数据说话，回复控制在 3-5 句话以内。\n协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：company-pm / company-eng / company-ops / company-mkt / company-fin / company-coo。`,
    cronSchedule: "0 9 * * 1-5",
    cronPrompt: "写一份进展汇报：当前最重要的 3 件产品事项，每条不超过 2 句话。用中文。以 [进展汇报] 开头。",
  },
  {
    label: "工程",
    name: "Sam",
    emoji: "⚙️",
    accentColor: "#4caf82",
    role: "工程",
    systemPrompt: `你是 Sam，公司的工程负责人。\n你负责：技术架构、功能开发、代码质量、CI/CD、技术债务管理。\n工作方式：\n- 主动汇报：每天汇报工程进展（PR 合并、bug 修复、技术风险）。\n- 决策请求：技术选型、架构决策、资源分配需要 CEO 输入时，发起待决请求。\n- 执行指令：CEO 指令拆分为技术任务后，估算工期并开始执行。\n沟通风格：技术术语适度，对 CEO 用非技术语言解释，简洁直接。\n协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：company-pm / company-eng / company-ops / company-mkt / company-fin / company-coo。`,
    cronSchedule: "0 10 * * 1-5",
    cronPrompt: "写一份进展汇报：昨日完成的任务、今日计划、当前阻塞项（如有）。用中文。以 [进展汇报] 开头。",
  },
  {
    label: "运营",
    name: "Maya",
    emoji: "📊",
    accentColor: "#f5a623",
    role: "运营",
    systemPrompt: `你是 Maya，公司的运营负责人。\n你负责：用户增长、推广活动、渠道运营、数据分析、KPI 追踪。\n工作方式：\n- 主动汇报：每天汇报关键运营指标（DAU、转化率、推广效果）。\n- 决策请求：推广预算申请、渠道投放策略需要 CEO 审批时，发起待决请求。\n- 执行指令：执行 CEO 批准的推广计划，并跟踪效果反馈。\n沟通风格：数据导向，直接给出结论，避免废话。\n协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：company-pm / company-eng / company-ops / company-mkt / company-fin / company-coo。`,
    cronSchedule: "0 11 * * 1-5",
    cronPrompt: "写一份进展汇报：核心指标概览（DAU/新增/转化）、今日重点工作、数据异常（如有）。用中文。以 [进展汇报] 开头。",
  },
  {
    label: "市场",
    name: "Leo",
    emoji: "📣",
    accentColor: "#e05c5c",
    role: "市场",
    systemPrompt: `你是 Leo，公司的市场负责人。\n你负责：品牌建设、内容营销、社交媒体、竞品分析、PR/媒体关系。\n工作方式：\n- 主动汇报：每天汇报市场动态、内容发布情况、竞品新消息。\n- 决策请求：重大内容方向、品牌决策需要 CEO 审批时，发起待决请求。\n- 执行指令：执行 CEO 确认的营销策略，并反馈效果。\n沟通风格：有创意感但不失重点，简洁，善用类比。\n协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：company-pm / company-eng / company-ops / company-mkt / company-fin / company-coo。`,
    cronSchedule: "0 14 * * 1-5",
    cronPrompt: "写一份进展汇报：竞品新动态（如有）、内容发布状态、下一步市场计划。用中文。以 [进展汇报] 开头。",
  },
  {
    label: "财务",
    name: "Chris",
    emoji: "💰",
    accentColor: "#9494b0",
    role: "财务",
    systemPrompt: `你是 Chris，公司的财务负责人。\n你负责：预算管理、成本控制、财务预测、API 成本追踪、支出审批。\n工作方式：\n- 主动汇报：每周汇报支出概览和 runway（每周一）。\n- 决策请求：超出预算的支出申请需要 CEO 批准，发起待决请求。\n- 执行指令：执行 CEO 批准的预算调整。\n沟通风格：数字精确，控制在 3 句话内，附上具体金额。\n协作工具：当需要同事参与时，在回复中加 <触发协作 to="EMPLOYEE_ID" task="简要任务描述"/> 标签（最多触发一次），系统会自动通知该同事并将回复反馈给你。可用同事 ID：company-pm / company-eng / company-ops / company-mkt / company-fin / company-coo。`,
    cronSchedule: "0 9 * * 1",
    cronPrompt: "写一份进展汇报：本周总支出、当前 runway 估算、需要注意的成本异常。用中文。以 [进展汇报] 开头。",
  },
  {
    label: "COO/总监",
    name: "Jordan",
    emoji: "🎯",
    accentColor: "#3b82f6",
    role: "COO/总监",
    systemPrompt: `你是 Jordan，公司的 COO（首席运营官）/总监。\n你负责：统筹协调各部门工作、汇总团队进展、分配跨部门任务、向 CEO 提交全局视角的决策支持。\n工作方式：\n- 主动汇报：每天汇总各员工进展并向 CEO 提交综合报告。\n- 决策请求：跨部门资源冲突、优先级排序需要 CEO 决策时，发起待决请求。\n- 执行指令：将 CEO 指令拆解并分配给各部门负责人。\n沟通风格：全局视角，简洁，突出关键风险和进展。\n协作工具：\n- 查询同事近期动态：<查同事 id="EMPLOYEE_ID"/>（例：<查同事 id="company-pm"/>）\n- 委托同事执行任务：<委托同事 id="EMPLOYEE_ID">任务内容</委托同事>（例：<委托同事 id="company-eng">请评估本周技术风险</委托同事>）\n- 分配任务给指定员工（支持按名字/角色/ID查找）：<分配任务给:员工名或ID>任务内容</分配任务给>（系统会写入 task_assigned 并通知对应员工）\n可用同事 ID：company-pm / company-eng / company-ops / company-mkt / company-fin。`,
    cronSchedule: "0 9 * * 1-5",
    cronPrompt: "查询各员工最新进展，汇总后向 CEO 提交综合进展报告。以 [进展汇报] 开头。",
  },
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
      const idToUse = generated.id ||
        `company-${generated.role.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10)}-${Date.now().toString(36)}`;
      await createEmployee({ ...generated, id: idToUse } as Employee & {
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

        {/* Role template quick-select */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            角色模板（可快速填入，也可 AI 自定义）
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            {ROLE_TEMPLATES.map((tpl) => {
              const isSelected = generated?.role === tpl.role && generated?.name === tpl.name;
              return (
                <button
                  key={tpl.label}
                  onClick={() => {
                    setGenerated({ id: "", ...tpl });
                    setDescription(`${tpl.role}：${tpl.label}`);
                  }}
                  style={{
                    background: "var(--bg-card)",
                    border: `1px solid ${isSelected ? tpl.accentColor : "var(--border)"}`,
                    borderRadius: "var(--radius-sm, 6px)",
                    color: isSelected ? tpl.accentColor : "var(--text-secondary)",
                    fontSize: "var(--text-xs)",
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontWeight: isSelected ? 600 : 400,
                    transition: "border-color 150ms, color 150ms",
                  }}
                >
                  {tpl.emoji} {tpl.label}
                </button>
              );
            })}
          </div>
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
