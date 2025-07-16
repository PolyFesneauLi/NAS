@echo off
chcp 65001
echo =====================================
echo      部署存储节点 (Storage Node)
echo =====================================
echo 部署时间: %date% %time%
echo.

:: 检查配置文件
if not exist "config\storage.conf" (
    echo [错误] 存储节点配置文件不存在
    echo 请先创建 config\storage.conf 配置文件
    echo.
    echo 示例配置文件内容:
    echo [Storage]
    echo role=storage
    echo port=5001
    echo storage_path=./storage/files
    echo master_host=localhost:5000
    echo max_storage=500GB
    echo.
    pause
    exit /b 1
)

:: 检查Node.js和PM2
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Node.js，请先安装Node.js
    exit /b 1
)

pm2 -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/10] 安装PM2进程管理器...
    npm install -g pm2
    if %errorlevel% neq 0 (
        echo [错误] PM2安装失败
        exit /b 1
    )
) else (
    echo [1/10] PM2已安装
)

:: 读取配置文件
echo [2/10] 读取配置文件...
for /f "tokens=1,2 delims==" %%a in ('type config\storage.conf ^| find "port="') do set STORAGE_PORT=%%b
for /f "tokens=1,2 delims==" %%a in ('type config\storage.conf ^| find "storage_path="') do set STORAGE_PATH=%%b
for /f "tokens=1,2 delims==" %%a in ('type config\storage.conf ^| find "master_host="') do set MASTER_HOST=%%b
for /f "tokens=1,2 delims==" %%a in ('type config\storage.conf ^| find "max_storage="') do set MAX_STORAGE=%%b

if not defined STORAGE_PORT set STORAGE_PORT=5001
if not defined STORAGE_PATH set STORAGE_PATH=./storage/files
if not defined MASTER_HOST set MASTER_HOST=localhost:5000
if not defined MAX_STORAGE set MAX_STORAGE=500GB

echo [✓] 配置读取完成
echo   端口: %STORAGE_PORT%
echo   存储路径: %STORAGE_PATH%
echo   主控节点: %MASTER_HOST%
echo   最大存储: %MAX_STORAGE%

:: 停止已存在的服务
echo [3/10] 停止现有存储服务...
pm2 stop nas-storage >nul 2>&1
pm2 delete nas-storage >nul 2>&1
echo [✓] 现有服务已停止

:: 创建存储目录
echo [4/10] 创建存储目录...
if not exist "%STORAGE_PATH%" mkdir "%STORAGE_PATH%"
if not exist "%STORAGE_PATH%\uploads" mkdir "%STORAGE_PATH%\uploads"
if not exist "%STORAGE_PATH%\cache" mkdir "%STORAGE_PATH%\cache"
if not exist "%STORAGE_PATH%\temp" mkdir "%STORAGE_PATH%\temp"
echo [✓] 存储目录创建完成

:: 创建环境配置
echo [5/10] 创建环境配置...
(
echo NODE_ENV=production
echo PORT=%STORAGE_PORT%
echo ROLE=storage
echo STORAGE_PATH=%STORAGE_PATH%
echo MASTER_HOST=%MASTER_HOST%
echo MAX_STORAGE=%MAX_STORAGE%
echo LOG_LEVEL=info
) > server\.env.storage
echo [✓] 环境配置创建完成

:: 安装依赖
echo [6/10] 检查依赖包...
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
echo [7/10] 创建PM2配置...
(
echo {
echo   "name": "nas-storage",
echo   "script": "server.js",
echo   "cwd": "./server",
echo   "instances": 1,
echo   "exec_mode": "fork",
echo   "env_file": ".env.storage",
echo   "log_file": "../logs/storage.log",
echo   "error_file": "../logs/storage-error.log",
echo   "out_file": "../logs/storage-out.log",
echo   "log_date_format": "YYYY-MM-DD HH:mm:ss",
echo   "restart_delay": 5000,
echo   "max_restarts": 10,
echo   "autorestart": true,
echo   "watch": false,
echo   "ignore_watch": ["node_modules", "logs", "storage"],
echo   "env": {
echo     "NODE_ENV": "production",
echo     "PORT": "%STORAGE_PORT%"
echo   }
echo }
) > config\pm2-storage.json
echo [✓] PM2配置创建完成

:: 检查磁盘空间
echo [8/10] 检查磁盘空间...
for /f "tokens=3" %%a in ('dir /-c %SystemDrive%\ ^| find "可用"') do set free_space=%%a
set /a free_gb=%free_space:~0,-9%
if %free_gb% GTR 10 (
    echo [✓] 磁盘空间充足 (%free_gb%GB 可用)
) else (
    echo [⚠] 磁盘空间不足 (%free_gb%GB 可用)
)

:: 启动存储服务
echo [9/10] 启动存储服务...
pm2 start config\pm2-storage.json
if %errorlevel% equ 0 (
    echo [✓] 存储服务启动成功
) else (
    echo [✗] 存储服务启动失败
    exit /b 1
)

:: 验证服务状态和主控连接
echo [10/10] 验证服务状态...
timeout /t 5 >nul
curl -s -o nul -w "存储服务状态: HTTP %%{http_code}" http://localhost:%STORAGE_PORT%/api/health 2>nul
echo.
curl -s -o nul -w "主控连接状态: HTTP %%{http_code}" http://%MASTER_HOST%/api/health 2>nul
echo.

:: 显示服务信息
echo.
echo =====================================
echo        ✅ 存储节点部署完成
echo.
echo 服务信息:
echo   - 服务名称: nas-storage
echo   - 监听端口: %STORAGE_PORT%
echo   - 存储路径: %STORAGE_PATH%
echo   - 主控节点: %MASTER_HOST%
echo   - 最大存储: %MAX_STORAGE%
echo   - 日志文件: logs\storage.log
echo.
echo 管理命令:
echo   - 查看状态: pm2 status nas-storage
echo   - 查看日志: pm2 logs nas-storage
echo   - 重启服务: pm2 restart nas-storage
echo   - 停止服务: pm2 stop nas-storage
echo.
echo 访问地址: http://localhost:%STORAGE_PORT%
echo =====================================

:: 记录部署日志
if not exist "logs" mkdir "logs"
echo %date% %time% - 存储节点部署完成，端口:%STORAGE_PORT% >> logs\deployment.log

:: 显示PM2状态
pm2 status

pause 