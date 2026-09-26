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