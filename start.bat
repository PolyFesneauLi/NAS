@echo off
chcp 65001
echo NAS文件管理系统启动脚本
echo ============================

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 建议以管理员权限运行此脚本
    echo 某些功能可能受限
    timeout /t 3
)

:: 检查Node.js是否安装
node -v > nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Node.js，请先安装Node.js
    echo 您可以从 https://nodejs.org 下载安装包
    pause
    exit /b 1
)

:: 检查MongoDB服务
echo 正在检查MongoDB服务...
sc query MongoDB > nul 2>&1
if %errorlevel% equ 0 (
    :: 检查服务是否在运行
    sc query MongoDB | find "RUNNING" > nul
    if %errorlevel% neq 0 (
        echo [警告] MongoDB服务未运行，正在尝试启动...
        net start MongoDB
        if %errorlevel% neq 0 (
            echo [错误] MongoDB服务启动失败
            echo 请以管理员身份运行本脚本，或手动启动MongoDB服务
            pause
            exit /b 1
        )
        echo MongoDB服务已启动
    ) else (
        echo MongoDB服务正在运行
    )
) else (
    echo [错误] 未检测到MongoDB服务
    echo 请确保已安装MongoDB并将其注册为Windows服务
    echo 您可以从 https://www.mongodb.com/try/download/community 下载安装包
    echo 安装时请选择"Install MongoDB as a Service"选项
    pause
    exit /b 1
)

:: 创建必要的目录
if not exist "storage\uploads" (
    echo 创建存储目录...
    mkdir "storage\uploads"
)

:: 获取可用端口
echo 正在检查端口...
for /f %%i in ('check_port.bat 5000') do set BACKEND_PORT=%%i
for /f %%i in ('check_port.bat 3000') do set FRONTEND_PORT=%%i

:: 确保配置目录存在
if not exist "server" mkdir "server"
if not exist "client" mkdir "client"

:: 创建或更新环境配置文件
echo 配置环境变量...
(
    echo PORT=%BACKEND_PORT%
    echo MONGODB_URI=mongodb+srv://li9021905:O0ysxh06MjzWUD5o@cluster0.ipcieg1.mongodb.net/
    echo JWT_SECRET=nas_secret_key
    echo STORAGE_PATH=../storage/uploads
    echo DEFAULT_STORAGE_QUOTA=1073741824*500
) > "server\.env"

:: 确保文件被正确创建
if not exist "server\.env" (
    echo [错误] 无法创建服务器配置文件
    pause
    exit /b 1
)

:: 更新前端配置
echo 更新前端配置...
(
    echo REACT_APP_API_URL=http://localhost:%BACKEND_PORT%/api
    echo PORT=%FRONTEND_PORT%
) > "client\.env"

:: 确保文件被正确创建
if not exist "client\.env" (
    echo [错误] 无法创建客户端配置文件
    pause
    exit /b 1
)

:: 显示配置信息
echo.
echo 当前配置:
echo - 后端端口: %BACKEND_PORT%
echo - 前端端口: %FRONTEND_PORT%
echo - MongoDB URI: mongodb://localhost:27017/nas
echo.

:: 安装依赖
echo 正在安装服务端依赖...
cd server
call npm install
if %errorlevel% neq 0 (
    echo [错误] 服务端依赖安装失败
    cd ..
    pause
    exit /b 1
)
cd ..

echo 正在安装客户端依赖...
cd client
call npm install
if %errorlevel% neq 0 (
    echo [错误] 客户端依赖安装失败
    cd ..
    pause
    exit /b 1
)
cd ..

:: 启动服务
echo 正在启动服务...
echo 后端服务将使用端口: %BACKEND_PORT%
start cmd /k "cd server && set PORT=%BACKEND_PORT% && set DEBUG=* && npm start"
timeout /t 5

:: 启动客户端
echo 正在启动客户端...
echo 前端服务将使用端口: %FRONTEND_PORT%
start cmd /k "cd client && set PORT=%FRONTEND_PORT% && npm start"

echo ============================
echo NAS文件管理系统已启动
echo 请在浏览器中访问 http://localhost:%FRONTEND_PORT%
echo 按任意键退出此窗口...
pause > nul 