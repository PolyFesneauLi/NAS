@echo off
chcp 65001
echo =====================================
echo      启动混合节点 (本机作为缓存机+存储机)
echo =====================================
echo 启动时间: %date% %time%
echo.

:: 检查配置文件
if not exist "config\hybrid.conf" (
    echo [错误] 混合节点配置文件不存在
    echo 正在创建默认配置文件...
    if not exist "config" mkdir "config"
    copy "config\hybrid.conf.example" "config\hybrid.conf" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 已创建默认配置文件 config\hybrid.conf
        echo [⚠] 请编辑配置文件后重新运行此脚本
    ) else (
        echo [✗] 配置文件创建失败
    )
    pause
    exit /b 1
)

:: 检查环境
echo [1/12] 检查运行环境...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Node.js，请先安装Node.js
    exit /b 1
)

pm2 -v >nul 2>&1
if %errorlevel% neq 0 (
    echo 安装PM2进程管理器...
    npm install -g pm2
    if %errorlevel% neq 0 (
        echo [错误] PM2安装失败
        exit /b 1
    )
) 
echo [✓] 运行环境检查完成

:: 读取配置
echo [2/12] 读取配置文件...
for /f "tokens=1,2 delims==" %%a in ('type config\hybrid.conf ^| find "master_port="') do set MASTER_PORT=%%b
for /f "tokens=1,2 delims==" %%a in ('type config\hybrid.conf ^| find "storage_port="') do set STORAGE_PORT=%%b
for /f "tokens=1,2 delims==" %%a in ('type config\hybrid.conf ^| find "cache_port="') do set CACHE_PORT=%%b
for /f "tokens=1,2 delims==" %%a in ('type config\hybrid.conf ^| find "mongodb_uri="') do set MONGODB_URI=%%b

if not defined MASTER_PORT set MASTER_PORT=5000
if not defined STORAGE_PORT set STORAGE_PORT=5001
if not defined CACHE_PORT set CACHE_PORT=5002
if not defined MONGODB_URI set MONGODB_URI=mongodb://localhost:27017/nas_hybrid

echo [✓] 配置读取完成
echo   主控端口: %MASTER_PORT%
echo   存储端口: %STORAGE_PORT%
echo   缓存端口: %CACHE_PORT%

:: 停止现有服务
echo [3/12] 停止现有服务...
pm2 stop nas-hybrid-master >nul 2>&1
pm2 stop nas-hybrid-storage >nul 2>&1
pm2 stop nas-hybrid-cache >nul 2>&1
pm2 delete nas-hybrid-master >nul 2>&1
pm2 delete nas-hybrid-storage >nul 2>&1
pm2 delete nas-hybrid-cache >nul 2>&1
echo [✓] 现有服务已停止

:: 创建必要目录
echo [4/12] 创建目录结构...
if not exist "logs" mkdir "logs"
if not exist "storage\files" mkdir "storage\files"
if not exist "storage\cache" mkdir "storage\cache"
if not exist "storage\temp" mkdir "storage\temp"
if not exist "backup" mkdir "backup"
echo [✓] 目录结构创建完成

:: 检查数据库
echo [5/12] 检查数据库连接...
mongosh %MONGODB_URI% --eval "db.adminCommand('ping')" --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] MongoDB连接正常
) else (
    echo [⚠] MongoDB连接失败，请检查数据库服务
)

:: 检查Redis（可选）
echo [6/12] 检查Redis缓存...
redis-cli ping >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] Redis缓存可用
    set REDIS_AVAILABLE=1
) else (
    echo [⚠] Redis缓存不可用（将使用本地缓存）
    set REDIS_AVAILABLE=0
)

:: 安装依赖
echo [7/12] 检查依赖包...
cd server
npm list >nul 2>&1
if %errorlevel% neq 0 (
    echo 安装依赖包...
    npm install --production
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        cd ..
        exit /b 1
    )
)
cd ..
echo [✓] 依赖检查完成

:: 创建环境配置
echo [8/12] 创建环境配置...
(
echo NODE_ENV=production
echo ROLE=hybrid
echo MASTER_PORT=%MASTER_PORT%
echo STORAGE_PORT=%STORAGE_PORT%
echo CACHE_PORT=%CACHE_PORT%
echo MONGODB_URI=%MONGODB_URI%
echo REDIS_AVAILABLE=%REDIS_AVAILABLE%
echo LOG_LEVEL=info
) > server\.env.hybrid
echo [✓] 环境配置创建完成

:: 创建PM2配置
echo [9/12] 创建进程配置...
(
echo {
echo   "apps": [
echo     {
echo       "name": "nas-hybrid-master",
echo       "script": "server.js",
echo       "cwd": "./server",
echo       "instances": 1,
echo       "env_file": ".env.hybrid",
echo       "env": {
echo         "PORT": "%MASTER_PORT%",
echo         "SERVICE_TYPE": "master"
echo       },
echo       "log_file": "../logs/hybrid-master.log",
echo       "error_file": "../logs/hybrid-master-error.log",
echo       "out_file": "../logs/hybrid-master-out.log"
echo     },
echo     {
echo       "name": "nas-hybrid-storage",
echo       "script": "server.js", 
echo       "cwd": "./server",
echo       "instances": 1,
echo       "env_file": ".env.hybrid",
echo       "env": {
echo         "PORT": "%STORAGE_PORT%",
echo         "SERVICE_TYPE": "storage"
echo       },
echo       "log_file": "../logs/hybrid-storage.log",
echo       "error_file": "../logs/hybrid-storage-error.log",
echo       "out_file": "../logs/hybrid-storage-out.log"
echo     },
echo     {
echo       "name": "nas-hybrid-cache",
echo       "script": "server.js",
echo       "cwd": "./server", 
echo       "instances": 1,
echo       "env_file": ".env.hybrid",
echo       "env": {
echo         "PORT": "%CACHE_PORT%",
echo         "SERVICE_TYPE": "cache"
echo       },
echo       "log_file": "../logs/hybrid-cache.log",
echo       "error_file": "../logs/hybrid-cache-error.log",
echo       "out_file": "../logs/hybrid-cache-out.log"
echo     }
echo   ]
echo }
) > config\pm2-hybrid.json
echo [✓] 进程配置创建完成

:: 启动主控服务
echo [10/12] 启动主控服务...
pm2 start config\pm2-hybrid.json --only nas-hybrid-master
if %errorlevel% equ 0 (
    echo [✓] 主控服务启动成功
) else (
    echo [✗] 主控服务启动失败
    exit /b 1
)

:: 等待主控服务就绪，然后启动存储和缓存
echo [11/12] 启动存储和缓存服务...
timeout /t 5 >nul
pm2 start config\pm2-hybrid.json --only nas-hybrid-storage
pm2 start config\pm2-hybrid.json --only nas-hybrid-cache
echo [✓] 存储和缓存服务启动完成

:: 验证服务状态
echo [12/12] 验证服务状态...
timeout /t 3 >nul
curl -s -o nul -w "主控服务: HTTP %%{http_code}" http://localhost:%MASTER_PORT%/api/health 2>nul
echo.
curl -s -o nul -w "存储服务: HTTP %%{http_code}" http://localhost:%STORAGE_PORT%/api/health 2>nul  
echo.
curl -s -o nul -w "缓存服务: HTTP %%{http_code}" http://localhost:%CACHE_PORT%/api/health 2>nul
echo.

:: 启动前端（如果存在）
if exist "client" (
    echo 启动前端服务...
    cd client
    start cmd /k "npm start"
    cd ..
    echo [✓] 前端服务启动完成
)

echo.
echo =====================================
echo        ✅ 混合节点启动完成
echo.
echo 服务信息:
echo   - 主控服务: http://localhost:%MASTER_PORT%
echo   - 存储服务: http://localhost:%STORAGE_PORT%  
echo   - 缓存服务: http://localhost:%CACHE_PORT%
echo   - Web界面: http://localhost:3000 (如果前端已启动)
echo.
echo 管理命令:
echo   - 查看状态: pm2 status
echo   - 查看日志: pm2 logs
echo   - 重启服务: pm2 restart all
echo   - 停止服务: stop.bat
echo.
echo 监控工具:
echo   - 健康检查: scripts\health-check.bat
echo   - 性能监控: scripts\monitor.bat
echo   - 集群状态: scripts\cluster-status.bat
echo =====================================

:: 记录启动日志
echo %date% %time% - 混合节点启动完成 >> logs\startup.log

:: 显示PM2状态
pm2 status

pause 