@echo off
chcp 65001
echo =====================================
echo      生成SSL/TLS证书
echo =====================================
echo 生成时间: %date% %time%
echo.

:: 检查OpenSSL是否可用
openssl version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到OpenSSL
    echo.
    echo 请安装OpenSSL或下载Win32/Win64 OpenSSL:
    echo https://slproweb.com/products/Win32OpenSSL.html
    echo.
    echo 或者使用Git Bash中的OpenSSL（如果已安装Git）
    pause
    exit /b 1
)

:: 创建证书目录
if not exist "certs" (
    echo [1/6] 创建证书目录...
    mkdir "certs"
    echo [✓] 证书目录创建完成
) else (
    echo [1/6] 证书目录已存在
)

:: 创建配置文件
echo [2/6] 创建SSL配置文件...
(
echo [req]
echo default_bits = 2048
echo prompt = no
echo default_md = sha256
echo distinguished_name = dn
echo req_extensions = v3_req
echo.
echo [dn]
echo CN=nas.local
echo O=NAS System
echo OU=IT Department
echo L=City
echo ST=State
echo C=CN
echo.
echo [v3_req]
echo basicConstraints = CA:FALSE
echo keyUsage = nonRepudiation, digitalSignature, keyEncipherment
echo subjectAltName = @alt_names
echo.
echo [alt_names]
echo DNS.1 = nas.local
echo DNS.2 = localhost
echo DNS.3 = *.nas.local
echo IP.1 = 127.0.0.1
echo IP.2 = 192.168.1.100
) > certs\ssl.conf
echo [✓] SSL配置文件创建完成

:: 生成私钥
echo [3/6] 生成私钥...
openssl genrsa -out certs\server.key 2048 2>nul
if %errorlevel% equ 0 (
    echo [✓] 私钥生成完成 (certs\server.key)
) else (
    echo [✗] 私钥生成失败
    exit /b 1
)

:: 生成证书请求
echo [4/6] 生成证书请求...
openssl req -new -key certs\server.key -out certs\server.csr -config certs\ssl.conf 2>nul
if %errorlevel% equ 0 (
    echo [✓] 证书请求生成完成 (certs\server.csr)
) else (
    echo [✗] 证书请求生成失败
    exit /b 1
)

:: 生成自签名证书
echo [5/6] 生成自签名证书...
openssl x509 -req -days 365 -in certs\server.csr -signkey certs\server.key -out certs\server.crt -extensions v3_req -extfile certs\ssl.conf 2>nul
if %errorlevel% equ 0 (
    echo [✓] 证书生成完成 (certs\server.crt)
) else (
    echo [✗] 证书生成失败
    exit /b 1
)

:: 生成证书链（如果需要）
echo [6/6] 生成证书链...
copy certs\server.crt certs\fullchain.pem >nul 2>&1
echo [✓] 证书链生成完成 (certs\fullchain.pem)

:: 验证证书
echo.
echo 验证证书信息:
echo =====================================
openssl x509 -in certs\server.crt -text -noout | findstr "Subject:\|Not Before:\|Not After:\|DNS:"

echo.
echo =====================================
echo        ✅ SSL证书生成完成
echo.
echo 生成的文件:
echo   - 私钥: certs\server.key
echo   - 证书: certs\server.crt
echo   - 证书链: certs\fullchain.pem
echo   - 配置: certs\ssl.conf
echo.
echo ⚠️  安全提醒:
echo   1. 请妥善保管私钥文件
echo   2. 定期更新证书（建议每年）
echo   3. 在生产环境中使用CA签发的证书
echo   4. 将证书添加到浏览器受信任列表
echo.
echo 📝 使用说明:
echo   1. 在服务器配置中启用HTTPS
echo   2. 指定证书和私钥路径
echo   3. 重启NAS服务生效
echo =====================================

:: 记录证书生成日志
if not exist "logs" mkdir "logs"
echo %date% %time% - SSL证书生成完成 >> logs\security.log

:: 清理临时文件
del certs\server.csr >nul 2>&1

pause 