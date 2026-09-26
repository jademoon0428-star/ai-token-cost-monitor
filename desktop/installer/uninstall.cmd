@echo off
setlocal
title AI Cost Management - uninstall
set "APPDIR=%LOCALAPPDATA%\AI-Cost-Management\App"
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\AI Cost Management.lnk"

if not defined LOCALAPPDATA (
    echo [uninstall] error: LOCALAPPDATA is not defined.
    exit /b 1
)

echo.
echo This removes the installed application files:
echo   %APPDIR%
echo and the Start Menu shortcut:
echo   %LNK%
echo.
echo Your cost history database is NOT affected:
echo   %APPDATA%\AI-Cost-Management\data
echo.

rem --- If the app is running: safe-fail, never force-kill. ---
powershell.exe -NoProfile -Command "if (Get-Process -Name 'AI Cost Management' -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo [uninstall] AI Cost Management is currently running.
    echo [uninstall] Close it first, then run this script again. Nothing was deleted.
    exit /b 2
)

if exist "%APPDIR%" (
    rd /s /q "%APPDIR%"
    if errorlevel 1 (
        echo [uninstall] error: could not remove "%APPDIR%".
        exit /b 3
    )
    echo [uninstall] removed: "%APPDIR%"
) else (
    echo [uninstall] app directory not present.
)

if exist "%LNK%" (
    del /f /q "%LNK%"
    if errorlevel 1 (
        echo [uninstall] error: could not remove shortcut "%LNK%".
        exit /b 4
    )
    echo [uninstall] removed shortcut: "%LNK%"
) else (
    echo [uninstall] shortcut not present.
)

echo [uninstall] done. User data preserved at "%APPDATA%\AI-Cost-Management\data".
exit /b 0