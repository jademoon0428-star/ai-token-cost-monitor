# Changelog

All notable changes to AI Cost Management, newest first.

Derived from the git history. Released versions are frozen; the `[Unreleased]` section is additive and does not modify them.

## [Unreleased]

Post-v1.4.1 work on `master`. Not versioned, not packaged, not released.

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
- No new dependency. The Registry and Planner add none.

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
