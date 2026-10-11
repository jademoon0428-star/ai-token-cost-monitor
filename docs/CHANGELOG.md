# Changelog

All notable changes to AI Cost Management, newest first.

Derived from the git history. Released versions are frozen; the `[Unreleased]` section is additive and does not modify them.

## [1.5.5] — 2026-10-10

Declared AI resources inventory, AI Registry startup baseline seeding, richer Planner AI-option state, the Planner five-plan comparison view (M1), empty/error-state polish, the commercial 90-day lifecycle with the Planner Advanced gate, and user-facing error-message cleanup. Schema changes are additive and applied automatically at startup (`declared_ai_resources`, `commercial_state`, and a now-nullable `project_task_ai_options.model_id`); no manual migration is required. Covers commits `af020f0`…`def18c2` (10 commits after the v1.5.4 tag).

### Added — Declared AI resources inventory

- New `declared_ai_resources` table for ways of reaching an AI model that this app cannot verify itself (web subscription, third-party gateway, someone else's account). Free-text provider/model names on purpose; it never becomes a Registry `models` row or an `ai_resources` row; it stores no credential, key, token, or balance.
- CRUD + archive API under `/api/planner/declarations`, service, repository, and a management panel on `/planner/resources`.
- `project_task_ai_options.model_id` is now nullable so an option can reference a declared resource; a partial unique index keeps a duplicate declaration from collapsing onto one option.
- Smoke coverage via `scripts/smoke-planner-declarations.mjs`.

### Added — AI Registry startup baseline

- `instrumentation.ts` calls `ensureAiRegistryBaseline()` on startup: an empty install receives the seeded Registry baseline (same manifest as `npm run seed:registry`) without any manual step. The write is idempotent and never blocks startup.
- Supersedes the v1.5.1 statement that "the app never seeds at runtime"; `npm run seed:registry` remains available for manual re-seeding.
- Smoke coverage via `scripts/smoke-registry-baseline.mjs`.

### Added — Planner M1 comparison view

- Project detail gains the five-plan comparison view (M1) built on existing plan, assignment, and productivity facts. Display follows the frozen rules: same-currency values are summed only within a currency, unknown pricing is shown as unknown (never as zero), multi-currency values are listed side by side, and nothing is ranked or labelled cheapest/most expensive.

### Changed — Planner AI-option state enrichment

- Candidate generation derives a per-option resource state (source, registration state, entitlement, availability, pricing, capability) from existing Registry and resource facts, and the Task AI Options panel displays it. Facts only; generation still never filters, scores, or selects.

### Added — Commercial lifecycle and Planner Advanced gate

- New `commercial_state` singleton table and a commercial service with a 90-day full-access window that starts on first real use (Dashboard open posts to `/api/commercial/start`; `first_use_at` is written once and never rewritten).
- After the window expires, the two Planner Advanced generation services (`generateProjectPlanCombinations`, `generateProjectTaskAiOptions`) refuse with the stable error code `PLANNER_ADVANCED_LOCKED`, mapped to HTTP 402. Free Planner features and all historical reads remain available; nothing is deleted.
- Smoke coverage via `scripts/smoke-commercial-lifecycle.mjs`; existing Planner smoke scripts updated to stay green.

### Added — Planner Advanced UI lock

- When the API returns `PLANNER_ADVANCED_LOCKED`, the combination-plans card and the Task AI Options panel show a locked notice ("Planner advanced features require a paid plan after the 90-day full-access period.") and hide the corresponding generate button. Every other failure keeps the existing error path. This release contains no in-app payment or unlock flow.

### Fixed — Empty and error states

- `/saving`: the Model spending section now falls back to an empty state instead of rendering a titled blank block.
- `/ai-activity`: API failures show an error state, distinct from "No reliable AI activity detected."
- Dashboard Task Session card no longer renders raw API error messages.
- `/usage/details` and `/budget` empty states gained an "Import official usage export" CTA; `/budget` labels its default amounts as suggested values that are not saved.

### Fixed — Cost and import error messages

- `/costs` and `/usage/import` no longer surface raw API error text to the user; both show fixed, friendly messages and log the original error server-side only.

### Documentation

- Management documents (HANDOFF, daily log, direction/decisions) synced to record the batch state (`def18c2`).

## [1.5.4] — 2026-10-07

Planner project stages, the Planner Productivity Report (API and UI, read-only), and the Plan Detail resource display-name fix. The only schema change is the new `project_stages` table, created automatically on upgrade; no manual migration is required.

### Added — Planner project stages

- New `project_stages` table, created automatically at startup (`CREATE TABLE IF NOT EXISTS`); no manual migration.
- Stage CRUD and archive API: list/create stages per project (`/api/planner/projects/[id]/stages`), update and archive per stage (`/api/planner/stages/[id]`, `/api/planner/stages/[id]/archive`).
- Task grouping: tasks can belong to a stage, returned alongside plan tasks and task reads.
- Project detail and Plan Detail UI: stage management panel and stage grouping of plan steps.

### Added — Planner Productivity Report (read-only)

- `GET /api/planner/plans/[id]/productivity` endpoint backed by a new productivity service, computed from existing verified facts.
- Productivity panel in Plan Detail. Display only: no writes, no new judgements, no price or ranking semantics.
- Smoke coverage via `scripts/smoke-planner-productivity.mjs`.

### Fixed — Plan Detail resource display names

- The plan assignments API now returns `resource_name` and `resource_provider`, resolved from records that already exist (`ai_resources.name` for registered resources; registry provider and model name for registry models).
- Plan Detail shows the resolved name (for example `provider · model`); when no name exists it falls back to the stored `registry_model_id` / `ai_resource_id`. No name is ever invented.

## [1.5.3] — 2026-10-01

Task Sessions connected to usage attribution. Recorded from git history after release; version released 2026-10-01.

### Added — Task Session usage attribution

- Usage records can be attributed to a Task Session, with duplicate/conflict protection.
- Verified task-session usage and cost are reflected in the Task Session workflow.
- Version identity aligned at 1.5.3.

## [1.5.2] — 2026-09-30

Minimal fix release: Budget page repair and official cost integrity hardening. No schema or data-model changes. Recorded from git history after release; version released 2026-09-30.

### Fixed — Budget page

- A single-character SQL typo in the official spend query made `GET /api/budget` fail with an internal SQLite error, so the Budget page could not load data.

### Fixed — official cost integrity (P0)

- Hardened official cost integrity across the import, saving, efficiency, and cost-policy paths.
- Removed dead code from the DeepSeek provider and import routes.

## [1.5.1] — 2026-09-30

AI Registry v1, AI Project Planner, Planner resources and combination plans, plus the Planner AI-option generation UI, the task PATCH contract fix, and the production standalone static-assets fix. v1.5.0 was an interim version bump on `master`; it was never packaged and its content shipped as part of v1.5.1.

### Added — AI Registry v1

- Vendor-facts data layer: `providers`, `models`, `ai_model_capabilities`, `pricing_versions`, `user_ai_tools`.
- Tri-state capabilities. `NULL` is unknown, `0` is documented-unsupported, `1` is supported. A capability is never guessed.
- Seed manifest covering 4 providers and 10 models (DeepSeek, OpenAI, Anthropic, Google) with a `source_url` and a `source_checked_at` stamp.
- Only unconditional date-banded rates are seeded. Time-of-day bands, long-context tiers, cache-write pricing, and batch or regional SKUs are deliberately omitted, because the rate-card schema can only express a date range. DeepSeek has no seeded rates at all, since every DeepSeek rate is time-banded.
- `npm run seed:registry` for manual, idempotent seeding. The app never seeds at runtime.
- Registry read surface exposed as a repository, including `resolveRegistryPricing`, which returns `null` for "price unknown" and never `0`.

### Added — AI Project Planner

- Planner data layer and API: `projects`, `project_plans`, `project_tasks`, `project_task_ai_options`.
- Plan versions are immutable. A change produces a new version; existing versions are never edited.
- Planner UI: project list, project creation, project detail, and plan detail with steps and token buckets.
- Per-step AI option generation composed from three pure estimators — fit, cost, time — with a strategy layer for `cost_first`, `time_first`, and `balanced`.
- Generation returns facts, not recommendations. It never filters, never scores, never selects.
- Selection is a separate, explicit user action. `is_selected` is not in the create whitelist, and a client cannot pass `now`, a version, or an assignment to steer a result.
- `lib/planner-api-errors.ts` as the shared API contract: `{ ok: true }` / `{ error, code }`, 404/409/400/500 mapping, and field whitelisting that keeps `id`, `status`, `version`, `sequence`, and `is_selected` out of client hands.
- AI option generation is connected to the plan UI (`POST /api/planner/tasks/[id]/ai-options/generate` plus the per-step panel). The Generate action is offered only for the three preference plans; combination-strategy plans show a hint instead.
- A planned step's generate endpoint performs an atomic replace of its candidate set and resets every row to `is_selected = 0`; selection always stays a separate explicit step.

### Fixed

- The task PATCH endpoint no longer accepts `taskId`: the execution-task link remains the separate `linkProjectTaskToExecutionTask` command, and a client that sends `taskId` now receives `400 UNKNOWN_FIELD` instead of a silent no-op.
- Production standalone fix: client static assets are copied into the standalone output on startup, so `/ _next/static` requests no longer 404 and the Planner pages load on the release server.

### Added — Planner resources and combination plans

- `ai_resources`: what the user actually owns. Access method, channel, entitlement, owner, and status. No credential columns.
- Resources archive, they do not delete. Status cannot be flipped through a plain patch.
- Resource pricing-basis columns: `pricing_basis_kind`, `pricing_version_id`, `pricing_basis_checked_at`. A pinned version is honored even when out of force; `none` means no nominal pricing at all.
- `lib/planner/registered-pricing.ts` as the single authority for a registered resource's pricing basis, shared by the combination and task ai-options paths.
- `lib/planner/combination-rules.ts` and `combination-service.ts`: whole-project evaluation across five strategies, with role derivation and out-of-pocket accounting.
- Combination results are persisted atomically alongside the plan and returned as facts, never a pick.
- Verified usage evidence read into the planner from existing Money Layer records, split per currency.
- Resource assignments are display context only. They never become a price and never feed `planned_cost_*`, `cost_basis`, or `pricing_basis_kind`.

### Changed

- Registered resource pricing is now honored uniformly in the planner cost basis, so the combination path and the task ai-options path no longer disagree.
- A resource whose pricing basis resolves to unknown stays unpriced rather than falling back to a guess.

### Not changed

- v1.4.1 remains frozen. None of the above modifies the Dashboard, Task Session, the core modules, or the installer.
- No change to `lib/cost-engine.ts`, `lib/cost-policy.ts`, or the Money Layer evidence rules.
- The Registry and Planner layers add no new dependency. The only dependency added across the release cycle is `playwright` (^1.63.0), used for browser-verified UI checks.

---

## [1.4.1] — 2026-09-27

- Core module navigation: the five core modules (Usage, Saving, Budget, AI Activity, Efficiency) can be switched directly from any core module page.
- Moving between core modules no longer requires passing through the Dashboard.
- Added a direct Dashboard return entry to `/usage/details` and to `/usage/import`.
- Existing parent return entries preserved.
- No changes to the Dashboard, Task Session, API, database, or installer.

## [1.4.0] — 2026-09-26

### Added

- v1.4-A Task data layer: `tasks`, `task_sessions`, `task_usage_records`, with a partial unique index enforcing a single active task session.
- Task repository and Task service for task and session lifecycle management.
- `/api/tasks`: `GET` returns the active session and task history; `POST` supports create/start, stop/complete, and stop/abandon.
- Dashboard Task Session UI: Start Task, Active Task with live elapsed time, Complete Task, Abandon Task, Task History.
- Isolated Task smoke test suite (22 checks) that never touches the production or project database.

### Fixed

- Two v1.4-B Task Session lint regressions (`react-hooks/set-state-in-effect` in `app/page.tsx`).

## [1.3.0] — 2026-09-26

- Corrected Dashboard verified-record semantics.
- Added cost concentration evidence to Saving.
- Added efficiency evidence to Saving.
- Added verified Money Layer efficiency metrics to Saving.
- Improved Usage wording to distinguish all stored records from the selected reporting period.
- Shipped the v1.3.0 desktop installer package.

## [1.2.0] — 2026-09-26

- The Efficiency page now shows per-model efficiency for the selected period.
- The Efficiency page now shows a day-by-day efficiency table.

## [1.1.0] — 2026-09-06

- DeepSeek official usage export ZIP import: the platform's usage-data ZIP imports directly into the local SQLite database.
- Preview phase is read-only. Parsing and validation write nothing.
- Confirm phase writes to `%APPDATA%\AI-Cost-Management\data\ai-token-cost-monitor.db`.
- Imported records carry `official_export` source and `verified` accuracy semantics.
- Deterministic record IDs and deduplication make repeat imports safe.
- The Usage page gained a persistent "Import official usage export" entry.
- v1.0.0 remained frozen and unmodified; v1.1.0 is additive to it.

## [1.0.0] — 2026-09-06

- Initial release. Windows x64 desktop distribution.
- Portable Node.js runtime and a Next.js standalone build, packaged as a CAB with a bootstrapper installer.
- Per-user installation under `%LOCALAPPDATA%\AI-Cost-Management\App`; user data under `%APPDATA%\AI-Cost-Management\data`.
- Money Layer: verified cost tracking from official sources only.
- Dashboard, Usage, Saving, Budget, and AI Activity modules.
- Uninstall preserves user cost history and data.

### Known non-blockers at 1.0.0

- The installer is unsigned; SmartScreen or reputation warnings are expected on first install.
- MSIX was not part of v1.0.0.
- No Apps & Features uninstall registration. `uninstall.cmd` remains the validated mechanism.
