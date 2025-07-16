@echo off
chcp 65001
title 分布式NAS系统性能监控

echo =====================================
echo     分布式NAS系统性能监控
echo =====================================
echo 按 Ctrl+C 退出监控
echo.

:monitor_loop

:: 获取当前时间
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set current_date=%%c-%%a-%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set current_time=%%a:%%b

echo [%current_date% %current_time%] 性能监控报告
echo =====================================

:: 1. CPU使用率
for /f "skip=1 tokens=1" %%p in ('wmic cpu get loadpercentage /value ^| find "="') do set %%p
if defined LoadPercentage (
    echo CPU使用率: %LoadPercentage%%%
    if %LoadPercentage% GTR 80 (
        echo [⚠️] CPU使用率过高！
    )
) else (
    echo CPU使用率: 无法获取
)

:: 2. 内存使用率
for /f "skip=1 tokens=1" %%p in ('wmic OS get TotalVisibleMemorySize /value ^| find "="') do set %%p
for /f "skip=1 tokens=1" %%p in ('wmic OS get FreePhysicalMemory /value ^| find "="') do set %%p
if defined TotalVisibleMemorySize if defined FreePhysicalMemory (
    set /a memory_usage=100-(%FreePhysicalMemory%*100/%TotalVisibleMemorySize%)
    set /a total_memory_gb=%TotalVisibleMemorySize%/1048576
    set /a free_memory_gb=%FreePhysicalMemory%/1048576
    echo 内存使用率: %memory_usage%% (可用: %free_memory_gb%GB/%total_memory_gb%GB)
    if %memory_usage% GTR 85 (
        echo [⚠️] 内存使用率过高！
    )
) else (
    echo 内存使用率: 无法获取
)

:: 3. 磁盘使用情况
echo.
echo 磁盘使用情况:
for /f "skip=1 tokens=1,2,3" %%a in ('wmic logicaldisk get size,freespace,caption /format:table ^| find ":"') do (
    set drive=%%a
    set free=%%b
    set total=%%c
    if defined free if defined total (
        set /a free_gb=!free!/1073741824
        set /a total_gb=!total!/1073741824
        set /a used_percent=100-(!free!*100/!total!)
        echo   !drive! !used_percent!%% 已使用 (可用: !free_gb!GB/!total_gb!GB)
        if !used_percent! GTR 90 (
            echo   [⚠️] 磁盘 !drive! 空间不足！
        )
    )
)

:: 4. 网络连接状态
echo.
echo 网络连接状态:
for /f "tokens=1,2" %%a in ('netstat -an ^| find "LISTEN" ^| find ":500"') do (
    echo   监听端口: %%b
)

:: 5. NAS服务状态
echo.
echo NAS服务状态:
curl -s -o nul -w "主控服务(5000): HTTP %%{http_code}\n" http://localhost:5000/api/health 2>nul
curl -s -o nul -w "存储服务(5001): HTTP %%{http_code}\n" http://localhost:5001/api/health 2>nul
curl -s -o nul -w "缓存服务(5002): HTTP %%{http_code}\n" http://localhost:5002/api/health 2>nul

:: 6. 进程信息
echo.
echo NAS相关进程:
for /f "tokens=1,2" %%a in ('tasklist /fi "imagename eq node.exe" /fo table /nh') do (
    echo   Node.js进程: PID %%b
)

:: 7. 文件系统状态
echo.
echo 文件系统状态:
if exist "storage\uploads" (
    for /f %%a in ('dir /s /b "storage\uploads\*" 2^>nul ^| find /c /v ""') do (
        echo   总文件数: %%a
    )
    for /f "tokens=3" %%a in ('dir /s "storage\uploads" ^| find "个文件"') do (
        set file_size=%%a
        echo   总文件大小: !file_size! 字节
    )
) else (
    echo   [⚠️] 上传目录不存在
)

:: 8. 数据库连接
echo.
echo 数据库状态:
mongosh --eval "db.adminCommand('ping')" --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo   MongoDB: [✓] 连接正常
    :: 获取数据库大小
    for /f %%a in ('mongosh --eval "db.stats().dataSize" --quiet 2^>nul') do (
        set /a db_size_mb=%%a/1048576
        echo   数据库大小: !db_size_mb!MB
    )
) else (
    echo   MongoDB: [✗] 连接失败
)

echo =====================================

:: 保存监控数据到日志
if not exist "logs" mkdir "logs"
echo %current_date% %current_time%,CPU:%LoadPercentage%,MEM:%memory_usage%,DISK:%used_percent% >> logs\performance.log

:: 等待60秒后继续监控
echo 等待60秒后继续监控... (按 Ctrl+C 退出)
timeout /t 60 /nobreak >nul

:: 清屏继续下一轮监控
cls
goto monitor_loop 