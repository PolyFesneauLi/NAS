@echo off
chcp 65001

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 此脚本需要管理员权限才能运行
    echo 请右键以管理员身份运行
    pause
    exit /b 1
)

echo =====================================
echo      分布式NAS防火墙配置
echo =====================================
echo 配置时间: %date% %time%
echo.

echo [1/10] 删除已存在的NAS规则...
netsh advfirewall firewall delete rule name="NAS-Master" >nul 2>&1
netsh advfirewall firewall delete rule name="NAS-Storage" >nul 2>&1
netsh advfirewall firewall delete rule name="NAS-Cache" >nul 2>&1
netsh advfirewall firewall delete rule name="NAS-Web" >nul 2>&1
netsh advfirewall firewall delete rule name="NAS-MongoDB" >nul 2>&1
netsh advfirewall firewall delete rule name="NAS-Redis" >nul 2>&1
echo [✓] 清理旧规则完成

echo [2/10] 配置主控节点端口 (5000)...
netsh advfirewall firewall add rule name="NAS-Master" dir=in action=allow protocol=TCP localport=5000 profile=any
if %errorlevel% equ 0 (
    echo [✓] 主控节点端口配置完成
) else (
    echo [✗] 主控节点端口配置失败
)

echo [3/10] 配置存储节点端口 (5001)...
netsh advfirewall firewall add rule name="NAS-Storage" dir=in action=allow protocol=TCP localport=5001 profile=any
if %errorlevel% equ 0 (
    echo [✓] 存储节点端口配置完成
) else (
    echo [✗] 存储节点端口配置失败
)

echo [4/10] 配置缓存节点端口 (5002)...
netsh advfirewall firewall add rule name="NAS-Cache" dir=in action=allow protocol=TCP localport=5002 profile=any
if %errorlevel% equ 0 (
    echo [✓] 缓存节点端口配置完成
) else (
    echo [✗] 缓存节点端口配置失败
)

echo [5/10] 配置Web前端端口 (3000)...
netsh advfirewall firewall add rule name="NAS-Web" dir=in action=allow protocol=TCP localport=3000 profile=any
if %errorlevel% equ 0 (
    echo [✓] Web前端端口配置完成
) else (
    echo [✗] Web前端端口配置失败
)

echo [6/10] 配置MongoDB端口 (27017)...
netsh advfirewall firewall add rule name="NAS-MongoDB" dir=in action=allow protocol=TCP localport=27017 profile=any
if %errorlevel% equ 0 (
    echo [✓] MongoDB端口配置完成
) else (
    echo [✗] MongoDB端口配置失败
)

echo [7/10] 配置Redis端口 (6379)...
netsh advfirewall firewall add rule name="NAS-Redis" dir=in action=allow protocol=TCP localport=6379 profile=any
if %errorlevel% equ 0 (
    echo [✓] Redis端口配置完成
) else (
    echo [✗] Redis端口配置失败
)

echo [8/10] 配置出站规则...
netsh advfirewall firewall add rule name="NAS-Outbound" dir=out action=allow protocol=TCP remoteport=5000,5001,5002,3000,27017,6379 profile=any
if %errorlevel% equ 0 (
    echo [✓] 出站规则配置完成
) else (
    echo [✗] 出站规则配置失败
)

:: 可选：限制IP范围（默认注释掉）
echo [9/10] 配置IP限制（可选）...
echo [⚠] IP限制已禁用，如需启用请编辑此脚本
:: 示例：只允许局域网访问
:: netsh advfirewall firewall set rule name="NAS-Master" new remoteip=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12
:: netsh advfirewall firewall set rule name="NAS-Storage" new remoteip=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12
:: netsh advfirewall firewall set rule name="NAS-Cache" new remoteip=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12

echo [10/10] 验证防火墙规则...
netsh advfirewall firewall show rule name="NAS-Master" >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] 防火墙规则验证通过
) else (
    echo [✗] 防火墙规则验证失败
)

echo.
echo =====================================
echo        ✅ 防火墙配置完成
echo.
echo 已配置的端口:
echo   - 主控节点: 5000
echo   - 存储节点: 5001
echo   - 缓存节点: 5002
echo   - Web前端: 3000
echo   - MongoDB: 27017
echo   - Redis: 6379
echo.
echo ⚠️  安全建议:
echo   1. 定期检查防火墙日志
echo   2. 考虑启用IP地址限制
echo   3. 使用HTTPS加密通信
echo =====================================

:: 记录配置日志
if not exist "logs" mkdir "logs"
echo %date% %time% - 防火墙配置完成 >> logs\security.log

pause 