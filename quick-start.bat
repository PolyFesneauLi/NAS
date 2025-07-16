@echo off
chcp 65001
title 分布式NAS系统一键部署

echo.
echo   ╔══════════════════════════════════════════════════════════════╗
echo   ║                    分布式NAS文件管理系统                     ║
echo   ║                       一键快速部署                          ║
echo   ╚══════════════════════════════════════════════════════════════╝
echo.
echo   版本: v1.0.0
echo   作者: NAS Development Team
echo   时间: %date% %time%
echo.

:: 主菜单
:main_menu
cls
echo =====================================
echo       分布式NAS系统部署菜单
echo =====================================
echo.
echo 请选择部署模式:
echo.
echo   [1] 快速部署 - 混合节点 (推荐新手)
echo       • 本机同时作为主控、存储、缓存节点
echo       • 适合单机或小规模部署
echo       • 简单配置，快速上手
echo.
echo   [2] 分布式部署 - 主控节点
echo       • 仅部署主控节点
echo       • 负责用户管理和权限控制
echo       • 需要额外的存储节点
echo.
echo   [3] 分布式部署 - 存储节点
echo       • 仅部署存储节点
echo       • 负责文件存储和管理
echo       • 需要连接到主控节点
echo.
echo   [4] 系统维护工具
echo       • 健康检查、备份、监控等
echo       • 系统更新和故障诊断
echo.
echo   [5] 依赖检查和安装
echo       • 检查系统环境
echo       • 安装必要依赖
echo.
echo   [0] 退出
echo.
echo =====================================
set /p choice=请输入选项 [0-5]: 

if "%choice%"=="1" goto quick_deploy
if "%choice%"=="2" goto deploy_master
if "%choice%"=="3" goto deploy_storage
if "%choice%"=="4" goto maintenance_menu
if "%choice%"=="5" goto install_deps
if "%choice%"=="0" goto exit
echo [错误] 无效选项，请重新选择
timeout /t 2 >nul
goto main_menu

:: 快速部署混合节点
:quick_deploy
cls
echo =====================================
echo         快速部署混合节点
echo =====================================
echo.
echo 此模式将在本机部署包含以下服务的完整NAS系统:
echo   • 主控服务 (端口 5000) - 用户管理和权限控制
echo   • 存储服务 (端口 5001) - 文件存储和管理  
echo   • 缓存服务 (端口 5002) - 文件缓存加速
echo   • Web前端 (端口 3000) - 用户界面
echo.
echo 系统要求:
echo   • Node.js >= 16.0.0
echo   • 可用磁盘空间 >= 10GB
echo   • 可用内存 >= 4GB
echo.
echo 是否继续? (Y/N)
set /p confirm=
if /i "%confirm%" neq "Y" goto main_menu

echo.
echo [1/5] 检查系统环境...
call scripts\install-dependencies.bat
if %errorlevel% neq 0 (
    echo [错误] 环境检查失败，请先解决依赖问题
    pause
    goto main_menu
)

echo [2/5] 配置安全设置...
call scripts\firewall-setup.bat

echo [3/5] 生成SSL证书...
call scripts\generate-ssl.bat

echo [4/5] 启动混合节点服务...
call scripts\start-hybrid.bat
if %errorlevel% neq 0 (
    echo [错误] 服务启动失败
    pause
    goto main_menu
)

echo [5/5] 运行健康检查...
timeout /t 10 >nul
call scripts\health-check.bat

echo.
echo =====================================
echo        ✅ 快速部署完成！
echo.
echo 服务访问地址:
echo   • Web界面: http://localhost:3000
echo   • API接口: http://localhost:5000
echo.
echo 管理工具:
echo   • 查看状态: pm2 status
echo   • 查看日志: pm2 logs
echo   • 停止服务: stop.bat
echo.
echo 下一步:
echo 1. 访问 http://localhost:3000 进行初始化设置
echo 2. 创建管理员账户
echo 3. 开始使用文件管理功能
echo =====================================
pause
goto main_menu

:: 部署主控节点
:deploy_master
cls
echo =====================================
echo         部署主控节点
echo =====================================
echo.
echo 主控节点负责:
echo   • 用户认证和权限管理
echo   • 集群协调和监控
echo   • API接口服务
echo.
call scripts\deploy-master.bat
pause
goto main_menu

:: 部署存储节点
:deploy_storage
cls
echo =====================================
echo         部署存储节点
echo =====================================
echo.
echo 存储节点负责:
echo   • 文件存储和检索
echo   • 数据备份和同步
echo   • 文件完整性检查
echo.
call scripts\deploy-storage.bat
pause
goto main_menu

:: 维护工具菜单
:maintenance_menu
cls
echo =====================================
echo         系统维护工具
echo =====================================
echo.
echo   [1] 健康检查 - 检查系统状态
echo   [2] 性能监控 - 实时性能监控
echo   [3] 集群状态 - 查看集群状态
echo   [4] 系统备份 - 备份配置和数据
echo   [5] 日志清理 - 清理过期日志
echo   [6] 系统更新 - 更新到最新版本
echo   [7] 故障诊断 - 自动故障检测
echo   [0] 返回主菜单
echo.
set /p maintenance_choice=请选择维护工具 [0-7]: 

if "%maintenance_choice%"=="1" (
    call scripts\health-check.bat
    pause
    goto maintenance_menu
)
if "%maintenance_choice%"=="2" (
    call scripts\monitor.bat
    goto maintenance_menu
)
if "%maintenance_choice%"=="3" (
    call scripts\cluster-status.bat
    pause
    goto maintenance_menu
)
if "%maintenance_choice%"=="4" (
    call scripts\backup.bat
    pause
    goto maintenance_menu
)
if "%maintenance_choice%"=="5" (
    call scripts\cleanup-logs.bat
    pause
    goto maintenance_menu
)
if "%maintenance_choice%"=="6" (
    call scripts\update-system.bat
    pause
    goto maintenance_menu
)
if "%maintenance_choice%"=="7" (
    call scripts\diagnose.bat
    pause
    goto maintenance_menu
)
if "%maintenance_choice%"=="0" goto main_menu
echo [错误] 无效选项
timeout /t 2 >nul
goto maintenance_menu

:: 安装依赖
:install_deps
cls
call scripts\install-dependencies.bat
pause
goto main_menu

:exit
echo.
echo 感谢使用分布式NAS文件管理系统！
echo.
timeout /t 3 >nul
exit 