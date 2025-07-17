@echo off
chcp 65001 >nul
title MongoDB Connection Test

echo =====================================
echo      MongoDB Connection Test Tool
echo =====================================
echo.

:: Check MongoDB service status
echo [1/4] Checking MongoDB service status...
sc query MongoDB >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✓ MongoDB service is installed
    sc query MongoDB | findstr "RUNNING" >nul 2>&1
    if %errorlevel% equ 0 (
        echo   ✓ MongoDB service is running
    ) else (
        echo   ✗ MongoDB service is not running
        echo   Trying to start MongoDB service...
        net start MongoDB >nul 2>&1
        if %errorlevel% equ 0 (
            echo   ✓ MongoDB service started successfully
        ) else (
            echo   ✗ Failed to start MongoDB service
        )
    )
) else (
    echo   ✗ MongoDB service is not installed or not found
)

:: Check MongoDB port
echo.
echo [2/4] Checking MongoDB port...
netstat -ano | findstr ":27017" >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✓ MongoDB port 27017 is listening
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":27017"') do (
        echo   Process PID: %%a
        tasklist /FI "PID eq %%a" /FO CSV 2>nul | findstr /v "PID" | findstr /v "INFO"
    )
) else (
    echo   ✗ MongoDB port 27017 is not listening
)

:: Test MongoDB connection
echo.
echo [3/4] Testing MongoDB connection...
if exist "server\node_modules\.bin\mongosh.exe" (
    echo   Using mongosh to test connection...
    server\node_modules\.bin\mongosh.exe "mongodb://localhost:27017/nas_system" --eval "db.runCommand('ping')" >nul 2>&1
    if %errorlevel% equ 0 (
        echo   ✓ MongoDB connection test successful
    ) else (
        echo   ✗ MongoDB connection test failed
    )
) else (
    echo   Using Node.js to test connection...
    cd server
    node -e "
    const mongoose = require('mongoose');
    mongoose.connect('mongodb://localhost:27017/nas_system', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
    }).then(() => {
        console.log('✓ MongoDB connection successful');
        process.exit(0);
    }).catch(err => {
        console.log('✗ MongoDB connection failed:', err.message);
        process.exit(1);
    });
    " 2>nul
    if %errorlevel% equ 0 (
        echo   ✓ MongoDB connection test successful
    ) else (
        echo   ✗ MongoDB connection test failed
    )
    cd ..
)

:: Check environment configuration
echo.
echo [4/4] Checking environment configuration...
if exist "server\.env" (
    echo   ✓ Found .env file
    findstr "MONGODB_URI" server\.env >nul 2>&1
    if %errorlevel% equ 0 (
        echo   ✓ Found MONGODB_URI configuration
        for /f "tokens=2 delims==" %%a in ('findstr "MONGODB_URI" server\.env') do (
            echo   MongoDB URI: %%a
        )
    ) else (
        echo   ✗ MONGODB_URI configuration not found
    )
) else (
    echo   ✗ .env file not found
    echo   Recommend creating server\.env file and adding MONGODB_URI configuration
)

echo.
echo =====================================
echo Test Complete
echo =====================================
echo.
echo If MongoDB connection fails, please check:
echo   • MongoDB service is running
echo   • Port 27017 is not occupied
echo   • Firewall is not blocking connection
echo   • MONGODB_URI configuration in .env file is correct
echo.
pause 