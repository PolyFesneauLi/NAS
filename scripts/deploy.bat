@echo off
chcp 65001 >nul
echo ========================================
echo    NAS 部署配置脚本
echo ========================================
echo.

:: 获取当前目录
set CURRENT_DIR=%~dp0
set NAS_ROOT=%CURRENT_DIR%..

:: 检查是否存在server目录
if not exist "%NAS_ROOT%\server" (
    echo 错误: 未找到server目录
    pause
    exit /b 1
)

:: 设置默认值
set DEFAULT_PORT=5000
set DEFAULT_STORAGE_PATH=F:\Code\NAS_DEMO\NAS\storage
set DEFAULT_STORAGE_HOST_IP=10.172.79.26
set DEFAULT_STORAGE_HOST_NAME=storage-server
set DEFAULT_MONGODB_URI=mongodb+srv://li9021905:O0ysxh06MjzWUD5o@cluster0.ipcieg1.mongodb.net/

echo 请输入配置信息 (按Enter使用默认值):
echo.

:: 获取端口配置
set /p PORT="服务器端口 [%DEFAULT_PORT%]: "
if "%PORT%"=="" set PORT=%DEFAULT_PORT%

:: 获取存储路径配置
echo 注意: 这是存储主机上的实际路径，不是网络路径
echo 例如: F:\Code\NAS_DEMO\NAS\storage
set /p STORAGE_PATH="存储主机上的绝对路径 [%DEFAULT_STORAGE_PATH%]: "
if "%STORAGE_PATH%"=="" set STORAGE_PATH=%DEFAULT_STORAGE_PATH%

:: 获取存储主机IP
echo 注意: 这是存储主机的IP地址，用于网络访问
set /p STORAGE_HOST_IP="存储主机IP [%DEFAULT_STORAGE_HOST_IP%]: "
if "%STORAGE_HOST_IP%"=="" set STORAGE_HOST_IP=%DEFAULT_STORAGE_HOST_IP%

:: 获取存储主机名称
set /p STORAGE_HOST_NAME="存储主机名称 [%DEFAULT_STORAGE_HOST_NAME%]: "
if "%STORAGE_HOST_NAME%"=="" set STORAGE_HOST_NAME=%DEFAULT_STORAGE_HOST_NAME%

:: 获取MongoDB URI
set /p MONGODB_URI="MongoDB连接URI [%DEFAULT_MONGODB_URI%]: "
if "%MONGODB_URI%"=="" set MONGODB_URI=%DEFAULT_MONGODB_URI%

:: 获取JWT密钥
set /p JWT_SECRET="JWT密钥 [nas_secret_key]: "
if "%JWT_SECRET%"=="" set JWT_SECRET=nas_secret_key

:: 获取最大文件大小
set /p MAX_FILE_SIZE="最大文件大小(字节) [21474836480]: "
if "%MAX_FILE_SIZE%"=="" set MAX_FILE_SIZE=21474836480

:: 获取存储配额
set /p DEFAULT_STORAGE_QUOTA="默认存储配额(字节) [536870912000]: "
if "%DEFAULT_STORAGE_QUOTA%"=="" set DEFAULT_STORAGE_QUOTA=536870912000

echo.
echo ========================================
echo    配置信息确认
echo ========================================
echo 服务器端口: %PORT%
echo 存储主机上的路径: %STORAGE_PATH%
echo 存储主机IP: %STORAGE_HOST_IP%
echo 存储主机名称: %STORAGE_HOST_NAME%
echo 网络访问路径: \\%STORAGE_HOST_IP%\storage
echo MongoDB URI: %MONGODB_URI%
echo JWT密钥: %JWT_SECRET%
echo 最大文件大小: %MAX_FILE_SIZE%
echo 默认存储配额: %DEFAULT_STORAGE_QUOTA%
echo ========================================
echo.

set /p CONFIRM="确认以上配置? (y/n): "
if /i not "%CONFIRM%"=="y" (
    echo 配置已取消
    pause
    exit /b 0
)

:: 创建.env文件
echo 正在创建环境配置文件...
echo # 服务器配置 > "%NAS_ROOT%\server\.env"
echo PORT=%PORT% >> "%NAS_ROOT%\server\.env"
echo NODE_ENV=development >> "%NAS_ROOT%\server\.env"
echo. >> "%NAS_ROOT%\server\.env"
echo # 数据库配置 >> "%NAS_ROOT%\server\.env"
echo MONGODB_URI=%MONGODB_URI% >> "%NAS_ROOT%\server\.env"
echo. >> "%NAS_ROOT%\server\.env"
echo # 显示用户信息开关 (true/false) >> "%NAS_ROOT%\server\.env"
echo SHOW_USER_INFO=false >> "%NAS_ROOT%\server\.env"
echo. >> "%NAS_ROOT%\server\.env"
echo # 分布式存储配置 >> "%NAS_ROOT%\server\.env"
echo STORAGE_HOST_IP=%STORAGE_HOST_IP% >> "%NAS_ROOT%\server\.env"
echo STORAGE_HOST_NAME=%STORAGE_HOST_NAME% >> "%NAS_ROOT%\server\.env"
echo STORAGE_PATH=%STORAGE_PATH% >> "%NAS_ROOT%\server\.env"
echo. >> "%NAS_ROOT%\server\.env"
echo # 文件上传配置 >> "%NAS_ROOT%\server\.env"
echo UPLOAD_PATH=%STORAGE_PATH% >> "%NAS_ROOT%\server\.env"
echo MAX_FILE_SIZE=%MAX_FILE_SIZE% >> "%NAS_ROOT%\server\.env"
echo. >> "%NAS_ROOT%\server\.env"
echo # JWT配置 >> "%NAS_ROOT%\server\.env"
echo JWT_SECRET=%JWT_SECRET% >> "%NAS_ROOT%\server\.env"
echo JWT_EXPIRES_IN=1h >> "%NAS_ROOT%\server\.env"
echo. >> "%NAS_ROOT%\server\.env"
echo # 存储配额配置 (500GB) >> "%NAS_ROOT%\server\.env"
echo DEFAULT_STORAGE_QUOTA=%DEFAULT_STORAGE_QUOTA% >> "%NAS_ROOT%\server\.env"
echo. >> "%NAS_ROOT%\server\.env"
echo # 允许的文件类型 (用逗号分隔，*表示所有类型) >> "%NAS_ROOT%\server\.env"
echo ALLOWED_FILE_TYPES=* >> "%NAS_ROOT%\server\.env"

echo.
echo ========================================
echo    配置完成！
echo ========================================
echo 环境配置文件已创建: %NAS_ROOT%\server\.env
echo 存储目录: %STORAGE_PATH%
echo 存储主机IP: %STORAGE_HOST_IP%
echo 存储主机名称: %STORAGE_HOST_NAME%
echo.
echo 配置信息:
echo - 服务器端口: %PORT%
echo - 存储主机路径: %STORAGE_PATH%
echo - 网络访问路径: \\%STORAGE_HOST_IP%\storage
echo - MongoDB URI: %MONGODB_URI%
echo - 最大文件大小: %MAX_FILE_SIZE%
echo - 默认存储配额: %DEFAULT_STORAGE_QUOTA%
echo.
echo ========================================
echo    配置已完成，脚本即将退出
echo ========================================
echo.
echo 如需启动服务，请手动运行:
echo   start-nas.bat
echo.
echo 如需停止服务，请运行:
echo   stop-nas.bat
echo ========================================
echo.
echo 按任意键退出配置脚本...
pause >nul 