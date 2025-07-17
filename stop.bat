@echo off
chcp 65001 >nul
echo Stopping NAS File Management System...

:: Read port information
if exist ".ports" (
    echo Reading port configuration...
    for /f "tokens=2 delims==" %%a in ('findstr "SERVER_PORT" .ports') do set SERVER_PORT=%%a
    for /f "tokens=2 delims==" %%a in ('findstr "CLIENT_PORT" .ports') do set CLIENT_PORT=%%a
    echo Detected ports: Server=%SERVER_PORT%, Client=%CLIENT_PORT%
) else (
    echo Port configuration file not found, using default ports...
    set SERVER_PORT=5000
    set CLIENT_PORT=3000
)

:: Precisely close processes on specified ports
echo Closing server (port %SERVER_PORT%)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%SERVER_PORT%"') do (
    echo Closing process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo Closing client (port %CLIENT_PORT%)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%CLIENT_PORT%"') do (
    echo Closing process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

:: Additional check and close remaining Node.js processes (limited to relevant ports)
echo Checking and closing related Node.js processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000\|:5001\|:5002\|:5003\|:5004\|:5005\|:5006\|:5007\|:5008\|:5009\|:5010"') do (
    echo Closing server process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000\|:3001\|:3002\|:3003\|:3004\|:3005\|:3006\|:3007\|:3008\|:3009\|:3010"') do (
    echo Closing client process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)

:: Wait for processes to fully close
timeout /t 2 /nobreak >nul

:: Verify if ports are released
echo Verifying port status...
netstat -an | findstr ":%SERVER_PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Server port %SERVER_PORT% may still be occupied
) else (
    echo [OK] Server port %SERVER_PORT% released
)

netstat -an | findstr ":%CLIENT_PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Client port %CLIENT_PORT% may still be occupied
) else (
    echo [OK] Client port %CLIENT_PORT% released
)

echo ============================
echo NAS File Management System Stopped
echo ============================
timeout /t 3 