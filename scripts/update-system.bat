@echo off
chcp 65001
echo =====================================
echo      分布式NAS系统更新脚本
echo =====================================
echo 更新时间: %date% %time%
echo.

:: 检查Git是否可用
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Git，无法执行自动更新
    echo 请手动下载最新版本或安装Git
    pause
    exit /b 1
)

:: 检查是否有未提交的更改
echo [1/10] 检查本地更改...
git status --porcelain >nul 2>&1
if %errorlevel% equ 0 (
    for /f %%i in ('git status --porcelain ^| find /c /v ""') do set changes=%%i
    if !changes! GTR 0 (
        echo [⚠] 检测到未提交的本地更改
        echo 是否备份并继续更新？ (Y/N)
        set /p choice=
        if /i "!choice!" neq "Y" (
            echo 更新已取消
            pause
            exit /b 1
        )
        
        :: 备份本地更改
        echo 正在备份本地更改...
        git stash push -m "Auto backup before update %date% %time%"
        echo [✓] 本地更改已备份
    )
) else (
    echo [✓] 没有本地更改
)

:: 备份当前版本
echo [2/10] 备份当前版本...
call scripts\backup.bat
if %errorlevel% neq 0 (
    echo [⚠] 备份失败，但继续更新
)

:: 停止所有服务
echo [3/10] 停止服务...
call stop.bat
echo [✓] 服务已停止

:: 获取远程更新
echo [4/10] 获取远程更新...
git fetch origin
if %errorlevel% neq 0 (
    echo [✗] 获取远程更新失败
    echo 正在重启服务...
    call start.bat
    exit /b 1
)

:: 检查是否有更新
echo [5/10] 检查更新...
for /f %%i in ('git rev-list HEAD..origin/main --count 2^>nul') do set update_count=%%i
if not defined update_count set update_count=0

if %update_count% EQU 0 (
    echo [✓] 系统已是最新版本
    echo 正在重启服务...
    call start.bat
    pause
    exit /b 0
) else (
    echo [ℹ] 发现 %update_count% 个更新
)

:: 显示更新内容
echo [6/10] 更新内容预览...
echo =====================================
git log --oneline HEAD..origin/main
echo =====================================
echo.
echo 是否继续安装更新？ (Y/N)
set /p choice=
if /i "%choice%" neq "Y" (
    echo 更新已取消，正在重启服务...
    call start.bat
    pause
    exit /b 1
)

:: 应用更新
echo [7/10] 应用更新...
git merge origin/main
if %errorlevel% neq 0 (
    echo [✗] 更新应用失败
    echo 正在回滚...
    git merge --abort >nul 2>&1
    echo 正在重启服务...
    call start.bat
    exit /b 1
)
echo [✓] 更新应用成功

:: 更新依赖
echo [8/10] 更新依赖包...
if exist "server\package.json" (
    cd server
    npm install --production
    if %errorlevel% neq 0 (
        echo [⚠] 服务端依赖更新失败
    ) else (
        echo [✓] 服务端依赖更新成功
    )
    cd ..
)

if exist "client\package.json" (
    cd client
    npm install --production
    if %errorlevel% neq 0 (
        echo [⚠] 客户端依赖更新失败
    ) else (
        echo [✓] 客户端依赖更新成功
    )
    cd ..
)

:: 运行数据库迁移（如果存在）
echo [9/10] 检查数据库迁移...
if exist "server\migrations" (
    echo 正在运行数据库迁移...
    cd server
    npm run migrate >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 数据库迁移完成
    ) else (
        echo [⚠] 数据库迁移失败，可能需要手动处理
    )
    cd ..
) else (
    echo [✓] 无需数据库迁移
)

:: 重启服务
echo [10/10] 重启服务...
call start.bat
if %errorlevel% equ 0 (
    echo [✓] 服务重启成功
) else (
    echo [✗] 服务重启失败
    echo 请手动检查日志文件
)

:: 验证更新
echo.
echo 验证更新结果...
timeout /t 10 >nul
call scripts\health-check.bat
if %errorlevel% equ 0 (
    echo [✓] 系统健康检查通过
) else (
    echo [⚠] 系统健康检查失败
    echo 请检查日志文件或考虑回滚
)

:: 获取新版本信息
echo.
echo 当前版本信息:
git log --oneline -1
for /f %%i in ('git rev-parse --short HEAD') do set current_commit=%%i
echo 提交哈希: %current_commit%

echo.
echo =====================================
echo        ✅ 系统更新完成
echo.
echo 更新摘要:
echo   - 应用了 %update_count% 个更新
echo   - 当前版本: %current_commit%
echo   - 更新时间: %date% %time%
echo.
echo 如果遇到问题，可以使用以下命令回滚:
echo   git reset --hard HEAD~%update_count%
echo   然后重启服务
echo.
echo 建议执行以下检查:
echo   1. 运行健康检查: scripts\health-check.bat
echo   2. 检查系统日志: logs\*.log  
echo   3. 验证功能正常: 访问Web界面测试
echo =====================================

:: 记录更新日志
if not exist "logs" mkdir "logs"
echo %date% %time% - 系统更新完成，版本:%current_commit%，更新数:%update_count% >> logs\update.log

pause 