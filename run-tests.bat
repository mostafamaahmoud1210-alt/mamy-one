@echo off
chcp 65001 >nul
title Mamy One – اختبارات الجودة والقبول

echo =====================================================================
echo       تشغيل حزمة اختبارات القبول الشاملة لنظام Mamy One
echo =====================================================================
echo.

set ELECTRON_RUN_AS_NODE=1
"C:\Users\mostafa.mahmoud\AppData\Local\Programs\antigravity\Antigravity.exe" tests/test_acceptance.js

echo.
pause
