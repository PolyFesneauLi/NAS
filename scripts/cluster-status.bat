@echo off
chcp 65001
echo =====================================
echo       分布式NAS集群状态检查
echo =====================================
echo 检查时间: %date% %time%
echo.

set cluster_healthy=1

:: 1. 检查PM2服务状态
echo [1/8] PM2服务状态检查...
pm2 -v >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] PM2进程管理器正常运行
    echo.
    echo PM2服务列表:
    pm2 status
    echo.
) else (
    echo [✗] PM2进程管理器未安装或异常
    set cluster_healthy=0
)

:: 2. 检查主控节点
echo [2/8] 主控节点状态检查...
curl -s -o temp_response.txt -w "%%{http_code}" http://localhost:5000/api/health 2>nul > temp_status.txt
set /p master_status=<temp_status.txt
if "%master_status%"=="200" (
    echo [✓] 主控节点正常运行 (端口:5000)
    if exist temp_response.txt (
        echo 响应内容: 
        type temp_response.txt
    )
) else (
    echo [✗] 主控节点异常 (端口:5000) - HTTP状态:%master_status%
    set cluster_healthy=0
)
del temp_response.txt temp_status.txt >nul 2>&1

:: 3. 检查存储节点
echo [3/8] 存储节点状态检查...
curl -s -o temp_response.txt -w "%%{http_code}" http://localhost:5001/api/health 2>nul > temp_status.txt
set /p storage_status=<temp_status.txt
if "%storage_status%"=="200" (
    echo [✓] 存储节点正常运行 (端口:5001)
    if exist temp_response.txt (
        echo 响应内容:
        type temp_response.txt
    )
) else (
    echo [✗] 存储节点异常 (端口:5001) - HTTP状态:%storage_status%
    set cluster_healthy=0
)
del temp_response.txt temp_status.txt >nul 2>&1

:: 4. 检查缓存节点
echo [4/8] 缓存节点状态检查...
curl -s -o temp_response.txt -w "%%{http_code}" http://localhost:5002/api/health 2>nul > temp_status.txt
set /p cache_status=<temp_status.txt
if "%cache_status%"=="200" (
    echo [✓] 缓存节点正常运行 (端口:5002)
) else (
    echo [⚠] 缓存节点未运行或异常 (端口:5002) - HTTP状态:%cache_status%
    echo [ℹ] 缓存节点为可选组件
)
del temp_response.txt temp_status.txt >nul 2>&1

:: 5. 检查数据库连接
echo [5/8] 数据库连接检查...
mongosh --eval "db.adminCommand('ping')" --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] MongoDB数据库连接正常
    :: 获取数据库信息
    echo 数据库信息:
    mongosh --eval "print('  连接数: ' + db.serverStatus().connections.current); print('  数据库大小: ' + Math.round(db.stats().dataSize/1024/1024) + 'MB');" --quiet 2>nul
) else (
    echo [✗] MongoDB数据库连接失败
    set cluster_healthy=0
)

:: 6. 检查Redis缓存
echo [6/8] Redis缓存检查...
redis-cli ping >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] Redis缓存服务正常
    echo Redis信息:
    redis-cli info server | findstr "redis_version"
    redis-cli info memory | findstr "used_memory_human"
) else (
    echo [⚠] Redis缓存服务未运行
    echo [ℹ] Redis为可选组件，不影响基本功能
)

:: 7. 检查存储状态
echo [7/8] 存储状态检查...
if exist "storage\uploads" (
    echo [✓] 存储目录存在
    :: 计算文件数量和大小
    for /f %%a in ('dir /s /b "storage\uploads\*" 2^>nul ^| find /c /v ""') do set file_count=%%a
    echo 存储统计:
    echo   总文件数: %file_count%
    
    :: 计算目录大小
    for /f "tokens=3" %%a in ('dir /s "storage" ^| find "个文件"') do (
        set storage_size=%%a
        set /a storage_mb=!storage_size!/1048576
        echo   存储大小: !storage_mb!MB
    )
    
    :: 检查磁盘空间
    for /f "tokens=3" %%a in ('dir /-c %SystemDrive%\ ^| find "可用"') do (
        set free_space=%%a
        set /a free_gb=!free_space:~0,-9!
        if !free_gb! GTR 10 (
            echo   磁盘空间: !free_gb!GB 可用 [正常]
        ) else (
            echo   磁盘空间: !free_gb!GB 可用 [⚠警告:空间不足]
            set cluster_healthy=0
        )
    )
) else (
    echo [✗] 存储目录不存在
    set cluster_healthy=0
)

:: 8. 检查系统资源
echo [8/8] 系统资源检查...
:: CPU使用率
for /f "skip=1 tokens=1" %%p in ('wmic cpu get loadpercentage /value ^| find "="') do set %%p
if defined LoadPercentage (
    if %LoadPercentage% LSS 80 (
        echo [✓] CPU使用率正常 (%LoadPercentage%%)
    ) else (
        echo [⚠] CPU使用率过高 (%LoadPercentage%%)
        set cluster_healthy=0
    )
)

:: 内存使用率
for /f "skip=1 tokens=1" %%p in ('wmic OS get TotalVisibleMemorySize /value ^| find "="') do set %%p
for /f "skip=1 tokens=1" %%p in ('wmic OS get FreePhysicalMemory /value ^| find "="') do set %%p
if defined TotalVisibleMemorySize if defined FreePhysicalMemory (
    set /a memory_usage=100-(%FreePhysicalMemory%*100/%TotalVisibleMemorySize%)
    if %memory_usage% LSS 85 (
        echo [✓] 内存使用率正常 (%memory_usage%%)
    ) else (
        echo [⚠] 内存使用率过高 (%memory_usage%%)
        set cluster_healthy=0
    )
)

:: 网络连接测试
ping -n 1 localhost >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 网络连接正常
) else (
    echo [✗] 网络连接异常
    set cluster_healthy=0
)

:: 生成集群状态报告
echo.
echo =====================================
if %cluster_healthy%==1 (
    echo        ✅ 集群状态：健康
    echo      所有核心服务运行正常
) else (
    echo        ⚠️  集群状态：异常
    echo     检测到一个或多个问题
    echo     请查看上述详细信息并及时处理
)
echo =====================================

:: 生成简要状态表
echo.
echo 服务状态概览:
echo ┌─────────────────┬─────────┬──────────┐
echo │     服务        │  端口   │   状态   │
echo ├─────────────────┼─────────┼──────────┤
if "%master_status%"=="200" (
    echo │ 主控节点        │  5000   │   ✓ 正常 │
) else (
    echo │ 主控节点        │  5000   │   ✗ 异常 │
)
if "%storage_status%"=="200" (
    echo │ 存储节点        │  5001   │   ✓ 正常 │
) else (
    echo │ 存储节点        │  5001   │   ✗ 异常 │
)
if "%cache_status%"=="200" (
    echo │ 缓存节点        │  5002   │   ✓ 正常 │
) else (
    echo │ 缓存节点        │  5002   │   - 离线 │
)
echo └─────────────────┴─────────┴──────────┘

:: 记录状态检查日志
if not exist "logs" mkdir "logs"
if %cluster_healthy%==1 (
    echo %date% %time% - 集群状态检查：健康 >> logs\cluster-status.log
) else (
    echo %date% %time% - 集群状态检查：异常 >> logs\cluster-status.log
)

:: 返回状态码
if %cluster_healthy%==0 exit /b 1

pause 