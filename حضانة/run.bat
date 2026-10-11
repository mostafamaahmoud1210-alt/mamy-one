@echo off
chcp 65001 >nul
title Mamy One – نظام إدارة الحضانات المتكامل

echo =====================================================================
echo           نظام مامي وان لإدارة وحسابات الحضانات (Mamy One)
echo =====================================================================
echo.
echo  جارٍ تشغيل الخادم المحلي...
echo  رابط الدخول: http://localhost:3000
echo.

set ELECTRON_RUN_AS_NODE=1
start "" "http://localhost:3000"
"C:\Users\mostafa.mahmoud\AppData\Local\Programs\antigravity\Antigravity.exe" server.js

pause
