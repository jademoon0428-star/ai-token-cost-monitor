# AI Cost Management - HANDOFF

更新时间：

2026-10-10（第十六更新：组1 §4-3 错误文案已提交 `ddb4df5`、组2 Planner Advanced lock UI 已提交 `6305de6`；源码工作区清零，仅余组3 三份文档未提交；见第十八节 §0）

2026-10-10（第十五更新：Phase 5 只读事实核对 + 本地文档状态同步；§4-3 两页错误文案本地完成未提交；/costs 无入口记为已知限制；见第十八节）

2026-10-09（第十四更新：Planner Advanced UI lock 完成静态实现与服务端隔离验证，浏览器交互实测经评估后决定停止；见第十七节）

2026-10-09（第十三更新：Commercial 生命周期 + Planner Advanced service 层门禁 + 402 映射 + 4 个 planner smoke 修复整理为待提交批次（16 个文件：5 生产 + 4 smoke + 3 文档 + 4 个 commercial 新增文件），见第十六节；本轮仅整理边界，不执行 commit）

2026-10-08（第十一更新：Phase 5 产品化收口完成，commit `80cd7a7`（仅 5 个源码文件，112+/13-），空态/错误态 5 项改进，见第十五节；文档仅本地更新，不提交）

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


================================================
十五、2026-10-08 收官：Phase 5 产品化收口（发布就绪审查 + 空态/错误态修复）
================================================


## 1. 发布就绪审查（只读）

- 产出 PHASE5_RELEASE_READINESS_REVIEW.md（未跟踪，不入 Git）。
- 结论：Conditional GO —— 核心价值闭环完整、无死链、无调试残留、新装数据安全；
  发布前小修清单见该文档 §4。
- Free/Paid 边界草案见该文档 §7（仅为草案，未冻结、未实现）。


## 2. 本批次已提交内容

commit：`80cd7a7` fix: improve empty and error states
统计：112 insertions, 13 deletions，仅 5 个源码文件：

- app/ai-activity/page.tsx —— 增加数据加载失败 error state（成功清除、
  失败用户可见、保留 console.error、polling 不变）。
- app/saving/page.tsx —— 无模型消费数据时显示明确 empty state。
- app/page.tsx —— Task Session 两处 catch 不再暴露原始错误信息，
  固定文案 "Unable to load task session state." / "Unable to complete task action."。
- app/usage/details/page.tsx —— 区分"完全没有 usage 数据"（No usage records yet.
  + Import official usage export 入口）与"当前筛选无匹配"（保留原文案）。
- app/budget/page.tsx —— 无 verified cost 时显示 empty state + 导入入口；
  未设置 budget 时提示显示的是 suggested values。


## 3. 验证

- `npx tsc --noEmit` PASS
- `npm run build` PASS（25/25 页面）
- scoped ESLint：本批次涉及的页面 PASS；usage/details 的 1 个
  react-hooks/set-state-in-effect error 已核实为 HEAD 基线既有，非本批次引入。


## 4. 边界与状态

- 无 API / schema / service / repository / Planner 改动；无文档外源码改动。
- 当前工作区无源码修改。
- 未跟踪文件保持本地、不加入 Git：`=`、PHASE5_RELEASE_READINESS_REVIEW.md、
  PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md、PROJECT_PROGRESS_TIMELINE.md、
  PROJECT_WORKING_AGREEMENT.md。
- v1.5.4 release/tag 冻结不变；未 push；未创建新 commit（文档更新仅本地）。


## 5. 下一阶段

Phase 5 后续（按方向文档 §11 收尾清单，等待用户逐项决策）：

1. 免费试用策略落地设计
2. Free / Paid 功能边界冻结
3. MVP 发布准备（发布工程：CHANGELOG 版本条目、PROJECT_STATUS 刷新、
   全量 smoke、打包产物检查）


==================================================
十六、2026-10-08 收官：Commercial 生命周期接入完成 + Planner Advanced 只读边界审查
==================================================


## 1. Commercial 生命周期基础层（已完成，待提交）

90-Day Full Access 商业模式落地，6 个冻结 capability：

planner_advanced、cost_advanced、budget_control、ai_activity_advanced、
productivity_efficiency、planner_historical_efficiency。

新增 3 个文件（lib/schema.ts 仅 +9 行）：

- lib/schema.ts：commercial_state singleton 表，first_use_at 可空。
- lib/repositories/commercial-repository.ts：ensureCommercialStateRow 只建行
  不写 first_use；stampCommercialFirstUse 原子
  `UPDATE … WHERE first_use_at IS NULL`。
- lib/services/commercial-service.ts：startCommercialTrial() 为唯一写入口；
  getCommercialLifecycle() 纯读，first_use_at 为 NULL 时返回 null
  （未开始，不擅自开始试用）；evaluateCommercialCapabilities /
  isCommercialCapabilityAllowed / setCommercialPaid 同步遵循 null 语义。
- scripts/smoke-commercial-lifecycle.mjs：25/25 PASS（含 90 天边界、
  幂等重复 start、生产 DB 快照零变化）。

关键认知（冻结）：

- commercial_state 表存在 ≠ 试用开始（dev 启动时 initDb 会建空表）。
- first_use_at IS NOT NULL 才代表商业生命周期开始。


## 2. Dashboard 首次使用接入（已完成，待提交）

- 新增 app/api/commercial/start/route.ts：POST，runtime=nodejs、
  dynamic=force-dynamic，Server 侧执行 startCommercialTrial()，
  异常返回通用 500 文案（不暴露内部错误）。
- app/page.tsx +6 行独立挂载 effect：fire-and-forget
  `void fetch("/api/commercial/start", { method: "POST" }).catch(() => null)`。
- 排除项确认：不放 layout / instrumentation / initDb / usage import /
  SSR / 后台服务；不接付费判定。

验证（Playwright 真实浏览器实测）：

- 首次打开 Dashboard 写入 first_use_at=2026-10-08T14:03:08.834Z，
  paid=0、paid_at=null、lifecycleState=full_access_trial、
  paidRequiredAt=2027-01-06（恰好 +90×24h）。
- reload 后全部字段逐字节不变；StrictMode 双 POST 幂等（4 次全 200）。
- 21 张业务表计数零漂移。
- tsc PASS、scoped ESLint（2 文件）PASS、git diff --check CLEAN。


## 3. Planner Advanced 边界（结论冻结，service 层已实现待提交）

planner_advanced 不覆盖整个 Planner，只含 2 个生成型 service 函数：

1. generateProjectPlanCombinations()（lib/planner/combination-service.ts）
   ← POST /api/planner/projects/[id]/combinations（多方案组合生成）。
2. generateProjectTaskAiOptions()（lib/services/planner-service.ts）
   ← POST /api/planner/tasks/[id]/ai-options/generate（Task AI Options 生成）。

免费保留（不拦）：项目创建、阶段 CRUD、计划版本创建、任务 CRUD、
AI options 查询/手动创建/select、已生成历史读取、
productivity/M1 报告（属其他 capability）。

技术方案（冻结）：权限检查放 service 层，不放 route 层——两个生成函数是
唯一入口、防未来调用方绕过、route 保持薄壳、免费功能零影响。
拒绝码 PLANNER_ADVANCED_LOCKED → HTTP 402。

smoke 影响：smoke-planner-api 不触达上述 2 个端点，零回归。


## 4. 边界与状态（2026-10-09 更新：commit 前整理完成，待提交）

- 即将提交共 16 个文件：5 个生产源码（lib/schema.ts、lib/services/planner-service.ts、
  lib/planner/combination-service.ts、lib/planner-api-errors.ts、app/page.tsx）、
  4 个新增 commercial 文件（lib/services/commercial-service.ts、
  lib/repositories/commercial-repository.ts、app/api/commercial/start/route.ts、
  scripts/smoke-commercial-lifecycle.mjs）、4 个 smoke-planner-*.mjs、3 份文档
  （HANDOFF.md / PROJECT_DAILY_LOG.md / PROJECT_DIRECTION_AND_DECISIONS.md）。
- smoke 修复（本轮授权）：4 个脚本 initDb 后调用 startCommercialTrial()；
  persistence 重写 API 面断言；combination/evidence 哈希断言改为运行前后实测比较；
  evidence check 同步化（24 passed 与日志一致）。
- 未 commit、未 push；HEAD 仍为 `80cd7a7`。
- v1.5.4 release/tag 冻结不变；未改 package.json；未接付费判定。
- 0 字节垃圾文件 `=` 已删除；PHASE5_RELEASE_READINESS_REVIEW.md、
  PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md、PROJECT_PROGRESS_TIMELINE.md、
  PROJECT_WORKING_AGEMENT.md 保持未跟踪，不入本次提交。


## 5. Planner Advanced service 层接入（已在本批实现，待提交）

已在本批完成的顺序（不提前做 UI、不扩展商业系统）：

1. lib/services/planner-service.ts：generateProjectTaskAiOptions() 增加
   planner_advanced capability 检查。✔
2. lib/planner/combination-service.ts：generateProjectPlanCombinations() 增加同一检查。✔
3. lib/planner-api-errors.ts：PLANNER_ADVANCED_LOCKED → 402 映射。✔
4. tsc --noEmit。✔（全量 PASS）
5. scoped ESLint（本批文件）。✔（0 findings）
6. 调用生成 API 验证 paid/trial 状态；再决定是否加 UI lock
   （可选：commercial/start 加 GET + 两个 UI 按钮锁定态）——仍未开始。

4 个 smoke-planner-* 已恢复全绿（37/40/24/12 passed, 0 failed）。

明确冻结：不改 schema、不改 commercial-service 核心生命周期逻辑、
不改 Planner 数据模型、不改免费 Planner 功能、不删历史数据。


=================================================
十七、2026-10-09 收尾：Planner Advanced UI lock（WIP 完成，浏览器实测停止）
=================================================


## 1. 当前状态（以此节为准）

状态更新（2026-10-10）：本条目下"工作区未提交源码仅 2 个文件（UI WIP）"已过期——现为 4 个（新增 `/costs`、`/usage/import` 错误文案 2 文件）。
后续更新（2026-10-10 提交后）：该 4 个源码文件已全部提交——组1 `ddb4df5`、组2 `6305de6`；现工作区源码修改为 0。
当前实际工作区状态、下一步入口与已知限制以**第十八节**为准。（以下原文保留，仅作 2026-10-09 时点记录。）

- HEAD：`5aefeee` feat: commercial lifecycle + planner_advanced gate + smoke fixes
  （第十六节所述 16 文件批次已随该 commit 落库；本节为之后的 UI WIP 收尾）。
- 工作区未提交源码仅 2 个文件（UI WIP）：
  - app/planner/[projectId]/page.tsx（89 行变更）
  - components/planner/task-ai-options.tsx（29 行变更）
- 4 个未跟踪文档保持原样：PHASE5_RELEASE_READINESS_REVIEW.md、
  PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md、PROJECT_PROGRESS_TIMELINE.md、
  PROJECT_WORKING_AGREEMENT.md。
- 未 commit、未 push、未打 tag。下一步由用户决定是否提交这 2 个 UI 文件。


## 2. UI WIP 范围（仅客户端，零服务端改动）

在服务端返回精确错误码 PLANNER_ADVANCED_LOCKED 时：

- 组合方案卡片（page.tsx）：显示锁定提示，隐藏"Generate combination plans"按钮。
- Task AI options 面板（task-ai-options.tsx）：显示锁定提示，隐藏"Generate AI Options"按钮。

普通错误、网络错误、JSON 解析失败仍走原有错误处理路径（错误行 + Retry），
不显示锁定提示。不改服务端权限逻辑、API、schema、商业生命周期。
锁定判定仅依赖 `data.code === "PLANNER_ADVANCED_LOCKED"`，不按 HTTP 状态码判定。


## 3. 验证证据（如实区分已验证与未验证）

已通过：

- 服务端隔离数据库权限测试 14/14 PASS（%TEMP% 一次性脚本）：
  - full_access_trial 下两个生成服务均放行；
  - paid_required（仅在隔离库回拨 first_use_at 91 天构造）下两服务均抛
    PLANNER_ADVANCED_LOCKED；
  - plannerErrorStatus("PLANNER_ADVANCED_LOCKED") = 402；
  - 普通错误映射不变（NOT_FOUND=404、CONFLICT=409、其余=400）。
- TypeScript（npx tsc --noEmit）PASS。
- scoped ESLint（仅两个 UI 文件）PASS。
- git diff --check CLEAN。
- 静态 diff 只读审查：无阻塞问题（锁定分支仅依赖精确错误码、
  普通错误路径保留、finally 复位 loading、无 lifecycle 启动调用、
  无客户端 90 天计算、无服务层权限修改）。

未完成（明确停止，非遗漏）：

- 浏览器端交互实测未完成。多次尝试受阻：
  1) 隔离临时目录启动 Next.js：Turbopack 因 node_modules junction 报 panic；
     改 webpack 后 lib/db.ts 的 node:fs 导入报 UnhandledSchemeError。
  2) 真实项目根目录启动（端口 3000）：首页返回 HTTP 200，服务器可服务页面，
     但 Playwright route-interception 交互验证未执行即按指令收尾。
- HTTP 200 只证明服务器可响应首页，不等于锁定/错误/成功三种 UI 交互已验证。
- 已决定停止浏览器测试，不再重试、不再投入环境排查——基于验证收益与
  时间成本的明确决定，不是待办遗漏。服务端契约已由 14/14 隔离测试覆盖，
  UI 锁定分支已由静态审查覆盖；浏览器实测的边际收益被判定为不值得继续投入。


## 4. 数据库安全结论（前后快照实测比较）

本轮从真实项目根目录启动过 next dev（页面加载会只读打开真实开发库）。前后
SHA-256 比较六个文件（data/ 与 %APPDATA% 各三件套）：

- data/ai-token-cost-monitor.db：SHA-256 与 mtime 均未变。
- data/ai-token-cost-monitor.db-wal：SHA-256 与 mtime 均未变。
- data/ai-token-cost-monitor.db-shm：SHA-256 变化、mtime 变化（大小未变）。
  原因：WAL 模式下打开连接会触碰共享内存文件；主库与 WAL 内容哈希未变，
  说明无业务数据写入。未做任何恢复操作。
- %APPDATA%\AI-Cost-Management\data\ 三个文件：全部 SHA-256 与 mtime 均未变。

结论：真实业务数据（.db 与 -wal 内容）未被修改；仅开发库的 -shm 侧文件被
连接打开触碰，属 WAL 正常副作用。


## 5. 下一步（简短明确）

1. 依据上述数据库核对结果完成收尾（本节即收尾记录）。
2. 如无异常，等待用户决定是否提交两个 UI 文件。
3. 不重新安排浏览器测试，不重新安排全量回归。


## 6. 保留的既定原则

- 范围最小化：只做锁定 UI，不扩展商业系统。
- 测试以实际价值为准：服务端已充分验证后，浏览器实测边际收益不足即停止。
- 不为形式重复验证：已通过的 tsc / ESLint / diff --check / 隔离权限测试不重跑。
- 不修改真实数据库作为测试手段：paid_required 构造只在隔离临时库进行。
- 不自行 commit / push / 打 tag。


=================================================
十八、2026-10-10 状态：Phase 5 只读核对 + §4-3 错误文案本地完成（当前以此节为准）
=================================================


## 0. 状态更新（2026-10-10 提交后；覆盖 §1、§2、§6 第 1 项的"未提交"表述）

- 组1 §4-3 错误文案：**已提交** `ddb4df5` fix: improve cost and import error messaging
  （app/costs/page.tsx、app/usage/import/page.tsx，2 文件 20+/8-）。
- 组2 Planner Advanced UI lock：**已提交** `6305de6` feat: add planner advanced lock UI
  （app/planner/[projectId]/page.tsx、components/planner/task-ai-options.tsx，2 文件 89+/29-；
  暂存核验仅含这 2 个文件，无未跟踪文件、无文档夹带）。
- HEAD：`6305de6`；origin/master=`c1ce06f`，本地 ahead 9；未 push、未打 tag。
- 工作区已跟踪未提交：**仅组3 三份文档**（本文件、PROJECT_DAILY_LOG.md、
  PROJECT_DIRECTION_AND_DECISIONS.md）。
- §1（HEAD `5aefeee`、"源码 4"）、§2（"本地完成，未提交"）、§6 第 1 项为提交前时点记录，
  已被本块取代；原文保留。
- 未跟踪 4 项不变、不入 Git；冻结文件（package.json、docs/CHANGELOG.md、
  docs/PROJECT_STATUS.md、RELEASE_NOTES.md、release/、v1.5.4 tag）不变。


## 1. 当前工作区状态（HEAD `5aefeee`，未 push、未打新 tag）

（提交前时点记录，已由 §0 取代。）

- HEAD：`5aefeee`；origin/master 停在 `c1ce06f`，本地 ahead 7。
- 已跟踪未提交 7 项：
  - 源码 4：app/costs/page.tsx、app/usage/import/page.tsx（本节 §2 的 §4-3 修改）；
    app/planner/[projectId]/page.tsx、components/planner/task-ai-options.tsx（UI lock WIP，见第十七节）。
  - 文档 3：本文件、PROJECT_DAILY_LOG.md、PROJECT_DIRECTION_AND_DECISIONS.md。
- 未跟踪 4 项保持原样、不入 Git：PHASE5_RELEASE_READINESS_REVIEW.md、
  PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md、PROJECT_PROGRESS_TIMELINE.md、
  PROJECT_WORKING_AGREEMENT.md。
- 冻结文件全部未动：package.json、docs/CHANGELOG.md、docs/PROJECT_STATUS.md、
  RELEASE_NOTES.md、release/、v1.5.4 tag、lib/services/productivity-service.ts。


## 2. §4-3 错误文案收敛（本地完成，未提交）

（已提交 `ddb4df5`，见 §0；以下为提交前记录。）

- 修改文件仅 2 个：app/costs/page.tsx、app/usage/import/page.tsx。
- 内容：两页用户可见错误不再直通 API 原始错误文本，改为固定文案
  （"Unable to load cost data. Please try again." / "Could not read this ZIP file. Please try again." /
  "Import did not complete. Please try again."），原始错误保留 console.error（沿用
  80cd7a7 在 app/page.tsx 建立的模式）。加载、成功、失败、重试、导入行为与
  API/业务语义零变化；无新依赖、无新日志框架。
- 该轮验证（已完成，不重复执行）：
  - `npx tsc --noEmit` PASS；
  - scoped ESLint（仅 2 文件）：usage/import 0 findings；costs 的 1 error + 1 warning
    经 `git show HEAD:… | eslint --stdin` 同名对照证实为 HEAD 既有基线（同规则同代码，
    仅行号位移），本批次 0 新增 findings，按约定不顺手修复；
  - `git diff --check` PASS；改动范围核对通过（仅这 2 个源码文件）。
- 状态：**已实现、未提交**，不得称为已发布或已提交。


## 3. 已知限制（记录，不处理）

- /costs 与 /connect **保持无入口状态**：全仓入链 grep 0 命中，本轮按指令不新增入口，
  作为已知限制记录（PHASE5_RELEASE_READINESS_REVIEW.md §11 已同步登记）。
- 其余既有已知限制（lint 435 基线、安装包未签名、/connect 流程未完成、无 Settings/根 404 等）
  见 PHASE5 §5/§6，维持不变。


## 4. 浏览器交互测试（明确停止，不得重新安排）

- UI lock 三态浏览器交互实测已于 2026-10-09 明确决定停止（第十七节 §3），本轮维持：
  **不重新安排、不重试、不投入环境排查**。服务端契约由 14/14 隔离测试覆盖，
  UI 锁定分支由静态 diff 审查覆盖。


## 5. 本轮工作方式与验证

- 本轮为只读事实核对 + 本地文档同步（PHASE5、DIRECTION、本文件、DAILY_LOG 四份）。
- 未运行 tsc / ESLint / smoke / build / 打包 / 浏览器测试；未访问数据库；
  未 git add / commit / push / tag；未修改任何源码、冻结文件与未跟踪设计文档。
- 只读核对发现的矛盾（PHASE5 §9 "6 项已全部修复"不实、表头 HEAD 过期、
  DIRECTION 版本描述过期、PROJECT_STATUS 停 1.5.1、冻结规则与发布工程清单冲突）
  已在四份文档中如实更正或标注；无法安全修正的（冻结规则冲突）保留原文并上报用户。


## 6. 下一步入口（等待用户授权，均未开始）

1. 决定 4 个源码修改 + 3 份文档修改的提交/拆分方式（本轮不提交）。
   （更新：组1 `ddb4df5`、组2 `6305de6` 已提交；余组3 3 份文档待决定，见 §0。）
2. §4-4 孤儿页处置确认（当前按"维持无入口 + 已知限制"执行）。
3. §4-6 发布工程：修改 package.json / docs/CHANGELOG.md / docs/PROJECT_STATUS.md /
   RELEASE_NOTES.md **均尚无授权**；版本号未决定，不推测。
4. 发布验收（全量 smoke + 打包产物检查）留待上述完成后执行，本轮未做。
5. Phase 5 后续（免费试用策略设计、Free/Paid 边界冻结）仍等待逐项决策。
