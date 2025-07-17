@echo off
chcp 65001 >nul
title NAS System Startup

echo =====================================
echo      NAS System Startup
echo =====================================
echo.

:: Check if programs are already running
echo [1/4] Checking program status...
netstat -an | findstr ":5000" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Server already running (port 5000)
    set SERVER_RUNNING=1
) else (
    echo [WARN] Server not running
    set SERVER_RUNNING=0
)

netstat -an | findstr ":3000" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Client already running (port 3000)
    set CLIENT_RUNNING=1
) else (
    echo [WARN] Client not running
    set CLIENT_RUNNING=0
)

:: If programs are already running, just open browser
if %SERVER_RUNNING% equ 1 if %CLIENT_RUNNING% equ 1 (
    echo.
    echo =====================================
    echo        Program Already Running
    echo.
    echo Opening web interface...
    start http://localhost:3000
    echo.
    echo To restart, please run stop.bat first
    echo =====================================
    timeout /t 3 /nobreak >nul
    exit
)

:: If partially running, stop all services first
if %SERVER_RUNNING% equ 1 (
    echo Stopping existing server...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

if %CLIENT_RUNNING% equ 1 (
    echo Stopping existing client...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: Check necessary files
echo [2/4] Checking necessary files...
if not exist "server\server.js" (
    echo [ERROR] Server file not found
    pause
    exit /b 1
)

if not exist "client\package.json" (
    echo [ERROR] Client file not found
    pause
    exit /b 1
)

:: Create .env file
if not exist ".env" (
    echo Creating default .env file...
    echo MONGODB_URI=mongodb://localhost:27017/nas_system > .env
    echo JWT_SECRET=your-secret-key-change-this >> .env
    echo PORT=5000 >> .env
    echo [OK] Default .env file created
)

:: Check port availability
echo [3/4] Checking port availability...
set SERVER_PORT=5000
set CLIENT_PORT=3000

:check_server_port
netstat -an | findstr ":%SERVER_PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo Port %SERVER_PORT% is occupied, trying next port...
    set /a SERVER_PORT+=1
    if %SERVER_PORT% gtr 5010 (
        echo [ERROR] Cannot find available port
        pause
        exit /b 1
    )
    goto check_server_port
) else (
    echo [OK] Server using port: %SERVER_PORT%
)

:check_client_port
netstat -an | findstr ":%CLIENT_PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo Port %CLIENT_PORT% is occupied, trying next port...
    set /a CLIENT_PORT+=1
    if %CLIENT_PORT% gtr 3010 (
        echo [ERROR] Cannot find available port
        pause
        exit /b 1
    )
    goto check_client_port
) else (
    echo [OK] Client using port: %CLIENT_PORT%
)

:: Start server
echo [4/4] Starting server...
cd server
set PORT=%SERVER_PORT%
start "NAS Server" cmd /c "node server.js %SERVER_PORT%"
cd ..

:: Wait for server to start
echo Waiting for server to start...
timeout /t 8 /nobreak >nul

:: Start client
echo Starting client...
cd client
set PORT=%CLIENT_PORT%
set BROWSER=none
set REACT_APP_SERVER_PORT=%SERVER_PORT%
set REACT_APP_CLIENT_PORT=%CLIENT_PORT%

:: Create temporary environment file
echo REACT_APP_SERVER_PORT=%SERVER_PORT% > .env.local
echo REACT_APP_CLIENT_PORT=%CLIENT_PORT% >> .env.local

start "NAS Client" cmd /c "npm start"
cd ..

:: Wait for client to start
echo Waiting for client to start...
timeout /t 12 /nobreak >nul

:: Open browser
echo Opening web interface...
start http://localhost:%CLIENT_PORT%

echo.
echo =====================================
echo        Startup Complete
echo.
echo Service Status:
echo   • Server: Running (port %SERVER_PORT%)
echo   • Client: Running (port %CLIENT_PORT%)
echo   • Web Interface: Opened
echo.
echo Port configuration saved to .ports file
echo To stop services, run stop.bat
echo =====================================

:: Save port information
echo SERVER_PORT=%SERVER_PORT% > .ports
echo CLIENT_PORT=%CLIENT_PORT% >> .ports

:: Create port info file for frontend
echo {"serverPort": %SERVER_PORT%, "clientPort": %CLIENT_PORT%} > .port-config.json

timeout /t 3 /nobreak >nul 