@echo off
chcp 65001 >nul
title NAS Quick Restart

echo =====================================
echo      NAS Quick Restart Tool
echo =====================================
echo.

:: Check if in correct directory
if not exist "..\server\server.js" (
    echo [ERROR] Please run this script from scripts directory
    pause
    exit /b 1
)

:: Stop all services
echo [1/3] Stopping existing services...
call stop-nas.bat

:: Wait for processes to fully close
echo Waiting for processes to close...
timeout /t 3 /nobreak >nul

:: Clean port configuration files
if exist "..\.ports" (
    echo Cleaning port configuration...
    del ..\.ports
)

if exist "..\.port-config.json" (
    echo Cleaning port configuration JSON...
    del ..\.port-config.json
)

:: Clean client temporary files
if exist "..\client\.env.local" (
    echo Cleaning client temporary configuration...
    del "..\client\.env.local"
)

:: Restart services
echo.
echo [2/3] Restarting services...
call start-nas.bat

echo.
echo [3/3] Restart complete
echo =====================================
echo If problems persist, please:
echo   • Run check_port.bat to check port status
echo   • Run scripts\test-mongodb.bat to check database
echo   • Check firewall settings
echo =====================================
pause 