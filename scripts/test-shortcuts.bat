@echo off
chcp 65001 >nul
title Test Shortcuts and Paths

echo =====================================
echo     Test Shortcuts and Paths
echo =====================================
echo.

:: Get current directory and project root
set "CURRENT_DIR=%~dp0"
set "PROJECT_ROOT=%CURRENT_DIR%.."
set "DESKTOP_DIR=%USERPROFILE%\Desktop"

echo [1/4] Directory Information:
echo Current directory: %CURRENT_DIR%
echo Project root: %PROJECT_ROOT%
echo Desktop directory: %DESKTOP_DIR%
echo.

echo [2/4] Checking icon files:
if exist "%PROJECT_ROOT%\ico_blue.ico" (
    echo [OK] Blue icon found: %PROJECT_ROOT%\ico_blue.ico
) else (
    echo [ERROR] Blue icon not found: %PROJECT_ROOT%\ico_blue.ico
)

if exist "%PROJECT_ROOT%\ico_red.ico" (
    echo [OK] Red icon found: %PROJECT_ROOT%\ico_red.ico
) else (
    echo [ERROR] Red icon not found: %PROJECT_ROOT%\ico_red.ico
)
echo.

echo [3/4] Checking essential files:
if exist "%PROJECT_ROOT%\server\server.js" (
    echo [OK] Server file found: %PROJECT_ROOT%\server\server.js
) else (
    echo [ERROR] Server file not found: %PROJECT_ROOT%\server\server.js
)

if exist "%PROJECT_ROOT%\client\package.json" (
    echo [OK] Client file found: %PROJECT_ROOT%\client\package.json
) else (
    echo [ERROR] Client file not found: %PROJECT_ROOT%\client\package.json
)
echo.

echo [4/4] Checking existing shortcuts:
if exist "%DESKTOP_DIR%\Start NAS System.lnk" (
    echo [OK] Start shortcut exists: %DESKTOP_DIR%\Start NAS System.lnk
) else (
    echo [WARN] Start shortcut not found
)

if exist "%DESKTOP_DIR%\Stop NAS System.lnk" (
    echo [OK] Stop shortcut exists: %DESKTOP_DIR%\Stop NAS System.lnk
) else (
    echo [WARN] Stop shortcut not found
)
echo.

echo =====================================
echo        Test Complete
echo =====================================
echo.
echo If you see any errors above, please:
echo 1. Run create-desktop-shortcuts.bat to recreate shortcuts
echo 2. Ensure all files are in the correct locations
echo 3. Check file permissions
echo.
pause 