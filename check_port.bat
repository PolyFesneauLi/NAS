@echo off
chcp 65001 >nul
title NAS Port Status Check

echo =====================================
echo      NAS Port Status Check Tool
echo =====================================
echo.

:: Read port configuration
if exist ".ports" (
    echo [Configuration Info]
    for /f "tokens=2 delims==" %%a in ('findstr "SERVER_PORT" .ports') do set SERVER_PORT=%%a
    for /f "tokens=2 delims==" %%a in ('findstr "CLIENT_PORT" .ports') do set CLIENT_PORT=%%a
    echo   Server Port: %SERVER_PORT%
    echo   Client Port: %CLIENT_PORT%
    echo.
) else (
    echo [WARNING] Port configuration file .ports not found
    set SERVER_PORT=5000
    set CLIENT_PORT=3000
    echo   Using default ports: Server=%SERVER_PORT%, Client=%CLIENT_PORT%
    echo.
)

:: Check server port
echo [Server Port Check]
netstat -ano | findstr ":%SERVER_PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✓ Port %SERVER_PORT% is in use
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%SERVER_PORT%"') do (
        echo   Process PID: %%a
        tasklist /FI "PID eq %%a" /FO CSV 2>nul | findstr /v "PID" | findstr /v "INFO"
    )
) else (
    echo   ✗ Port %SERVER_PORT% is not in use
)

:: Check client port
echo.
echo [Client Port Check]
netstat -ano | findstr ":%CLIENT_PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✓ Port %CLIENT_PORT% is in use
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%CLIENT_PORT%"') do (
        echo   Process PID: %%a
        tasklist /FI "PID eq %%a" /FO CSV 2>nul | findstr /v "PID" | findstr /v "INFO"
    )
) else (
    echo   ✗ Port %CLIENT_PORT% is not in use
)

:: Check MongoDB port
echo.
echo [MongoDB Port Check]
netstat -ano | findstr ":27017" >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✓ MongoDB port 27017 is in use
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":27017"') do (
        echo   Process PID: %%a
        tasklist /FI "PID eq %%a" /FO CSV 2>nul | findstr /v "PID" | findstr /v "INFO"
    )
) else (
    echo   ✗ MongoDB port 27017 is not in use
    echo   [WARNING] MongoDB may not be running
)

:: Check Node.js processes
echo.
echo [Node.js Process Check]
tasklist /FI "IMAGENAME eq node.exe" /FO CSV 2>nul | findstr /v "PID" | findstr /v "INFO" >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✓ Found Node.js processes:
    tasklist /FI "IMAGENAME eq node.exe" /FO CSV 2>nul | findstr /v "PID" | findstr /v "INFO"
) else (
    echo   ✗ No Node.js processes found
)

:: Check related port ranges
echo.
echo [Related Port Range Check]
echo   Checking ports 5000-5010 (Server):
for /L %%i in (5000,1,5010) do (
    netstat -ano | findstr ":%%i" >nul 2>&1
    if !errorlevel! equ 0 (
        echo     Port %%i: In use
    )
)

echo.
echo   Checking ports 3000-3010 (Client):
for /L %%i in (3000,1,3010) do (
    netstat -ano | findstr ":%%i" >nul 2>&1
    if !errorlevel! equ 0 (
        echo     Port %%i: In use
    )
)

:: Health check
echo.
echo [Health Check]
if exist ".ports" (
    echo   Trying to connect to server health endpoint...
    powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:%SERVER_PORT%/health' -TimeoutSec 5; Write-Host '  ✓ Server responding normally' } catch { Write-Host '  ✗ Server not responding' }" 2>nul
) else (
    echo   Skipping health check (no port configuration)
)

echo.
echo =====================================
echo Check Complete
echo =====================================
echo.
echo If problems found:
echo   • Run stop.bat to stop all services
echo   • Run start-nas.bat to restart
echo   • Check if MongoDB is running
echo.
pause 