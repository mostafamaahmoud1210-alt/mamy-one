@echo off
title Mamy One - Nursery Management System with Cloud Tunnel
cd /d "C:\MamyOne"

echo =============================================================
echo   Mamy One - Nursery Management System (Mobile Cloud Access)
echo =============================================================
echo.

start "" "http://localhost:3000"

where node >nul 2>&1
if %errorlevel% equ 0 (
    node server.js
    goto :end
)

if exist "%APPDATA%\Antigravity\bin\agy-node.cmd" (
    call "%APPDATA%\Antigravity\bin\agy-node.cmd" server.js
    goto :end
)

set ELECTRON_RUN_AS_NODE=1
if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" (
    "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" server.js
    goto :end
)

if exist "C:\Users\mostafa.mahmoud\AppData\Local\Programs\antigravity\Antigravity.exe" (
    "C:\Users\mostafa.mahmoud\AppData\Local\Programs\antigravity\Antigravity.exe" server.js
    goto :end
)

echo Node.js is required. Download from https://nodejs.org
pause

:end
pause
