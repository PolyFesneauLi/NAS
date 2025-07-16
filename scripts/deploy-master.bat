@echo off
chcp 65001
echo =====================================
echo      部署主控节点 (Master Node)
echo =====================================
echo 部署时间: %date% %time%
echo.

:: 检查配置文件
if not exist "config\master.conf" (
    echo [错误] 主控节点配置文件不存在
    echo 请先创建 config\master.conf 配置文件
    echo.
    echo 示例配置文件内容:
    echo [Master]
    echo role=master
    echo port=5000
    echo mongodb_uri=mongodb://localhost:27017/nas_master
    echo jwt_secret=your_super_secret_key
    echo.
    pause
    exit /b 1
)

:: 检查Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Node.js，请先安装Node.js
    exit /b 1
)

:: 检查PM2
pm2 -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/10] 安装PM2进程管理器...
    npm install -g pm2
    if %errorlevel% neq 0 (
        echo [错误] PM2安装失败
        exit /b 1
    )
    echo [✓] PM2安装完成
) else (
    echo [1/10] PM2已安装
)

:: 读取配置文件
echo [2/10] 读取配置文件...
for /f "tokens=1,2 delims==" %%a in ('type config\master.conf ^| find "port="') do set MASTER_PORT=%%b
for /f "tokens=1,2 delims==" %%a in ('type config\master.conf ^| find "mongodb_uri="') do set MONGODB_URI=%%b
for /f "tokens=1,2 delims==" %%a in ('type config\master.conf ^| find "jwt_secret="') do set JWT_SECRET=%%b

if not defined MASTER_PORT set MASTER_PORT=5000
if not defined MONGODB_URI set MONGODB_URI=mongodb://localhost:27017/nas_master
if not defined JWT_SECRET set JWT_SECRET=default_secret_key

echo [✓] 配置读取完成
echo   端口: %MASTER_PORT%
echo   数据库: %MONGODB_URI%

:: 停止已存在的服务
echo [3/10] 停止现有主控服务...
pm2 stop nas-master >nul 2>&1
pm2 delete nas-master >nul 2>&1
echo [✓] 现有服务已停止

:: 创建环境配置
echo [4/10] 创建环境配置...
(
echo NODE_ENV=production
echo PORT=%MASTER_PORT%
echo MONGODB_URI=%MONGODB_URI%
echo JWT_SECRET=%JWT_SECRET%
echo ROLE=master
echo LOG_LEVEL=info
) > server\.env.master
echo [✓] 环境配置创建完成

:: 安装依赖
echo [5/10] 检查依赖包...
cd server
npm list >nul 2>&1
if %errorlevel% neq 0 (
    echo 安装服务端依赖...
    npm install --production
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        cd ..
        exit /b 1
    )
)
cd ..
echo [✓] 依赖检查完成

:: 创建PM2配置文件
echo [6/10] 创建PM2配置...
(
echo {
echo   "name": "nas-master",
echo   "script": "server.js",
echo   "cwd": "./server",
echo   "instances": 1,
echo   "exec_mode": "fork",
echo   "env_file": ".env.master",
echo   "log_file": "../logs/master.log",
echo   "error_file": "../logs/master-error.log",
echo   "out_file": "../logs/master-out.log",
echo   "log_date_format": "YYYY-MM-DD HH:mm:ss",
echo   "restart_delay": 5000,
echo   "max_restarts": 10,
echo   "autorestart": true,
echo   "watch": false,
echo   "ignore_watch": ["node_modules", "logs"],
echo   "env": {
echo     "NODE_ENV": "production",
echo     "PORT": "%MASTER_PORT%"
echo   }
echo }
) > config\pm2-master.json
echo [✓] PM2配置创建完成

:: 创建必要目录
echo [7/10] 创建必要目录...
if not exist "logs" mkdir "logs"
if not exist "storage\master" mkdir "storage\master"
echo [✓] 目录创建完成

:: 检查数据库连接
echo [8/10] 检查数据库连接...
mongosh %MONGODB_URI% --eval "db.adminCommand('ping')" --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 数据库连接正常
) else (
    echo [⚠] 数据库连接失败，请检查MongoDB服务
)

:: 启动主控服务
echo [9/10] 启动主控服务...
pm2 start config\pm2-master.json
if %errorlevel% equ 0 (
    echo [✓] 主控服务启动成功
) else (
    echo [✗] 主控服务启动失败
    exit /b 1
)

:: 验证服务状态
echo [10/10] 验证服务状态...
timeout /t 5 >nul
curl -s -o nul -w "HTTP状态码: %%{http_code}" http://localhost:%MASTER_PORT%/api/health 2>nul
echo.

:: 显示服务信息
echo.
echo =====================================
echo        ✅ 主控节点部署完成
echo.
echo 服务信息:
echo   - 服务名称: nas-master
echo   - 监听端口: %MASTER_PORT%
echo   - 数据库: %MONGODB_URI%
echo   - 日志文件: logs\master.log
echo.
echo 管理命令:
echo   - 查看状态: pm2 status nas-master
echo   - 查看日志: pm2 logs nas-master
echo   - 重启服务: pm2 restart nas-master
echo   - 停止服务: pm2 stop nas-master
echo.
echo 访问地址: http://localhost:%MASTER_PORT%
echo =====================================

:: 记录部署日志
echo %date% %time% - 主控节点部署完成，端口:%MASTER_PORT% >> logs\deployment.log

:: 显示PM2状态
pm2 status

pause 