@echo off
chcp 65001 >nul
title 三路攻防卡牌 Demo 启动器

cd /d "%~dp0"

echo ========================================================
echo       三路攻防卡牌游戏 Demo (React + Vite) 一键启动
echo ========================================================
echo.

:: 优先检测 AutoClaw 自带的 Node 路径，防止系统 PATH 未配置
set "VENDOR_NODE=C:\Users\s006.NISSINJPN\AppData\Local\Programs\AutoClaw2\resources\vendor\node"
if exist "%VENDOR_NODE%\node.exe" (
    set "PATH=%VENDOR_NODE%;%PATH%"
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未在系统或环境中检测到 Node.js。
    echo 请确认已安装 Node.js。
    pause
    exit /b 1
)

echo [1/2] 正在后台启动中继服务 (Socket.IO relay:8787)...
start "中继服务器 (Relay Server :8787)" cmd /c "title 中继服务器 (8787) && node relay-server/src/index.ts"

echo [2/2] 正在启动前端服务并自动打开浏览器 (http://localhost:5173)...
echo.
echo 提示：关闭本窗口将停止前端服务。
echo.

node "./node_modules/vite/bin/vite.js" --port 5173 --open
