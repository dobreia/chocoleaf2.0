@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
call npm run local
set "LOCAL_TEST_EXIT=%ERRORLEVEL%"
pause
exit /b %LOCAL_TEST_EXIT%
