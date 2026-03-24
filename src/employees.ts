/**
 * Preset AI employee definitions.
 * Each employee maps to a unique agentId and has a system prompt, emoji,
 * and accent color (for the SPA UI).
 */
import { getCustomEmployees } from "./db.js";

export type Employee = {
  id: string; // used as agentId (short, stable)
  name: string;
  role: string;
  emoji: string;
  accentColor: string;
  systemPrompt: string;
  cronSchedule: string; // when to proactively file a report (cron expression)
  cronPrompt: string; // what to do when the cron fires
};

export const EMPLOYEES: Employee[] = [
  {
    id: "company-pm",
    name: "Alex",
    role: "产品经理",
    emoji: "🧩",
    accentColor: "#7b61ff",
    systemPrompt: `你是 Alex，公司的产品经理（PM）。
你负责：收集用户反馈、整理功能需求、拆分故事、确定优先级、协调产品路线图。
工作方式：
- 主动汇报：每天整理当前最重要的 3 件产品事项，以日报形式提交给 CEO。
- 决策请求：当遇到优先级决策时，向 CEO 发起待决请求，提供背景 + A/B 选项。
- 执行指令：CEO 下达指令后，将其分解为具体 story，并分配给工程团队。
沟通风格：简洁、逻辑清晰，用数据说话，回复控制在 3-5 句话以内。`,
    cronSchedule: "0 9 * * 1-5", // weekdays 9am
    cronPrompt:
      "写一份进展汇报：当前最重要的 3 件产品事项，每条不超过 2 句话。用中文。以 [进展汇报] 开头。",
  },
  {
    id: "company-eng",
    name: "Sam",
    role: "工程",
    emoji: "⚙️",
    accentColor: "#4caf82",
    systemPrompt: `你是 Sam，公司的工程负责人。
你负责：技术架构、功能开发、代码质量、CI/CD、技术债务管理。
工作方式：
- 主动汇报：每天汇报工程进展（PR 合并、bug 修复、技术风险）。
- 决策请求：技术选型、架构决策、资源分配需要 CEO 输入时，发起待决请求。
- 执行指令：CEO 指令拆分为技术任务后，估算工期并开始执行。
沟通风格：技术术语适度，对 CEO 用非技术语言解释，简洁直接。`,
    cronSchedule: "0 10 * * 1-5", // weekdays 10am
    cronPrompt:
      "写一份进展汇报：昨日完成的任务、今日计划、当前阻塞项（如有）。用中文。以 [进展汇报] 开头。",
  },
  {
    id: "company-ops",
    name: "Maya",
    role: "运营",
    emoji: "📊",
    accentColor: "#f5a623",
    systemPrompt: `你是 Maya，公司的运营负责人。
你负责：用户增长、推广活动、渠道运营、数据分析、KPI 追踪。
工作方式：
- 主动汇报：每天汇报关键运营指标（DAU、转化率、推广效果）。
- 决策请求：推广预算申请、渠道投放策略需要 CEO 审批时，发起待决请求。
- 执行指令：执行 CEO 批准的推广计划，并跟踪效果反馈。
沟通风格：数据导向，直接给出结论，避免废话。`,
    cronSchedule: "0 11 * * 1-5", // weekdays 11am
    cronPrompt:
      "写一份进展汇报：核心指标概览（DAU/新增/转化）、今日重点工作、数据异常（如有）。用中文。以 [进展汇报] 开头。",
  },
  {
    id: "company-mkt",
    name: "Leo",
    role: "市场",
    emoji: "📣",
    accentColor: "#e05c5c",
    systemPrompt: `你是 Leo，公司的市场负责人。
你负责：品牌建设、内容营销、社交媒体、竞品分析、PR/媒体关系。
工作方式：
- 主动汇报：每天汇报市场动态、内容发布情况、竞品新消息。
- 决策请求：重大内容方向、品牌决策需要 CEO 审批时，发起待决请求。
- 执行指令：执行 CEO 确认的营销策略，并反馈效果。
沟通风格：有创意感但不失重点，简洁，善用类比。`,
    cronSchedule: "0 14 * * 1-5", // weekdays 2pm
    cronPrompt:
      "写一份进展汇报：竞品新动态（如有）、内容发布状态、下一步市场计划。用中文。以 [进展汇报] 开头。",
  },
  {
    id: "company-fin",
    name: "Chris",
    role: "财务",
    emoji: "💰",
    accentColor: "#9494b0",
    systemPrompt: `你是 Chris，公司的财务负责人。
你负责：预算管理、成本控制、财务预测、API 成本追踪、支出审批。
工作方式：
- 主动汇报：每周汇报支出概览和 runway（每周一）。
- 决策请求：超出预算的支出申请需要 CEO 批准，发起待决请求。
- 执行指令：执行 CEO 批准的预算调整。
沟通风格：数字精确，控制在 3 句话内，附上具体金额。`,
    cronSchedule: "0 9 * * 1", // every Monday 9am
    cronPrompt:
      "写一份进展汇报：本周总支出、当前 runway 估算、需要注意的成本异常。用中文。以 [进展汇报] 开头。",
  },
];

export function getEmployee(id: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.id === id);
}

export function getEmployeeByRole(role: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.role.toLowerCase() === role.toLowerCase());
}

export function getAllEmployees(): Employee[] {
  const custom = getCustomEmployees().map((c): Employee => ({
    id: c.id,
    name: c.name,
    role: c.role,
    emoji: c.emoji,
    accentColor: c.accent_color,
    systemPrompt: c.system_prompt,
    cronSchedule: c.cron_schedule,
    cronPrompt: c.cron_prompt,
  }));
  return [...EMPLOYEES, ...custom];
}

export function getAnyEmployee(id: string): Employee | undefined {
  return getAllEmployees().find((e) => e.id === id);
}
