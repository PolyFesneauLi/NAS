@echo off
chcp 65001
title 分布式NAS系统启动

echo =====================================
echo     分布式NAS系统启动程序
echo =====================================
echo.

:: 检查程序是否已经运行
echo [1/4] 检查程序状态...
netstat -an | findstr ":5000" >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 服务端已在运行 (端口 5000)
    set SERVER_RUNNING=1
) else (
    echo [⚠] 服务端未运行
    set SERVER_RUNNING=0
)

netstat -an | findstr ":3000" >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 客户端已在运行 (端口 3000)
    set CLIENT_RUNNING=1
) else (
    echo [⚠] 客户端未运行
    set CLIENT_RUNNING=0
)

:: 如果程序已经运行，直接打开浏览器
if %SERVER_RUNNING% equ 1 if %CLIENT_RUNNING% equ 1 (
    echo.
    echo =====================================
    echo        ✅ 程序已在运行
    echo.
    echo 正在打开Web界面...
    start http://localhost:3000
    echo.
    echo 如需重新启动，请先运行 stop.bat
    echo =====================================
    timeout /t 3 /nobreak >nul
    exit
)

:: 如果部分运行，先停止所有服务
if %SERVER_RUNNING% equ 1 (
    echo 停止现有服务端...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

if %CLIENT_RUNNING% equ 1 (
    echo 停止现有客户端...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: 检查必要文件
echo [2/4] 检查必要文件...
if not exist "server\server.js" (
    echo [错误] 服务器文件不存在
    pause
    exit /b 1
)

if not exist "client\package.json" (
    echo [错误] 客户端文件不存在
    pause
    exit /b 1
)

:: 创建.env文件
if not exist ".env" (
    echo 创建默认.env文件...
    echo MONGODB_URI=mongodb://localhost:27017/nas_system > .env
    echo JWT_SECRET=your-secret-key-change-this >> .env
    echo PORT=5000 >> .env
    echo [✓] 已创建默认.env文件
)

:: 检查端口占用
echo [3/4] 检查端口占用...
set SERVER_PORT=5000
set CLIENT_PORT=3000

:check_server_port
netstat -an | findstr ":%SERVER_PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo 端口 %SERVER_PORT% 被占用，尝试下一个端口...
    set /a SERVER_PORT+=1
    if %SERVER_PORT% gtr 5010 (
        echo [错误] 无法找到可用端口
        pause
        exit /b 1
    )
    goto check_server_port
) else (
    echo [✓] 服务端使用端口: %SERVER_PORT%
)

:check_client_port
netstat -an | findstr ":%CLIENT_PORT%" >nul 2>&1
if %errorlevel% equ 0 (
    echo 端口 %CLIENT_PORT% 被占用，尝试下一个端口...
    set /a CLIENT_PORT+=1
    if %CLIENT_PORT% gtr 3010 (
        echo [错误] 无法找到可用端口
        pause
        exit /b 1
    )
    goto check_client_port
) else (
    echo [✓] 客户端使用端口: %CLIENT_PORT%
)

:: 启动服务端
echo [4/4] 启动服务端...
cd server
set PORT=%SERVER_PORT%
start "NAS服务端" cmd /c "node server.js"
cd ..

:: 等待服务端启动
echo 等待服务端启动...
timeout /t 8 /nobreak >nul

:: 启动客户端
echo 启动客户端...
cd client
set PORT=%CLIENT_PORT%
set BROWSER=none
start "NAS客户端" cmd /c "npm start"
cd ..

:: 等待客户端启动
echo 等待客户端启动...
timeout /t 12 /nobreak >nul

:: 打开浏览器
echo 打开Web界面...
start http://localhost:%CLIENT_PORT%

echo.
echo =====================================
echo        ✅ 启动完成
echo.
echo 服务状态:
echo   • 服务端: 运行中 (端口 %SERVER_PORT%)
echo   • 客户端: 运行中 (端口 %CLIENT_PORT%)
echo   • Web界面: 已打开
echo.
echo 如需停止服务，请运行 stop.bat
echo =====================================

:: 保存端口信息
echo SERVER_PORT=%SERVER_PORT% > .ports
echo CLIENT_PORT=%CLIENT_PORT% >> .ports

timeout /t 3 /nobreak >nul 