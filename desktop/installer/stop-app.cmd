@echo off
setlocal enabledelayedexpansion
rem Stops the installed AI Cost Management app tree.
rem 1. Sends CTRL_C to the app console via a transient helper (best-effort graceful).
rem 2. Waits a bounded time for graceful exit.
rem 3. Falls back to a deterministic taskkill of the app EXE tree.
rem The helper output is held in a temp file so it never swallows console signals.

set "TMPOUT=%TEMP%\acm-stop-helper.out"

for /f %%a in ('powershell.exe -NoProfile -Command "(Get-Process -Name 'AI Cost Management' -ErrorAction SilentlyContinue | Select-Object -First 1).Id"') do set "EXEPID=%%a"

if not defined EXEPID (
    echo [stop] AI Cost Management is not running.
    exit /b 0
)

echo [stop] pid=!EXEPID! - sending graceful CTRL_C ...
"%~dp0stop-helper.exe" !EXEPID! > "!TMPOUT!" 2>&1
echo [stop] helper: (type "!TMPOUT!" ^2>nul ^& echo ^[none^])

set /a "waits=0"
:waitloop
tasklist /FI "PID eq !EXEPID!" /NH 2>nul | find /I "!EXEPID!" >nul
if errorlevel 1 (
    echo [stop] app exited (graceful or early fallback). done.
    del /q "!TMPOUT!" 2>nul
    exit /b 0
)
set /a waits+=1
if !waits! geq 15 goto :timeout
timeout /t 1 /nobreak >nul
goto :waitloop

:timeout
echo [stop] graceful timeout (15s). forcing tree stop via taskkill ...
taskkill /PID !EXEPID! /T /F
if errorlevel 1 (
    echo [stop] ERROR: could not stop AI Cost Management. exit code: !errorlevel!
    del /q "!TMPOUT!" 2>nul
    exit /b 2
)
echo [stop] forced tree stop done.
del /q "!TMPOUT!" 2>nul
exit /b 0