# AI Cost Management - HANDOFF

更新时间：

2026-10-08（第十更新：R3.5 M1 五方案比较视图代码完成并验证（TypeScript/ESLint/Build/浏览器 23 项 PASS），文档同步，见第十四节；3 代码文件 + 3 文档提交）

2026-10-08（第九更新：五方案比较视图 M1 显示规则冻结为方向文档 §11.10，阻塞 B3 解除，见第十三节；仅改 3 份文档，无代码改动）

2026-10-08（第八更新：五方案比较视图 M1 只读评审完成，GO + 3 项阻塞，见第十三节；仅改 3 份文档，无代码改动）

2026-10-08（第七更新：Planner AI Options 产品语义复核完成，四问全部回答并冻结，见第十二节；仅改 3 份文档，无代码改动）

2026-10-07（第六更新：A/B/C 三组完成并提交，HEAD=82b3edc，架构收口 PASS，进入产品语义决策）

2026-10-06（第五更新：R3.5-A 已提交 a2fde32；R3.5-B 已完成并精确 staged 待提交；M2 保持 unstaged）


==================================================
一、项目当前定位
==================================================

项目：

AI Cost Management


核心目标：

自动发现 AI 使用行为。

统计 AI 成本。

发现异常消耗。

帮助用户控制 AI 支出。


长期商业方向：

AI Project Planner。


目标：

帮助用户面对复杂项目时：

不要使用单一 AI 从头执行全部任务。

根据不同阶段、不同任务特点：

选择最合适的 AI 模型组合。


核心价值：

降低 AI 成本。

提高项目完成效率。


说明：

AI Cost Management 不只是成本统计工具。

核心定位：

自动发现 AI 使用情况、控制 AI 支出，并通过 AI Project Planner 为复杂项目选择最合适的 AI 组合方案。


==================================================
二、已经完成内容
==================================================


## AI Cost Management 基础能力

已完成：

- 本地 AI 成本管理
- Token 统计
- 成本计算
- Provider 管理
- 模型价格管理
- Dashboard
- Usage
- Saving
- Budget
- AI Activity


## 产品化

已完成：

- Windows 打包
- Release Packaging
- 安装包
- README
- SHA256


## Planner

已经完成：

R3.3-B：

- 项目计划
- 任务拆解
- AI Resource 分配
- AI Option 基础结构


R3.4：

完成：

- AI Resource owner
- AI Resource channel


R3.4-C1：

完成并冻结。

验证：

- smoke
- regression
- tsc
- ESLint
- build


==================================================
三、2026-10-01 方向确认
==================================================


## 1. Planner 方向重新确认

已写入 PROJECT_DIRECTION_AND_DECISIONS.md：

- AI Cost Management 不只是成本统计工具。
- 核心定位：自动发现 AI 使用情况、控制 AI 支出，
  并通过 AI Project Planner 为复杂项目选择最合适的 AI 组合方案。
- 产品价值：降低 AI 使用成本，提高项目完成效率。


## 2. AI Project Planner 成为核心商业价值方向

- 是未来主要付费价值，不是附属功能。
- 目标：复杂项目不再由单一 AI 从头执行。
- 系统根据：项目类型、项目阶段、任务特点、AI 能力、成本、时间要求
  生成 AI 组合方案。
- 目标模型：

项目
↓
阶段
↓
任务
↓
AI 资源组合


## 3. 五种方案冻结（最多五种）

方案1：最低成本方案

原则：优先免费 AI、用户已有 AI、本地 AI。


方案2：用户已有 AI 方案（必须保留）

原则：充分利用本地 AI、已注册 AI、已购买会员 AI，
减少重新注册和学习成本。


方案3：最快完成方案

原则：时间优先，允许更高成本。


方案4：综合优化方案

原则：成本、速度、质量综合平衡。


方案5：高质量方案

原则：优先效果和成功率。


对照代码（事实）：

- 已实现 3：cost_conscious / existing / mixed
- 未实现 2：最快完成、高质量
- 待归类 2：subscription、registry_expanded

方案数量上限为 5，不得静默增删。


==================================================
四、Planner 架构复核结果（2026-10-01）
==================================================


方式：

只读复核。未修改任何文件，未提交代码。


结论：

支持未来方向 62 / 100。


判断：

- 数据模型与生成引擎对"多方案"的准备度约 80%。
- 不需要推倒重来。
- 需要 4 项局部架构设计 + 一批小改。


已具备：

- 项目 / 计划 / 任务三层数据结构
- 一个项目多方案（project_plans 版本不可变 + 五策略组合生成）
- 每任务分配 AI，方案级双口径成本（out-of-pocket / api-equivalent）
- Token 预测 → 成本预测链路
- 用户已有资源与 registry 的区分（resource_source、owner、channel、access_method）
- 候选生成链：UI → API → planner-service → 三个估计器 → 落库
- 方案级读接口 /plans/[id]/assignments 与方案详情 UI


需要架构设计（4 项）：

1. 阶段层 + 任务依赖模型
2. Registry 速度 / 效率事实来源（决定"最快完成方案"能否成立）
3. 本地 AI / 自述资源进入方案池的合法路径
4. plan → actual 对账模型


==================================================
五、当前缺口
==================================================


## 问题1：无阶段层，无任务依赖

当前只有项目 → 任务两层。

最接近"阶段"的是 project_tasks.category（任务类型枚举，不是阶段）。

没有 depends_on / blocked_by，顺序只有 sequence。


## 问题2：最快完成方案数据上不成立

Registry 无延迟 / 吞吐列。

time-estimator 对所有模型返回相同档位。

前置判断：若厂商文档无法给出可引用的速度事实，
该方案必须降级为近似，不得虚构精确数据。


## 问题3：方案比较视图缺位

缺聚合对比接口与对比页面。

方案详情当前显示原始 ID，而不是模型名与任务名。

状态更新（2026-10-08 只读评审，见第十三节 / 方向文档 §11.9）：
M1 不需要聚合接口（现有只读端点足够）；资源显示名已在 v1.5.4 修复。
余下 3 项阻塞：组合方案任务列必须取自 productivity、手工方案无计划级模型名、
方案级成本合计与 unknown 规则未冻结（B3，设计前置）。
→ 后续：B3 已于同日以方向文档 §11.10 显示规则冻结解除；B1/B2 解法见 §11.9。


## 问题4：五方案清单与实现错位

缺 2、多 2，subscription / registry_expanded 归属待决策。


## 问题5：本地 AI / 自述资源进不了组合池

plan_resource_assignments.resource_source 只允许
registered / registry。

declared 资源被明确排除在组合池之外。


## 问题6：plan → actual 未闭环

无法证明"方案真的更省"。

这是商业模式价值缺失的第一条证据。


## 问题7：效率指标缺失

Planner 无效率字段，展示要求中的"效率"暂时无法提供。


==================================================
六、下一阶段工作
==================================================


第一步：

设计 PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md

状态：已完成（2026-10-06，只读分析，未修改任何代码）。

- 已创建 PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md。
- 四项决策已由用户确认：
  1. 阶段归属项目级（project_stages 表 + project_tasks.stage_id 可空列）
  2. 任务依赖本期不做，预留扩展位
  3. 阶段仅手工创建，预设模板后置
  4. 有任务引用的阶段只归档、不可物理删除
- 迁移结论：新表 + 加可空列，低风险；不重建表、不回填、不动 project_plans。
- 与 plan 版本不可变规则不冲突。


第二步：

补齐方案能力设计

- 最快完成方案、高质量方案
- subscription / registry_expanded 归属决策
- 五方案比较视图
- 用户已有 AI（本地 / 自述）进入方案池


第三步：

设计 AI Project Planner 核心方案生成能力。

第四步：

再决定具体开发顺序。


==================================================
七、工作方式要求
==================================================


必须：

每天开始：

读取：

- PROJECT_WORKING_AGREEMENT.md
- PROJECT_DIRECTION_AND_DECISIONS.md
- PROJECT_PROGRESS_TIMELINE.md
- PROJECT_DAILY_LOG.md
- HANDOFF.md


每天结束：

更新：

- HANDOFF.md
- PROJECT_DAILY_LOG.md


开发原则：

- 不做无价值功能
- 不重复验证
- 不浪费 AI 额度
- 不陷入局部循环
- 以产品整体价值判断
- 不做 AI 排名
- 不做没有依据的评分
- 不制造虚假精确数据


==================================================
八、当前暂停事项
==================================================


状态（2026-10-06）：

- PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md 设计评审已完成，
  四项决策已确认。
- 按用户指令暂停，等待确认进入 M1。
- M1 之外的新 Planner 功能仍不开发。

状态更新（2026-10-06 收口，覆盖上述"等待进入 M1"）：

- M1 / M2 Stage 相关改动已执行，全部仍在 working tree（unstaged）。
- R3.5-A Productivity API 已完成并提交：`a2fde32`。
- R3.5-B Productivity UI 已完成开发并精确 staged，尚未提交。
- 暂停事项更新为：除 R3.5-B 提交与 M2 继续外，不新开工作包。


=================================================
九、OpenCode 执行优先规则（长期执行约定）
=================================================


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


=================================================
下一次继续入口
==================================================


状态更新（2026-10-06）：本节记录的 M1 入口为历史内容，M1 已执行完成。
当前实际接续状态与明天第一步以第十节为准（提交 R3.5-B → 继续 M2）。


从 M1 数据层开始（待用户确认进入）：

设计依据：PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md

范围：

- 新增 project_stages 表（project_id、name、sequence、
  status active/archived）
- project_tasks 加 stage_id 可空列 + 自守护迁移
  （migrateProjectTasksStageId，加列不重建表）
- 阶段 CRUD（repository / service / route）
- 有任务引用的阶段禁止物理删除（service 校验）
- 新增 scripts/smoke-planner-stages.mjs

验证：

- npx tsc --noEmit
- npm run lint
- 新 smoke 通过
- 9 个既有 planner smoke + smoke:tasks 回归通过

注意：

- 与 declared WIP 的第 9 个迁移同在 lib/schema.ts，
  需顺序合并。
- 组合方案生成链路零改动（assignments → 任务 → stage_id）。


=================================================
十、2026-10-06 结束状态与明天第一步
================================================

状态更新（2026-10-07）：本节为 2026-10-06 的历史时点记录，其中"明天第一步
（提交 R3.5-B / 继续 M2）"已过期，不再执行；v1.5.4 已在其后发布并冻结
（tag → bc47a9a）。当前实际状态与明天第一步以第十一节为准。
（以下保留原文，仅作历史。）


## 1. 当前状态

- R3.5-A：DONE / COMMITTED
  - commit：`a2fde32` feat: add planner productivity reporting
  - productivity smoke：14 passed / 0 failed
  - `npx tsc --noEmit` PASS；`npx eslint scripts/smoke-planner-productivity.mjs` PASS
  - 只读 API；无 productivity 专用持久化 / 缓存；
    不产生 score / rank / recommendation / isPrimary；
    不跨货币计算、不隐式换汇、不增加 FX API 或货币设置；
    unreliable / unverified 成本不参与成本比较

- R3.5-B：DEVELOPMENT DONE / STAGED / PENDING COMMIT
  - 新增 `components/planner/plan-productivity.tsx`，
    集成 `app/planner/[projectId]/plans/[planId]/page.tsx`
  - staged：2 files / 635 insertions / 0 deletions
  - 尚未提交

- M2：UNSTAGED / CONTINUE NEXT
  - Stage 相关改动全部在 working tree，保持 unstaged
  - 与 R3.5-B 的分界文件是 page.tsx（按 hunk 精确拆分）


## 2. 明天第一步（按顺序执行）

```
git commit -m "feat: add planner productivity UI"
git status --short
git log --oneline -4
```

确认：

- 提交只包含已 staged 的 2 个文件
- M2 改动仍为 unstaged
- 然后继续 M2 Stage 工作


## 3. 明确禁止

- 不要 `git restore` page.tsx（会丢弃 M2 修改）
- 不要重新打开 R3.5-A 架构审查
- 不要扩张 R3.5 Productivity 范围
- 不要加入 FX / ranking / recommendation
- 不要把 M2 混入 R3.5-B commit
- 不要为了文档收口改动、回滚或重新整理任何代码


================================================
十一、2026-10-07 结束状态与明天第一步（当前以此节为准）
================================================


## 1. 当前状态

- v1.5.4：已发布并冻结（`bc47a9a`，tag v1.5.4）；release/ 与 package.json 不动。
- A / B / C 三组：已完成并提交、已收口。

  - A `af020f0` fix: align ai option schema with declared resource column
    （nullable model_id + declared_resource_id + exactly-one 约束 + FK
    + 既有行迁移 + planner repository 对齐）
  - `036a483` feat: add declared resources inventory（declared CRUD 本体）
  - B `6631a63` feat: enrich planner ai option state（5 文件：
    ai-options route、task-ai-options、candidate-generator、
    resource-universe、planner-service）
  - C `82b3edc` feat: initialize ai registry baseline on startup（3 文件：
    instrumentation.ts、ai-registry-repository、smoke-registry-baseline.mjs）

- A/B/C 最终只读架构收口：**PASS，无 P0 / P1**（2 条 P2 观察记录在
  PROJECT_DIRECTION_AND_DECISIONS.md §10，非 blocker）。
- C smoke：`node --experimental-strip-types scripts/smoke-registry-baseline.mjs`
  → 8 passed / 0 failed（已跑过，不重复）。

Git：

- HEAD = `82b3edc`；staged = 空；今日未 push。
- 未跟踪 7 项，**一律不要自动暂存**：
  `=`、HANDOFF.md、PROJECT_WORKING_AGREEMENT.md、
  PROJECT_DIRECTION_AND_DECISIONS.md、PROJECT_PROGRESS_TIMELINE.md、
  PROJECT_DAILY_LOG.md、PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md
- 这 5 个项目文档是本地工作文档，更新文档不等于要提交文档。


## 2. 当前架构（2026-10-07 确认）

```
AI Registry → Registry Models → Planner AI Options   （candidate pool 唯一来源）
Declared Resources → Resource Inventory               （独立 inventory）
```

- Declared Resources 是"用户声明/登记的一类 AI 资源"，
  **不是某个具体模型或 Provider**。
- Declared Resources 当前：不进 AI Option candidate pool、
  不进 plan_resource_assignments、无成本计算、无凭据、无外部 live 调用。
- AI Option state 是读取时实时派生、不持久化；无评分/排名/推荐。
- 新安装空 DB：启动 instrumentation → registry baseline →
  `listAiRegistry()` → Planner candidate generation，已静态确认成立。


## 3. 当前不要做

- 不要把 Declared Resources 自动加入 candidate pool。
- 不要修改 candidate-generator / resource-universe（产品语义决策前）。
- 不要重新打开 A / B / C（无新证据不重复修改已提交代码）。
- 不要重复 build / lint / smoke（已通过的不重跑）。
- 不要动 frozen 文件（productivity-service、docs/CHANGELOG、RELEASE_NOTES、
  package.json、release/、v1.5.4 tag、`=`）。
- 不要 push、不要自动 commit、不要自动 git add 文档。


## 4. 明天第一步

先读取：

1. HANDOFF.md（本文件）
2. PROJECT_DIRECTION_AND_DECISIONS.md（重点 §10）
3. PROJECT_PROGRESS_TIMELINE.md（重点 2026-10-07 节点）

必要时再读：

4. PROJECT_WORKING_AGREEMENT.md（§14）
5. PROJECT_DAILY_LOG.md（2026-10-07）

然后进行：**Planner AI Options 产品语义复核**（先决策，不写代码）。

必须回答的四个问题：

1. AI Option 是"模型选择"还是"AI 资源选择"？
2. 为什么 model_id 和 declared_resource_id 要共存？
3. 没有价格的 Declared Resource 是否允许成为 AI Option？
4. 用户选择 Declared Resource 后，Productivity / Cost / Task Completion
   如何记录？

只有这四个问题确定后，才决定 Declared Resources 是否进入 candidate pool。


状态更新（2026-10-08）：本节"明天第一步（Planner AI Options 产品语义复核）"已完成，
四个问题全部回答并冻结。当前实际状态与明天第一步以第十二节为准。
（以上保留原文，仅作历史。）


=================================================
十二、2026-10-08 结束状态与明天第一步（当前以此节为准）
=================================================

状态更新（2026-10-08 收官）：本节 §5 的 M1 排期项已完成实现与提交，当前状态与
下一阶段以第十四节为准。（以上保留原文，仅作历史。）


## 1. 本轮做了什么

- 方式：只读复核 + 语义决策。读取 lib/schema.ts、planner-repository、
  candidate-generator、resource-universe、planner-service、combination-service。
- 产出：PRODUCT 语义四问全部回答并冻结，写入
  PROJECT_DIRECTION_AND_DECISIONS.md §11。
- 修改文件仅 3 份：PROJECT_DIRECTION_AND_DECISIONS.md、
  HANDOFF.md、PROJECT_DAILY_LOG.md。
- 无代码 diff、无 schema 改动、无新 API、未运行验证命令、未 git commit、未 push。


## 2. 四个问题的答案（详版见方向文档 §11）

1. AI Option 是「AI 资源选择」，不是「模型选择」。
   一个 AI Option = 这个 planned step 可以用哪一种 AI 资源运行的一条候选记录。
   当前实际可选资源只有 AI Registry Model；Declared 是 schema 预留的第二类资源入口。

2. model_id 与 declared_resource_id 共存，因为它们是两类不同实体：
   model_id = Registry 中可验证模型；declared_resource_id = 用户声明、Registry 不存在的资源。
   互不回填、互不物化（不进 models、不进 ai_resources），禁止任何隐式转换。

3. Declared Resource：**后续允许进入 candidate pool（方向），当前不进入，进入有条件。**
   条件：pricing unknown → 成本三列同时 NULL、不参与成本数值比较、pricing_state='known'
   不等于有费率；capability unknown → fit_status='unknown'；复用同一 fit-estimator、不打分。
   本轮不实现。

4. 选择 Declared 后的闭环：
   Plan 记 option 行（declared_resource_id + is_selected=1 + 成本 NULL + 时间照常）；
   Actual 仍走 tasks / task_sessions / usage 归因，不可测即 actual cost = NULL（不是 0）；
   cost unknown 显示 unknown/—，不显示 0、不并入合计；task completion 仍由
   project_tasks.status + task_sessions.status 记录，与资源类型无关。


## 3. 当前架构（保持 2026-10-07 确认，未变）

```
AI Registry → Registry Models → Planner AI Options   （candidate pool 唯一来源）
Declared Resources → Resource Inventory               （独立 inventory）
```

- AI Option 不存 resource_source，读取时实时派生；无评分 / 排名 / 推荐。
- plan_resource_assignments.resource_source CHECK 仍仅 registered / registry。


## 4. 当前不要做

- 不要把 Declared Resources 加入 candidate pool（语义冻结 ≠ 功能交付）。
- 不修改 lib/schema.ts、lib/planner/*、lib/services/planner-service.ts、
  lib/repositories/*、app/api/*、components/*、scripts/*（语义冻结后的四项决策逐项单独评审前）。
- 不实现 declared candidate、不为 declared 做成本推算。
- 不重新打开 A / B / C 架构审查。
- 不重复 build / lint / smoke（已通过的不重跑）。
- 不动 frozen 文件（productivity-service、docs/CHANGELOG、RELEASE_NOTES、
  package.json、release/、v1.5.4 tag、`=`）。
- 不 push、不自动 commit、不自动 git add 文档。


## 5. 明天第一步

先读取：

1. PROJECT_DIRECTION_AND_DECISIONS.md §11（语义冻结全文，重点 11.4 进入条件、
   11.5 数据闭环、11.6 风险）
2. HANDOFF.md（本文件，第十二节）
3. PROJECT_DAILY_LOG.md（2026-10-08）

然后按优先级逐项**单独决策**（每项独立评审，不打包，决策前不写代码）：

1. candidate pool 是否扩展（declared 是否入池，按 §11.4 条件逐条核对）
2. resource universe 是否修改（ResourceSource 第三值 + deriveModelState declared 分支）
3. AI Option state 是否增加 declared 分支（替换 planner-service 的过滤 guard）
4. plan_resource_assignments.resource_source 是否扩枚举（涉及重建表，单独评估）

同时仍待排期的既有工作包：M2 收尾、五方案比较视图、plan → actual 闭环。
本轮不新增任何未经确认的产品方向。


=================================================
十三、2026-10-08 追加：五方案比较视图 M1 只读评审（GO + 3 项阻塞）
=================================================


## 1. 结论

- **M1 可用现有只读 API 实现：GO。** 零 schema 改动、零新增/修改 API，只新增一个只读视图。
- 详版（端点核对表、逐项证据）见 PROJECT_DIRECTION_AND_DECISIONS.md §11.9。


## 2. 三项阻塞（实现前必须解决）

1. **B1 组合方案任务列只能取自 productivity**：`GET /plans/[id]/tasks` 对组合方案返回 `[]`
   （组合方案不持有 project_tasks），assignments 只带 task id 无任务名。
2. **B2 手工方案无计划级 AI 模型名**：无 assignments 行、productivity selectedOption 只有 id、
   无 registry API；名字仅 per-task `GET /tasks/[id]/ai-options` 可得 →
   折叠行显示 `—` 或展开时按任务惰性拉取；要求"折叠态仅用计划级接口显示名字"即被阻塞。
3. **B3 方案级成本合计与 unknown 规则未冻结（设计前置，非 API）**：
   同币种才求和、任一 NULL ⇒ 合计 unknown（非部分和、非 0）、多币种并列不合并、
   不排名、时间列标注各方案同源同值、效率列 `—`。未冻结不得实现。


## 3. 不变

- 第十二节 §4「当前不要做」与 §5「明天第一步」（四项 declared 决策）不变；
  本轮是可行性评审，不改变优先级、不新增产品方向。
- 本轮仅改 3 份文档（方向文档 §5 状态更正 + §11.9、本文件、日志），无代码 diff、
  未运行 build/lint/smoke、未 git add/commit、未 push。


## 4. 状态更新（同日：§11.10 显示规则冻结，B3 解除）

- 上述 **B3 已解除**：比较视图显示规则全文冻结为方向文档 **§11.10**
  （同币种汇总、多币种并列、任意任务 planned cost NULL ⇒ 方案总成本 Unknown、
  禁止最便宜/最快/推荐/性价比排序、时间标注任务级估计、效率 `—`、
  同 strategy 默认最新 version、只展示不推荐）。
- 余下 **B1 / B2** 为既定取数约束，解法已在 §11.9 给定，开发时直接执行。
- M1 实现前置条件至此全部满足（零 schema 改动、零新增/修改 API）；
  是否进入开发、何时进入，仍按第十二节 §5 的逐项决策节奏，由用户决定。
- 本状态更新仍只改 3 份文档，无代码改动。


================================================
十四、2026-10-08 收官：R3.5 M1 五方案比较视图完成（代码 + 验证 + 提交）
================================================


## 1. 实现范围

R3.5 M1 五方案比较视图完成。

- 方案并列比较
- 任务数量展示
- AI resource 展示
- 时间估算展示
- planned cost 展示
- efficiency 占位

实现文件仅 3 个：

- app/planner/[projectId]/page.tsx（Compare plans 卡片）
- app/planner/[projectId]/plans/[planId]/page.tsx（面包屑回链）
- components/planner/plan-productivity.tsx（导出格式化函数，逻辑零改动）


## 2. 严格遵守 §11.10

- 不推荐、不排名、不评分、不自动选择、不汇率转换、不制造效率数据
- 默认每 strategy 最新 version；历史版本需手动勾选
- 任一任务 planned cost NULL ⇒ 方案总成本 Unknown（不为 0、不部分求和）
- 效率恒为 —；表格固定分组顺序，无任何成本排序


## 3. 数据来源与边界

- productivity API + assignments API + existing ai-options API
- 无 schema 修改、无新 API、无新数据库字段


## 4. 验证

- TypeScript PASS
- ESLint PASS（M1 三文件 0 findings；全仓 435 errors 为既有基线）
- Build PASS（25/25 页面）
- 浏览器验证 23/23 PASS（含 historical 开关 3 行 ↔ 5 行、组合方案 AI 3/3 named、
  手工方案 selected option 惰性加载、0 console error）


## 5. 状态与下一阶段

状态：M1 完成。

下一阶段：进入 Phase 5 商业价值闭环收尾（不在此轮开始开发）：

1. 发布前检查
2. 免费试用策略落地设计
3. Free / Paid 功能边界冻结
4. MVP 发布准备
