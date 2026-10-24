@echo off
title Sales App API
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files\PostgreSQL\17\bin"
call npm run start:dev
pause
