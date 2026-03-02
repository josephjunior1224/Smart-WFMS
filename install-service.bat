@echo off
REM ====================================================
REM WFMS - Production Service Installer (NSSM)
REM ====================================================

echo.
echo ====================================================
echo    WFMS - Windows Service Setup
echo    Using NSSM (Non-Sucking Service Manager)
echo ====================================================
echo.

REM Check for admin privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script requires Administrator privileges!
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Check if NSSM is installed
where nssm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] NSSM is not installed or not in PATH
    echo.
    echo To install NSSM:
    echo 1. Download from: https://nssm.cc/download
    echo 2. Extract to: C:\nssm\
    echo 3. Add C:\nssm\ to your PATH environment variable
    echo 4. Run this script again
    pause
    exit /b 1
)

REM Set variables
set SERVICE_NAME=WFMS
set NODE_PATH=C:\Program Files\nodejs\node.exe
set APP_PATH=C:\Users\Otto Wilson\Desktop\wfms test\server.js
set WORK_DIR=C:\Users\Otto Wilson\Desktop\wfms test

echo [INFO] Creating Windows Service: %SERVICE_NAME%
echo [INFO] Node.js path: %NODE_PATH%
echo [INFO] App path: %APP_PATH%
echo [INFO] Working directory: %WORK_DIR%
echo.

REM Remove existing service if it exists
nssm query %SERVICE_NAME% >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Removing existing service...
    nssm stop %SERVICE_NAME%
    nssm remove %SERVICE_NAME% confirm
)

REM Create the service
echo [INFO] Installing service...
nssm install %SERVICE_NAME% "%NODE_PATH%" "%APP_PATH%"

if %errorlevel% neq 0 (
    echo [ERROR] Failed to create service
    pause
    exit /b 1
)

REM Configure the service
echo [INFO] Configuring service...
nssm set %SERVICE_NAME% AppDirectory "%WORK_DIR%"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% AppExit Default Restart
nssm set %SERVICE_NAME% AppRestartDelay 5000

REM Set log files
mkdir "C:\Users\Otto Wilson\Desktop\wfms test\logs" 2>nul
nssm set %SERVICE_NAME% AppStdout "C:\Users\Otto Wilson\Desktop\wfms test\logs\stdout.log"
nssm set %SERVICE_NAME% AppStderr "C:\Users\Otto Wilson\Desktop\wfms test\logs\stderr.log"

echo.
echo [SUCCESS] Service created successfully!
echo.
echo Available commands:
echo   - Start service:   nssm start %SERVICE_NAME%
echo   - Stop service:    nssm stop %SERVICE_NAME%
echo   - Restart service: nssm restart %SERVICE_NAME%
echo   - Check status:    nssm status %SERVICE_NAME%
echo   - View logs:       C:\Users\Otto Wilson\Desktop\wfms test\logs\
echo   - Remove service:  nssm remove %SERVICE_NAME% confirm
echo.
echo Starting service now...
nssm start %SERVICE_NAME%

echo.
echo Service is starting. Check logs in: C:\Users\Otto Wilson\Desktop\wfms test\logs\
echo Access application at: http://localhost:8000
echo.
pause
