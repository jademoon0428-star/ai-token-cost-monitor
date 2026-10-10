# AI Cost Management Daily Log

---

# 2026-09-29

## 工作目标

继续推进 AI Project Planner R3.4 阶段。

## 完成内容

- 完成 Planner 架构相关检查。
- 确认 R3.4-C1 已完成并冻结。
- 确认：
  - AI Resource owner
  - AI Resource channel
  - Planner 数据结构

已经满足当前阶段需求。

## 验证

完成：

- smoke 测试
- regression
- tsc
- ESLint
- build

状态：

通过。


## 重要决定

Planner 不应该只是简单记录 AI 模型。

未来方向：

成为 AI 项目执行规划系统。


---

# 2026-09-30

## 工作目标

检查 Planner AI Option 生成能力。

## 完成内容

确认：

generateProjectTaskAiOptions

已经存在。

调用链：

UI

↓

API

↓

planner-service

↓

生成 AI options


## 发现问题

之前认为：

AI option 生成功能没有入口。

实际：

已经通过：

app/api/planner/tasks/[id]/ai-options/generate/route.ts

连接 UI。


## 修正认知

不要重复开发已有能力。

下一步重点：

不是增加入口。

而是提升 Planner 商业价值。


## 当前结论

Planner 基础能力已经存在。

下一阶段应该关注：

方案规划能力。


---

# 2026-10-01

## 工作目标

重新确认项目方向。

## 发现问题

项目长期方向没有形成稳定文档。

导致：

- 开发上下文丢失
- 重复讨论
- 功能定位混乱


## 用户要求建立项目文档体系

创建：

1. PROJECT_WORKING_AGREEMENT.md

用途：

记录合作方式、沟通方式、开发原则。


2. PROJECT_DIRECTION_AND_DECISIONS.md

用途：

记录：

- 产品方向
- 已确认方案
- 重要设计决定


3. PROJECT_PROGRESS_TIMELINE.md

用途：

记录：

- 阶段进度
- 完成内容
- 当前状态


4. PROJECT_DAILY_LOG.md

用途：

记录：

- 每天工作内容
- 当前问题
- 下一步


5. HANDOFF.md

用途：

每天结束时：

总结：

- 当前做到哪里
- 完成什么
- 未解决问题
- 下一步计划


---

# 最新产品方向确认

AI Project Planner 是未来核心商业价值方向。


目标：

复杂项目不应该由一个 AI 从头执行。

系统应该：

根据任务特点：

选择不同 AI 模型组合。


方案最多 5 个：

1. 最省钱方案

特点：

优先免费 AI、
本地 AI、
低成本 AI。


2. 用户已有 AI 方案

必须保留。

优先使用：

用户电脑已有模型、
已有账号、
已有会员。


原因：

降低使用门槛。


3. 最快速方案

优先效率。


4. 综合优化方案

平衡：

成本 + 时间 + 效果。


5. 高质量方案

面向高要求项目。


---

# 当前项目阶段

当前：

v1.5.x


已经完成：

- AI 成本监控基础能力
- 成本统计
- Provider 管理
- AI Activity
- Planner 基础结构


正在进入：

Planner 商业价值完善阶段。


---

# 下一步计划

1. 完成项目文档体系。

2. 重新审查 Planner 当前代码：

确认：

现有结构是否支持：

- 多方案生成
- 成本预测
- 时间预测
- AI组合比较

状态：已完成（2026-10-01 架构只读复核，结论见下方追加记录）。


3. 再决定开发顺序。

4. 明天继续：设计 PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md。


---

# 2026-10-01 追加记录（Planner 方向与架构复核）

## 1. Planner 方向重新确认

2026-10-01 重新确认项目方向并写入 PROJECT_DIRECTION_AND_DECISIONS.md：

- AI Cost Management 不只是成本统计工具。
- 核心定位：自动发现 AI 使用情况、控制 AI 支出，并通过 AI Project Planner 为复杂项目选择最合适的 AI 组合方案。
- 产品价值：降低 AI 使用成本，提高项目完成效率。


## 2. AI Project Planner 成为核心商业价值方向

- AI Project Planner 是未来主要付费价值，不是附属功能。
- 目标：用户面对复杂项目时不再使用单一 AI 从头执行全部工作。
- 系统根据项目类型、项目阶段、任务特点、AI 能力、成本、时间要求生成 AI 组合方案。
- 目标模型：项目 → 阶段 → 任务 → AI 资源组合。


## 3. 五种方案冻结

最多五种，定义冻结：

1. 最低成本方案 — 优先免费 AI、用户已有 AI、本地 AI
2. 用户已有 AI 方案（必须保留）— 本地 AI、已注册 AI、已购买会员 AI，降低使用门槛
3. 最快完成方案 — 时间优先，允许更高成本
4. 综合优化方案 — 成本、速度、质量平衡
5. 高质量方案 — 优先效果和成功率

与代码对照：已实现 3（`cost_conscious` / `existing` / `mixed`），未实现 2（最快完成、高质量），代码多出 2 项待归类（`subscription` / `registry_expanded`），方案上限为 5。


## 4. Planner 架构复核结果

只读复核完成，未修改任何文件。

- 结论：支持未来方向 **62 / 100**。
- 数据模型与生成引擎对"多方案"准备度约 80%。
- 不需推倒重来：4 项局部架构设计 + 一批小改。
- 已具备：项目/计划/任务三层、一个项目多方案、方案级成本时间与资源分配、用户已有 vs registry 区分、完整候选生成链。


## 5. 当前缺口

1. 无阶段层，无任务依赖（只有 category 与 sequence）。
2. 最快完成方案数据不成立（Registry 无速度列，time-estimator 不区分模型）。
3. 方案比较视图缺位，方案详情显示原始 ID。
4. 五方案清单与实现错位（缺 2、多 2 待归类）。
5. 本地 AI / 自述资源进不了组合池（resource_source CHECK 限制）。
6. plan → actual 未闭环，无法证明"方案更省"。
7. 效率指标缺失。


## 6. 明天继续任务

设计 **PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md**：

- 建立 `项目 → 阶段 → 任务` 结构，必要时补任务依赖。
- 保持红线：plan 版本只追加、NULL=unknown、不打分不排名、不做货币换算。
- 该设计是"AI 组合方案、五方案比较、阶段展示"的前置依赖。
- 先出设计再决定开发顺序，期间继续暂停新增 Planner 功能。


---

# 2026-10-06

## 工作目标

设计 PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md（2026-10-01 计划的"明天继续任务"）。

## 工作方式

只读代码复核，未修改任何代码。

## 完成内容

创建 PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md，覆盖 HANDOFF 四个检查项：

1. 阶段层如何建立
2. 任务依赖是否需要
3. 与 plan 版本不可变规则是否冲突
4. 迁移成本与风险

关键事实（复核所得）：

- 任务挂在方案上（project_tasks.plan_id），不属于项目。
- 组合方案 0 任务，assignments 指向源 plan 的任务。
- 阶段（stage/phase）与依赖（depends_on/blocked_by）在代码和数据库中完全不存在（0 命中）。
- 迁移机制：initDb 每次 repository 调用执行，9 个自守护迁移；新表零风险、加可空列低风险、改 CHECK 需重建表（高风险）。
- 方案详情显示原始 ID 的根因：assignments 接口不返回显示名。
- Planner 读路径均使用显式列清单（无 SELECT *），加列对老构建安全。

## 重要决定（四项决策，用户 2026-10-06 确认）

1. 阶段归属：方案A —— 阶段属于项目（project_stages.project_id + project_tasks.stage_id 可空列），组合方案零改动共享阶段。
2. 任务依赖：本期不做，预留 depends_on 扩展位（加可空列无需重建表）。
3. 阶段创建：仅手工创建，预设模板后置（无法验证价值，默认不开发）。
4. 有任务引用的阶段：只归档、禁止物理删除（服务层校验）；无任务引用可删。

## 迁移结论

- 新增 project_stages 表 + project_tasks.stage_id 可空列（自守护迁移）。
- 不重建任何表、不回填数据、不触碰 project_plans。
- 主要风险：与 declared WIP 的第 9 个迁移同在 lib/schema.ts，需顺序合并。

## 验证

本日无代码改动，无需运行验证。

## 下一步

进入 M1 数据层：project_stages 表 + stage_id 列 + 迁移 + 阶段 CRUD + 新增 smoke:planner-stages。

当前状态：按用户指令暂停，等待确认进入 M1。


---

# 2026-10-06 追加记录（M1 执行完成 + 新增长期执行约定）

## M1 阶段与任务模型执行情况

当日按用户分步指令完成（每步暂停确认）：

- M1 schema：`project_stages` 表 + `project_tasks.stage_id` 可空列 + 第 10 个自守护迁移 `migrateProjectTasksStageId`（只改 `lib/schema.ts`）。
- M1-B repository：阶段查询函数（`planner-repository.ts`），无业务规则。
- M1-C service：阶段 5 个业务函数（`planner-service.ts`）；核心规则 = 有任务引用的阶段禁止物理删除（`STAGE_HAS_TASKS`），无引用可删。
- M1-D API：错误映射（`STAGE_NOT_FOUND`→404、`STAGE_HAS_TASKS`→409，`planner-api-errors.ts`）+ 3 个路由文件（projects/[id]/stages、stages/[id]、stages/[id]/archive）+ 新增 `scripts/smoke-planner-stages.mjs`。

范围控制：除指定文件外零改动；schema / repository / service / 组合方案生成链路均未越界修改。

## 验证

- `npx tsc --noEmit` 通过
- 修改文件 `npx eslint` 通过
- `npm run smoke:planner` 26/26
- `node --experimental-strip-types scripts/smoke-planner-stages.mjs` 11/11

## 遗留（未完成）

- 设计 §8 中部分专项覆盖未进新 smoke：`UNIQUE(project_id, sequence)` 碰撞、老任务 stage_id=NULL、项目删除级联、组合方案 JOIN 取阶段名、迁移幂等。
- 其余 8 个 planner smoke + smoke:tasks 本轮未跑；全量 `npm run lint` 因既有 `.desktop-package/`、`release/` 忽略项失败（与本次改动无关）。
- 任务写入带 stage（`createProjectTask` / `updateProjectTask` 白名单）未做，待 M2 需要分组展示时再做。
- M1-E（前端展示）未开始。

## 新增长期执行约定：OpenCode 执行优先规则（2026-10-06）

当用户输入：

- 下一步
- 继续
- 开始

默认含义：进入下一开发步骤。

必须直接输出可交给 OpenCode 执行的任务指令。

任务指令必须包含：

1. 当前目标
2. 修改文件范围
3. 明确实现要求
4. 验证命令
5. 禁止范围

禁止：

- 先解释背景
- 重复已确认设计
- 情绪安抚式回复
- 只给说明不给执行任务
- 输出没有行动内容的总结

所有已经确认的设计约束，以文档为准，不重新讨论。

同步写入：PROJECT_WORKING_AGREEMENT.md §12、HANDOFF.md 第九节、PROJECT_PROGRESS_TIMELINE.md、PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md §11。

## 下一步

1. M1 收尾验证：按设计 §8 补齐剩余回归（其余 8 个 planner smoke + smoke:tasks）与缺失的专项 smoke 覆盖项。
2. 进入 M2 展示层（任务按阶段分组展示 + 方案详情补显示名 + 任务写入带 stage 白名单）。


---

# 2026-10-06 追加记录（R3.5 Productivity：R3.5-A 完成 + R3.5-B 完成 staged）

## 工作目标

完成 R3.5 Productivity 的 API（R3.5-A）与 UI（R3.5-B），并保持与 M2 的边界。

## R3.5-A：Productivity API 完成

- 新增只读接口 `app/api/planner/plans/[id]/productivity/route.ts`。
- 新增 `lib/services/productivity-service.ts`、`lib/repositories/task-repository.ts` 查询函数。
- 新增 `scripts/smoke-planner-productivity.mjs`（package.json 增加对应 smoke 命令）。

验证结果：

- productivity smoke：14 passed / 0 failed
- `npx tsc --noEmit`：PASS
- `npx eslint scripts/smoke-planner-productivity.mjs`：PASS

commit：

- `a2fde32` feat: add planner productivity reporting

## R3.5-A 架构边界（本次确认）

- API 只读；没有 productivity 专用持久化 / 缓存。
- 不产生 score / rank / recommendation / isPrimary。
- 不做跨货币计算，不做隐式 FX 转换；不增加 FX API 或货币设置。
- unreliable / unverified 成本不作为可靠成本参与成本比较。
- 多货币：同币种才做数值比较，币种不同并列展示，不合并数字。

## R3.5-B：Productivity UI 完成

- 新增 `components/planner/plan-productivity.tsx`。
- 集成到 `app/planner/[projectId]/plans/[planId]/page.tsx`。

## 精确 staging 的原因与处理方式

`app/planner/[projectId]/plans/[planId]/page.tsx` 同时包含两类修改：

1. R3.5-B 的 Productivity UI 集成（本次要提交）
2. M2 Stage 展示层修改（不属于 R3.5-B，必须留在 working tree）

处理方式：

- 只对该文件做 hunk 级精确 staging，把 R3.5-B 的改动 stage、M2 的改动留在 unstaged。
- 没有 `git restore` 整个 page.tsx（整文件 restore 会连带丢弃 M2 修改）。
- 没有改动、回滚或重新整理 M2。

当前 staged 结果：

- 2 files / 635 insertions / 0 deletions
  （page.tsx 64 行 + plan-productivity.tsx 571 行）

## 当前结束状态（2026-10-06）

- R3.5-A：DONE / COMMITTED（`a2fde32`）。
- R3.5-B：DEVELOPMENT DONE / STAGED / PENDING COMMIT（尚未提交）。
- M2：Stage 相关改动全部保持 unstaged，未被 R3.5-B 影响。
- 5 个项目文档已同步更新，未修改任何代码文件，未执行 git commit / git restore。

## 下一步

1. `git commit -m "feat: add planner productivity UI"`（只提交已精确 staged 的 2 个文件）。
2. `git status --short`、`git log --oneline -4` 确认提交边界。
3. 继续 M2 Stage 工作（保持 unstaged 内容原样推进）。

禁止：restore page.tsx、重新打开 R3.5-A 架构审查、扩张 R3.5 Productivity 范围、
加入 FX / ranking / recommendation、把 M2 混入 R3.5-B commit。


---

# 2026-10-07

## 工作目标

完成 Declared Resources 相关的 A / B / C 三组工作，并做最终架构收口。

## 完成内容

### A 组（schema 对齐）

- commit：`af020f0` fix: align ai option schema with declared resource column。
- `project_task_ai_options` 支持 nullable `model_id`、新增 `declared_resource_id`、
  model_id / declared_resource_id exactly-one 约束、
  FK → `declared_ai_resources`、迁移既有数据、planner repository 与 schema 对齐。
- 提交前核对：staged 仅该 2 个文件（schema.ts、planner-repository.ts）。

### Declared Resources 本体

- commit：`036a483` feat: add declared resources inventory。
- 9 个文件（declared repository / service / 3 个 API route / UI / planner-api-errors /
  resources page / smoke-declarations）。
- smoke：`scripts/smoke-registry-baseline.mjs` 之外另建 `smoke-planner-declarations.mjs`
  → 27 passed / 0 failed（当时）。

### B 组（AI Option state）

- commit：`6631a63` feat: enrich planner ai option state，5 个文件：
  ai-options route、task-ai-options.tsx、candidate-generator.ts、
  resource-universe.ts、planner-service.ts。
- AI Option 新增读取时实时派生的 resource/model state：显示名称、provider、
  来源、注册状态、channel、entitlement、availability、pricing known、capability known。
- state 不持久化；无 score / rank / recommend 逻辑。
- 本批唯一代码改动：把 `planner-service` 中 `declared_resource_id === null`
  的过滤明确为 deliberate boundary（补注释，行为零变化）。
- 提交前补跑此前未复跑的 2 个 smoke：`smoke:planner-api` 44/44、
  `smoke:planner-candidates` 30/30（均 PASS）。

### C 组（Registry startup baseline）

- commit：`82b3edc` feat: initialize ai registry baseline on startup，3 个文件：
  `instrumentation.ts`、`lib/registry/ai-registry-repository.ts`、
  `scripts/smoke-registry-baseline.mjs`。
- 新增 baseline smoke（8 项断言：非 nodejs 不写、build phase 不写、空库建 baseline、
  第二次调用不重写、register() 无额外写入、既有 models/pricing 不被覆盖、
  capabilities 按 manifest 刷新、临时库隔离）。
- 结果：**8 passed / 0 failed**。

## 收口审查

- A/B/C 完成后做最终只读架构收口审查 → **PASS**。
- 无 P0、无 P1。
- 确认 5 条链路：AI Option schema 自洽、B state 调用链、
  Declared Resources 仅 inventory、C startup baseline、standalone 产物静态确认
  （instrumentation chunk 含 ensureAiRegistryBaseline、repository chunk 含 baseline SQL、
  externals 仅 Node 内建）。
- 新安装路径静态追踪成立：空 DB → 启动 instrumentation → registry baseline →
  `listAiRegistry()` → Planner candidate generation。
- 发现并确认 2 个 P2 observation（非阻塞）：
  1. `instrumentation.ts` 的 `await import(...)` 在 try/catch 外（理论启动韧性观察，暂不修）。
  2. baseline 进程级 memo，同进程内 Registry 被清空不会自动补种（设计行为，不修）。

## 重要边界确认

- **Declared Resources 不是 AI 模型**，是 Planner 中"用户声明/登记的一类 AI 资源"
  （inventory），与 Registry Model 明确区分。
- 当前结构：`AI Registry → Registry Models → AI Options`；`Declared Resources → Inventory`。

## 下一步（不是写代码）

先做产品语义决策："Planner AI Options 到底代表什么？"
四个问题见 HANDOFF.md 第十一节。决策前不改 candidate-generator / resource-universe。

## Git 状态

- HEAD：`82b3edc` ← `6631a63` ← `036a483` ← `af020f0` ← `c1ce06f` ← `bc47a9a (v1.5.4)`。
- staged：空。
- 未跟踪 7 项（`=` + 6 份文档），不暂存。

## 今日纪律

- 未 push、未修改 v1.5.4 tag、未修改 release/ 与 package.json。
- 未跑 build / lint；已通过的 smoke 未重复（仅补跑当时缺跑的 2 个）。
- 文档更新未做 git add / commit。

今日工作结束。


---

# 2026-10-08

## 工作目标

完成 Planner AI Options 产品语义决策文档整理（回答 2026-10-07 决策 7 的四个问题）。

## 工作方式

只读复核，不改业务代码。修改文件仅限：
PROJECT_DIRECTION_AND_DECISIONS.md、HANDOFF.md、PROJECT_DAILY_LOG.md。

## 复核事实（只读所得）

- `project_task_ai_options`：`model_id XOR declared_resource_id` 表内 CHECK，两列均可空，
  FK → `models` / `declared_ai_resources`，**不存 resource_source**（读时派生）。
- repository 只存不判（XOR 交给 DB CHECK）；service 层强制 `modelId` 非空 → 当前链路写不出 declared 行。
- candidate pool = `listAiRegistry()` + active `ai_resources`；`declared_ai_resources` 在
  planner 生成链 0 引用（从未进入输入，不是被过滤）。
- `plan_resource_assignments.resource_source` CHECK 仅 registered / registry。
- 读路径 `listProjectTaskAiOptionsWithState` 过滤 `declared_resource_id === null`（deliberate boundary）。

## 重要决定（四项语义决策，写入方向文档 §11，冻结）

1. **AI Option = AI 资源选择**，不是"模型选择"。
   一条 option = 该 planned step 可用的一种 AI 资源 + 可选 tool + 估算成本/时间。
   当前实际可选资源只有 Registry Model；Declared 是 schema 预留的第二类资源入口。
2. **model_id 与 declared_resource_id 共存**：前者是 Registry 可验证模型，后者是用户声明、
   Registry 不存在的资源；两者不是同一实体，禁止隐式转换（不物化成 models、不物化成
   ai_resources、不互回填、只允许用户显式动作）。
3. **Declared Resource 后续允许进入 candidate pool（方向），当前不进入，进入有条件。**
   - pricing unknown：成本三列同时 NULL，不写 0 / 不写估算 / 不写默认币种；
     `pricing_state='known'` 不等于有费率；unknown 行不参与任何成本数值比较，只并列展示 unknown。
   - capability unknown：`fit_status='unknown'`（非 meets、非 below_minimum）；显式 0 →
     below_minimum；复用同一条 fit-estimator，不打分。
   - cost/productivity：planned 成本 NULL，productivity 只对同币种 verified 成本做数值比较，
     declared 行只参与任务完成与时间维度。
4. **选择 Declared 后的数据闭环**：
   - Plan：option 行（declared_resource_id + is_selected=1 + 成本 NULL + 时间照常 + 无 source 列）；
     assignment 当前仍不写 declared。
   - Actual：仍走 tasks / task_sessions / usage 归因；不可测 → actual cost = NULL（不是 0）；
     可测（own_api/gateway 正常导入）照常来自 Money Layer。
   - Cost unknown 展示：`unknown` / `—`，不显示 0、不并入合计、与已知成本并列不合并。
   - Task completion：仍由 project_tasks.status + task_sessions.status 记录，与资源类型无关；
     "done + cost unknown" 如实呈现，不反推成本。

## 风险记录（只记录，不改代码）

1. repository 可绕过 service 直写 declared 行 → 通过 CHECK 但被读路径过滤，形成"静默不可见"，
   却仍可按 id 被选中（当前 API 层不产生这种行）。
2. option 不存 source、assignment 存 source：引入 declared 时 assignment 侧必须重建表改 CHECK。
3. 两列均 ON DELETE CASCADE，源行删除会连带清掉候选与选择（与"只归档不删除"方向相反，备查）。
4. productivity-service 直接读原始行带出 declared_resource_id，与被过滤的 options 列表口径分叉。

## 下一阶段开发前置条件（语义冻结后才逐项单独决策）

1. candidate pool 是否扩展
2. resource universe 是否修改（ResourceSource 第三值 + deriveModelState declared 分支）
3. AI Option state 是否增加 declared 分支（替换过滤 guard）
4. plan_resource_assignments.resource_source 是否扩枚举（涉及重建表）

四项各自独立评审，不打包；决策前不改 schema / planner / repository / API / 组件。

## 追加：五方案比较视图 M1 只读评审（GO + 3 项阻塞）

方式：只读评审，不改代码。结论写入方向文档 §11.9 与 HANDOFF 第十三节。

**结论：M1 可用现有只读 API 实现（GO），零 schema 改动、零新增/修改 API，只新增一个只读视图。**

已核对端点：`projects/[id]/plans`、`projects/[id]/stages`、`plans/[id]/assignments`
（含 resource_name / resource_provider / evidenceSummary，手工方案返回空列表 200）、
`plans/[id]/productivity`（缺 plan 404；无执行任务 200 且 actual=null；tasks[] 含
name/sequence/stageId）、per-task `tasks/[id]/ai-options`、`plans/[id]`。
全仓 app/api 清单核对：无 registry/model API（客户端不能把 id 解析成名字）。

三项阻塞：

1. **B1** 组合方案任务列必须取自 productivity：`plans/[id]/tasks` 对组合方案返回 `[]`
   （组合方案不持有 project_tasks），assignments 只带 task id 无任务名。
2. **B2** 手工方案无计划级 AI 模型名：无 assignments、selectedOption 只有 modelId、
   无 registry API → 折叠行 `—` 或展开时按任务惰性拉 ai-options；
   要求"折叠态仅用计划级接口显示名字"即被阻塞（需新聚合端点，超出 M1）。
3. **B3（设计前置，非 API）** 方案级成本合计与 unknown 规则未冻结：
   同币种才求和、任一 NULL ⇒ 合计 unknown（非部分和、非 0）、多币种并列不合并、
   不排名、时间列标注各方案同源同值、效率列 `—`（未实现，不推算）。

非阻塞：效率列无数据源 → `—`；缺 2 个策略 → 缺的行；同策略多版本 → 客户端取最新；
请求量 ≤ ~6×2+1（+惰性 per-task）可接受；聚合端点为 M2 可选优化，非 M1 前提。

边界：方向文档 §5 表两处状态更正（显示名 v1.5.4 已修、比较视图不缺聚合接口）；
不改变 §11.7 四项决策冻结与顺序。

## 追加 2：M1 显示规则冻结（方向文档 §11.10，B3 解除）

方式：用户给出显示规则全文，只读写入方向文档 §11.10；不改代码。

冻结要点（七条）：

1. 成本只同币种汇总，不换算汇率，多币种分别展示（CNY 10-20 / USD 3-5 式并列）；
   计划成本来自 assignment / selected option 的 planned cost，不是实际消费。
2. Unknown：任意任务 planned_cost_min/max = NULL ⇒ 方案总成本显示 `Unknown`；
   禁止部分求和冒充完整成本、禁止 NULL 当 0、禁止推测价格。
3. 排名：禁止"最便宜 / 最快 / 推荐 / 性价比"排序——当前只有计划数据，
   没有足够 actual evidence 支撑推荐。
4. 时间：展示时间范围，标注为任务级估计（当前估算不区分模型能力），不解释为模型速度比较。
5. 效率：cost/task、time/task、completion rate 均无可靠数据 ⇒ 显示 `—`，不得推算。
6. 多版本：同 strategy 默认展示最新 version，历史 version 不参与默认比较、不删除。
7. 产品边界：做（展示差异/成本范围/AI 资源/时间估算）；不做（AI 推荐/自动选择/
   成本优化评分/模型排名）。

结果：§11.9 阻塞 **B3 解除**；余 B1（组合任务列取自 productivity）、
B2（手工方案按任务惰性拉模型名或显示 `—`）为既定取数约束，解法已给定。
M1 实现前置条件全部满足，是否开发仍由用户逐项决定。

## 追加 3：R3.5 M1 五方案比较视图完成（代码 + 验证 + 提交）

2026-10-08

R3.5 M1 五方案比较视图完成。

实现范围：

- 方案并列比较
- 任务数量展示
- AI resource 展示
- 时间估算展示
- planned cost 展示
- efficiency 占位

严格遵守 §11.10：

- 不推荐
- 不排名
- 不评分
- 不自动选择
- 不汇率转换
- 不制造效率数据

数据来源：

- productivity API
- assignments API
- existing ai-options API

无：

- schema 修改
- 新 API
- 新数据库字段

实现文件仅 3 个：`app/planner/[projectId]/page.tsx`（Compare plans 卡片）、
`app/planner/[projectId]/plans/[planId]/page.tsx`（面包屑回链）、
`components/planner/plan-productivity.tsx`（导出格式化函数，逻辑零改动）。

验证：

- TypeScript PASS
- ESLint PASS
- Build PASS
- 浏览器验证 23/23 PASS：默认最新 version（v1/v4/v5，历史 v2/v3 需勾选，勾选后 5 行）、
  成本列仅 `Unknown` 或 `币种: min – max`（与库中 NULL 实测一致，非 0）、
  时间列任务级区间、效率列恒 `—`、无排名/推荐用语、固定分组顺序（非成本排序）、
  组合方案 AI 来自 assignments（3/3 named）、手工方案 selected option 惰性加载、
  详情页回链存在、0 console error。

状态：

M1 完成。

下一阶段：

进入 Phase 5 商业价值闭环收尾：

- 发布前检查
- 免费试用策略落地设计
- Free / Paid 功能边界冻结
- MVP 发布准备

（以上为收口记录；本日此前各轮为只读决策轮，当时"无代码改动"的结论仅对当轮有效，以本节为准。）

## 追加 4：Phase 5 产品化收口（发布就绪审查 + 空态/错误态修复，commit 80cd7a7）

2026-10-08

Phase 5 产品化收口已完成。

步骤一（只读审查）：产出 PHASE5_RELEASE_READINESS_REVIEW.md，
结论 Conditional GO，修复清单 §4；该文档保持未跟踪、不入 Git。

步骤二（修复）：仅改 5 个源码文件，commit `80cd7a7`
fix: improve empty and error states（112 insertions, 13 deletions）：

1. Saving 页面无模型消费数据时显示明确 empty state。
2. AI Activity 加入明确的数据加载失败状态。
3. Dashboard Task Session 不再直接暴露 catch 中的原始错误信息。
4. Usage Details 区分"完全没有 usage 数据"与"当前筛选条件无匹配数据"，
   并提供官方 usage import 入口。
5. Budget 无 verified cost 时显示明确 empty state；
   未设置 budget 时明确说明显示的是 suggested values。

边界：无 API / schema / service / repository / Planner 改动；
未修改任何文档以外的其他源码；未触碰 v1.5.4 release/tag。

## 追加 5：Commercial 生命周期基础层 + Dashboard 首次使用接入（待提交）

2026-10-08

90-Day Full Access 商业化落地，共两个批次，均未 commit（整理为待提交批次）。

批次一（基础层）：新增 lib/schema.ts（commercial_state 表，first_use_at 可空，
+9 行）、lib/repositories/commercial-repository.ts、
lib/services/commercial-service.ts、scripts/smoke-commercial-lifecycle.mjs。
startCommercialTrial() 为唯一写入口；getCommercialLifecycle() 纯读，
first_use_at 为 NULL 返回 null（未开始试用）。smoke 25/25 PASS。

批次二（接入，仅 2 个源码文件）：新增 app/api/commercial/start/route.ts
（POST，Server 侧执行）；app/page.tsx +6 行独立挂载 effect，
fire-and-forget POST，catch 静默，不动现有 Dashboard 逻辑。
明确不放 layout / instrumentation / initDb / usage import / SSR / 后台服务；
不接付费判定。

实测（Playwright 真实浏览器）：

- 首开写入 first_use_at=2026-10-08T14:03:08.834Z；paid=0；paid_at=null；
  full_access_trial；paidRequiredAt=2027-01-06（+90 天整）。
- reload 后全部字段不变；StrictMode 双 POST 幂等（4 次 200）。
- 21 张业务表零漂移。

关键认知（冻结）：commercial_state 表存在 ≠ 试用开始；
first_use_at IS NOT NULL 才代表商业生命周期开始
（dev 启动时 initDb 会建空表）。

## 追加 6：Planner Advanced 边界审查（结论冻结，service 层已实现待提交）

2026-10-08

全量普查 22 个 planner API route + planner-service + combination-service +
candidate-generator 后冻结：

planner_advanced 仅含 2 个生成型 service 函数：

1. generateProjectPlanCombinations()（lib/planner/combination-service.ts）
   ← POST /api/planner/projects/[id]/combinations。
2. generateProjectTaskAiOptions()（lib/services/planner-service.ts）
   ← POST /api/planner/tasks/[id]/ai-options/generate。

免费保留：项目创建、阶段 CRUD、计划版本创建、任务 CRUD、AI options
查询/手动创建/select、已生成历史读取、productivity/M1 报告（属其他
capability）。

技术方案：权限检查放 service 层（不放 route 层）——两个函数是唯一入口、
防未来调用方绕过、route 保持薄壳、免费零影响；拒绝码
PLANNER_ADVANCED_LOCKED → 402。smoke-planner-api 不触达 2 个生成端点，
零回归。API 可绕过 UI，故必须服务端拦截；不存在"有 UI 无 API"入口。

## 验证

M1 收口轮：

- `npx tsc --noEmit`：PASS
- `npm run lint`：M1 三个文件 0 findings；全仓 435 errors 为既有基线（desktop-package 构建产物与既有源文件），与 M1 无关
- `npm run build`：PASS（25/25 页面）
- 浏览器人工验证（Playwright 驱动）：23/23 PASS，验证后临时脚本与截图已删除

Phase 5 产品化收口轮（80cd7a7 批次）：

- `npx tsc --noEmit`：PASS
- `npm run build`：PASS（25/25 页面）
- scoped ESLint：本批次涉及页面 PASS；usage/details 的 1 个
  `react-hooks/set-state-in-effect` error 已核实为 HEAD 基线既有，非本批次引入
- 提交前 staged 恰好 5 文件核对通过；提交后源码无残留修改

Commercial 生命周期轮（基础层 + 接入，未提交）：

- 基础层：smoke-commercial-lifecycle.mjs 25/25 PASS；tsc PASS；scoped ESLint PASS
- 接入批次：`git diff --check` CLEAN；`npx tsc --noEmit` PASS；
  scoped ESLint（route.ts + page.tsx）PASS 2/2
- 运行时（Playwright 实测）：首开写入 first_use_at / paid=0 / full_access_trial /
  paidRequiredAt=+90 天；reload 字段不变；StrictMode 幂等；业务表零漂移
- 全量 build / 全量 lint / 全量 smoke 未重跑（scoped 检查全绿，按指令不跑）

文档一致性：方向文档 §11–§14 = HANDOFF 第十二–十六节 = 本日志。

## Git 状态

- 今日两笔提交：`6e9bf4c`（M1：3 代码 + 3 文档）、
  `80cd7a7`（Phase 5 产品化收口：仅 5 个源码文件，112+/13-）。
- 当前 HEAD：`80cd7a7`；Commercial 批次 + Planner Advanced 门禁 + smoke 修复
  已整理为待提交批次（16 个文件：5 生产源码 + 4 个 commercial 新增 + 4 个 smoke + 3 份文档）。
- 0 字节垃圾文件 `=` 已删除；PHASE5_RELEASE_READINESS_REVIEW.md、
  PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md、PROJECT_PROGRESS_TIMELINE.md、
  PROJECT_WORKING_AGEMENT.md 保持未跟踪、不加入本次提交。
- 本次文档更新随源码一并提交（3 份文档已更新“未提交”→“待提交”状态），不 git add、不 commit、不 push。

## 今日纪律

- M1 批次仅改获批 3 文件；Phase 5 批次仅改获批 5 文件；无越界改动。
- Commercial 批次：基础层新增 3 文件 + smoke；接入批次严格仅 2 个源码文件；
  未 commit、未 push，待审。
- 商业系统只做"启动试用"，未接任何付费判定；未新增会员等级/Pro/支付/账号。
- 未改 schema 以外的既有表；未删除任何历史数据。
- 未新增产品方向；§11.7 四项 declared 决策保持冻结；v1.5.4 release/tag 冻结不变。
- 已通过的验证不重复执行；预存 lint 错误记录基线、不顺手修复。
- 独立批次独立 staging / commit，提交前后均核对 staged 清单。

今日工作结束。


---

# 2026-10-09

## 工作目标

完成 Planner Advanced UI lock 的静态实现与验证，并执行当日收尾。

## 完成内容

### UI WIP（仅 2 个文件，未提交）

- app/planner/[projectId]/page.tsx：组合方案卡片在收到精确错误码
  PLANNER_ADVANCED_LOCKED 时显示锁定提示并隐藏生成按钮；
  普通错误仍走原有 throw → catch → 错误行 + Retry 路径。
- components/planner/task-ai-options.tsx：Task AI options 面板同样逻辑，
  锁定分支显式复位 loading 后返回。
- 锁定判定仅依赖 `data.code === "PLANNER_ADVANCED_LOCKED"`，不按 HTTP 状态码判定。
- 不改服务端权限逻辑、API、schema、商业生命周期；无 lifecycle 启动调用；
  无客户端 90 天计算。

### 验证证据

已通过：

- 服务端隔离数据库权限测试 14/14 PASS（%TEMP% 一次性脚本，隔离临时库）：
  - full_access_trial 下 generateProjectTaskAiOptions 与
    generateProjectPlanCombinations 均放行；
  - paid_required（仅在隔离库把 first_use_at 回拨 91 天构造）下两服务均抛
    PLANNER_ADVANCED_LOCKED；
  - plannerErrorStatus("PLANNER_ADVANCED_LOCKED") = 402；
  - 普通错误映射不变（PROJECT_NOT_FOUND=404、INVALID_STATUS_TRANSITION=409、
    其余=400）。
- TypeScript（npx tsc --noEmit）PASS。
- scoped ESLint（仅两个 UI 文件）PASS。
- git diff --check CLEAN。
- 静态 diff 只读审查：无阻塞问题。

未完成（明确停止）：

- 浏览器端交互实测未完成。多次尝试受阻：
  1) 隔离临时目录启动 Next.js：Turbopack 因 node_modules junction 报 panic；
     改 webpack 后 lib/db.ts 的 node:fs 导入报 UnhandledSchemeError。
  2) 真实项目根目录启动（端口 3000）：首页返回 HTTP 200，服务器可服务页面，
     但 Playwright route-interception 交互验证未执行即按指令收尾。
- HTTP 200 只证明服务器可响应首页，不等于三种 UI 交互已验证。
- 已决定停止浏览器测试，不再重试、不再投入环境排查——基于验证收益与
  时间成本的明确决定，不是待办遗漏。

### 数据库安全（前后快照实测比较）

本轮从真实项目根目录启动过 next dev（页面加载会只读打开真实开发库）。前后
SHA-256 比较六个文件：

- data/ 三件套：.db 与 -wal 的 SHA-256 与 mtime 均未变；仅 -shm 的 SHA-256
  与 mtime 变化（大小未变）——WAL 模式下打开连接触碰共享内存文件的正常副作用，
  主库与 WAL 内容哈希未变说明无业务数据写入。未做任何恢复操作。
- %APPDATA%\AI-Cost-Management\data\ 三件套：全部 SHA-256 与 mtime 均未变。

结论：真实业务数据未被修改。

### 服务器清理

- PID 21704（node ... next dev -p 3000，本项目路径）核对命令行后停止；
  端口 3000 无残留监听；无归属本轮的 Playwright/Chromium 残留进程。

## Git 状态

- HEAD：`5aefeee` feat: commercial lifecycle + planner_advanced gate + smoke fixes。
- 未提交源码仅 2 个 UI 文件（89 + 29 行变更）。
- 4 个未跟踪文档保持原样：PHASE5_RELEASE_READINESS_REVIEW.md、
  PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md、PROJECT_PROGRESS_TIMELINE.md、
  PROJECT_WORKING_AGREEMENT.md。
- 未 commit、未 push、未打 tag。

## 重要决定

1. 停止浏览器实测：服务端契约已由 14/14 隔离测试覆盖，UI 锁定分支已由静态
   diff 审查覆盖；浏览器实测多次因环境问题受阻，边际收益被判定为不值得继续
   投入。这是明确决定，不是遗漏待办。
2. 两个 UI 文件保持未提交 WIP，由用户决定是否提交。

## 下一步

1. 依据数据库核对结果完成收尾（本日志即收尾记录）。
2. 如无异常，等待用户决定是否提交两个 UI 文件。
3. 不重新安排浏览器测试，不重新安排全量回归。

今日工作结束。


---

# 2026-10-10

## 工作目标

Phase 5 发布准备：恢复上下文 → 盘点真实剩余事项 → 收尾 §4-3 错误文案 → 发布前置只读核对 → 本地文档事实同步。

## 完成内容（按轮次）

### 1. 只读上下文恢复与剩余事项盘点（2 轮，未改任何文件）

- 读取 5 份管理文档 + git 只读核对，输出上下文摘要与 Phase 5 剩余事项分类
  （已完成 / 真实未完成 / 已明确推迟）。
- 逐项核验 PHASE5 §4 六项：1、2、5 与 3（首页部分）已提交于 `80cd7a7`；
  3（余量）当时未做；4 未决策；6 未做。

### 2. §4-3 错误文案收敛（实施 + 验证，**本地完成、未提交**）

- 修改文件仅 2 个：`app/costs/page.tsx`、`app/usage/import/page.tsx`。
- 内容：用户可见错误不再直通 API 原始错误文本，改为固定文案；原始错误保留
  `console.error`（沿用 `80cd7a7` 在 `app/page.tsx` 建立的模式）；加载/成功/失败/
  重试/导入行为与 API/业务语义零变化；无新依赖、无新日志框架。
- 该轮验证（如实记录，今日已跑、其后不重复）：
  - `npx tsc --noEmit`：PASS；
  - scoped ESLint（仅 2 文件）：`usage/import` 0 findings；`costs` 的 1 error +
    1 warning 经 `git show HEAD:… | eslint --stdin` 同名对照**证实为 HEAD 既有基线**
    （同规则同代码、仅行号位移），本批次 0 新增 findings，按 §15 约定记录基线、不顺手修复；
  - `git diff --check`：PASS；改动范围核对：仅这 2 个源码文件。
- 未提交、未 push；不得称为已发布或已提交。

### 3. 发布前置只读核对（未改任何文件、未跑任何测试）

- 冻结规则核对：HANDOFF 第十一节§3 与 第十二节§4 无条件冻结 package.json、
  docs/CHANGELOG、RELEASE_NOTES、release/、v1.5.4 tag；WORKING_AGREEMENT §14/§15
  为"不因日常工作改动"；CHANGELOG L5 允许 `[Unreleased]` 追加。
- 版本记录核对：package.json=`1.5.4`；CHANGELOG 最新 `[1.5.4] — 2026-10-07`；
  PROJECT_STATUS 仍记 1.5.1；tag `v1.5.4` → `bc47a9a`；HEAD `5aefeee`、ahead 7。
- 结论：**对 package.json / docs/CHANGELOG.md / docs/PROJECT_STATUS.md /
  RELEASE_NOTES.md 无任何修改授权**（发布工程清单均标注"等待用户逐项决策"）。

### 4. 本地文档事实同步（本轮，仅 4 份文档）

- PHASE5：更正表头 HEAD（`6e9bf4c` → `5aefeee`）、更正 §9 "6 项已全部修复"的不实表述、
  新增 §11 逐项核对表 / 已知限制 / 版本三层区分 / 待授权清单。
- DIRECTION：更正 L4 事实依据、§8 版本表（补 v1.5.4 行、去"当前版本"错误标注）、
  L341 改为四方对照表（package.json / CHANGELOG / PROJECT_STATUS / 实际 tag）。
- HANDOFF：新增第十八节（当前工作区状态、§4-3 本地完成及验证、/costs 已知限制、
  浏览器测试停止确认、下一步入口）；第十七节 §1 加过期标注。
- DAILY_LOG：本条记录。
- 均未修改产品方向与任何已冻结决策；未删除历史记录，仅加时点标注。

### 5. 组1、组2 提交（2026-10-10 后续，由用户执行并授权记录）

- 组1：`ddb4df5` fix: improve cost and import error messaging
  （app/costs/page.tsx、app/usage/import/page.tsx，2 文件 20+/8-）。
- 组2：`6305de6` feat: add planner advanced lock UI
  （app/planner/[projectId]/page.tsx、components/planner/task-ai-options.tsx，2 文件 89+/29-）；
  暂存核验仅含这 2 个目标文件，无未跟踪文件、无文档夹带。
- 效果：工作区源码修改清零；本节 §2 标题"本地完成、未提交"及下方"未提交、未 push"
  为提交前时点记录，由本条更新；组3 三份文档仍未提交。

## 只读核对发现的关键矛盾及处理结果

| 矛盾 | 处理结果 |
| --- | --- |
| PHASE5 §9 "§4 的 6 项已全部修复并提交（80cd7a7）" — 不实（3 余量/4/6 当时未做） | 已在 PHASE5 §9 就地更正 + 新增 §11 逐项表 |
| PHASE5 表头 HEAD `6e9bf4c` vs 实际 `5aefeee` | 已更正表头并注明时点 |
| PHASE5 §9 "商业生命周期（未提交）" vs 已随 `5aefeee` 提交 | 已在小节标题标注"现已随 5aefeee 提交，见 §10" |
| DIRECTION 文档头部事实依据、§8 版本表、§8"文档滞后待修"段 — 版本与 CHANGELOG 滞后描述过期 | 已更正；PROJECT_STATUS 确认仍滞后（保留为待修项） |
| PROJECT_STATUS 停 1.5.1、"app never seeds at runtime" 已被 instrumentation 取代 | **保留原文未改**（无授权），已在 DIRECTION 对照表与 PHASE5 §11 登记为待发布工程项 |
| HANDOFF 第十七节"未提交源码仅 2 个"已过期 | 已加过期标注指向第十八节，原文保留 |
| 冻结清单（HANDOFF 无条件冻结 CHANGELOG/package.json）与发布工程清单（要求改两者）冲突 | **保留原文、不解释为授权**，已上报用户待决 |

## Git 状态

- HEAD：`5aefeee`；origin/master=`c1ce06f`，ahead 7；未 push、未打 tag。
- 未提交：4 个源码（2 个 §4-3 + 2 个 UI lock WIP）+ 3 份已跟踪文档（本文件、
  HANDOFF.md、PROJECT_DIRECTION_AND_DECISIONS.md）；另 PHASE5_RELEASE_READINESS_REVIEW.md
  为未跟踪文档，本轮同样已更新（保持未跟踪、不入 Git）。
- 未跟踪 4 项保持原样：PHASE5、STAGE_DESIGN、TIMELINE、WORKING_AGREEMENT。

（2026-10-10 提交后更新：HEAD=`6305de6`，origin/master=`c1ce06f`，ahead 9，未 push、未打 tag；
上方 HEAD `5aefeee`/ahead 7/"4 个源码未提交"为提交前时点记录。4 个源码已全部提交——
组1 `ddb4df5`、组2 `6305de6`；未提交仅余本节所列 3 份文档；未跟踪 4 项不变；冻结文件不变。）

## 今日纪律

- 未执行 git add / commit / push / tag；未运行 tsc / ESLint / smoke / build / 打包 /
  浏览器测试（§4-3 一轮的 tsc/scoped ESLint 为当时新改动的必要验证，已跑、不重复）。
- 未访问或修改数据库；未改源码（除 §4-3 授权的 2 文件）、未改冻结文件与未跟踪设计文档。
- 未虚构任何测试、提交、发布或用户授权；版本号未决定、不推测。
- 浏览器交互测试维持停止决定，未重新安排。

## 下一步（等待用户授权，均未开始）

1. 4 个源码 + 4 份文档的提交/拆分决定。
   （更新：组1 `ddb4df5`、组2 `6305de6` 已提交；余组3 3 份文档 + 4 个未跟踪文件待决定。）
2. §4-4 孤儿页处置确认（当前：维持无入口 + 已知限制）。
3. §4-6 发布工程的文件修改授权（package.json / CHANGELOG / PROJECT_STATUS / RELEASE_NOTES）。
4. 发布验收（全量 smoke + 打包产物检查）时点确认。

今日工作结束。


---

# 工作原则

以后每天结束必须更新：

HANDOFF.md

每天开始必须读取：

- PROJECT_WORKING_AGREEMENT.md
- PROJECT_DIRECTION_AND_DECISIONS.md
- PROJECT_PROGRESS_TIMELINE.md
- PROJECT_DAILY_LOG.md
- HANDOFF.md

确保：

方向一致。

避免：

重复开发。

避免：

偏离产品目标。
