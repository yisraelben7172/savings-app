@echo off
REM ============================================================
REM  Sales App - installs Node.js, Git, PostgreSQL and sets up
REM  the project. Just double-click this file.
REM  Click "Yes" on any Windows permission pop-ups.
REM ============================================================
title Sales App setup
cd /d "%~dp0"

echo.
echo [1/6] Installing Node.js LTS...
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements

echo.
echo [2/6] Installing Git...
winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements

echo.
echo [3/6] Installing PostgreSQL 17 (local dev password: sales_password)...
winget install --id PostgreSQL.PostgreSQL.17 -e --accept-source-agreements --accept-package-agreements --override "--mode unattended --unattendedmodeui minimal --superpassword sales_password --serverport 5432"

REM Make the new tools usable in this window without restarting
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files\PostgreSQL\17\bin;%APPDATA%\npm"

echo.
echo [4/6] Creating database and user...
set "PGPASSWORD=sales_password"
psql -U postgres -h localhost -c "CREATE USER sales WITH PASSWORD 'sales_password' CREATEDB;"
psql -U postgres -h localhost -c "CREATE DATABASE sales_app OWNER sales;"

echo.
echo [5/6] Installing project packages...
if not exist ".env" copy ".env.example" ".env"
call npm install

echo.
echo [6/6] Creating tables and demo data...
call npx prisma generate
call npx prisma migrate dev --name init
call npx prisma db seed

echo.
echo ============================================================
echo  Done! To start the API, double-click start-api.bat
echo  then open http://localhost:3000/api/health
echo ============================================================
pause
