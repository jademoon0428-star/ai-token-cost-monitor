# AI Cost Management - HANDOFF

更新时间：

2026-10-11（第十七更新：v1.5.5 正式发布完成——commit `40a0996`、tag `v1.5.5`、已 push、GitHub Release 已创建；正式产物四件套落库 release 目录；安装验收与人工测试 PASS；进入发布后运营准备阶段；见第十九节）

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


---


## 收工状态更新（2026-10-10 晚间；取代 §0 的 `6305de6` 时点与 §6 中已过期表述，原文保留）

### 当前工作区

- HEAD：`def18c2`（组3 文档同步已提交）；origin/master=`c1ce06f`，ahead 10；
  未 push、未打 tag、未新增 tag。
- 已跟踪未提交（恰好 5 个）：RELEASE_NOTES.md、docs/CHANGELOG.md、
  docs/PROJECT_STATUS.md、package.json（均 1.5.5 版本文件，Batch 1），
  desktop/installer/package.ddf（1737 → 1817 条，Batch 3C 再生成）。
- 未跟踪：原 4 个管理/设计文档不变；新增 `scripts/generate-package-ddf.mjs`
  （Batch 3C 产物，待 finalize 决定是否入库）。
- `git diff --check` exit 0。

### 本日完成（Batch 1 → 4A）

1. Batch 1：版本身份 1.5.5 四文件同步（CHANGELOG/RELEASE_NOTES/PROJECT_STATUS/package.json）。
2. Batch 2：17 项发布门禁 16 PASS / 1 FAIL（smoke:deepseek）；`package:desktop` 成功。
3. Batch 3A–3B：deepseek 与打包流程只读复核；ddf 陈旧性证实（旧快照缺 80 文件）。
4. Batch 3C–3D：DDF 生成器建立与加固（`--check` 门禁、15 项临时目录断言全过、
   真实 ddf 再生成 SHA256 稳定）。
5. Batch 3E：makecab 临时试制通过——1817 条目与 DDF 双向一致、无禁运文件、
   v1.5.4 正式资产零触碰。
6. Batch 4A：smoke:deepseek 只读根因确认（既有 DeepSeek provider 唯一约束冲突；
   脚本无事务、存在部分夹具残留结构性风险）。
7. 收工：约定五文档（WORKING_AGREEMENT §16 / DIRECTION / TIMELINE / DAILY_LOG /
   本文件）按各自职责更新，协作规则改进归档 §16。

### 明确未做 / 暂停中

- 未授权：deepseek 方案 B 实施（仅推荐）、正式发布打包、Setup 编译、
  正式 v1.5.5 产物生成、git commit/tag/push、ddf/生成器入库提交。
- 未运行任何 smoke 重跑、构建或正式 makecab 链路；未读写任何数据库。
- CAB 试制产物仅存 `Temp\opencode\cab-trial-1.5.5`，未进入 release/。

### 下一步入口（等待用户授权）

1. deepseek 修复方案选择：A（隔离库）/ **B（幂等化+事务，推荐）** / C（记录保留）。
2. 正式发布链授权：生成器跑正式 ddf → makecab → csc bootstrapper → README.txt →
   SHA256SUMS.txt → `release/AI-Cost-Management-v1.5.5/` → RELEASE_NOTES SHA 回填。
3. finalize 提交范围决定（建议：4 个版本文件 + ddf + 生成器一并入库）。
4. tag/push 时点决定。


---


## 收工状态更新 2（2026-10-10 深夜；取代前一收工块中的 deepseek 待决、smoke 未重跑与工作区条目，原文保留）

### 当前工作区

- HEAD：`def18c2`；origin/master=`c1ce06f`，ahead 10；未 push、未打 tag。
- 已跟踪未提交（9 个）：Batch 1 四个版本文件（RELEASE_NOTES / CHANGELOG /
  PROJECT_STATUS / package.json）、Batch 3C 的 package.ddf、Batch 4B–4D 的
  `scripts/deepseek-db-smoke-test.mjs`、以及本收工批次更新的 HANDOFF /
  PROJECT_DAILY_LOG / PROJECT_DIRECTION_AND_DECISIONS。
- 未跟踪：原 4 个管理/设计文档 + `scripts/generate-package-ddf.mjs` 不变。
- `git diff --check` exit 0。

### 本日追加完成（Batch 4B → 4G）

1. Batch 4B–4D：deepseek 修复按方案 B 思路实施并加固——provider/model 幂等复用、
   fixture 显式身份校验、四写入单事务；默认使用 mkdtemp 隔离临时数据库（成功后清理、
   失败保留诊断库并打印绝对路径、参数非法显式失败、**无任何回退真实开发库的路径**）；
   隔离验证 22/22 PASS。
2. Batch 4E：`npm run smoke:deepseek` 单跑 PASS；真实库 db/wal/shm 指纹与内容不变。
3. Batch 4F：完整 17 项 Release Smoke 门禁 **17/17 PASS**；真实库三件套前后一致；
   13 个其他 smoke 按仓库约定各遗留 1 个临时目录（未清理，未经授权不得清理）。
4. Batch 4G：五管理文档（HANDOFF / DAILY_LOG / DIRECTION / RELEASE_NOTES /
   PROJECT_STATUS）一致性收口。

### 明确未做（不变）

- Smoke 全绿 ≠ 发布完成：正式打包（ddf 正式再生成、makecab、Setup 编译）、
  安装/安装测试、正式产物与 SHA256、commit/tag/push 均未执行、待授权。
- CAB 试制产物仍在 `Temp\opencode\cab-trial-1.5.5`；release/ 无 v1.5.5 目录。

### 下一步入口（等待用户授权）

1. 正式发布链授权（同前一收工块第 2 条，内容未变）。
2. finalize 提交范围决定（同前第 3 条；建议追加 deepseek 脚本与生成器一并入库）。
3. tag/push 时点决定（同前第 4 条）。


---


## 收工状态更新 3（2026-10-10 日终收尾；汇总 4B–4I 实况并取代前两块中的过期细节，历史保留）

**用户决定：Batch 4I 之后当日到此为止，仅收尾文档；正式发布链未获授权，未执行任何发布步骤。**

### 当日完成总览（Batch 4B → 4I，均有证据）

1. **4B–4D deepseek 修复**：`scripts/deepseek-db-smoke-test.mjs` 单文件修复——provider/model
   按 id 幂等复用（冲突显式报错、引用占用方 id、不改既有数据）；fixture 全量身份校验
   （source/accuracy/token/成本，不符即显式失败）；孤立 cost 显式失败；四写入单事务
   （触发器注入中途失败验证完整回滚）。默认隔离：无参即在系统临时目录 mkdtemp 全新库运行，
   成功清理、失败保留诊断库并打印绝对路径；仅显式 `--db <path>` 使用指定库；
   非法/缺值/未知/多余参数一律显式失败，**不存在回退开发库的路径**。
   隔离驱动 22/22 PASS；期间修复过一处校验语义 bug（input_tokens 存原始值）并如实披露。
2. **4E 门禁单跑**：`npm run smoke:deepseek` PASS（cost 507400 与期望一致）。
3. **4F 完整门禁**：17 项（14 npm + 3 直跑 declarations/registry-baseline/commercial-lifecycle）
   **17/17 PASS**，无失败/重试/中断；`smoke-planner-stages.mjs` 为补充项不计入。
4. **4G 五文档一致性收口**：HANDOFF/DAILY_LOG/DIRECTION/RELEASE_NOTES/PROJECT_STATUS
   按实况修正，历史保留。
5. **4H 发布链只读风险审查**：无 P0；三项 P1 程序性风险——①必须先 package:desktop 再生成
   并 `--check` ddf（BUILD_ID 联动）；②Setup/README/SHA256SUMS 为手动步骤需按 v1.5.4
   格式严格执行；③失败产物清理须谨慎、不得擅自删除。打包三层禁运防线（包脚本、ddf 生成器、
   3E 试制 tar 实证）核实；打包链从不读真实数据库。
6. **4I 前置条件复核**：版本 1.5.5；makecab=`C:\Windows\system32\makecab.exe`、
   csc=`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` 均在；
   `release\AI-Cost-Management-v1.5.5\` **不存在**（4J 收尾时复核仍不存在）；
   v1.5.4 四件套命名逐字符确认；S1–S9 最终命令清单与授权边界已交付（见 DIRECTION 收尾补充）。

### 真实数据库保护（当日多次护航，一致结论）

- 4E/4F 全程 db+wal+shm hash+size+mtime 前后不变；integrity ok；
  providers=4、DeepSeek provider=1/models=5、official_export usage/cost=25/25、fixture=0/0。
- 本次修复只改测试脚本，**未修改任何真实业务数据**。

### 当前工作区

- HEAD `def18c2`；ahead 10 未 push；无新 tag。
- 已跟踪未提交 9 个：四个 1.5.5 版本文件、package.ddf（1817 条，
  试制时哈希 `DE44106B…B9A0F`）、deepseek 脚本、本日更新的三份管理文档。
- 未跟踪 5 个：四份管理/设计文档（未动）+ `scripts/generate-package-ddf.mjs`。
- 遗留临时产物（未清理、无授权不得清理）：`Temp\opencode\cab-trial-1.5.5`（试制 CAB，
  **非正式发布产物**）；%TEMP% 下 13 个 smoke 约定临时目录。

### 明确未做（当日结束时点）

- 正式发布链 S1–S9 全部未执行：package:desktop 重跑、正式 ddf 再生成/`--check`、
  正式 makecab、Setup 编译、README.txt、SHA256SUMS.txt、RELEASE_NOTES SHA 回填、
  release 目录创建、finalize commit、tag、push。
- 发布策略（**全干净链**〔推荐〕 vs 复用现存 `.desktop-package`）未选定。

### 下次会话恢复入口

1. 阅读 DIRECTION「2026-10-10 发布工程决策记录」+ 其深夜/收尾补充（决策全貌）。
2. 决策点一：发布策略选择（全干净链 vs 复用包）。
3. 决策点二：正式发布链 S1–S9 授权（命令清单在 4I 报告/收尾补充中，逐项含验证与失败停止条件）。
4. 决策点三：finalize 提交范围与 tag/push 时点。
5. 勿重新调查：deepseek 根因/修复、ddf 生成器行为、打包禁运防线均已闭环（本块 + 4G 块 + DAILY_LOG 对应批次）。


=================================================
十九、2026-10-11 v1.5.5 正式发布完成（当前以此节为准）
=================================================

（取代第十八节"下一步入口"中的决策点一/二/三——均已完成。历史原文保留。）


## 1. 发布事实（Git 与产物）

- commit：`40a0996` release: prepare AI Cost Management v1.5.5
- tag：`v1.5.5`（指向 `40a0996`）
- 已 push：GitHub `master`（本地与 origin 同步）
- GitHub Release：已创建完成
- 正式发布产物：`release\AI-Cost-Management-v1.5.5\`（四件套）
  - AI-Cost-Management-Setup.exe（7,168 字节）
  - AI-Cost-Management-Payload.cab（32,503,105 字节）
  - README.txt
  - SHA256SUMS.txt（CAB / Setup / README 三行，大写 SHA256 + 两空格 + 文件名）
- Installer SHA256（Setup.exe）：`C8403A4D9276D2636D3EF1844865D5404F8DFB3B3DA24AE2102FA705C5F128EF`
  （已回填 RELEASE_NOTES.md v1.5.5 节末）
- 发布相关文件（4 个版本文件、package.ddf、生成器脚本、deepseek 脚本、管理文档）
  已随 `40a0996` 入库；工作区仅余 4 个未跟踪管理/设计文档。


## 2. 正式发布链 S1–S9（全部完成，均有 exit code 证据）

1. S1 `npm run package:desktop`：exit 0，Package verified 成功（`data/` 未入包），
   构建 BUILD_ID = `lnVtZ1FuHRMtX-YGjTnWQ`。
2. S2 正式 ddf 再生成：exit 0，1817 条；S3 `--check`：exit 0，
   BUILD_ID 与当前包一致（非 Batch 2 旧快照）。
3. S4 正式 makecab（于 release 目录内）：exit 0，Payload.cab 32,503,105 字节。
4. S5 csc 编译 Setup：exit 0，Setup.exe 7,168 字节。
5. S6 README.txt（按 v1.5.4 格式，未夸大、未写已发布/tag）、
   S7 SHA256SUMS.txt（首次行尾格式有误，已立即修正为逐行）。
6. S8 RELEASE_NOTES 追加 Installer SHA256（仅改该文件；当时按指令未写已发布/tag/已下载
   表述，发布状态于同日文档同步中按事实更新）。
7. S9 删除 makecablog.txt / setup.inf，发布目录仅存四件套。


## 3. 安装验收（Batch 4L）+ 人工测试

- Setup 安装成功 → `%LOCALAPPDATA%\AI-Cost-Management\App`。
- 安装内容核验：version `1.5.5`、BUILD_ID `lnVtZ1FuHRMtX-YGjTnWQ`（与 S1 构建一致）。
- Launcher 启动成功；本地服务 `127.0.0.1` 监听正常，进程运行中。
- 核心页面 HTTP 200 且无错误模式：Dashboard `/`、Usage `/usage`、Planner `/planner`、
  Budget `/budget`、AI Activity `/ai-activity`。
- SQLite 数据目录正常：`%APPDATA%\AI-Cost-Management\data` 三件套存在、连接已建立。
- 发布版本人工测试：已完成，全部 PASS。
- 按指令未卸载，安装结果保留。


## 4. 当前阶段：发布后运营准备阶段

v1.5.5 已发布，项目进入「发布后运营准备阶段」。

下一步重点（下次会话入口）：

1. 产品官网建设规划 + 上线推广准备。
2. 创建产品介绍页面。
3. 准备用户获取渠道。
4. 收集真实用户反馈。

明确不提前进入：

- 自动优化引擎（个性化 AI 方案优化引擎）开发
- Subscription Cost Model 开发
- 大规模功能扩展


## 5. 长期方向记录（只记录，当前不实现）

1. **个性化 AI 方案优化引擎**：依据本机使用历史、模型选择、Token 消耗、任务类型、
   成本变化、时间效率，逐步优化模型组合推荐、免费/付费模型替代建议、AI 使用效率分析。
   v1.5.5 不实现——优先完成产品上线与真实用户验证。
2. **Subscription Cost Model**：当前覆盖 API Token 成本、模型调用成本、本地检测与分析；
   暂未完整支持 ChatGPT Plus / Claude Pro / Gemini Advanced / GitHub Copilot 等包月订阅。
   未来考虑：手动录入订阅、月度 AI 固定成本、与 API 成本合并分析、真实 AI 总投入。
   当前不进入 v1.5.5 收尾。
3. **商业与推广**：GitHub Release 只是技术发布渠道；用户增长需要官网、产品介绍文章、
   AI 社区发布、开发者社区推广、软件目录提交、内容营销。大型 AI 模型推荐目前不可依赖
   （ChatGPT/Codex/Gemini 不会自动知道新软件），需要官方网站、搜索索引、用户评价、
   外部文章、社区曝光。

详版记录见 PROJECT_DIRECTION_AND_DECISIONS.md 新增节（2026-10-11）。


## 6. 边界与不变（本轮文档同步）

- 本轮仅更新五份文档（本文件 / DAILY_LOG / DIRECTION / RELEASE_NOTES / docs/PROJECT_STATUS），
  未改源码、未运行 npm/build/smoke/test、未执行任何 git 操作、未新增其他文档。
- 已知限制不变：lint 435 基线、/costs 与 /connect 无入口、安装包未签名、
  /connect 流程未完成、无 Settings/根 404；%TEMP% 13 个 smoke 临时目录未清理。
- 已闭环勿重查：deepseek 根因/修复、ddf 生成器行为、打包禁运防线、发布链 P1 三项。
- 浏览器交互测试停止决定维持；不重新安排。


## 收工状态更新（2026-10-12：官网 MVP 完成；补充第十九节 §4 下一步重点第 1 项实况，历史保留）

### 当前工作区

- HEAD 仍为 `40a0996`（tag `v1.5.5`）；未 commit、未 push、未部署、未打新 tag。
- 既有 5 M 未变：HANDOFF.md、PROJECT_DAILY_LOG.md、PROJECT_DIRECTION_AND_DECISIONS.md、
  RELEASE_NOTES.md、docs/PROJECT_STATUS.md（含此前未提交的修改，原样保留）。
- 既有 4 个未跟踪文档不变；新增未跟踪 `website/`（index.html、styles.css）。
- 工作区**不干净**：既有未提交修改 + 未跟踪文件仍在；未执行任何清理。

### 本日完成（官网 MVP，独立静态页面）

- `website/index.html` + `website/styles.css`：英文静态单页（产品介绍 / 核心功能 /
  隐私与网络说明 / 下载 / FAQ 8 项）。系统字体 + 静态 CSS，主体内容不依赖 JavaScript；
  未新增 npm 依赖、脚本、外部字体/CDN、分析工具、第三方图片。
- Hero 为明确标注的 UI schematic（非伪造截图、非真实用户消费数据）。
- 链接指向已核实的 GitHub 仓库、v1.5.5 Release 与安装程序：
  - 下载地址：`https://github.com/jademoon0428-star/ai-token-cost-monitor/releases/download/v1.5.5/AI-Cost-Management-Setup.exe`
  - Setup.exe SHA256：`C8403A4D9276D2636D3EF1844865D5404F8DFB3B3DA24AE2102FA705C5F128EF`
- 官网工作不是产品功能更新、不是新版本发布；未改产品源码、数据库与发布资产。
- 本轮收尾仅更新 5 份授权文档，其中 RELEASE_NOTES.md 保留原状（官网不写入产品发布说明）。

### 验证证据（当日执行输出）

- 静态：误导话术扫描无肯定式夸大；外部资源 0（无 script/CDN/外部字体/分析）。
- 完整性：`meta description` 1、`og:description` 1、`h1` 1；指定 6 项旧文案全部未命中；
  新旧文案无并存；HTML 标签配对无异常；12 个 id 无重复。
- Playwright 360px + 1280px 共 **24/24 PASS**：外部请求列表为空、无页面错误、无水平溢出、
  单一 h1、样式表加载正常、FAQ 8 项、键盘可用、下载地址与 SHA-256 显示正确。
- 边界：外部请求为空仅指该页面，**不代表产品完全不联网**；未做浏览器 → GitHub
  下载端到端测试，**不声称下载流程端到端成功**。

### 下次启动必须先读（按顺序）

1. PROJECT_WORKING_AGREEMENT.md（协作与 git 纪律）
2. PROJECT_DIRECTION_AND_DECISIONS.md（§16 阶段 + §17 当日方向 / 宣传边界 / 协作规则）
3. HANDOFF.md 本收工块（与第十九节历史并读，本块为最新状态）
4. PROJECT_DAILY_LOG.md 2026-10-12
5. docs/PROJECT_STATUS.md（Post-release website work 节）

### 下次从实际剩余收尾事项继续（等待用户授权）

1. 官网后续：真实产品截图（干净测试数据）替换 schematic、托管上线决策（GitHub Pages
   等，未定）、浏览器 → GitHub 下载端到端验证（需 github.com 可达环境）。
2. 产品侧既有已知限制不变：lint 435 基线、/costs 与 /connect 无入口、安装包未签名、
   /connect 流程未完成、无 Settings/根 404、%TEMP% 13 个 smoke 临时目录未清理。
3. 明确不提前进入：个性化 AI 优化引擎、反馈闭环、更广泛的资源推荐改进、
   Subscription Cost Model、大规模功能扩展。

### 本轮边界

- 仅改 5 份授权文档（HANDOFF / DAILY_LOG / DIRECTION / docs/PROJECT_STATUS 更新，
  RELEASE_NOTES 保留原状）；未改 website/ 与其他任何文件；未跑 npm/build/smoke/test；
  收尾阶段未重跑已通过的 Playwright；未执行任何 git 写操作；未部署。


---

## 收工状态更新（2026-10-13：官网上线完成 + v1.5.5 发布阶段收口；接续 2026-10-12 收工块）

### 1. 官网发布完成

- GitHub Pages 已上线可访问：
  **https://jademoon0428-star.github.io/ai-token-cost-monitor/**
- 部署方式：**gh-pages 分支**，根目录部署 `index.html` + `styles.css`
  （Pages source = gh-pages / root）；**master 未因此修改**，规范来源仍是
  master 的 `website/`。
- 验收结果（只读验证）：**PASS**
  - 首页 HTTP 200；`styles.css` HTTP 200（text/css，相对路径，内容与本地一致；
    0 个 src 资源、0 外部资源、无 404）。
  - 下载链接指向 v1.5.5 Release：Setup.exe 直链 HEAD 200、Release 页 200。
  - FAQ 8 项 / 隐私说明 / 产品介绍渲染正常，单一 h1。
  - 宣传边界检查通过：无"实时监控所有 AI / 自动阻止费用 / 未实现平台支持 /
    自动推荐最佳模型省钱"声称；唯一 "real-time monitor" 命中为 FAQ 问句、
    答案为 No（否定式披露，合规）。
- 未做：浏览器点击 → 完整下载 → SHA256 复核的端到端测试（与页面披露口径一致，
  不声称）。

### 2. Git 信息

- 官网页面 commit（master）：`4418e48` docs: add official website static page
  （仅 website/index.html + website/styles.css，2 files / 705 insertions）。
- gh-pages publish commits：`f00057a` docs: publish website、
  `c196f97` docs: remove website subdirectory from gh-pages publish tree；
  均已 push（origin/gh-pages 同步）。
- master：HEAD `4418e48`，领先 origin/master 1 个提交（**未 push，等待授权**）。
- 分支切换期间管理文档经 stash 暂存（"temp before gh-pages publish"），
  本日已恢复（checkout master → stash pop）：工作区基线 5 M + 4 个未跟踪文档
  完整不变；gh-pages 根目录残留的 index.html/styles.css 已随 checkout 清理。

### 3. 本轮文档更新范围

- 仅更新 HANDOFF.md、PROJECT_DAILY_LOG.md、docs/PROJECT_STATUS.md 三份；
  **RELEASE_NOTES.md 按约定保留原状**（官网不写入产品发布说明）。
- 未改源码、package.json、release/ 文件；未 commit（等待用户检查 diff）。

### 4. 后续规划备注

- **官网动画演示属于 post-v1.5.5 官网增强，不纳入当前版本。**
- **暂不扩展 SaaS、账号系统、企业功能等范围。**
- 官网内容维护项：版本发布后需同步页面中的版本号 / 文件大小 / SHA256；
  双分支同步约定（master `website/` → gh-pages 根目录）。
- 下一步（等待用户决定）：本轮 3 份文档 diff 检查与提交授权；master push 授权。


---

## 2026-10-13 v1.5.5 Release Closeout Final Status

### 1. v1.5.5 已完成发布闭环

- 发布事实：commit `40a0996`、tag `v1.5.5`、已 push、GitHub Release 已创建；
  正式产物四件套在 `release\AI-Cost-Management-v1.5.5\`；Installer SHA256
  `C8403A4D9276D2636D3EF1844865D5404F8DFB3B3DA24AE2102FA705C5F128EF`
  已回填 RELEASE_NOTES。
- 17/17 发布门禁、安装验收、发布版人工测试全部 PASS。
- 官网（发布收尾最后一项）已上线并验收通过：
  https://jademoon0428-star.github.io/ai-token-cost-monitor/
  **v1.5.5 阶段正式关闭。**

  官网验收 PASS 明细（只读验证，2026-10-13）：

  - 首页 HTTP 200
  - styles.css HTTP 200，CSS 正常加载
  - 无 404 资源（0 个 src 资源、0 外部 CDN/字体/图片）
  - 下载链接指向 v1.5.5 Release（Setup.exe 直链 HEAD 200）
  - Release 页面可访问（200）
  - FAQ 8 项正常
  - 隐私说明正常
  - 产品介绍正常
  - 宣传边界检查通过：**没有声称**「实时监控所有 AI」「自动阻止费用」
    「支持未实现平台」「自动推荐最佳模型省钱」
    （唯一 "real-time monitor" 命中为 FAQ 问句，答案为 No）

  发布阶段关闭清单（v1.5.5 已完成）：

  1. Release（commit `40a0996` + tag `v1.5.5` + push）
  2. 安装包（`release\AI-Cost-Management-v1.5.5\` 四件套 + SHA256 回填）
  3. GitHub Release（已创建；安装验收与人工测试 PASS）
  4. 官网发布（GitHub Pages 上线，gh-pages 分支根目录部署）
  5. 官网验收（PASS，见上）
  6. 文档收口（五文档今日同步）

### 2. 当前 master / gh-pages 状态

- master：HEAD `5a5c4ad`（docs: close out v1.5.5 website launch），
  **与 origin/master 同步**；其上为 `4418e48`（官网页面入库）、
  `40a0996`（v1.5.5 发布）。
- gh-pages：HEAD `c196f97`（docs: remove website subdirectory from
  gh-pages publish tree），**与 origin/gh-pages 同步**，仍指向最新官网发布内容
  （根目录仅 index.html + styles.css），GitHub Pages 正常提供服务。
- 官网规范来源：master 的 `website/`；内容更新需双分支同步
  （master `website/` → gh-pages 根目录）。

### 3. 保留的未提交文档（不要处理）

- 已跟踪未提交 2 项（保持 modified，本轮不处理）：
  `PROJECT_DIRECTION_AND_DECISIONS.md`、`RELEASE_NOTES.md`
  （均为历史收尾修改，是否提交由用户另行决定）。
- 未跟踪 4 项（保持不入 Git，不要处理）：
  `PHASE5_RELEASE_READINESS_REVIEW.md`、`PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md`、
  `PROJECT_PROGRESS_TIMELINE.md`、`PROJECT_WORKING_AGREEMENT.md`。

### 4. 下一阶段方向

1. **用户验证** —— 收集真实用户反馈，作为后续一切决策依据。
2. **官网增强（动画演示）** —— post-v1.5.5 官网增强项，独立于产品版本排期。
3. **不启动 SaaS / 账号系统 / 企业范围扩展** —— 维持 local-first、单机单用户定位。
4. **等真实反馈后再评估优化引擎** —— 个性化 AI 方案优化引擎在获得真实用户验证前
   不启动；Subscription Cost Model 同样维持暂缓。
5. 已知限制维持原状（lint 435 基线、/costs 与 /connect 无入口、安装包未签名、
   %TEMP% 13 个 smoke 临时目录未清理等），不顺手修复。
