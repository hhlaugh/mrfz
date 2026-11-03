@echo off
chcp 65001 >nul
title Three-Lane Card Game Demo Launcher

cd /d "%~dp0"

echo ========================================================
echo       Three-Lane Card Game Demo Launcher (Vite + React)
echo ========================================================
echo.

set "VENDOR_NODE=C:\Users\s006.NISSINJPN\AppData\Local\Programs\AutoClaw2\resources\vendor\node"
if exist "%VENDOR_NODE%\node.exe" (
    set "PATH=%VENDOR_NODE%;%PATH%"
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found in PATH or AutoClaw vendor folder.
    pause
    exit /b 1
)

echo [1/2] Starting Relay Server (:8787)...
start "Relay Server :8787" cmd /c "title Relay Server (8787) && node relay-server/src/index.ts"

echo [2/2] Starting Frontend Vite Server (:5173)...
echo Opening default browser at http://localhost:5173 ...
echo.

node "./node_modules/vite/bin/vite.js" --port 5173 --open
