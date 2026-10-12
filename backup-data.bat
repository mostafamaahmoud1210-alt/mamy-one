@echo off
chcp 65001 >nul
title Mamy One – النسخ الاحتياطي لقاعدة البيانات
cd /d "%~dp0"

if not exist "backups" mkdir "backups"

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set datestamp=%datetime:~0,8%_%datetime:~8,6%

copy /y "data\mamy_one.db" "backups\mamy_one_backup_%datestamp%.db" >nul

echo =====================================================================
echo           تم أخذ نسخة احتياطية من قاعدة البيانات بنجاح!
echo =====================================================================
echo.
echo مكان الحفظ:
echo backups\mamy_one_backup_%datestamp%.db
echo.
echo احتفظ بهذه النسخة على فلاش ميموري (USB) أو في أي مكان آمن لحماية بياناتك.
echo =====================================================================
echo.
pause
