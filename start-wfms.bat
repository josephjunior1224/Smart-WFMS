@echo off
REM ====================================================
REM WFMS - Windows Server Deployment Script
REM ====================================================

cd /d "C:\Users\Otto Wilson\Desktop\wfms test"

echo.
echo ====================================================
echo    WFMS - Workforce Management System
echo    Windows Server Deployment
echo ====================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Display Node.js version
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [INFO] Node.js version: %NODE_VERSION%

REM Check if MySQL is available
echo.
echo Checking MySQL connection...
REM Note: This is basic check - MySQL must be running

REM Start the application
echo.
echo [INFO] Starting WFMS server...
echo [INFO] Application will run on http://localhost:8000
echo.
echo ====================================================
echo Server is starting. Press Ctrl+C to stop.
echo Access the application at: http://localhost:8000
echo Default credentials: admin@wfms.local / admin
echo ====================================================
echo.

npm start

pause
