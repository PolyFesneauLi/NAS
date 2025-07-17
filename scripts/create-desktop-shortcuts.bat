@echo off
chcp 65001 >nul
title Create Desktop Shortcuts

echo =====================================
echo     Create NAS System Desktop Shortcuts
echo =====================================
echo.

:: Get current directory and project root
set "CURRENT_DIR=%~dp0"
set "PROJECT_ROOT=%CURRENT_DIR%.."
set "DESKTOP_DIR=%USERPROFILE%\Desktop"

echo Current directory: %CURRENT_DIR%
echo Project root: %PROJECT_ROOT%
echo Desktop directory: %DESKTOP_DIR%
echo.

:: Check if icon files exist
if not exist "%PROJECT_ROOT%\ico_blue.ico" (
    echo [ERROR] Blue icon file not found: %PROJECT_ROOT%\ico_blue.ico
    pause
    exit /b 1
)

if not exist "%PROJECT_ROOT%\ico_red.ico" (
    echo [ERROR] Red icon file not found: %PROJECT_ROOT%\ico_red.ico
    pause
    exit /b 1
)

:: Create start shortcut
echo [1/2] Creating start shortcut...
set "START_BAT=%CURRENT_DIR%start-nas.bat"
set "START_SHORTCUT=%DESKTOP_DIR%\Start NAS System.lnk"

echo Creating shortcut: %START_SHORTCUT%
echo Target: %START_BAT%
echo Working Directory: %PROJECT_ROOT%
echo Icon: %PROJECT_ROOT%\ico_blue.ico

powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%START_SHORTCUT%'); $Shortcut.TargetPath = '%START_BAT%'; $Shortcut.WorkingDirectory = '%PROJECT_ROOT%'; $Shortcut.Description = 'Start NAS File Management System'; $Shortcut.IconLocation = '%PROJECT_ROOT%\ico_blue.ico'; $Shortcut.Save()"

if exist "%START_SHORTCUT%" (
    echo [OK] Start shortcut created successfully
) else (
    echo [ERROR] Failed to create start shortcut
)

:: Create stop shortcut
echo [2/2] Creating stop shortcut...
set "STOP_BAT=%CURRENT_DIR%stop-nas.bat"
set "STOP_SHORTCUT=%DESKTOP_DIR%\Stop NAS System.lnk"

echo Creating shortcut: %STOP_SHORTCUT%
echo Target: %STOP_BAT%
echo Working Directory: %PROJECT_ROOT%
echo Icon: %PROJECT_ROOT%\ico_red.ico

powershell -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STOP_SHORTCUT%'); $Shortcut.TargetPath = '%STOP_BAT%'; $Shortcut.WorkingDirectory = '%PROJECT_ROOT%'; $Shortcut.Description = 'Stop NAS File Management System'; $Shortcut.IconLocation = '%PROJECT_ROOT%\ico_red.ico'; $Shortcut.Save()"

if exist "%STOP_SHORTCUT%" (
    echo [OK] Stop shortcut created successfully
) else (
    echo [ERROR] Failed to create stop shortcut
)

echo.
echo =====================================
echo        Desktop Shortcuts Created
echo.
echo Created shortcuts:
echo   • Start NAS System.lnk - Start the system (Blue icon)
echo   • Stop NAS System.lnk - Stop all services (Red icon)
echo.
echo Shortcut Details:
echo   • Working Directory: %PROJECT_ROOT%
echo   • Icons: %PROJECT_ROOT%\ico_blue.ico, %PROJECT_ROOT%\ico_red.ico
echo.
echo Usage:
echo 1. Double-click "Start NAS System" to start the system
echo 2. System will automatically open browser after startup
echo 3. Only two icons will appear in taskbar (server and client)
echo 4. Double-click "Stop NAS System" to stop all services
echo.
echo Note: First run may need to install dependencies, please wait patiently
echo =====================================
pause 