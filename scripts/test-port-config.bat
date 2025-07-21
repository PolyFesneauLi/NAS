@echo off
chcp 65001 >nul
title Port Configuration Test

echo =====================================
echo      Port Configuration Test
echo =====================================
echo.

REM Check if .port-config.json exists
if exist ".port-config.json" (
    echo [OK] .port-config.json found
    type .port-config.json
    echo.
) else (
    echo [WARN] .port-config.json not found
    echo.
)

REM Check if .ports file exists
if exist ".ports" (
    echo [OK] .ports file found
    type .ports
    echo.
) else (
    echo [WARN] .ports file not found
    echo.
)

REM Check current port usage
echo Current port usage:
netstat -an | findstr ":500" | findstr "LISTENING"
echo.
netstat -an | findstr ":300" | findstr "LISTENING"
echo.

REM Test environment variables
echo Testing environment variables:
echo REACT_APP_SERVER_PORT=%REACT_APP_SERVER_PORT%
echo REACT_APP_API_URL=%REACT_APP_API_URL%
echo.

echo Press any key to close...
pause >nul 