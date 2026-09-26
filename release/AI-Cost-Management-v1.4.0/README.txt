AI Cost Management
Version 1.4.0

Purpose:
A local Windows-first AI cost monitoring and management application.

v1.4.0 highlights:
- Added the Task data layer: tasks, task_sessions, and task_usage_records tables.
- Enforced a single active task session per task.
- Added the Task repository and Task service for task and session lifecycle management.
- Added the /api/tasks route for task and session lifecycle management.
- Added the Dashboard Task Session UI: Start Task, Active Task, Complete Task, Abandon Task, and Task History.
- Added an isolated Task smoke test suite (22 checks) that never touches the production or project database.
- Fixed two Task Session lint regressions.

Data policy:
Only source-reported verified or exact costs are counted as monetary cost.
Local Activity evidence is not converted into estimated monetary cost.

Installation:
Run AI-Cost-Management-Setup.exe.

User data:
User data is stored under:
%APPDATA%\AI-Cost-Management\data

Upgrade behavior:
Existing user data is preserved during installation.

Release build:
Version: 1.4.0
BUILD_ID: MyvyqIH_zZZEviZO2U8zF
