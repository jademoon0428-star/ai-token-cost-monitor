# PROJECT_DIRECTION_AND_DECISIONS

项目长期方向与已确认决策的基准文档。
事实依据：项目代码结构、`README.md`、`docs/ARCHITECTURE.md`、`docs/PROJECT_STATUS.md`、`docs/CHANGELOG.md`、git 历史（2026-10-10 核对：HEAD `5aefeee`，同日后续提交至 `6305de6`——组1 `ddb4df5`、组2 `6305de6`，`package.json` 版本 `1.5.4`），以及 2026-10-01 的 Planner 架构只读复核。（原表述"截至 `a2fde32`、版本 `1.5.3`"为更早时点记录，已过期。）

阅读约定：

- 标注「已实现」的内容以代码为准。
- 标注「方向 / 未实现」的内容是已确认的决策，不是当前能力，不得当作已交付事实使用。
- 方向与实现不一致时，差异本身必须显式记录，不允许默认"已经有了"。

---

# 项目名称

AI Cost Management / ai-token-cost-monitor

---

# 1. 产品总体定位

**AI Cost Management 不只是 AI 成本统计工具。**

消费统计只是起点：它证明了"钱花在哪里"，但不能告诉用户"接下来该怎么花"。

核心定位：

**帮助用户自动发现 AI 使用情况、控制 AI 支出，并通过 AI Project Planner 为复杂项目选择最合适的 AI 组合方案。**

产品价值：

**降低 AI 使用成本，提高项目完成效率。**

长期目标：成为用户管理 AI 成本、选择 AI 工具、优化 AI 工作流程的平台。

具体化为三个能力的结合体：

1. **AI 成本管理** — 成本、Token、模型、时间维度的准确记录与预算约束。
2. **AI 使用效率优化** — 哪些使用是浪费，哪些方式更划算。
3. **AI 项目规划系统** — 面向一个具体项目，给出"用哪些 AI、按什么顺序、花多少"的执行方案。

价值阶梯（已确认的升级顺序）：

1. 记录过去：花了多少（成本统计，已完成）
2. 解释过去：为什么花这么多、花在哪（Saving / Efficiency，已完成）
3. 规划未来：这个项目该用哪些 AI、按什么顺序、预计花多少（Planner，进行中）
4. 验证结果：实际是否更省、是否更快（需打通 plan → actual 回路，未实现）

---

# 2. 产品核心功能方向

## 第一部分：AI 使用监控与成本管理

包含五项基础能力：

| 能力 | 含义 | 当前状态 |
| --- | --- | --- |
| 自动发现 AI 使用 | 自动发现用户正在使用的 AI 工具、AI 项目、AI 消耗行为 | 已实现（本地进程/网络检测、会话解析、Provider 连接器）；AI 项目维度与消耗的关联仍在推进 |
| AI 使用记录 | 使用记录、Token 消耗、模型维度、时间维度 | 已实现（Money Layer：`usage_records`、`cost_records`） |
| 成本统计 | 只用来源上报的成本，官方导出/官方 API 才记 verified | 已实现（Dashboard、Usage、Saving、Budget、Efficiency 全部由该层计算） |
| 异常提醒 | 非预期调用、成本快速增加、长时间运行、未授权消耗 | **部分实现**：Dashboard attention signals + Budget 额度；主动/推送式告警未实现（四个能力中完成度最低） |
| 支出控制 | 发现浪费、降低成本、优化使用方式 | 已实现（Saving 成本集中度与效率证据、Budget 额度控制）；"给出可执行替代用法"由 Planner 承接 |

基础硬规则（已发布实现，改动需先推翻决策）：

- 供应商不报成本 → 结果是 unknown，不是估算值。
- 不做货币换算，预算币种不一致直接拒绝。
- NULL = unknown，永远不是 0。

## 第二部分：AI Project Planner（核心商业价值方向）

**AI Project Planner 是未来主要付费价值。**

不是普通辅助功能，不是附属页面，是从"账单工具"升级为"成本管理平台"的关键载体。

目标：用户面对复杂项目时，**不再使用单一 AI 从头执行全部工作**。

系统根据：

- 项目类型
- 项目阶段
- 任务特点
- AI 能力
- 成本
- 时间要求

生成 AI 组合方案。

核心价值：降低 AI 使用成本，提高项目完成效率。

核心商业价值：**AI 资源规划 + 成本优化 + 项目执行效率提升。**

用户愿意付费的核心不是查看历史账单，而是：系统帮助用户降低 AI 成本、提高 AI 使用效率。可推导的付费点按证据强度排序：① 方案预估 vs 实际 verified 成本的对照；② 决策成本被替代（不用自己调研该用哪个模型）；③ 持续的预算与异常监控。local-first（数据不上云）是产品承诺，不是可售卖项。

---

# 3. AI Project Planner 产品模型

目标结构：

```
项目
 ↓
阶段
 ↓
任务
 ↓
AI 资源组合
```

每个任务匹配最适合的 AI。

示例（任务特点 → 匹配倾向）：

| 阶段 / 任务 | 匹配倾向 |
| --- | --- |
| 需求分析 | 推理能力强的模型 |
| 代码开发 | 代码能力强的模型 |
| 测试 | 低成本、快速的模型 |
| 文档 | 文本能力强且价格低的模型 |

**避免：** 一个昂贵 AI 模型执行全部任务。

**因为：** 不同任务使用不同 AI，可以明显降低成本、提高效率。

## 实现现状（事实，不可省略）

| 模型层 | 状态 |
| --- | --- |
| 项目 | 已实现（`projects`） |
| 阶段 | **未实现**：无 stage/phase 表或列；最接近的是 `project_tasks.category`（任务类型枚举，不是阶段） |
| 任务 | 已实现（`project_tasks`，含分类、复杂度、Token 上下限、sequence） |
| 任务依赖 | **未实现**：无 depends_on / blocked_by，顺序只有 `sequence` |
| AI 资源组合 | 已实现（`plan_resource_assignments`，每方案、每任务、每资源、每角色） |

## 实现上的三条硬约束（已实现，属产品原则而非技术细节）

1. 系统只给事实，不给推荐：不打分、不排名、不选"最优"。选择永远是用户自己的动作。
2. 未知保持未知：没有价格就是 unknown，不写 0；能力没有记录就是 unknown，不猜。
3. 估算必须可追溯：每个数字都能追到来源（rate card、任务 Token 估计、时间档位表）。

---

# 4. 五种方案定义（冻结）

**最多提供五种方案。方案是完整项目执行策略，不是简单模型推荐。**

## 方案1：最低成本方案

原则：优先免费 AI、用户已有 AI、本地 AI。

- 综合考虑：用户电脑已有 AI、本地 AI、免费额度 AI、网络上的免费或低成本 AI
- 适合：不着急完成项目，希望以最低成本完成

## 方案2：用户已有 AI 方案（必须保留）

原则：充分利用用户已经拥有的——本地 AI、已注册 AI、已购买会员 AI。

- 减少用户重新注册、下载新软件、学习新工具、购买新会员的成本
- 重点：**降低用户使用门槛**；即使不是理论最优，也必须作为实际可执行方案提供

## 方案3：最快完成方案

原则：时间优先，允许更高成本。

- 允许使用更强大的模型、付费模型、多个专业 AI
- 适合：需要快速完成项目的用户

## 方案4：综合优化方案

原则：成本、速度、质量综合平衡，提供多个综合选择。

## 方案5：高质量方案

原则：优先效果和成功率。

- 适合：商业项目、高要求项目

## 与当前实现的对照（事实）

代码中已有的五种组合策略（`lib/planner/combination-rules.ts` 的 `COMBINATION_STRATEGIES`）：

| 已确认方案 | 代码 ID | 状态 |
| --- | --- | --- |
| 方案1 最低成本 | `cost_conscious` | 已实现 |
| 方案2 用户已有 AI | `existing` | 已实现（对应"已有资源最大利用"） |
| 方案4 综合优化 | `mixed` | 已实现 |
| 方案3 最快完成 | — | **未实现**：无对应策略；`time-estimator` 对所有模型返回相同档位（Registry 无延迟/吞吐列），数据上尚不成立 |
| 方案5 高质量 | — | **未实现** |
| （代码中另有）会员优先 | `subscription` | 已实现但不在冻结清单内 → 归属待决策 |
| （代码中另有）市场扩展 | `registry_expanded` | 已实现但不在冻结清单内 → 归属待决策 |

结论：冻结清单中 **2 项待开发**（最快完成、高质量），代码中 **2 项策略待归类**（`subscription`、`registry_expanded`）。开发前必须先做映射决策，方案数量上限为 5，不得静默增删。

---

# 5. 方案展示要求

每个方案必须能够展示，让用户直观看到不同方案的区别：

- 项目阶段
- 任务
- 使用 AI
- 预计时间
- 预计成本
- Token 消耗
- 效率指标（未来逐步实现）

目标形态：

| 阶段 | 任务 | AI 模型 | 预计时间 | 预计成本 | 效率 |
| --- | --- | --- | --- | --- | --- |

让用户按**价格、速度、质量**自行选择。

## 当前实现对照

| 期望展示 | 当前状态 |
| --- | --- |
| 项目阶段 | **未实现**（无阶段层） |
| 任务 | 已实现 |
| 使用 AI | 已实现（方案级 `plan_resource_assignments` + 单步候选 `project_task_ai_options`） |
| 预计时间 | 部分实现（任务级档位，所有模型相同） |
| 预计成本 | 已实现（min/max + 币种 + 成本依据，未知即 null；含 out-of-pocket 与 api-equivalent 双口径） |
| Token 消耗 | 已实现（任务级 Token 上下限，是成本与能力估算的输入） |
| 效率指标 | **未实现**（Planner 无效率字段） |
| 方案间横向比较视图 | **未实现**（数据已在库中，缺聚合对比接口与对比页面） |
| 展示质量 | **需小改**：方案详情当前把资源渲染成原始 ID（`Registry model <uuid>`），未显示模型名与任务名 |

状态更正（2026-10-08 只读评审，详版见 §11.9）：
- 展示质量行部分过时：方案详情资源显示名已在 v1.5.4 修复（assignments 读时解析 `resource_name` / `resource_provider`）；任务名在方案详情仍不可见（见 §11.9 阻塞 B1）。
- 横向比较视图行可放宽：**M1 不需要聚合对比接口**，现有只读端点足够（聚合端点仅为可选优化，属 M2）。

## AI 来源范围（配套约束）

Planner 推荐 AI 时不要限制：用户电脑已有 AI、当前会员 AI、已有 API。

可以参考市场：免费 AI、开源 AI、商业 AI、专业领域 AI。目标是提供市场最佳组合参考。

当前事实：AI Registry v1 仅 seed 4 家供应商 10 个模型（带 `source_url` / `source_checked_at`），覆盖面是主要瓶颈；扩展 registry 不得引入评分/排名列。用户自有资源记在 `ai_resources`，不存任何密钥。

---

# 6. 产品原则

必须遵守：

- **不做 AI 排名**
- **不做没有依据的评分**
- **不制造虚假精确数据**
- **所有成本和效率数据必须有依据**
- **免费 AI、本地 AI、用户已有 AI 必须被重视**

配套技术红线（来自已发布实现，改动需先推翻这些决策）：

- 不引入 score / rank / tier / weight / confidence 列。
- 不做货币换算。
- 不用估算值填充未上报的成本。
- 不在运行时自动 seed 数据（registry seed 是手动命令）。
- 已发布版本与已发布数据不重写：plan 版本只追加，资源只归档不删除。

## 通用开发原则

1. 以真实用户价值为判断标准。
2. 不为了增加功能而增加功能。
3. 不做无法验证价值的功能。
4. 优先保证核心产品价值。
5. 控制开发时间和成本。
6. 避免企业级复杂化。
7. 避免偏离个人用户和小型专业用户场景。
8. 所有功能必须回答：是否降低 AI 成本？是否提高 AI 使用效率？是否提升产品商业价值？

## Planner 新功能检查表（每次开发前必答）

1. 是否增强 AI 组合规划价值？
2. 是否帮助用户降低成本？
3. 是否帮助用户提高项目完成效率？
4. 是否具有真实商业价值？

避免：为了功能数量增加复杂度、没有实际用户价值的 AI 推荐、空泛的 AI 排名。

---

# 7. 当前明确不做

暂不做：

- 企业复杂管理（权限、组织架构、审计合规）
- 多用户协作（账号体系、云端同步）
- 过度自动化（自动替用户选择 AI）
- 无依据推荐（评分、排名、拍脑袋的"最优"）
- 为了功能数量增加而增加功能

---

# 8. 当前阶段判断

## 已完成发布（git 历史与 CHANGELOG）

| 版本 | 内容 |
| --- | --- |
| v1.0.0 | Windows x64 桌面分发：便携 Node 运行时、standalone 构建、CAB 安装器、卸载 |
| v1.1.0 | DeepSeek 官方 usage 导出 ZIP 导入（预览只读，确认后单事务写入） |
| v1.2.0 | 按模型、按天的 Efficiency 视图 |
| v1.3.0 | Dashboard verified 语义修正；Saving 增加成本集中度与效率证据 |
| v1.4.0 / v1.4.1 | tasks、task sessions、usage→session 归因、`/api/tasks`、Dashboard Task Session UI、核心模块导航 |
| v1.5.1 | AI Registry v1、AI Project Planner（项目/计划/步骤/Token 桶）、Planner 资源与组合方案、单步 AI 候选生成 UI、standalone 静态资源修复 |
| v1.5.2 | 预算修复与 P0 官方成本完整性缺口收口 |
| v1.5.3 | task sessions 接入 usage 归因（2026-10-01；当时为 `package.json` 版本，现已推进） |
| v1.5.4 | Planner 项目阶段、Planner Productivity 报告（只读 API+UI）、Plan Detail 资源显示名修复（2026-10-07，tag `v1.5.4` → `bc47a9a`）；当前 `package.json` 版本 |

技术底盘（同样已交付）：Next.js 16 App Router + React 19 + SQLite（`node:sqlite`，无 ORM）、严格分层、Windows 桌面打包与安装器、20+ 个隔离数据库的 smoke 脚本、`npx tsc --noEmit` 与 `npm run lint` 通过。

## 当前判断

**AI Cost Management 基础能力基本完成。**

**Planner 已具备：**

- 项目（`projects`）
- 计划（`project_plans`，版本不可变，一个项目可有多个方案行）
- 任务（`project_tasks`，含分类、复杂度、Token 上下限）
- AI 资源（`ai_resources` + AI Registry + `plan_resource_assignments`）
- 成本预测（cost-estimator + 双口径成本，未知即 NULL）
- 组合方案基础（五策略生成、原子落库、`/plans/[id]/assignments` 读接口、方案详情 UI）

**当前在做（本地未发布）：** Planner 资源拆分（Stage 拆分）。已完成 `resource-universe.ts` 修剪与 `candidate-generator.ts`、`planner-service.ts`、`task-ai-options.tsx` 的 declared 逻辑移除，`npx tsc --noEmit` 通过；declared 模块新文件尚未纳入版本控制；`master` 领先 `origin/master` 8 提交；schema 与数据库结构本轮未改动。

**架构复核结论（2026-10-01，只读）：支持未来方向 62/100。** 数据模型与生成引擎为"多方案"准备度约 80%，外壳缺 4 项（阶段层、速度维度、比较展示、plan→actual 闭环）。

**下一阶段重点：完善 Planner 商业价值**

1. **阶段模型** — 建立 `项目 → 阶段 → 任务` 结构（现无 stage 层，仅有任务类型枚举），必要时补任务依赖。
2. **AI 组合方案** — 补齐"最快完成""高质量"两种方案；决策 `subscription` / `registry_expanded` 归属；扩 strategy 枚举需走 `schema.ts` 重建表迁移。
3. **五方案比较** — 输出「阶段｜任务｜AI 模型｜预计时间｜预计成本｜效率」对比视图；方案详情先修模型名/任务名显示（当前是原始 ID）。
4. **用户已有 AI 支持** — 让本地 AI、未入 registry 的自述资源能进入方案池（现被 `plan_resource_assignments.resource_source` CHECK 与 declared 排除规则挡在外面）。
5. **预测与实际效果闭环** — 把 usage 归因接回计划，形成"方案预估 vs 实际 verified 成本"对照，这是商业模式的第一条证据。

**前置判断（决定立项）：** "最快完成方案"依赖 Registry 增加模型级速度事实；若厂商文档无法给出可引用的延迟/吞吐，该方案必须降级为近似并同步更新本文档，不得虚构精确数据。

**文档与发布状态对照（2026-10-10 只读核对更正；原表述"两份文档停在 1.5.1、落后于 1.5.3"已过期）：**

| 事实来源 | 当前记录 | 说明 |
| --- | --- | --- |
| `package.json` 版本 | `1.5.4` | 与 tag 一致 |
| `docs/CHANGELOG.md` 最新条目 | `[1.5.4] — 2026-10-07` | 已非 1.5.1；M1/`80cd7a7`/`5aefeee` 内容尚未入册，无 `[Unreleased]` 段 |
| `docs/PROJECT_STATUS.md` 记录版本 | 仍为 `1.5.1`（`2f28633`，2026-09-30） | **仍然滞后**，且含"app never seeds at runtime"等已被 instrumentation 播种取代的描述 |
| 实际 Git 发布标签 | `v1.5.4`（annotated tag → `bc47a9a`）；另有 v1.4.1 / v1.5.0 / v1.5.1（无 v1.5.2、v1.5.3 tag） | v1.5.4 之后的 9 个提交（核对时 7 个至 `5aefeee`；同日组1 `ddb4df5`、组2 `6305de6` 后续提交）**已提交、未发布、未 push**（origin/master 停在 `c1ce06f`） |

- 已发布 ≠ 已提交：`af020f0`…`6305de6` 共 9 个提交仅在本地，未 push、未打 tag、未发布（核对时点为 `5aefeee`、7 个）。
- 修订 `docs/PROJECT_STATUS.md`、`docs/CHANGELOG.md`、`package.json` 属发布工程（HANDOFF 第十五节§5 / PHASE5 §4-6），**尚无授权，本轮未改**。

状态更新（2026-10-11 发布后；覆盖上方对照表与"当前判断"中的版本表述）：上表为 Batch 1 之前时点记录，已过期。v1.5.5 已完成正式发布——commit `40a0996`、tag `v1.5.5`、已 push、GitHub Release 已创建；package.json/CHANGELOG/PROJECT_STATUS/RELEASE_NOTES 均已更新为 1.5.5 并随该 commit 入库。当前版本状态以 §16 为准，原文保留作历史。

---

# 9. 2026-10-06 记录：R3.5 Productivity（R3.5-A / R3.5-B）

## R3.5-A：Productivity API（已完成并提交）

- commit：`a2fde32`（feat: add planner productivity reporting）。
- 范围：`app/api/planner/plans/[id]/productivity/route.ts`、`lib/services/productivity-service.ts`、`lib/repositories/task-repository.ts`、`scripts/smoke-planner-productivity.mjs`。
- 验证：productivity smoke 14 passed / 0 failed；`npx tsc --noEmit` 通过；`npx eslint scripts/smoke-planner-productivity.mjs` 通过。

架构边界（事实，后续改动不得擅自突破）：

- API 为只读。
- 没有 productivity 专用持久化 / 缓存。
- 不产生 score / rank / recommendation / isPrimary。
- 不做跨货币计算，不做隐式 FX 转换；不增加 FX API 或货币设置。
- unreliable / unverified 成本不作为可靠成本参与成本比较。

## 多货币策略（确认）

- 只在同币种之间进行数值比较。
- 跨币种不计算、不隐式换汇；币种不同只并列展示，不合并成单一数字。

## R3.5-B：Productivity UI（开发完成，已精确 staged，待提交）

- 新增 `components/planner/plan-productivity.tsx`。
- 已集成到 `app/planner/[projectId]/plans/[planId]/page.tsx`。
- 该 page.tsx 同时包含 M2 Stage 修改，因此只做 hunk 级精确 staging：
  当前 staged = 2 files / 635 insertions / 0 deletions（page.tsx 64 行 + plan-productivity.tsx 571 行）。
- 截至本次文档更新尚未提交，下一步命令：
  `git commit -m "feat: add planner productivity UI"`。

## M2 与 R3.5-B 边界（不可混同）

- M2 Stage 相关改动仍在 working tree，保持 unstaged，不属于 R3.5-B。
- 严禁 `git restore` 整个 page.tsx（会连带丢弃 M2 修改）。
- 严禁把 M2 内容错误提交进 R3.5-B commit。

## 当前下一步

1. 提交 R3.5-B（只提交已精确 staged 的 2 个文件）。
2. 然后继续 M2 Stage 工作。

不加入任何未经确认的新产品方向。

---

# 10. 2026-10-07 记录：A/B/C 三组完成与架构收口

> 对第 8 节的时点更正：第 8 节"当前在做（本地未发布）/ declared 模块新文件尚未纳入版本控制"是更早时点的记录，
> 已被本节覆盖——declared 相关代码已全部提交，`master` 本地继续领先远端（今日未 push），schema 与 repository 已对齐。

## 决策 1：A/B/C 三组形成稳定架构边界

| 组 | commit | 内容 | 状态 |
|---|---|---|---|
| A | `af020f0` fix: align ai option schema with declared resource column | `project_task_ai_options` nullable `model_id` + `declared_resource_id` + exactly-one 约束 + FK → `declared_ai_resources` + 既有行迁移 + repository 对齐 | 已提交，冻结 |
| （声明资源本体） | `036a483` feat: add declared resources inventory | declared CRUD repository/service/API/UI + smoke | 已提交，冻结 |
| B | `6631a63` feat: enrich planner ai option state | AI Option 实时派生 state（名称/provider/来源/注册状态/channel/entitlement/availability/pricing known/capability known），5 文件 | 已提交，冻结 |
| C | `82b3edc` feat: initialize ai registry baseline on startup | `instrumentation.ts` + `ensureAiRegistryBaseline()` + baseline smoke，3 文件 | 已提交，冻结 |

三组无新证据不重复修改。

## 决策 2：Registry Model 与 Declared Resource 明确区分

- Registry Model：系统已知、来自 AI Registry，是 Planner AI Option candidate pool 的实际来源。
- Declared Resource：用户声明/登记的额外 AI 资源，是**一类资源**，不是某个具体模型或 Provider。
- 结构：`AI Registry → Registry Models → Planner AI Options`；`Declared Resources → Resource Inventory`。

## 决策 3：Declared Resources 当前不进入 AI Options candidate pool

- 不进 AI Option candidate pool、不进 `plan_resource_assignments`（CHECK 仅允许 registered / registry）。
- 不做 cost calculation、不引入 API key / secret / token / 外部 live 调用。
- `planner-service` 中 `declared_resource_id === null` 的过滤是 **deliberate boundary**，不是遗留错误。

## 决策 4：不做评分 / 排名 / 推荐

B 与 declared 全链路无 score / rank / recommend / tier / weight / quality 逻辑；state 只陈述事实。

## 决策 5：Registry baseline 在 startup 初始化

- Next.js Node runtime 启动时经 `instrumentation.ts → ensureAiRegistryBaseline()` 建立 baseline。
- models / providers / pricing 用 `INSERT OR IGNORE`（不覆盖既有行）；capabilities 用 `ON CONFLICT DO UPDATE` 按 manifest 刷新。
- production build phase 跳过；进程级 memo；错误不阻断启动；无 API / launcher / initDb 第二个隐式 caller。

## 决策 6：新安装空 DB 的 Registry 可用性已解决

`空 DB → 启动 instrumentation → registry baseline → listAiRegistry() → Planner candidate generation` 静态追踪成立；打包产物已删除开发库，因此该路径对每个新装用户必然生效。

## 决策 7：下一步先定义 AI Option 产品语义，再决定 Declared 是否入池

必须先回答：

1. AI Option 是"模型选择"还是"AI 资源选择"？
2. 为什么 `model_id` 与 `declared_resource_id` 要共存？
3. 没有价格的 Declared Resource 是否允许成为 AI Option？
4. 用户选择 Declared Resource 后，Productivity / Cost / Task Completion 如何记录？

在此之前不修改 `candidate-generator` / `resource-universe`，不自动把 declared 加入候选池。

（2026-10-08 更新：上述四个问题已全部回答，本决策收口，见 §11。）

## 决策 8：两个 P2 为非阻塞观察（记录，非 blocker）

- **P2-1**：`instrumentation.ts` 的 `await import(...)` 在 try/catch 外，理论上 chunk 缺失时可能影响启动。当前 standalone 产物已确认 chunk 存在 → 暂不修，留待未来"启动韧性加固"专项。
- **P2-2**：`ensureAiRegistryBaseline` 的进程级 memo 意味着同进程内 Registry 被人为清空后不会自动补种。这是"启动时 baseline"的设计行为，不是 bug → 不修，不为此引入持续检查。

## 收口结论

2026-10-07 只读架构收口审查：**PASS，无 P0、无 P1**。未重新 build、未重跑 smoke/lint。

---

# 11. 2026-10-08 记录：Planner AI Options 产品语义冻结

> 本节回答 §10 决策 7 的四个问题，是其收口。
> 方式：只读复核 + 语义决策。仅修改 3 份项目文档（本文件、HANDOFF.md、PROJECT_DAILY_LOG.md）；
> 未修改任何 TypeScript 文件、未调整 schema、未新增 API、未运行代码验证、未 git commit。

## 11.1 复核事实（代码为准）

- `project_task_ai_options`（`lib/schema.ts`）：`model_id XOR declared_resource_id` 表内 CHECK，两列均可空，FK 分别指向 `models` / `declared_ai_resources`，**不存 `resource_source`**（注册状态读取时派生）。
- repository（`lib/repositories/planner-repository.ts`）只存不判：XOR 完全交给 DB CHECK；service 层 `normalizeAiOptionFields` 强制 `modelId` 非空 → 当前链路写不出 declared 行。
- candidate pool = `listAiRegistry()` + active `ai_resources`（`buildResourceUniverse`）；`declared_ai_resources` 在整条 planner 生成链中 0 引用（不是被过滤，而是从未进入输入）。
- `plan_resource_assignments.resource_source` CHECK 仅允许 `registered` / `registry`，declared 连合法枚举值都不存在。
- 读路径 `listProjectTaskAiOptionsWithState` 显式过滤 `declared_resource_id === null`（deliberate boundary，B 组已注释固化）。

## 11.2 决策 A：AI Option 是「AI 资源选择」，不是「模型选择」

**最终产品语义：一个 AI Option = 这个 planned step 可以用哪一种 AI 资源运行的一条候选记录。**

依据（结合 schema）：

- 表本身就是资源语义：一条 option = 一个资源 + 可选 tool + 估算成本/时间；两个 id 列指向的是**两类资源**（Registry Model / Declared Resource），不是同一种实体的两种写法。
- `plan_resource_assignments` 用同一 two-id boundary 表达同一件事并显式存 `resource_source`；两条持久化路径回答的都是"哪个资源"。
- 读路径派生的是资源 state（registration / channel / entitlement / availability / pricing known / capability known），不是模型评分。

边界（不改变现状）：

- 当前实际可选资源只有 AI Registry Model（有无 active `ai_resources` 注册的两态）。
- Declared Resource 是 schema 已预留的第二类资源入口，尚未进入候选池（见 11.4）。
- "模型选择"只是当前阶段的 UI 表现形式，不构成本体定义。

## 11.3 决策 B：`model_id` 与 `declared_resource_id` 共存原因（禁止隐式转换）

- `model_id` = AI Registry 中**可验证**的模型：有 registry id、有 source_url、有能力三态事实、有 rate card 才有价格。
- `declared_resource_id` = 用户声明、Registry 中**不存在**的 AI 资源：自由文本 provider/model 名、三态能力、无费率行。
- 两者不是同一实体：一个可被系统独立核验，一个只是用户陈述。
- 不允许隐式转换：
  1. 不把 declared 物化成 `models` 行（否则把用户陈述变成 registry 事实）。
  2. 不把 declared 物化成 `ai_resources` 行（`ai_resources` 是"用户拥有"清单，须以真实 registry model id 为键）。
  3. 不把 registry model 降格成 declared。
  4. 两列互不回填 id；XOR CHECK 与两条 FK 就是这条规则的数据库表达。
  5. 任何"转换"只能由用户显式动作完成，系统不自动桥接。

## 11.4 决策 C：Declared Resource 允许后续进入 candidate pool（当前不进入，进入有条件）

**决定：后续允许进入（方向性），当前仍不进入；本轮不实现。**

选"允许"而非"永久禁止"的理由：与 §5「AI 来源范围」（本地 AI、已有 AI 必须被重视）、§8 下一阶段重点 4、HANDOFF 问题 5 一致——"本地 AI / 自述资源进不了组合池"已被登记为缺口；永久禁止会直接推翻这些已确认方向。

**进入条件（全部满足才开工，缺一不进入）：**

1. AI Option 语义冻结（本节已完成）。
2. **pricing unknown 如何处理**
   - 无费率 → `cost_min_micros` / `cost_max_micros` / `cost_currency` 三列**同时 NULL**；不写 0、不写估算、不写默认币种。
   - `declared_ai_resources.pricing_state = 'known'` 只表示"用户声明他知道价格"，**不等于存在可用费率**；没有数字就没有数字，不因此产生成本。
   - planned cost unknown 的行**不参与任何成本数值比较**（沿用多货币策略：只有同币种才比较，无币种天然不可比），只并列展示 `unknown`。
   - 不为 declared 新增 FX、估算价、外部 live 报价。
3. **capability unknown 如何处理**
   - 三态全 NULL → `fit_status = 'unknown'`，既不是 `meets` 也不是 `below_minimum`。
   - 显式 0（声明不支持）→ `below_minimum`；显式 1 且满足任务需求 → `meets`。
   - 复用同一条 fit-estimator 规则，不新增独立判定逻辑、不打分。
4. **cost / productivity 如何记录**（详见 11.5）
   - planned 成本 unknown（NULL）；productivity 只对"同币种且有 verified 成本"的行做数值比较，declared 行不参与成本比较，仅参与任务完成与时间维度。
   - 时间照常记录：time 是 step 属性，与资源无关，不受 declared 影响。
5. **实现前置（各自单独评审，不打包）**：`ResourceSource` 是否扩第三值、`deriveModelState` 是否加 declared 分支、`plan_resource_assignments.resource_source` CHECK 是否重建表、`planner-service` 过滤 guard 是否替换。

**本轮仍禁止**：把 declared 自动加入候选池、修改 `candidate-generator` / `resource-universe`、为 declared 做任何成本推算。

## 11.5 决策 D：用户选择 Declared Resource 后的数据闭环

**Plan 阶段记录什么**

- `project_task_ai_options`：`declared_resource_id` 非空、`model_id` NULL、`tool_id` NULL、`is_selected = 1`（只能由用户显式选择置位）、`fit_status` 三态、成本三列 NULL、时间列照常、`pricing_basis` / `rationale` 只陈述事实。
- 不写 `resource_source` 列（读时派生，避免存下过期注册状态）。
- `plan_resource_assignments` 当前**仍不写** declared 行（CHECK 仅 registered / registry）；组合方案包含 declared 属后续独立决策。

**Actual 阶段记录什么**

- 执行仍走既有链：`tasks` / `task_sessions` / usage 归因，`project_tasks.task_id` 是唯一执行连接。
- 外部资源本 app 不可测 → Money Layer 收不到 usage → actual cost = **NULL（unknown），不是 0**。
- 若 declared 实为 own_api / gateway 且 usage 正常导入，actual 成本照常来自 Money Layer，与资源声明无关；资源声明不改变 Money Layer 任何规则。
- 不因"选择了 declared"新增任何成本来源或外部 live 调用。

**Cost unknown 如何展示**

- 显示 `unknown` / `—`；绝不显示 0、绝不显示假币种、绝不计入合计。
- 与已知成本**并列展示、不合并数字**（沿用多货币策略与"不制造虚假精确数据"红线）。

**Task completion 如何记录**

- 仍由 `project_tasks.status`（planned / in_progress / done / skipped）与 `task_sessions.status` 记录，与资源类型无关。
- "done + actual cost unknown" = 完成但成本未知，如实呈现，不反推成本、不补估算。

全程保持现有原则：**NULL = unknown、不虚构成本、不评分、不排名、不推荐。**

## 11.6 风险记录（本轮只记录，不修改代码）

1. **静默不可见**：repository 层 `createProjectTaskAiOption` 不校验 XOR（交给 DB CHECK）。绕过 service 直写 declared 行会通过 CHECK，却被读路径过滤 → 列表不可见，却仍可按 id 被 `selectProjectTaskAiOption` 选中。当前 API 层不产生这种行；实现 declared 入池前必须先消除该口径分叉。
2. **两表语义不对称**：option 不存 source、assignment 存 source。引入 declared 时 option 侧只需加分支，assignment 侧必须重建表改 CHECK 枚举（SQLite 无法原地改 CHECK）。
3. **CASCADE 删除**：`model_id` / `declared_resource_id` 均 ON DELETE CASCADE，源行被删会连带清掉候选与用户已做的选择，与"只归档不删除"约定方向相反（现状，备查）。
4. **productivity 口径分叉**：`productivity-service` 直接读原始行并带出 `declared_resource_id`，与被过滤的 options 列表口径不一致（现状，备查）。

## 11.7 下一阶段开发前置条件（语义冻结后才决定）

只有本节语义冻结后，才逐项单独决定（每项独立决策、独立评审，不打包）：

1. candidate pool 是否扩展（declared 是否入池，按 11.4 条件逐条核对）。
2. resource universe 是否修改（`ResourceSource` 第三值、`deriveModelState` declared 分支）。
3. AI Option state 是否增加 declared 分支（替换 `planner-service` 的 `declared_resource_id === null` 过滤 guard）。
4. `plan_resource_assignments.resource_source` 是否扩枚举（涉及重建表，单独评估）。

在上述任一决策完成前：不修改 `lib/schema.ts`、`lib/planner/*`、`lib/services/planner-service.ts`、`lib/repositories/*`、`app/api/*`、`components/*`、`scripts/*`；不实现 declared candidate；不重新打开 A/B/C 架构审查。

## 11.8 冻结状态

- 决策 A / B / C / D 冻结于本节；§10 决策 7 四问全部回答完毕，收口。
- 语义冻结 ≠ 功能交付：declared 入池、state 分支、assignment 枚举扩展均**未实现**，属未实现方向。
- 本轮无代码 diff、无 schema 改动、无新 API、未运行验证命令、未 git commit。

## 11.9 五方案比较视图 M1 只读评审（同日追加，只读）

**结论：M1 可用现有只读 API 实现 —— GO。零 schema 改动、零新增/修改 API，只新增一个只读视图。3 项阻塞先解决。**

### 已核对的可用端点（均只读存在）

| 用途 | 端点 | 关键行为 |
| --- | --- | --- |
| 方案列表（strategy/version/basis） | `GET /projects/[id]/plans` | 返回全部版本 |
| 阶段标签 | `GET /projects/[id]/stages` | 每项目一次，覆盖所有方案 |
| AI 模型 + 成本 + 时间（组合方案） | `GET /plans/[id]/assignments` | 行 + `resource_name`/`resource_provider` + `evidenceSummary`；手工方案返回空列表 200 |
| 任务 + planned 侧（两类方案通用） | `GET /plans/[id]/productivity` | 缺 plan → 404；无执行任务 → 200 且 actual=null；`tasks[]` 含 name/sequence/stageId；`summary.taskCount` |
| 手工方案 selected option 显示名 | `GET /tasks/[id]/ai-options` | **仅 per-task**，返回 `display_name` |
| 展开跳转 | `GET /plans/[id]` + 现有详情页 | 不变 |

全仓 `app/api` 清单核对：**无 registry/model API** —— 客户端不能自行把 registry id 解析成名字。

### 阻塞项（3 项，必须先解决）

- **B1 组合方案任务名只能取自 productivity。**
  `GET /plans/[id]/tasks` 对组合方案返回 `[]`（组合方案从不持有 `project_tasks`，combination-service.ts:332-334）；assignments 只带 `project_task_id`、不含任务名。任务列**必须**以 `GET /plans/[id]/productivity` 的 `tasks[]` 为唯一数据源，否则组合方案任务列全空/裸 id。
- **B2 手工方案无计划级 AI 模型名来源。**
  手工方案无 assignments 行；productivity 的 `planned.selectedOption` 只有 `modelId`、无名字；无 registry API 可解析；唯一名字来源是 per-task `GET /tasks/[id]/ai-options`。
  解法（现有 API）：折叠行显示 `—`，展开时按任务惰性拉取；或直接占位。
  **阻塞条件**：若设计要求"折叠态、仅用计划级接口显示模型名" → 该设计不可用现有 API 实现（需新聚合端点，超出 M1 范围）。
- **B3 设计门槛（非 API）：方案级成本合计与 unknown 规则尚未写入设计文档。**
  必须先冻结：① 只有同币种才求和；② 任一行成本三列 NULL ⇒ 该方案合计 = **unknown**（非部分和、非 0），并标注"含 n 条未定价"；③ 多币种并列展示、不合并单一数字；④ 不排名、不标记最便宜/最贵；⑤ 时间列标注"各方案同源同值，不区分方案"（time-estimator 是 step 属性）；⑥ 效率列显示 `—`（未实现，不推算）。
  未冻结前实现 = UI 自造规则，违反"不制造虚假精确数据 / 不排名"红线，且返工。

### 非阻塞（已核对）

- 效率列无任何数据源 → 显示 `—`（设计已如此规定）。
- 缺 2 个策略（最快完成/高质量）→ 视图对 `listProjectPlans` 通用，缺的策略就是缺的行。
- 同策略多版本 → 客户端取最新，纯 UI。
- 请求量 ≤ ~6 方案 × 2 端点 + 1 stages（+ 惰性 per-task），本地单用户可接受；聚合端点是 M2 可选优化，不是 M1 前提。

### 边界

- 本轮只读：无代码 diff、无 schema 改动、无新 API、未运行 build/lint/smoke、未 git commit。
- 本节不改变 §11.7 四项决策的冻结状态与顺序；实现（开发）前仍需 B3 规则先冻结。

## 11.10 五方案比较视图 M1 显示规则冻结

（2026-10-08，只读设计冻结）

五方案比较视图只负责并列展示已有计划事实，不负责推荐、评分或优化决策。

### 1. 成本展示规则

- 成本只允许同币种汇总。
- 不进行自动汇率转换。
- 不同币种必须分别展示。
- 计划成本来源于 assignment / selected option 的 planned cost。
- 计划成本不是实际消费。

示例：

CNY:
10 - 20

USD:
3 - 5

### 2. Unknown 成本规则

若方案中任意任务存在：

- planned_cost_min = NULL
- planned_cost_max = NULL

则该方案总成本显示：

Unknown

禁止：

- 部分任务求和后作为完整方案成本
- NULL 当作 0
- 推测未知价格

### 3. 排名规则

比较视图禁止：

- 最便宜方案
- 最快方案
- 推荐方案
- 性价比排序

原因：

当前 Planner 只有计划数据，没有足够 actual evidence 支撑推荐。

### 4. 时间展示规则

预计时间来自任务估算。

当前估算不区分 AI 模型能力。

因此：

- 展示时间范围
- 标注时间估算为任务级估计
- 不解释为模型速度比较

### 5. 效率字段规则

当前没有可靠效率数据：

- cost/task
- time/task
- completion rate

因此效率显示：

—

不得推算。

### 6. 多版本规则

同 strategy 存在多个 version 时：

- 默认展示最新 version
- 历史 version 不参与默认比较
- 不删除历史数据

### 7. 产品边界

比较视图：

做：

- 展示方案差异
- 展示成本范围
- 展示 AI 资源
- 展示时间估算

不做：

- AI 推荐
- 自动选择
- 成本优化评分
- 模型排名

---

状态（本节冻结后）：§11.9 阻塞 **B3 解除**（显示规则已冻结，实现前不再有设计前置）。
余下 B1（组合方案任务列取自 productivity）与 B2（手工方案模型名按任务惰性拉取或显示 `—`）
为既定取数约束，解法已在 §11.9 给定，开发时直接执行即可。本节与 §11.9 同为只读产出，无代码 diff。

---

# 12. 2026-10-08 记录：R3.5 M1 五方案比较视图完成

R3.5 M1 五方案比较视图完成。

## 实现范围

- 方案并列比较
- 任务数量展示
- AI resource 展示
- 时间估算展示
- planned cost 展示
- efficiency 占位

实现文件（仅 3 个，无其他代码改动）：

- `app/planner/[projectId]/page.tsx`（Compare plans 卡片，`id="compare"`）
- `app/planner/[projectId]/plans/[planId]/page.tsx`（面包屑 "Compare plans →" 回链）
- `components/planner/plan-productivity.tsx`（导出 `costRangeText` / `minutesRangeText` / `TaskProductivityRow`，逻辑零改动）

## 严格遵守 §11.10

- 不推荐
- 不排名
- 不评分
- 不自动选择
- 不汇率转换
- 不制造效率数据

行为核对：默认每 strategy 只显示最新 version（历史版本需勾选）；成本只按币种分组展示、任一任务 planned cost NULL ⇒ 方案总成本 `Unknown`（不当 0、不做部分和）；时间为任务级估算并加脚注说明不区分模型速度；Efficiency 恒为 `—`；表格顺序为固定分组顺序（手工在前），不做任何成本排序。

## 数据来源

- productivity API
- assignments API
- existing ai-options API

无：

- schema 修改
- 新 API
- 新数据库字段

## 验证

- TypeScript PASS（`npx tsc --noEmit`）
- ESLint PASS（M1 三个文件 0 findings；全仓 435 errors 为既有基线，与 M1 无关）
- Build PASS（`npm run build`，25/25 页面生成）
- 浏览器验证 23/23 PASS：加载、默认最新 version、成本/时间/效率规则、无排名语言、组合方案 AI 来自 assignments（3/3 named）、手工方案 selected option 惰性加载、historical 开关（3 行 ↔ 5 行）、详情页回链、0 console error

## 状态

M1 完成。

## 下一阶段

进入 Phase 5 商业价值闭环收尾：

- 发布前检查
- 免费试用策略落地设计
- Free / Paid 功能边界冻结
- MVP 发布准备

---

# 13. 2026-10-08 记录：Phase 5 发布就绪审查与产品化收口完成

## 发布就绪审查（只读）

产出 `PHASE5_RELEASE_READINESS_REVIEW.md`（本地未跟踪，不入 Git）。

结论：**Conditional GO**。核心价值路径（发现 AI 使用 → 查看成本 → 找到消耗来源 → 管理预算/优化行为）完整；无死链、无 TODO/debugger/秘钥残留；新装数据库安全（空库 + Registry 启动自动播种）。发布前小修清单与 Free/Paid 草案分别见该文档 §4、§7（草案未冻结）。

## 产品化收口批次（已完成）

commit：`80cd7a7` fix: improve empty and error states

仅 5 个源码文件，112 insertions / 13 deletions：

1. Saving 页面无模型消费数据时显示明确 empty state。
2. AI Activity 加入明确的数据加载失败状态。
3. Dashboard Task Session 不再直接暴露 catch 中的原始错误信息。
4. Usage Details 区分"完全没有 usage 数据"与"当前筛选条件无匹配数据"，并提供官方 usage import 入口。
5. Budget 无 verified cost 时显示明确 empty state；未设置 budget 时明确说明显示的是 suggested values。

## 验证

- `npx tsc --noEmit` PASS
- `npm run build` PASS（25/25 页面）
- scoped ESLint：本批次涉及页面 PASS；usage/details 的 1 个 `react-hooks/set-state-in-effect` error 为 HEAD 基线既有，非本批次引入

## 边界

- 无 API / schema / service / repository / Planner 改动
- v1.5.4 release/tag 冻结不变；未 push；未创建新 commit（本节文档更新仅本地）
- 未跟踪文件保持本地不入 Git：`=`、PHASE5_RELEASE_READINESS_REVIEW.md、PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md、PROJECT_PROGRESS_TIMELINE.md、PROJECT_WORKING_AGREEMENT.md

## 状态

Phase 5 产品化收口完成。M1 完成（`6e9bf4c`）。当前 HEAD：`80cd7a7`。

## 下一阶段

Phase 5 后续（等待用户逐项决策，不自动开始）：

- 免费试用策略落地设计
- Free / Paid 功能边界冻结
- MVP 发布准备

# 14. 2026-10-08 记录：Commercial 生命周期落地 + Planner Advanced 边界冻结

## 商业模式与生命周期（已实现）

90-Day Full Access：用户首次真正使用产品起 90 天全功能；第 91 天未付费进入
paid_required，高级能力拒绝，基础能力保留；历史数据永不删除；无登录/账号/
多用户/支付网关/第三方 SDK；不新增会员等级与 Pro。

6 个冻结 capability：planner_advanced、cost_advanced、budget_control、
ai_activity_advanced、productivity_efficiency、planner_historical_efficiency。

生命周期实现（待提交）：

- commercial_state singleton 表；first_use_at 可空；试用起点唯一写入口为
  startCommercialTrial()（原子 `WHERE first_use_at IS NULL`，重复调用不改写）。
- getCommercialLifecycle() 纯读；first_use_at 为 NULL 返回 null（未开始）。
- Dashboard（app/page.tsx）真实挂载后经 POST /api/commercial/start 启动试用；
  不放 layout / instrumentation / initDb / usage import / SSR / 后台服务。
- 实测：首开写入 first_use_at、paid=0、full_access_trial、
  paidRequiredAt=+90×24h；reload 不变；幂等；业务表零漂移。

关键认知（冻结）：commercial_state 表存在 ≠ 试用开始；
first_use_at IS NOT NULL 才代表商业生命周期开始。

## Planner Advanced 边界（只读审查结论，冻结）

planner_advanced 不覆盖整个 Planner，仅含 2 个生成型 service 函数：

1. generateProjectPlanCombinations()——多方案组合生成，替代用户规划决策成本。
2. generateProjectTaskAiOptions()——Task AI Resource 候选生成，替代用户模型
   选择决策成本。

免费保留：项目创建、阶段 CRUD、计划版本创建、任务 CRUD、AI options 查询、
手动创建 AI option、option select、已生成历史读取、productivity/M1 报告
（属其他 capability）。

技术方案（冻结）：权限检查放 service 层，不放 route 层——两个生成函数是
唯一入口、防未来调用方绕过、route 保持薄壳、免费功能零影响；
PLANNER_ADVANCED_LOCKED → HTTP 402。API 可绕过 UI，必须服务端拦截。

## 状态

Commercial 生命周期接入 + Planner Advanced service 层门禁 + 402 映射 + 4 个 smoke 修复
已整理为 16 文件待提交批次，HEAD 仍 `80cd7a7`（本轮不 commit）。
Planner Advanced 边界审查结论冻结并已在 service 层实现；UI lock 仍未开始。

## 下一阶段

Planner Advanced service 层权限接入（1–3 已在本批实现并待提交，4 未开始）：

1. 两个 service 入口加 capability 检查 ✔
2. planner error code（402）映射 ✔
3. tsc + scoped eslint + 生成 API 实测 ✔（4 个 smoke 全绿 37/40/24/12，0 failed）
4. 再决定是否加 UI lock（不提前做 UI，不扩展商业系统）——未开始

---

# 15. 2026-10-09 记录：Planner Advanced UI lock 完成（静态）+ 浏览器实测停止

## UI WIP 范围（仅客户端，未提交）

§14 下一阶段第 4 项（"再决定是否加 UI lock"）已执行，结论：**加，且仅加最小客户端锁定 UI**。

修改文件仅 2 个：

- `app/planner/[projectId]/page.tsx`：组合方案卡片。
- `components/planner/task-ai-options.tsx`：Task AI options 面板。

行为：

- 服务端返回精确错误码 `PLANNER_ADVANCED_LOCKED` 时，显示锁定提示（"Planner advanced features require a paid plan after the 90-day full-access period."），隐藏对应生成按钮。
- 普通错误、网络错误、JSON 解析失败仍走原有错误路径（错误行 + Retry），不显示锁定提示。
- 锁定判定仅依赖 `data.code === "PLANNER_ADVANCED_LOCKED"`，不按 HTTP 状态码判定（避免把其他 402 或中间层响应误判为锁定）。

边界（冻结）：

- 不改服务端权限逻辑、API、schema、商业生命周期。
- 不调用 `/api/commercial/start`，不新增任何 commercial 读取端点。
- 不做客户端 90 天计算、不缓存 lifecycle 状态、不新增解锁路径。
- 锁定态一旦在客户端设置，无 UI 内解锁（当前无支付 UI，属可接受边界；后续接入支付后由用户重挂载页面恢复）。

## 验证证据

已通过（如实记录）：

- 服务端隔离数据库权限测试 14/14 PASS（%TEMP% 一次性脚本，隔离临时库）：
  - `full_access_trial` 下 `generateProjectTaskAiOptions` 与 `generateProjectPlanCombinations` 均放行；
  - `paid_required`（仅在隔离库把 `first_use_at` 回拨 91 天构造）下两服务均抛 `PLANNER_ADVANCED_LOCKED`；
  - `plannerErrorStatus("PLANNER_ADVANCED_LOCKED") = 402`；
  - 普通错误映射不变（NOT_FOUND=404、CONFLICT=409、其余=400）。
- TypeScript（`npx tsc --noEmit`）PASS。
- scoped ESLint（仅两个 UI 文件）PASS。
- `git diff --check` CLEAN。
- 静态 diff 只读审查：无阻塞问题。

未完成（明确停止，非遗漏）：

- 浏览器端交互实测未完成。多次尝试受阻：隔离临时目录启动 Next.js 遭 Turbopack panic（node_modules junction）与 webpack `node:fs` UnhandledSchemeError；真实项目根目录启动（端口 3000）首页返回 HTTP 200，但 Playwright route-interception 交互验证未执行即按指令收尾。
- HTTP 200 只证明服务器可响应首页，不等于锁定/错误/成功三种 UI 交互已验证。
- **已决定停止浏览器测试，不再重试、不再投入环境排查**——基于验证收益与时间成本的明确决定。服务端契约已由 14/14 隔离测试覆盖，UI 锁定分支已由静态审查覆盖；浏览器实测的边际收益被判定为不值得继续投入。

## 数据库安全结论（前后快照实测比较）

本轮从真实项目根目录启动过 `next dev`（页面加载会只读打开真实开发库）。前后 SHA-256 比较六个文件：

- `data/` 三件套：`.db` 与 `-wal` 的 SHA-256 与 mtime 均未变；仅 `-shm` 的 SHA-256 与 mtime 变化（大小未变）——WAL 模式下打开连接触碰共享内存文件的正常副作用，主库与 WAL 内容哈希未变说明无业务数据写入。未做任何恢复操作。
- `%APPDATA%\AI-Cost-Management\data\` 三件套：全部 SHA-256 与 mtime 均未变。

结论：真实业务数据未被修改。

## 状态与下一步

- 两个 UI 文件仍是未提交 WIP；HEAD 仍为 `5aefeee`。
- 下一步由用户决定是否提交这两个 UI 文件。
- （2026-10-10 更新：两个 UI 文件已提交 `6305de6` feat: add planner advanced lock UI；
  同日组1 §4-3 亦提交 `ddb4df5`。原文保留为 2026-10-09 时点记录。）
- 不重新安排浏览器测试，不重新安排全量回归。
- 保留既定原则：范围最小化、测试以实际价值为准、不为形式重复验证、不修改真实数据库作为测试手段。


---


## 2026-10-10 发布工程决策记录（Phase 5 收口）

已决定并实施：

- CAB 文件清单（package.ddf）由 `scripts/generate-package-ddf.mjs` 确定性生成，
  以 `--check` 双向集合作为门禁；取代"手工/未记录的每版本再生成"。
  依据：v1.5.4 finalize 未提交 ddf 导致 HEAD 清单落后两版本、缺 80 文件的既成教训；
  新机制已端到端实证（生成 → makecab 试制 → `tar -tf` 清单 100% 对齐）。
- 发布打包拆为显式步骤：`package:desktop`（应用包）与 ddf/makecab（发布清单与 CAB）
  不合并，避免耦合。

已验证、作为后续发布前提的事实：

- makecab 试制链路可靠：1817 条目双向一致、无禁运、v1.5.4 资产零触碰（Batch 3E）。
- smoke:deepseek 失败为环境夹具冲突（既有 provider 唯一约束），非产品回归；
  脚本缺事务保护属结构性风险（Batch 4A 只读确认）。

待决（记录推荐，不视为决定）：

- deepseek 修复：方案 B（fixture 幂等化 + 事务包裹）为推荐首选，未授权实施；
  A（隔离库）与 C（保留失败记录）为备选。
- ddf 与生成器是否随 release finalize 提交（建议：是，沿 v1.5.3 先例）。
- 正式发布打包、Setup 编译、正式产物生成、commit/tag/push：一律暂停待授权。

协作规则同步：

- 本日协作规则改进（任务规划 / 验证原则 / 协作方式）归档于
  PROJECT_WORKING_AGREEMENT.md §16，本文件不重复正文。

同日深夜补充（Batch 4B–4G，取代上方"待决"第 1 条，原文保留）：

- deepseek 修复已获授权并实施（Batch 4B–4D）：provider/model 幂等复用、fixture 显式
  身份校验、单事务写入；且采纳"默认隔离"——无参执行即在 mkdtemp 临时库运行，成功清理、
  失败保留诊断库，脚本内不存在回退真实开发库的路径。方案 A/B/C 选择问题关闭：
  实际落地 = B（幂等化+事务）+ A 的隔离诉求（以默认临时库形式，`--db` 仍可显式指定）。
- 门禁回归完成：`npm run smoke:deepseek` PASS（4E）；完整 17 项 Release Smoke 门禁
  17/17 PASS（4F）；全程真实开发库 db/wal/shm 指纹与内容不变。其余 13 个 smoke 的
  约定临时目录保留未清理，未经授权不得清理。
- 上方"待决"第 2、3 条（ddf/生成器入库、正式发布链、commit/tag/push）维持暂停，
  未因本补充而改变；Smoke 全绿不得记为发布完成。

同日收尾补充（Batch 4H–4I；用户决定当日到此，先收尾文档）：

- 已确认决定（事实层）：发布链顺序固定为 S1 `package:desktop` → S2 ddf 再生成 →
  S3 `--check` → S4 makecab → S5 Setup csc → S6 README → S7 SHA256SUMS →
  S8 RELEASE_NOTES 回填 → S9 清理 makecablog（须授权）；S1→S2 顺序不可倒置
  （BUILD_ID 联动，4H P1-①）。deepseek Smoke 默认隔离与 17/17 门禁为既成事实（见深夜补充）。
- 已确认事实（4I）：工具路径、v1.5.4 命名格式、release v1.5.5 目录不存在（4J 复核仍不存在）；
  S1–S9 命令清单与验证/失败停止条件已交付。
- **未决（记录推荐，不视为决定）**：发布策略二选一——全干净链（重跑 package:desktop，
  推荐，产物自洽于发布日）或复用现存 `.desktop-package`（BUILD_ID 属 Batch 2 时点，需明示接受）。
- **授权边界（当日终点）**：正式发布链 S1–S9、release 目录创建、数据库写入、
  13 个 smoke 临时目录清理、commit/tag/push **一律未授权、未执行**；用户明确当日到此为止。
  后续任何执行须重新获得明确授权，本补充不构成预授权。
- 长期规则维持不变（单人本地产品方向、不扩范围、不擅自 git 操作、以验证结果为准、
  历史保留；全文见 PROJECT_WORKING_AGREEMENT.md §16 及本文件既有条目），本日工作未触碰任何
  产品范围或技术方向决策。

---

# 16. 2026-10-11 记录：v1.5.5 正式发布完成 + 上线阶段与后续路线

## 16.1 发布事实（已执行完毕）

- commit：`40a0996` release: prepare AI Cost Management v1.5.5。
- tag：`v1.5.5`（→ `40a0996`）；已 push 至 GitHub `master`；GitHub Release 已创建完成。
- 正式发布产物：`release\AI-Cost-Management-v1.5.5\`（Setup.exe、Payload.cab、README.txt、
  SHA256SUMS.txt 四件套）；Installer SHA256 已回填 RELEASE_NOTES。
- 正式发布链 S1–S9 按授权逐步执行完成（全干净链：重跑 package:desktop → 正式 ddf
  再生成 + `--check` → makecab → csc Setup → README/SHA256SUMS → SHA 回填 → 收尾清理）；
  BUILD_ID `lnVtZ1FuHRMtX-YGjTnWQ` 全链一致。
- 安装验收：Setup 安装成功至 `%LOCALAPPDATA%\AI-Cost-Management\App`；version 1.5.5、
  BUILD_ID 与构建一致；Launcher 启动成功、本地服务正常；Dashboard / Usage / Planner /
  Budget / AI Activity 全部 HTTP 200；SQLite 数据目录正常。安装结果保留未卸载。
- 人工测试：发布版本人工测试已完成，全部 PASS。
- 上方 §15 收尾补充中的"授权边界（当日终点）"与 §15 之前各节的"待决/未授权"表述
  已被本节取代（历史保留）；§8 对照表已加发布后状态更新标注。

## 16.2 当前阶段：发布后运营准备阶段

v1.5.5 已发布，产品进入「发布后运营准备阶段」。

下一步重点：

1. 建立产品官网。
2. 创建产品介绍页面。
3. 准备用户获取渠道。
4. 收集真实用户反馈。

明确不提前进入：自动优化引擎开发、Subscription Cost Model 开发、大规模功能扩展。

## 16.3 长期方向记录一：个性化 AI 方案优化引擎（当前不实现）

未来考虑建设「个性化 AI 方案优化引擎」。

目标：根据用户本机 AI 使用情况——使用历史、模型选择、Token 消耗、任务类型、
成本变化、时间效率——逐步优化：

- 模型组合推荐
- 免费/付费模型替代建议
- AI 使用效率分析

当前状态：**v1.5.5 不实现。** 原因：优先完成产品上线和真实用户验证。
（本条为长期方向记录，不构成立项；启动前须按 §6 检查表与 §16.2 阶段重点单独决策。
注意与既有红线的关系：推荐/优化不得演变为无依据评分排名——须遵守"不做 AI 排名、
不做没有依据的评分、不制造虚假精确数据"，且依据只能来自用户本机真实数据。）

## 16.4 长期方向记录二：Subscription Cost Model（当前不进入收尾）

当前产品主要覆盖：

- API Token 成本
- 模型调用成本
- 本地检测和分析

暂未完整支持：

- ChatGPT Plus
- Claude Pro
- Gemini Advanced
- GitHub Copilot
- 其他包月/包年订阅

未来阶段考虑增加 Subscription Cost Model：

- 用户手动录入订阅
- 自动计算月度 AI 固定成本
- 与 API 成本合并分析
- 计算真实 AI 总投入

当前状态：**不进入 v1.5.5 收尾，不排期。**

## 16.5 商业与推广方向记录

- GitHub Release 只是技术发布渠道。
- 未来用户增长需要：官网、产品介绍文章、AI 社区发布、开发者社区推广、
  软件目录提交、内容营销。
- 大型 AI 模型推荐目前不可依赖：ChatGPT / Codex / Gemini 等不会自动知道新软件。
  需要：官方网站、搜索索引、用户评价、外部文章、社区曝光。

## 16.6 明日工作入口

从「官网建设规划 + 上线推广准备」开始。

不要提前进入：自动优化引擎开发、Subscription Cost Model 开发、大规模功能扩展。

## 16.7 本节同步边界

本节与 HANDOFF 第十九节、DAILY_LOG 2026-10-11、RELEASE_NOTES v1.5.5 Release Status、
docs/PROJECT_STATUS 同批次同步；仅改这 5 份文档，未改源码、未运行验证命令、
未执行 git 操作、未新增文档。

# 17. 2026-10-12 记录：官网 MVP 完成 + 方向、宣传边界与协作规则确认

## 17.1 官网 MVP 事实（当日完成）

- 英文静态单页官网位于 `website/`，仅 `index.html` 与 `styles.css` 两个文件。
  独立静态页面，不是产品功能开发，也不构成新版本发布。
- 技术约束：系统字体 + 静态 CSS + 语义化 HTML，主体内容不依赖 JavaScript 展示；
  未新增 npm 依赖、脚本、外部字体/CDN、分析工具、第三方图片。
- 内容：产品介绍、核心功能、隐私与网络说明、下载入口、FAQ（8 项）。
  Hero 视觉为明确标注的 UI schematic，非伪造产品截图、非真实用户消费数据。
- 链接指向已核实的 GitHub 仓库、v1.5.5 Release 与安装程序：
  `https://github.com/jademoon0428-star/ai-token-cost-monitor/releases/download/v1.5.5/AI-Cost-Management-Setup.exe`
  Setup.exe SHA256：`C8403A4D9276D2636D3EF1844865D5404F8DFB3B3DA24AE2102FA705C5F128EF`。
- 本轮未修改产品源码、数据库与发布资产；官网未部署、未提交、未推送。

## 17.2 验证证据（当日执行输出，如实记录）

- 完整性检查：`meta name="description"` 1、`meta property="og:description"` 1、`h1` 1；
  指定 6 项旧文案全部未命中；新旧文案无并存；HTML 标签配对无异常；12 个 id 无重复。
- Playwright 360px + 1280px 共 24/24 PASS：无水平溢出、无页面错误、单一 h1、
  样式表加载正常、FAQ 8 项、键盘可用、下载地址与 SHA-256 显示正确；
  外部请求列表为空——仅描述该页面浏览器请求，**不得夸大为产品完全不联网**。
- 未做浏览器 → GitHub 下载端到端验证；**不声称下载流程端到端成功**。

## 17.3 宣传与文案边界（长期约束）

- 禁止声称：开源、永久免费、完全离线、零网络、实时/后台监控、自动阻止超预算消费、
  推送通知、100% 检测准确、覆盖所有模型、自动成本优化。
- 隐私表述必须精确区分：未发现上传使用量或成本数据的代码；未发现分析或崩溃报告代码；
  AI Activity 扫描可能执行反向 DNS 查询；用户主动触发的可选提供商连接测试会联系相应 API。
- 价格注册表：随当前版本打包的价格信息，不承诺自动或实时更新。
- API Key 表述：区分无需 API Key 的核心功能与主动触发的可选提供商连接测试。
- 活动检测 ≠ 实际消费记录：AI Activity 只提供本地活动证据，不是消费记录。
- 未确认事项不得推断：许可证、最低 Windows 版本、安装包签名、SmartScreen 状态。
- 宣传证据要求：任何对外数字、链接、校验和与功能描述必须来自可复核的执行输出或官方来源；
  未验证的流程不得写成已验证。

## 17.4 长期方向（重申，2026-10-12 确认）

- 优先完成 v1.5.5 发布后的收尾：官网、产品介绍页面、用户获取渠道、真实用户反馈收集。
- 暂缓：个性化 AI 方案优化引擎、反馈闭环、更广泛的资源推荐改进、Subscription Cost Model。
- 决策标准不变：以实际用户价值、必要性、可验证性为准；不为"可能有用"扩展范围。
- 保持产品简单、稳定、专业，优先服务个人 AI 用户与小型/细分 AI 使用者，
  不以企业级复杂度为默认目标；坚持证据优先，避免范围蔓延。

## 17.5 协作规则（重申，2026-10-12 确认）

1. 用户说"下一步/继续"时，优先给出可执行的 OpenCode 任务（明确文件、命令与验收标准）。
2. 步骤必须适配 Windows PowerShell 环境。
3. 不做无目的重复检查；已通过的检查在内容未变化时不重复重跑。
4. 每次项目工作结束必须更新 HANDOFF.md。
5. 未经授权不得 commit、push、deploy 或改动发布资产；不执行 `git add .` / reset /
   checkout / stash / clean 等破坏性操作。
6. 保护既有未提交修改与未跟踪文件：5 M + 4 个未跟踪文档的基线不得被覆盖、重置或清理。

## 17.6 本节同步边界

本节与 HANDOFF 2026-10-12 收工块、DAILY_LOG 2026-10-12、docs/PROJECT_STATUS 官网工作节
同批次同步；RELEASE_NOTES.md 保留原状（官网工作不写入产品发布说明）。
本轮未改产品源码、数据库与发布资产，未执行 git 操作，未部署，未新增文档。

---

# 18. 2026-10-13 记录：v1.5.5 发布阶段关闭 + 官网发布与验收

## 18.1 官网发布事实

- GitHub Pages 已上线：https://jademoon0428-star.github.io/ai-token-cost-monitor/
- 部署方式：**gh-pages 分支根目录部署** `index.html` + `styles.css`
  （Pages source = gh-pages / root）。
- master 规范来源：`website/`。
- **双分支同步约定：`master website/` → `gh-pages root`。**

## 18.2 Git 状态

- master：`5a5c4ad` docs: close out v1.5.5 website launch —— 与 origin/master 同步。
- 官网入库：`4418e48` docs: add official website static page（master，仅 website 两文件）。
- gh-pages：`f00057a`、`c196f97` —— 与 origin/gh-pages 同步。
- （§8 对照表、§16.1 的发布事实不变；本节记录发布后新增的官网提交与分支状态。）

## 18.3 官网验收（PASS，2026-10-13 只读验证）

- 首页 HTTP 200；styles.css HTTP 200，CSS 正常加载；无 404 资源。
- 下载链接指向 v1.5.5 Release；Release 页面可访问。
- FAQ 8 项正常；隐私说明正常；产品介绍正常。
- 宣传边界检查通过（符合 §17.3 长期约束）：**没有声称**
  「实时监控所有 AI」「自动阻止费用」「支持未实现平台」「自动推荐最佳模型省钱」。
- 未做浏览器端到端下载测试，不声称（与页面披露口径一致）。

## 18.4 发布阶段关闭

v1.5.5 已完成：**Release、安装包、GitHub Release、官网发布、官网验收、文档收口**。
§16.2 的「发布后运营准备阶段」自此进入执行期（官网项已闭环）。

## 18.5 后续方向（2026-10-13 确认）

1. **用户验证优先** —— 收集真实用户反馈，作为后续决策依据。
2. **官网动画演示** —— 属于 post-v1.5.5 官网增强，不纳入当前版本。
3. **暂不启动 SaaS / 账号系统 / 企业功能** —— 维持 local-first、单机单用户定位
   （与 §17.4 一致）。
4. **等真实用户反馈后再评估 Personalized AI Optimization Engine**
   —— 与 §16.3 暂缓决定一致，不提前启动。

## 18.6 本节同步边界

- 本轮更新五份文档（本文件 / HANDOFF / DAILY_LOG / RELEASE_NOTES / docs/PROJECT_STATUS）；
  其中 RELEASE_NOTES.md 按用户本次指示做最小补充（v1.5.5 节末新增 Website 小节，
  不改原发布记录结构），该指示为对 §17.6「RELEASE_NOTES 保留原状」约定的单次覆盖。
- 未改源码、package.json、release/、website/；未执行 git 操作；未 commit。

---

# 19. 2026-10-14 记录：下载入口一致性修复收口 + 阶段转入用户验证

## 19.1 性质说明

- 今天不是重新发布版本。v1.5.5 已冻结并公开发布；今天修复的是**公开安装说明
  一致性问题**（文档 / 官网静态内容 / Release 文案层面）。
- 安装包二进制没有变化：Setup.exe、Payload.cab、SHA256SUMS.txt 资产未变，
  未重新构建，未创建新 Release，未执行 build/smoke。

## 19.2 下载入口一致性修复事实

问题根因：安装器 `bootstrapper.cs` 要求 `AI-Cost-Management-Payload.cab` 与
Setup.exe 同目录（缺失即 exit 1），但官网 3 个下载按钮、Release 正文、资产
README.txt 均只引导下载 Setup.exe——按官方指引安装必然失败。审计时
Payload.cab 下载数=0，公开路径无人完成安装。定级 P0。

已完成修复：

- 仓库 3 文件 → commit `faca490`（docs: fix v1.5.5 download instructions）：
  - `website/index.html`：规格表补 Payload.cab（32,503,105 bytes）；新增三步
    安装说明（两文件组成 → 同目录 → 运行 Setup.exe）；3 个下载按钮加 title
    提示（href 未变）。
  - `README.md`：删除过期 "JSON import tool"，改为 DeepSeek official usage
    ZIP import。
  - `RELEASE_NOTES.md`：v1.5.5 节新增 `## Installation` 双文件说明（历史版本
    零改动）。
- gh-pages → commit `ef920ed`（docs: fix download instructions for two-file
  installer），已 push，线上官网生效。
- GitHub Release v1.5.5：正文 Installation 段改为双文件同目录；资产 README.txt
  删旧传新（629982578 / 1,216 B → 640030502 / 1,323 B，API 直连核验）。
- 收口记录提交 → commit `c7d24fb`（docs: record v1.5.5 download fix closeout，
  3 份文档 +107 行）。

## 19.3 当前 Git 状态

- master：`c7d24fb`，与 origin/master 同步；工作区干净。
- gh-pages：`ef920ed`，与 origin/gh-pages 同步。
- 工作区仅剩四个未跟踪规划文档（不入 Git）：PHASE5_RELEASE_READINESS_REVIEW.md、
  PLANNER_STAGE_AND_TASK_MODEL_DESIGN.md、PROJECT_PROGRESS_TIMELINE.md、
  PROJECT_WORKING_AGREEMENT.md。

## 19.4 阶段判断（2026-10-14 确认）

- **v1.5.5 Release 阶段完成**（§18.4 的关闭结论维持有效，今日修复属发布后
  文档级补丁，不重开发布阶段）。
- **当前阶段：发布后用户验证阶段。**
- 下一步重点：
  1. 发布用户验证帖子（V2EX「分享创造」首帖终稿草案已备妥，含双文件安装指引）。
  2. 收集真实安装反馈。
  3. 根据反馈决定后续优化方向。

## 19.5 边界（重申，不新增决定）

- 不修改产品代码；不启动 Planner 新功能；不启动 Personalized AI Optimization
  Engine；不增加 SaaS / 账号 / 企业功能；不修改版本号。
- 与 §18.5、§17.4 的既有暂缓与方向决定完全一致，本节仅记录今日事实与阶段
  转入，不扩展。

## 19.6 本节同步边界

- 本轮更新五份文档：本文件 / HANDOFF.md / PROJECT_DAILY_LOG.md /
  docs/PROJECT_STATUS.md / PROJECT_WORKING_AGREEMENT.md。
- 未改源码、安装器、schema、测试文件、release/、website/；未执行 build/smoke；
  收口提交 c7d24fb 为本节记录对象而非本节产物（本节文档更新未 commit，待确认）。
