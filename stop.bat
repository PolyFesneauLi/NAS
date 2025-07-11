@echo off
chcp 65001
echo 正在停止NAS文件管理系统...

:: 查找并关闭Node.js进程
echo 正在关闭服务...
taskkill /F /IM node.exe > nul 2>&1
if %errorlevel% equ 0 (
    echo 服务已停止
) else (
    echo 没有找到运行中的服务
)

echo ============================
echo NAS文件管理系统已停止
timeout /t 3 