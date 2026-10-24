@echo off
title Sales App API
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files\PostgreSQL\17\bin"
rem Free port 3000 if an old API window is still holding it
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do (
  echo Stopping old process on port 3000 ^(PID %%p^)...
  taskkill /PID %%p /F >nul 2>&1
)
call npm run start:dev
pause
