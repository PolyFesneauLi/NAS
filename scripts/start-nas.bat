@echo off
chcp 65001 >nul
title NAS System Startup (Improved)

echo =====================================
echo      NAS System Startup (Improved)
echo =====================================
echo.

setlocal enabledelayedexpansion

REM Get script directory and project root
set "SCRIPT_DIR=%~dp0"  
set "PROJECT_ROOT=%SCRIPT_DIR%.."

echo Script directory: %SCRIPT_DIR%
echo Project root: %PROJECT_ROOT%
echo Current working directory: %CD%
echo.

REM Change to project root directory
cd /d "%PROJECT_ROOT%"
echo Changed to project root: %CD%
echo.

REM Force stop all existing Node.js processes
echo [0/4] Stopping existing processes...
taskkill /f /im node.exe >nul 2>&1
timeout /t 3 /nobreak >nul
echo [OK] All Node.js processes stopped
echo.

REM Check npm dependencies
echo [1/4] Checking npm dependencies...

echo ========================
echo Installing SERVER dependencies
echo ========================
cd server
call npm install --silent
if %errorlevel% neq 0 (
    echo [ERROR] Server dependencies installation failed
    pause
    exit /b 1
)
cd ..

echo ========================
echo Installing CLIENT dependencies
echo ========================
cd client
call npm install --silent
if %errorlevel% neq 0 (
    echo [ERROR] Client dependencies installation failed
    pause
    exit /b 1
)
cd ..

echo [OK] Npm dependencies installed
echo.

REM Check necessary files
echo [2/4] Checking necessary files...
if not exist "server\server.js" (
    echo [ERROR] Server file not found: %CD%\server\server.js
    pause
    exit /b 1
)

if not exist "client\package.json" (
    echo [ERROR] Client file not found: %CD%\client\package.json
    pause
    exit /b 1
)

echo [OK] All necessary files found
echo.

REM Check for .env file in server directory
if not exist "server\.env" (
    echo [WARNING] No .env file found in server directory
    echo Please run deploy.bat first to configure the system
    echo.
    set /p CONTINUE="Continue without configuration? (y/n): "
    if /i not "!CONTINUE!"=="y" (
        echo Startup cancelled
        pause
        exit /b 0
    )
)

REM Find available ports
echo [3/4] Finding available ports...
set SERVER_PORT=5000
set CLIENT_PORT=3000

:find_server_port
netstat -an | findstr ":%SERVER_PORT%" | findstr "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo Port %SERVER_PORT% is occupied, trying next port...
    set /a SERVER_PORT+=1
    if !SERVER_PORT! gtr 5010 (
        echo [ERROR] Cannot find available server port
        pause
        exit /b 1
    )
    goto find_server_port
) else (
    echo [OK] Server will use port: %SERVER_PORT%
)

:find_client_port
netstat -an | findstr ":%CLIENT_PORT%" | findstr "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo Port %CLIENT_PORT% is occupied, trying next port...
    set /a CLIENT_PORT+=1
    if !CLIENT_PORT! gtr 3010 (
        echo [ERROR] Cannot find available client port
        pause
        exit /b 1
    )
    goto find_client_port
) else (
    echo [OK] Client will use port: %CLIENT_PORT%
)

REM [4/4] Starting services
echo [4/4] Starting services...
echo.

REM Start server first
echo Starting server on port %SERVER_PORT%...
pushd server
set PORT=%SERVER_PORT%
start "NAS Server" cmd /c "npm start"
popd

REM Wait for server to start
echo Waiting for server to start...
set server_attempts=0
:wait_for_server
set /a server_attempts+=1
netstat -an | findstr ":%SERVER_PORT%" | findstr "LISTENING" >nul 2>&1
if !errorlevel! neq 0 (
    if !server_attempts! geq 30 (
        echo [ERROR] Server failed to start within 30 seconds
        pause
        exit /b 1
    )
    timeout /t 1 /nobreak >nul
    goto wait_for_server
)
echo [OK] Server is running on port %SERVER_PORT%

REM Start client
echo Starting client on port %CLIENT_PORT%...
pushd client

REM Create environment file for client
echo REACT_APP_SERVER_PORT=%SERVER_PORT% > .env.local
echo REACT_APP_API_URL=http://localhost:%SERVER_PORT%/api >> .env.local
echo REACT_APP_CLIENT_PORT=%CLIENT_PORT% >> .env.local

REM 读取存储主机IP配置（供后端使用）
if exist "server\.env" (
    for /f "tokens=2 delims==" %%a in ('findstr "STORAGE_HOST_IP" server\.env') do set STORAGE_HOST_IP=%%a
) else (
    set STORAGE_HOST_IP=localhost
)

echo REACT_APP_STORAGE_HOST_IP=%STORAGE_HOST_IP% >> .env.local

set PORT=%CLIENT_PORT%
set BROWSER=none
set REACT_APP_SERVER_PORT=%SERVER_PORT%
set REACT_APP_API_URL=http://localhost:%SERVER_PORT%/api
set REACT_APP_STORAGE_HOST_IP=%STORAGE_HOST_IP%

start "NAS Client" cmd /c "npm start"
popd

REM Wait for client to start
echo Waiting for client to start...
set client_attempts=0
:wait_for_client
set /a client_attempts+=1
netstat -an | findstr ":%CLIENT_PORT%" | findstr "LISTENING" >nul 2>&1
if !errorlevel! neq 0 (
    if !client_attempts! geq 30 (
        echo [ERROR] Client failed to start within 30 seconds
        pause
        exit /b 1
    )
    timeout /t 1 /nobreak >nul
    goto wait_for_client
)
echo [OK] Client is running on port %CLIENT_PORT%

REM Save port information
echo SERVER_PORT=%SERVER_PORT% > .ports
echo CLIENT_PORT=%CLIENT_PORT% >> .ports
echo {"serverPort": %SERVER_PORT%, "clientPort": %CLIENT_PORT%} > .port-config.json

REM Open browser with cleared localStorage
echo Opening web interface...
echo Clearing previous login state...
REM 使用JavaScript清除localStorage的URL
start http://localhost:%CLIENT_PORT%?clearAuth=true&t=%random%

echo.
echo =====================================
echo        Startup Complete
echo.
echo Service Status:
echo   • Server: Running (port %SERVER_PORT%)
echo   • Client: Running (port %CLIENT_PORT%)
echo   • Web Interface: Opened
echo.
echo Port configuration saved to .ports and .port-config.json
echo To stop services, run scripts\stop-nas.bat
echo =====================================

echo Press any key to close this window...
pause >nul 