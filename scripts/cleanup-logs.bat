@echo off
chcp 65001
echo =====================================
echo      分布式NAS系统日志清理
echo =====================================
echo 清理时间: %date% %time%
echo.

set cleanup_count=0

:: 1. 清理系统日志（保留30天）
echo [1/5] 清理系统日志文件...
if exist "logs" (
    forfiles /p "logs" /s /m *.log /d -30 /c "cmd /c del @path && echo 删除: @path" 2>nul
    if %errorlevel% equ 0 (
        echo [✓] 旧日志文件清理完成
        set /a cleanup_count+=1
    ) else (
        echo [✓] 没有需要清理的日志文件
    )
) else (
    echo [⚠] 日志目录不存在
)

:: 2. 清理临时文件
echo [2/5] 清理临时文件...
if exist "storage\temp" (
    del /Q /S "storage\temp\*" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 临时文件清理完成
        set /a cleanup_count+=1
    ) else (
        echo [✓] 没有需要清理的临时文件
    )
) else (
    echo [⚠] 临时文件目录不存在
)

:: 3. 清理上传临时文件
echo [3/5] 清理上传临时文件...
if exist "storage\uploads\temp" (
    forfiles /p "storage\uploads\temp" /s /d -1 /c "cmd /c del @path" 2>nul
    if %errorlevel% equ 0 (
        echo [✓] 上传临时文件清理完成
        set /a cleanup_count+=1
    ) else (
        echo [✓] 没有需要清理的上传临时文件
    )
)

:: 4. 清理Node.js缓存
echo [4/5] 清理Node.js缓存...
if exist "node_modules\.cache" (
    rmdir /S /Q "node_modules\.cache" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] Node.js缓存清理完成
        set /a cleanup_count+=1
    )
)

if exist "server\node_modules\.cache" (
    rmdir /S /Q "server\node_modules\.cache" >nul 2>&1
)

if exist "client\node_modules\.cache" (
    rmdir /S /Q "client\node_modules\.cache" >nul 2>&1
)

:: 5. 清理过期缓存（如果存在缓存清理脚本）
echo [5/5] 清理过期缓存...
if exist "scripts\cleanup-cache.js" (
    node scripts\cleanup-cache.js >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 过期缓存清理完成
        set /a cleanup_count+=1
    ) else (
        echo [⚠] 缓存清理脚本执行失败
    )
) else (
    echo [⚠] 缓存清理脚本不存在，跳过
)

:: 清理Windows临时文件（可选）
echo.
echo 正在清理Windows临时文件...
del /Q /F "%TEMP%\*" >nul 2>&1
for /d %%p in ("%TEMP%\*") do rmdir /S /Q "%%p" >nul 2>&1

:: 显示磁盘空间情况
echo.
echo 当前磁盘空间:
for /f "tokens=1,2,3" %%a in ('dir /-c %SystemDrive%\ ^| find "可用"') do (
    echo 可用空间: %%c 字节
)

echo.
echo =====================================
echo        ✅ 清理完成
echo     共执行 %cleanup_count% 项清理任务
echo =====================================

:: 记录清理日志
if not exist "logs" mkdir "logs"
echo %date% %time% - 日志清理完成，执行了%cleanup_count%项任务 >> logs\cleanup.log

timeout /t 3 >nul 