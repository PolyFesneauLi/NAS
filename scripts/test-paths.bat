@echo off
chcp 65001 >nul
title Path Test

echo =====================================
echo      Path Test
echo =====================================
echo.

echo [1/4] Testing server file paths...
if exist "..\server\server.js" (
    echo ✓ Server file found: ..\server\server.js
) else (
    echo ✗ Server file not found: ..\server\server.js
)

if exist "..\client\package.json" (
    echo ✓ Client file found: ..\client\package.json
) else (
    echo ✗ Client file not found: ..\client\package.json
)

echo.
echo [2/4] Testing icon files...
if exist "..\ico_blue.ico" (
    echo ✓ Blue icon found: ..\ico_blue.ico
) else (
    echo ✗ Blue icon not found: ..\ico_blue.ico
)

if exist "..\ico_red.ico" (
    echo ✓ Red icon found: ..\ico_red.ico
) else (
    echo ✗ Red icon not found: ..\ico_red.ico
)

echo.
echo [3/4] Testing script files...
if exist "start-nas.bat" (
    echo ✓ start-nas.bat found
) else (
    echo ✗ start-nas.bat not found
)

if exist "stop-nas.bat" (
    echo ✓ stop-nas.bat found
) else (
    echo ✗ stop-nas.bat not found
)

if exist "create-desktop-shortcuts.bat" (
    echo ✓ create-desktop-shortcuts.bat found
) else (
    echo ✗ create-desktop-shortcuts.bat not found
)

echo.
echo [4/4] Testing script execution...
echo Testing start-nas.bat (should show file check)...
call start-nas.bat >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ start-nas.bat executed successfully
) else (
    echo ✗ start-nas.bat execution failed
)

echo.
echo =====================================
echo Path Test Complete
echo =====================================
echo.
echo If all tests passed, the paths are correct.
echo You can now run:
echo   • scripts\create-desktop-shortcuts.bat to create shortcuts
echo   • scripts\start-nas.bat to start the system
echo   • scripts\stop-nas.bat to stop the system
echo.
pause 