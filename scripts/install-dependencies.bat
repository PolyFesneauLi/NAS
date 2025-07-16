@echo off
chcp 65001
echo =====================================
echo     分布式NAS系统依赖安装脚本
echo =====================================
echo 安装时间: %date% %time%
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 建议以管理员权限运行此脚本
    echo 某些功能可能需要管理员权限
    timeout /t 3
)

:: 检查Node.js
echo [1/10] 检查Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Node.js
    echo.
    echo 请下载并安装Node.js:
    echo https://nodejs.org/zh-cn/download/
    echo.
    echo 建议安装LTS版本
    pause
    exit /b 1
) else (
    for /f %%i in ('node -v') do echo [✓] Node.js版本: %%i
)

:: 检查npm
echo [2/10] 检查npm...
npm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] npm不可用
    exit /b 1
) else (
    for /f %%i in ('npm -v') do echo [✓] npm版本: %%i
)

:: 安装PM2
echo [3/10] 安装PM2进程管理器...
pm2 -v >nul 2>&1
if %errorlevel% equ 0 (
    for /f %%i in ('pm2 -v') do echo [✓] PM2已安装，版本: %%i
) else (
    echo 正在安装PM2...
    npm install -g pm2
    if %errorlevel% equ 0 (
        echo [✓] PM2安装成功
    ) else (
        echo [✗] PM2安装失败
        exit /b 1
    )
)

:: 安装服务端依赖
echo [4/10] 安装服务端依赖...
if exist "server\package.json" (
    cd server
    echo 正在安装服务端依赖包...
    npm install
    if %errorlevel% equ 0 (
        echo [✓] 服务端依赖安装成功
    ) else (
        echo [✗] 服务端依赖安装失败
        cd ..
        exit /b 1
    )
    cd ..
) else (
    echo [⚠] 未找到服务端package.json文件
)

:: 安装客户端依赖
echo [5/10] 安装客户端依赖...
if exist "client\package.json" (
    cd client
    echo 正在安装客户端依赖包...
    npm install
    if %errorlevel% equ 0 (
        echo [✓] 客户端依赖安装成功
    ) else (
        echo [✗] 客户端依赖安装失败
        cd ..
        exit /b 1
    )
    cd ..
) else (
    echo [⚠] 未找到客户端package.json文件
)

:: 检查MongoDB
echo [6/10] 检查MongoDB...
mongosh --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=1" %%i in ('mongosh --version') do echo [✓] MongoDB Shell已安装
    
    :: 尝试连接本地MongoDB
    mongosh --eval "db.adminCommand('ping')" --quiet >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 本地MongoDB服务正在运行
    ) else (
        echo [⚠] 本地MongoDB服务未运行或未安装
        echo.
        echo 如需安装MongoDB:
        echo https://www.mongodb.com/try/download/community
        echo.
        echo 或使用云数据库（已在deployment.md中配置）
    )
) else (
    echo [⚠] MongoDB Shell未安装
    echo.
    echo 下载MongoDB Shell:
    echo https://www.mongodb.com/try/download/shell
)

:: 检查Redis（可选）
echo [7/10] 检查Redis缓存（可选）...
redis-cli --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=3" %%i in ('redis-cli --version') do echo [✓] Redis CLI已安装，版本: %%i
    
    :: 尝试连接Redis
    redis-cli ping >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] Redis服务正在运行
    ) else (
        echo [⚠] Redis服务未运行
    )
) else (
    echo [⚠] Redis未安装（可选组件）
    echo.
    echo 如需安装Redis:
    echo Windows: https://github.com/microsoftarchive/redis/releases
    echo 或使用Docker: docker run -d -p 6379:6379 redis:alpine
)

:: 检查OpenSSL（用于SSL证书）
echo [8/10] 检查OpenSSL（用于SSL证书）...
openssl version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=1,2" %%i in ('openssl version') do echo [✓] OpenSSL已安装，版本: %%i %%j
) else (
    echo [⚠] OpenSSL未安装
    echo.
    echo 如需生成SSL证书，请安装OpenSSL:
    echo https://slproweb.com/products/Win32OpenSSL.html
    echo.
    echo 或使用Git Bash中的OpenSSL（如果已安装Git）
)

:: 检查curl（用于健康检查）
echo [9/10] 检查curl（用于健康检查）...
curl --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=1,2" %%i in ('curl --version ^| findstr "curl"') do echo [✓] curl已安装，版本: %%i %%j
) else (
    echo [⚠] curl未安装
    echo Windows 10/11通常已内置curl
    echo 如果缺失，请从以下地址下载:
    echo https://curl.se/windows/
)

:: 创建必要目录
echo [10/10] 创建必要目录...
if not exist "logs" mkdir "logs"
if not exist "backup" mkdir "backup"
if not exist "storage" mkdir "storage"
if not exist "storage\uploads" mkdir "storage\uploads"
if not exist "storage\cache" mkdir "storage\cache"
if not exist "storage\temp" mkdir "storage\temp"
if not exist "config" mkdir "config"
if not exist "scripts" mkdir "scripts"
echo [✓] 目录结构创建完成

:: 复制配置文件模板
if not exist "config\master.conf" if exist "config\master.conf.example" (
    copy "config\master.conf.example" "config\master.conf" >nul
    echo [✓] 已创建主控配置文件模板
)
if not exist "config\storage.conf" if exist "config\storage.conf.example" (
    copy "config\storage.conf.example" "config\storage.conf" >nul
    echo [✓] 已创建存储配置文件模板
)
if not exist "config\hybrid.conf" if exist "config\hybrid.conf.example" (
    copy "config\hybrid.conf.example" "config\hybrid.conf" >nul
    echo [✓] 已创建混合配置文件模板
)

:: 生成依赖检查报告
echo.
echo =====================================
echo        ✅ 依赖安装检查完成
echo.
echo 必需组件状态:
node -v >nul 2>&1 && echo [✓] Node.js || echo [✗] Node.js
npm -v >nul 2>&1 && echo [✓] npm || echo [✗] npm
pm2 -v >nul 2>&1 && echo [✓] PM2 || echo [✗] PM2

echo.
echo 可选组件状态:
mongosh --version >nul 2>&1 && echo [✓] MongoDB || echo [⚠] MongoDB
redis-cli --version >nul 2>&1 && echo [✓] Redis || echo [⚠] Redis
openssl version >nul 2>&1 && echo [✓] OpenSSL || echo [⚠] OpenSSL
curl --version >nul 2>&1 && echo [✓] curl || echo [⚠] curl

echo.
echo 下一步操作:
echo 1. 检查并编辑配置文件 (config\*.conf)
echo 2. 运行启动脚本 (start.bat 或 scripts\start-hybrid.bat)
echo 3. 访问Web界面进行初始化设置
echo.
echo 如有问题，请查看日志文件 (logs\*.log)
echo =====================================

:: 记录安装日志
echo %date% %time% - 依赖检查完成 >> logs\installation.log

pause 