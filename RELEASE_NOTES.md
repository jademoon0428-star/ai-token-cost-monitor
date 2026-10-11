# AI Cost Management v1.0.0

## Release Status
Release Candidate / Final Freeze

## Product
AI Cost Management

## Version
1.0.0

## Platform
Windows x64

## Installer
AI-Cost-Management-Setup.exe

## Package
AI-Cost-Management-Payload.cab

## Installation
Per-user installation under:
%LOCALAPPDATA%\AI-Cost-Management\App

## User Data
%APPDATA%\AI-Cost-Management\data

## Uninstall
Application files and Start Menu shortcut are removed.
User cost history/data is preserved.

## Validation
- Production standalone runtime validated
- Bundled Node.js runtime validated
- Installer install validated
- Application startup validated
- /api/usage validated
- /api/ai-activity validated
- Repeat installation validated
- Uninstall validated
- User data preservation validated
- Database integrity validated
- No database shipped inside release package
- No source files shipped inside release package

## Installer SHA256

Setup:
1F2F02B4A4AC366C05A4EBD194B49403EF12117AB22044262F7D6DA07BCFEFBB

Payload:
D4E401E81543B853F967D13A41A8D0753A19CF90B7978C9D4DE0678D6E7AB18B

## Known Non-Blockers
- Installer is currently unsigned.
- Windows SmartScreen/reputation warnings may appear for an unsigned first release.
- MSIX is not part of v1.0.0.
- No formal Apps & Features uninstall registration is included; uninstall.cmd remains the validated developer/test uninstall mechanism.

## Freeze Rule
After this point, no business-code changes should be made for v1.0.0.
Any new feature or code change should start a new version/release cycle.

---

# AI Cost Management v1.1.0

## Release Status
Release Preparation

## Version
1.1.0

## Changes in v1.1.0
- DeepSeek official usage export ZIP Import: import the DeepSeek platform's usage-data ZIP directly into the local SQLite database.
- Preview phase is read-only: parsing and validation write nothing to the database.
- Confirm phase writes to user data under %APPDATA%\AI-Cost-Management\data\ai-token-cost-monitor.db.
- Imported records carry `official_export` source and `verified` accuracy semantics.
- Deterministic record IDs and deduplication make repeat imports safe (skipped duplicates).
- Usage page gains a persistent "Import official usage export" entry (no longer only a first-run action).
- The v1.0.0 release remains frozen and unmodified; v1.1.0 is additive to it.

---

# AI Cost Management v1.2.0

## Release Status
Released

## Version
1.2.0

## Changes in v1.2.0
- The Efficiency page now shows per-model efficiency for the selected period.
- The Efficiency page now shows a day-by-day efficiency table.

---

# AI Cost Management v1.3.0

## Release Status
Released

## Version
1.3.0

## Changes in v1.3.0
- Corrected Dashboard verified-record semantics.
- Added cost concentration evidence to Saving.
- Added efficiency evidence to Saving.
- Added verified Money Layer efficiency metrics to Saving.
- Improved Usage wording to distinguish all stored records from the selected reporting period.
- Shipped the v1.3.0 desktop installer package.

---

# AI Cost Management v1.4.0

## Release Status
Released

## Version
1.4.0

## Changes in v1.4.0
- v1.4-A Task data layer: added tasks, task_sessions, and task_usage_records tables with a partial unique index enforcing a single active task session.
- Added the Task repository and Task service for task and session lifecycle management.
- Added an isolated Task smoke test suite (22 checks) that never touches the production or project database.
- v1.4-B: added the /api/tasks route (GET returns the active session and task history; POST supports create/start, stop/complete, and stop/abandon).
- Added the Dashboard Task Session UI: Start Task, Active Task with live elapsed time, Complete Task, Abandon Task, and Task History.
- Fixed two v1.4-B Task Session lint regressions (react-hooks/set-state-in-effect in app/page.tsx).

---

# AI Cost Management v1.4.1

## Release Status
Release Preparation

## Version
1.4.1

## Changes in v1.4.1
- Core Module Navigation: the five core modules (Usage, Saving, Budget, AI Activity, Efficiency) can now be switched directly from any core module page.
- Moving between core modules no longer requires passing through the Dashboard.
- Added a direct Dashboard return entry to /usage/details.
- Added a direct Dashboard return entry to /usage/import.
- Existing parent return entries are preserved.
- No changes to the Dashboard, Task Session, API, database, or installer.

---

# AI Cost Management v1.5.1

## Release Status
Final Release Freeze

## Version
1.5.1

## Date
2026-09-30

## Changes in v1.5.1
- AI Registry v1: providers, models, capabilities, and official rate cards, seeded from vendor documentation.
- AI Project Planner: projects, immutable plan versions, planned steps with token buckets, and per-step candidate AI options. Options are facts, never recommendations; selection is a separate, explicit user action.
- Planner resources and combination plans: ownership facts (access method, channel, entitlement, pricing basis) and whole-project combination plans across five strategies.
- Planner AI option generation connected to the plan UI, available for the preference plans (Cost First, Time First, Balanced).
- The task PATCH contract no longer accepts `taskId`; held-back fields are rejected instead of silently ignored.
- Production standalone fix: client static assets are copied into the standalone output on startup (fixes `/ _next/static` 404s).
- No changes to the Dashboard, Budget, AI Activity, or database behavior.
- v1.5.0 was an interim version bump and was never packaged; its content is included in v1.5.1.

## Installer
AI-Cost-Management-Setup.exe

## Package
AI-Cost-Management-Payload.cab

---

# AI Cost Management v1.5.4

## Release Status
Final

## Version
1.5.4

## Date
2026-10-07

## Changes in v1.5.4
- Planner project stages: a new `project_stages` table (created automatically on upgrade, no manual migration), stage CRUD and archive API, task grouping by stage, and stage management in the project and Plan Detail UI.
- Planner Productivity Report: a read-only productivity endpoint for a plan plus the productivity panel in Plan Detail. Display only; no data is written and no new judgements are introduced.
- Plan Detail resource display names: assignments show the resolved resource name and provider (registered resource `name`; registry model provider and model name), falling back to the stored `registry_model_id` / `ai_resource_id` only when no name exists.
- Upgrade note: the only schema change is the new `project_stages` table, created automatically at startup; no manual migration is required.

## Installer
AI-Cost-Management-Setup.exe

## Package
AI-Cost-Management-Payload.cab

## Installer SHA256
01C130AAA8974FED9218E7F64DB571C78118567D285A0A779276D8BDA4B9951E

---

# AI Cost Management v1.5.5

## Release Status
Release Preparation (full 17-item smoke gate passed 17/17 on 2026-10-10; the DeepSeek DB smoke now isolates to a temp database by default — test tooling only, no product data change; read-only release risk review and precondition checks completed; official CAB/Setup/README/SHA256SUMS, installer SHA256 backfill, install validation, and tag are not yet done)

## Version
1.5.5

## Date
2026-10-10

## Changes in v1.5.5
- Declared AI resources inventory: declare ways of reaching an AI model that the app cannot verify itself (web subscription, third-party gateway, shared account). Declarations store no credentials and never enter the Registry or the owned-resources inventory. Managed from the Planner resources page.
- AI Registry startup baseline: an empty install now seeds the Registry baseline automatically at startup (idempotent, never blocks startup). Running `npm run seed:registry` manually is no longer required for first run.
- Planner AI-option state: each generated option now shows its resource state (source, registration, entitlement, availability, pricing, capability) as facts. Generation still never filters, scores, or recommends.
- Planner comparison view (M1): project detail shows the five-plan comparison built from existing plan facts. Same-currency values are summed per currency only; unknown pricing is shown as unknown; nothing is ranked.
- Empty and error state fixes: /saving model-spending empty fallback, /ai-activity error state (now distinct from "nothing detected"), Dashboard task-session error copy, /usage/details and /budget empty-state import CTAs, /budget default amounts labelled as unsaved suggestions.
- Cost and import error messages: /costs and /usage/import show fixed friendly error text instead of raw API errors.
- Upgrade note: new tables `declared_ai_resources` and `commercial_state` are created automatically at startup; `project_task_ai_options.model_id` became nullable. No manual migration is required.

## Behavior Change — Planner Advanced gate (please read)
- A 90-day full-access window starts on first real use (the first time the Dashboard opens in a session; recorded once as the first-use timestamp and never rewritten).
- After 90 days, two Planner features are gated behind a paid plan: combination-plan generation and per-task AI-options generation. The app shows the notice "Planner advanced features require a paid plan after the 90-day full-access period." and hides those generate buttons.
- This version contains no in-app payment, license entry, or unlock flow. Free features — import, Dashboard, Budget, Saving, Efficiency, AI Activity, Registry facts, and all existing Planner reading and management — remain available, and historical plans and options are never deleted.

## Installer
AI-Cost-Management-Setup.exe

## Package
AI-Cost-Management-Payload.cab

## Installer SHA256
AI-Cost-Management-Setup.exe SHA256 verified:
C8403A4D9276D2636D3EF1844865D5404F8DFB3B3DA24AE2102FA705C5F128EF
