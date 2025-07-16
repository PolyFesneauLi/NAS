@echo off
chcp 65001
echo =====================================
echo       分布式NAS系统健康检查
echo =====================================
echo 检查时间: %date% %time%
echo.

:: 检查服务状态
echo [1/8] 检查主控服务状态...
curl -s -o nul -w "%%{http_code}" http://localhost:5000/api/health 2>nul | findstr "200" >nul
if %errorlevel% equ 0 (
    echo [✓] 主控服务正常 (端口:5000)
) else (
    echo [✗] 主控服务异常 (端口:5000)
    set health_issues=1
)

echo [2/8] 检查存储服务状态...
curl -s -o nul -w "%%{http_code}" http://localhost:5001/api/health 2>nul | findstr "200" >nul
if %errorlevel% equ 0 (
    echo [✓] 存储服务正常 (端口:5001)
) else (
    echo [✗] 存储服务异常 (端口:5001)
    set health_issues=1
)

echo [3/8] 检查缓存服务状态...
curl -s -o nul -w "%%{http_code}" http://localhost:5002/api/health 2>nul | findstr "200" >nul
if %errorlevel% equ 0 (
    echo [✓] 缓存服务正常 (端口:5002)
) else (
    echo [✗] 缓存服务异常 (端口:5002)
    set health_issues=1
)

:: 检查MongoDB连接
echo [4/8] 检查数据库连接...
mongosh --eval "db.adminCommand('ping')" --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] MongoDB连接正常
) else (
    echo [✗] MongoDB连接异常
    set health_issues=1
)

:: 检查磁盘空间
echo [5/8] 检查磁盘空间...
for /f "tokens=1,2,3" %%a in ('dir /-c %SystemDrive%\ ^| find "可用"') do (
    set free_bytes=%%c
)
if defined free_bytes (
    set /a free_gb=%free_bytes:~0,-9%
    if %free_gb% GTR 10 (
        echo [✓] 磁盘空间充足 (%free_gb%GB 可用)
    ) else (
        echo [✗] 磁盘空间不足 (%free_gb%GB 可用)
        set health_issues=1
    )
) else (
    echo [✗] 无法获取磁盘空间信息
    set health_issues=1
)

:: 检查内存使用
echo [6/8] 检查内存使用...
for /f "skip=1 tokens=1" %%p in ('wmic OS get TotalVisibleMemorySize /value ^| find "="') do set %%p
for /f "skip=1 tokens=1" %%p in ('wmic OS get FreePhysicalMemory /value ^| find "="') do set %%p
if defined TotalVisibleMemorySize if defined FreePhysicalMemory (
    set /a memory_usage=100-(%FreePhysicalMemory%*100/%TotalVisibleMemorySize%)
    if %memory_usage% LSS 90 (
        echo [✓] 内存使用正常 (%memory_usage%%)
    ) else (
        echo [✗] 内存使用过高 (%memory_usage%%)
        set health_issues=1
    )
) else (
    echo [✗] 无法获取内存信息
    set health_issues=1
)

:: 检查CPU使用率
echo [7/8] 检查CPU使用率...
for /f "skip=1 tokens=1" %%p in ('wmic cpu get loadpercentage /value ^| find "="') do set %%p
if defined LoadPercentage (
    if %LoadPercentage% LSS 80 (
        echo [✓] CPU使用正常 (%LoadPercentage%%)
    ) else (
        echo [✗] CPU使用过高 (%LoadPercentage%%)
        set health_issues=1
    )
) else (
    echo [✗] 无法获取CPU信息
    set health_issues=1
)

:: 检查网络连接
echo [8/8] 检查网络连接...
ping -n 1 localhost >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 本地网络正常
) else (
    echo [✗] 本地网络异常
    set health_issues=1
)

:: 生成健康报告
echo.
echo =====================================
if defined health_issues (
    echo        ⚠️  系统健康状态: 异常
    echo     建议立即查看系统日志并解决问题
) else (
    echo        ✅ 系统健康状态: 正常
    echo       所有服务运行正常
)
echo =====================================

:: 保存健康检查结果到日志
if not exist "logs" mkdir "logs"
echo %date% %time% - 健康检查完成 >> logs\health-check.log
if defined health_issues (
    echo %date% %time% - 发现健康问题 >> logs\health-check.log
)

:: 如果有问题，返回错误代码
if defined health_issues exit /b 1

timeout /t 3 >nul 