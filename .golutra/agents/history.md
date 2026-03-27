# History

## Description
- Record each Git change or local file change summary.
- Each entry includes reason, impact scope, and related links (put links in Notes when applicable).
- If owner is not specified, default to `<project-name>-agent-1`.
- Use datetime format `YYYY-MM-DD HH:MM` (24h).

## Mandatory Action
- MUST: When this table reaches 50 entries, compress the records into shorter and more general summaries, keeping stable and reusable change points.

## Record Template
| Date Time | Type | Summary | Reason | Impact Scope | Owner Id | Notes |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| 2026-03-26 | feat | 新增浏览器通知功能：待决请求到达时弹出系统通知 | P0-1 需求：提醒 CEO 及时处理新待决请求 | ui/src/hooks/useNotification.ts（新增）, ui/src/pages/Hall.tsx（修改） | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | feat | 新增会议纪要导出功能：支持 markdown 预览、复制、下载 | P0-2 需求：全员会议结束后 CEO 可一键生成结构化纪要 | ui/src/pages/Meeting.tsx（修改） | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | feat | 任务增加 deadline/priority 字段，支持内联编辑 | P0-3 需求：为任务添加截止日期和优先级管理 | src/db.ts、src/api.ts、ui/src/types.ts、ui/src/hooks/useApi.ts、ui/src/pages/Hall.tsx | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | feat | 新增员工间直接协作机制（触发协作标签 + depth 防递归） | P1-1 需求：员工可主动触发同事参与任务协作 | src/agent-runner.ts、src/employees.ts | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | feat | 新增日报导出功能：大厅右上角一键导出所有员工最近汇报为 Markdown | P1-2 需求：CEO 可一键将员工近期汇报导出为 .md 文件 | src/api.ts（新增 GET /company/api/reports）、ui/src/pages/Hall.tsx（新增 exportDailyReport 函数及按钮） | 01KMMQWZ9JPBZ75PAC952CVN75 |  |
| 2026-03-26 | feat | 新增员工间直接委托功能：支持 <委托同事> 标签触发跨员工任务委托，depth 防递归 | P1-1 需求：员工可主动委托同事执行任务，无需 CEO 介入 | src/agent-runner.ts | 01KMMQW7KKE6CRPSN7CGK0DNCB |  |
| 2026-03-26 | feat | 决策台账新增员工/状态筛选和统计卡片 | P1-3 需求：决策台账支持按员工、状态筛选并展示各状态数量汇总 | src/db.ts、src/api.ts、ui/src/hooks/useApi.ts、ui/src/pages/Decisions.tsx、ui/src/App.tsx | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | feat | 自定义员工入职引导：自动触发 AI 自我介绍，员工动态页显示 NEW 徽章 | P2-2 需求：添加自定义员工后触发 onboarding，直观标识新员工 | src/api.ts、ui/src/pages/Team.tsx | 01KMMQW7KKE6CRPSN7CGK0DNCB |  |
| 2026-03-26 | feat | 员工状态卡片新增活跃度指标：7天汇报次数 + 任务完成率 | P2-1 需求：大厅员工状态卡片展示近期汇报频率和任务完成率 | ui/src/pages/Hall.tsx | 01KMMQWZ9JPBZ75PAC952CVN75 |  |
| 2026-03-26 | feat | 新增日报/周报导出功能：大厅实时动态区域支持按今日/近7天导出员工汇报为 Markdown，含预览覆盖层、复制、下载 | P1-2 需求：CEO 可按时间范围导出员工汇报 | src/db.ts（新增 getReportsByDays）、src/api.ts（GET /reports 支持 days 参数）、ui/src/hooks/useApi.ts（新增 fetchReports）、ui/src/pages/Hall.tsx（新增 exportReportsMd、ReportExportOverlay、报告导出控件） | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | feat | 任务多目标关联：任务可附加额外关联目标 ID，大厅任务列表显示目标徽章 | P2-3 需求：一个任务可跨目标关联，在任务列表展示关联目标标签 | src/db.ts（GoalTask 新增 extra_goal_ids 字段、幂等 ALTER TABLE、updateGoalTask 扩展）、src/api.ts（PATCH /tasks/:id 支持 extraGoalIds 参数及校验）、ui/src/types.ts（GoalTask 新增 extra_goal_ids）、ui/src/hooks/useApi.ts（updateTask 新增 extraGoalIds）、ui/src/pages/Hall.tsx（GoalRow 新增 allGoals prop、任务行渲染额外目标徽章） | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | fix | 目标隔离：<查同事>工具改用 getEmployeeActivityForActiveGoals，过滤已删除目标的历史 activity | N-1 问题：删除旧目标后 activity_log 残留旧 goalId 上下文污染新目标 agent 提示词 | src/db.ts（新增 getEmployeeActivityForActiveGoals，JSON 函数过滤 meta.goalId）、src/agent-runner.ts（<查同事>调用改用新函数） | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | feat | 添加员工弹窗新增 6 个角色模板快速选择（产品/工程/运营/市场/财务/COO），点击直接填入预览档案，保存时自动生成唯一 id | N-2 需求：CEO 可一键选择预设角色模板，无需每次依赖 AI 生成 | ui/src/components/Sidebar.tsx（新增 ROLE_TEMPLATES 常量、模板按钮区域、handleSave auto-id 逻辑） | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
| 2026-03-26 | feat | N-3 统领角色 COO：新增 <分配任务给> 标签支持 id/名字/角色三种查找方式分配任务；修正 COO systemPrompt 中委托工具格式 | N-3 需求：COO 可通过 <分配任务给> 直接向下级分配任务，并修正 <委托同事> 格式与正则一致 | src/agent-runner.ts（新增 ASSIGN_TASK_RE 及 ④ 检测块）、ui/src/components/Sidebar.tsx（COO systemPrompt 修正） | 01KMMQW7KKE6CRPSN7CGK0DNCB |  |
| 2026-03-26 | feat | 待决事项支持多选项：<需要决策> 标签动态提交选项，DecisionCard 动态渲染按钮 | N-4 需求：员工可提交任意数量选项的决策请求，CEO 从动态按钮中选择 | src/db.ts（PendingDecision 新增 options 字段、幂等 ALTER TABLE、insertPendingDecision 扩展）、src/agent-runner.ts（新增 DECISION_REQUEST_RE 和 ⑤ 检测块）、src/api.ts（POST /decisions/pending 读取 options）、ui/src/types.ts（PendingDecision 新增 options）、ui/src/pages/Hall.tsx（DecisionCard 动态渲染选项按钮） | 01KMMPTJEYX55AN9A7R0N1GY3N |  |
