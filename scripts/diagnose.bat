@echo off
chcp 65001
echo =====================================
echo       分布式NAS系统故障诊断
echo =====================================
echo 诊断时间: %date% %time%
echo.

set issues_found=0
set critical_issues=0

:: 1. 基础环境检查
echo [1/12] 基础环境检查...
echo =====================================

:: 检查Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] Node.js未安装或不可用
    set /a critical_issues+=1
) else (
    for /f %%i in ('node -v') do echo [✓] Node.js版本: %%i
)

:: 检查PM2
pm2 -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] PM2未安装或不可用
    set /a critical_issues+=1
) else (
    echo [✓] PM2可用
)

:: 2. 服务状态检查
echo.
echo [2/12] 服务状态检查...
echo =====================================

:: 检查PM2进程
pm2 list >nul 2>&1
if %errorlevel% neq 0 (
    echo [✗] PM2服务异常
    set /a critical_issues+=1
) else (
    echo [✓] PM2服务正常
    echo.
    echo PM2进程状态:
    pm2 status
)

:: 3. 端口占用检查
echo.
echo [3/12] 端口占用检查...
echo =====================================

set ports=5000 5001 5002 3000
for %%p in (%ports%) do (
    netstat -an | find ":%%p " >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 端口 %%p 正在使用
    ) else (
        echo [⚠] 端口 %%p 未使用
        set /a issues_found+=1
    )
)

:: 4. 数据库连接检查
echo.
echo [4/12] 数据库连接检查...
echo =====================================

mongosh --eval "db.adminCommand('ping')" --quiet >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] MongoDB连接正常
    
    :: 检查数据库权限
    mongosh --eval "db.runCommand({connectionStatus: 1})" --quiet >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] 数据库权限正常
    ) else (
        echo [⚠] 数据库权限可能有问题
        set /a issues_found+=1
    )
) else (
    echo [✗] MongoDB连接失败
    set /a critical_issues+=1
    
    :: 尝试诊断MongoDB问题
    sc query MongoDB >nul 2>&1
    if %errorlevel% equ 0 (
        echo [ℹ] MongoDB服务已安装，检查服务状态...
        sc query MongoDB | find "RUNNING" >nul 2>&1
        if %errorlevel% neq 0 (
            echo [⚠] MongoDB服务未运行，尝试启动...
            net start MongoDB >nul 2>&1
        )
    ) else (
        echo [ℹ] MongoDB服务未安装或未注册
    )
)

:: 5. 磁盘空间检查
echo.
echo [5/12] 磁盘空间检查...
echo =====================================

for /f "tokens=1,2,3" %%a in ('dir /-c %SystemDrive%\ ^| find "可用"') do (
    set free_bytes=%%c
    set /a free_gb=!free_bytes:~0,-9!
    if !free_gb! GTR 10 (
        echo [✓] 磁盘空间充足: !free_gb!GB 可用
    ) else if !free_gb! GTR 5 (
        echo [⚠] 磁盘空间较少: !free_gb!GB 可用
        set /a issues_found+=1
    ) else (
        echo [✗] 磁盘空间严重不足: !free_gb!GB 可用
        set /a critical_issues+=1
    )
)

:: 6. 内存使用检查
echo.
echo [6/12] 内存使用检查...
echo =====================================

for /f "skip=1 tokens=1" %%p in ('wmic OS get TotalVisibleMemorySize /value ^| find "="') do set %%p
for /f "skip=1 tokens=1" %%p in ('wmic OS get FreePhysicalMemory /value ^| find "="') do set %%p
if defined TotalVisibleMemorySize if defined FreePhysicalMemory (
    set /a memory_usage=100-(%FreePhysicalMemory%*100/%TotalVisibleMemorySize%)
    set /a total_memory_gb=%TotalVisibleMemorySize%/1048576
    
    if %memory_usage% LSS 85 (
        echo [✓] 内存使用正常: %memory_usage%% (%total_memory_gb%GB 总内存)
    ) else if %memory_usage% LSS 95 (
        echo [⚠] 内存使用较高: %memory_usage%% (%total_memory_gb%GB 总内存)
        set /a issues_found+=1
    ) else (
        echo [✗] 内存使用过高: %memory_usage%% (%total_memory_gb%GB 总内存)
        set /a critical_issues+=1
    )
) else (
    echo [⚠] 无法获取内存信息
    set /a issues_found+=1
)

:: 7. 网络连通性检查
echo.
echo [7/12] 网络连通性检查...
echo =====================================

ping -n 1 localhost >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 本地回环正常
) else (
    echo [✗] 本地回环异常
    set /a critical_issues+=1
)

:: 检查服务端口响应
for %%p in (5000 5001 5002) do (
    curl -s -o nul -w "%%{http_code}" http://localhost:%%p/api/health 2>nul | findstr "200" >nul
    if %errorlevel% equ 0 (
        echo [✓] 端口 %%p 服务响应正常
    ) else (
        echo [⚠] 端口 %%p 服务无响应
        set /a issues_found+=1
    )
)

:: 8. 文件系统检查
echo.
echo [8/12] 文件系统检查...
echo =====================================

set required_dirs=storage storage\uploads storage\cache storage\temp logs config
for %%d in (%required_dirs%) do (
    if exist "%%d" (
        echo [✓] 目录存在: %%d
    ) else (
        echo [⚠] 目录缺失: %%d
        set /a issues_found+=1
        mkdir "%%d" >nul 2>&1
        if exist "%%d" (
            echo [ℹ] 已自动创建目录: %%d
        )
    )
)

:: 9. 配置文件检查
echo.
echo [9/12] 配置文件检查...
echo =====================================

set config_files=server\package.json client\package.json
for %%f in (%config_files%) do (
    if exist "%%f" (
        echo [✓] 配置文件存在: %%f
    ) else (
        echo [⚠] 配置文件缺失: %%f
        set /a issues_found+=1
    )
)

:: 检查环境配置
if exist "server\.env" (
    echo [✓] 服务器环境配置存在
) else (
    echo [⚠] 服务器环境配置缺失
    set /a issues_found+=1
)

:: 10. 依赖包检查
echo.
echo [10/12] 依赖包检查...
echo =====================================

if exist "server\node_modules" (
    echo [✓] 服务端依赖包已安装
) else (
    echo [⚠] 服务端依赖包缺失
    set /a issues_found+=1
    echo [ℹ] 建议运行: cd server && npm install
)

if exist "client\node_modules" (
    echo [✓] 客户端依赖包已安装
) else (
    echo [⚠] 客户端依赖包缺失
    set /a issues_found+=1
    echo [ℹ] 建议运行: cd client && npm install
)

:: 11. 日志文件分析
echo.
echo [11/12] 日志文件分析...
echo =====================================

if exist "logs" (
    :: 检查错误日志
    if exist "logs\*error*.log" (
        for %%f in (logs\*error*.log) do (
            for /f %%a in ('find /c /v "" "%%f" 2^>nul') do (
                if %%a GTR 0 (
                    echo [⚠] 发现错误日志: %%f (%%a 行)
                    set /a issues_found+=1
                    echo [ℹ] 最近的错误:
                    tail -5 "%%f" 2>nul || echo "   请手动查看该文件"
                )
            )
        )
    )
    
    :: 检查最近日志
    if exist "logs\*.log" (
        echo [✓] 日志文件存在
        echo [ℹ] 最近的日志条目:
        for %%f in (logs\*.log) do (
            echo   文件: %%f
            tail -3 "%%f" 2>nul || echo "     (无法读取)"
        )
    )
) else (
    echo [⚠] 日志目录不存在
    set /a issues_found+=1
)

:: 12. 性能问题检测
echo.
echo [12/12] 性能问题检测...
echo =====================================

:: 检查CPU使用率
for /f "skip=1 tokens=1" %%p in ('wmic cpu get loadpercentage /value ^| find "="') do set %%p
if defined LoadPercentage (
    if %LoadPercentage% GTR 90 (
        echo [✗] CPU使用率过高: %LoadPercentage%%
        set /a critical_issues+=1
    ) else if %LoadPercentage% GTR 70 (
        echo [⚠] CPU使用率较高: %LoadPercentage%%
        set /a issues_found+=1
    ) else (
        echo [✓] CPU使用率正常: %LoadPercentage%%
    )
)

:: 检查磁盘I/O
echo [ℹ] 磁盘性能信息:
wmic logicaldisk get size,freespace,caption | find ":"

:: 生成诊断报告
echo.
echo =====================================
echo           诊断报告摘要
echo =====================================
echo.
echo 检测项目: 12项
echo 发现问题: %issues_found%项
echo 严重问题: %critical_issues%项
echo.

if %critical_issues% GTR 0 (
    echo ⚠️  系统状态: 严重异常
    echo    有 %critical_issues% 个严重问题需要立即处理
    echo.
    echo 建议操作:
    echo 1. 检查并解决环境依赖问题
    echo 2. 确保数据库服务正常运行
    echo 3. 检查系统资源使用情况
    echo 4. 查看详细错误日志
) else if %issues_found% GTR 0 (
    echo ⚠️  系统状态: 轻微异常
    echo    有 %issues_found% 个一般问题建议处理
    echo.
    echo 建议操作:
    echo 1. 检查缺失的目录和文件
    echo 2. 清理日志和临时文件
    echo 3. 监控系统性能指标
) else (
    echo ✅ 系统状态: 健康
    echo    所有检测项目均正常
)

echo.
echo 详细信息:
echo - 诊断时间: %date% %time%
echo - 系统版本: Windows %OS%
echo - 用户身份: %USERNAME%
echo.

:: 自动修复选项
if %issues_found% GTR 0 (
    echo =====================================
    echo          自动修复选项
    echo =====================================
    echo.
    echo 发现可自动修复的问题，是否执行自动修复？
    echo.
    echo 修复内容:
    echo - 创建缺失的目录
    echo - 重启异常的服务
    echo - 清理临时文件
    echo - 重新安装依赖包
    echo.
    set /p auto_fix=是否执行自动修复？ (Y/N): 
    
    if /i "%auto_fix%"=="Y" (
        echo.
        echo 执行自动修复...
        
        :: 创建缺失目录
        echo [1/4] 创建缺失目录...
        for %%d in (storage storage\uploads storage\cache storage\temp logs config backup) do (
            if not exist "%%d" (
                mkdir "%%d"
                echo   创建目录: %%d
            )
        )
        
        :: 重启服务
        echo [2/4] 重启服务...
        pm2 restart all >nul 2>&1
        
        :: 清理临时文件
        echo [3/4] 清理临时文件...
        if exist "storage\temp" (
            del /Q /S "storage\temp\*" >nul 2>&1
        )
        
        :: 检查依赖
        echo [4/4] 检查依赖...
        if not exist "server\node_modules" (
            echo   正在安装服务端依赖...
            cd server && npm install --production >nul 2>&1 && cd ..
        )
        
        echo.
        echo [✓] 自动修复完成
        echo.
        echo 建议再次运行健康检查验证修复结果:
        echo scripts\health-check.bat
    )
)

:: 保存诊断结果
if not exist "logs" mkdir "logs"
(
    echo %date% %time% - 系统诊断完成
    echo 发现问题: %issues_found%项，严重问题: %critical_issues%项
    if %critical_issues% GTR 0 (
        echo 系统状态: 严重异常
    ) else if %issues_found% GTR 0 (
        echo 系统状态: 轻微异常
    ) else (
        echo 系统状态: 健康
    )
) >> logs\diagnosis.log

echo.
echo =====================================
echo 诊断结果已保存到: logs\diagnosis.log
echo.
echo 如需技术支持，请提供此诊断报告
echo =====================================

pause 