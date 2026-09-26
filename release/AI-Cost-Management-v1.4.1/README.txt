AI Cost Management
Version 1.4.1

Purpose:
A local Windows-first AI cost monitoring and management application.

v1.4.1 highlights:
- Core Module Navigation: the five core modules (Usage, Saving, Budget, AI Activity, Efficiency) can now be switched directly from any core module page.
- Moving between core modules no longer requires passing through the Dashboard.
- Added a direct Dashboard return entry to /usage/details.
- Added a direct Dashboard return entry to /usage/import.
- Existing parent return entries are preserved.
- No changes to the Dashboard, Task Session, API, database, or installer.

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
Version: 1.4.1
BUILD_ID: DwWZIOazkLt4sP-QODQjJ
