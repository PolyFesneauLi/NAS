@echo off
chcp 65001
echo =====================================
echo       分布式NAS系统自动备份
echo =====================================

:: 设置备份目录（按日期时间命名）
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set backup_date=%%c%%a%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set backup_time=%%a%%b
set backup_time=%backup_time: =0%
set backup_dir=backup\%backup_date%_%backup_time%

echo 开始备份到: %backup_dir%
echo 备份时间: %date% %time%
echo.

:: 创建备份目录
if not exist "backup" mkdir "backup"
if not exist "%backup_dir%" mkdir "%backup_dir%"

:: 1. 备份配置文件
echo [1/6] 备份配置文件...
if exist "config" (
    xcopy "config\*" "%backup_dir%\config\" /S /I /Y /Q >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 配置文件备份完成
    ) else (
        echo [✗] 配置文件备份失败
    )
) else (
    echo [⚠] 配置目录不存在，跳过
)

:: 2. 备份用户数据
echo [2/6] 备份用户数据...
if exist "storage\users" (
    xcopy "storage\users\*" "%backup_dir%\users\" /S /I /Y /Q >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 用户数据备份完成
    ) else (
        echo [✗] 用户数据备份失败
    )
) else (
    echo [⚠] 用户数据目录不存在，跳过
)

:: 3. 备份日志文件
echo [3/6] 备份日志文件...
if exist "logs" (
    xcopy "logs\*" "%backup_dir%\logs\" /S /I /Y /Q >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 日志文件备份完成
    ) else (
        echo [✗] 日志文件备份失败
    )
) else (
    echo [⚠] 日志目录不存在，跳过
)

:: 4. 备份数据库
echo [4/6] 备份数据库...
mongodump --uri="mongodb://localhost:27017/nas" --out="%backup_dir%\database" --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 数据库备份完成
) else (
    echo [✗] 数据库备份失败（可能MongoDB未运行）
)

:: 5. 备份关键脚本
echo [5/6] 备份关键脚本...
if exist "scripts" (
    xcopy "scripts\*" "%backup_dir%\scripts\" /S /I /Y /Q >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 脚本文件备份完成
    ) else (
        echo [✗] 脚本文件备份失败
    )
)

:: 6. 压缩备份
echo [6/6] 压缩备份文件...
powershell "try { Compress-Archive -Path '%backup_dir%' -DestinationPath '%backup_dir%.zip' -Force; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 备份压缩完成
    rmdir /S /Q "%backup_dir%" >nul 2>&1
    set final_backup=%backup_dir%.zip
) else (
    echo [✗] 备份压缩失败，保留原文件夹
    set final_backup=%backup_dir%
)

:: 计算备份大小
for %%F in ("%final_backup%") do set backup_size=%%~zF
if defined backup_size (
    set /a backup_size_mb=%backup_size%/1048576
    echo 备份大小: %backup_size_mb%MB
)

echo.
echo =====================================
echo        ✅ 备份完成
echo   备份文件: %final_backup%
echo =====================================

:: 清理超过7天的旧备份
echo 清理旧备份文件...
forfiles /p "backup" /s /m *.zip /d -7 /c "cmd /c del @path" 2>nul
forfiles /p "backup" /s /d -7 /c "cmd /c if @isdir==TRUE rmdir /S /Q @path" 2>nul

:: 记录备份日志
if not exist "logs" mkdir "logs"
echo %date% %time% - 备份完成: %final_backup% >> logs\backup.log

echo 旧备份清理完成
timeout /t 3 >nul 