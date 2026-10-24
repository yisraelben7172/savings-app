@echo off
REM ============================================================
REM  Vault - Step 1: deals database + website starter
REM  Double-click. Takes about 5 minutes. Don't close the window.
REM ============================================================
title Vault build step 1
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files\Git\cmd;C:\Program Files\PostgreSQL\17\bin;%APPDATA%\npm"

echo.
echo [1/6] Removing the old starter features (customers, orders)...
if exist src\customers rmdir /s /q src\customers
if exist src\products rmdir /s /q src\products
if exist src\orders rmdir /s /q src\orders
if exist setup.ps1 del setup.ps1

echo.
echo [2/6] Adding empty API key slots to your .env file...
for %%K in (ANTHROPIC_API_KEY ANTHROPIC_MODEL AMAZON_ASSOCIATE_TAG EBAY_APP_ID EBAY_CERT_ID TICKETMASTER_API_KEY TRAVELPAYOUTS_TOKEN GOOGLE_SAFE_BROWSING_KEY) do (
  findstr /b /c:"%%K=" .env >nul || echo %%K=>>.env
)
findstr /b /c:"CORS_ORIGIN=" .env >nul && (
  powershell -NoProfile -Command "(Get-Content .env) -replace '^CORS_ORIGIN=.*','CORS_ORIGIN=http://localhost:3001,https://*.vercel.app' | Set-Content .env"
)

echo.
echo [3/6] Rebuilding the database for deals (demo data only, nothing real is lost)...
if exist prisma\migrations rmdir /s /q prisma\migrations
call npx prisma migrate reset --force --skip-seed || goto :fail
call npx prisma migrate dev --name deals_init || goto :fail
call npx prisma db seed || goto :fail

echo.
echo [4/6] Checking the backend code compiles...
call npm run build || goto :fail

echo.
echo [5/6] Creating the website (Next.js) in the "web" folder...
if not exist web (
  call npx --yes create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes || goto :fail
  cd web
  call npm install lucide-react || goto :fail
  cd ..
) else (
  echo     web folder already exists, skipping.
)

echo.
echo [6/6] Uploading to GitHub (Vercel will pick it up)...
git add -A
git ls-files --cached | findstr /r /x "\.env" >nul && (git rm --cached .env >nul & echo     Kept .env private.)
git commit -m "Deals database, AI assistant API, website starter" || echo     (nothing new to save)
git push || goto :fail

echo.
echo ============================================================
echo  Done! Tell Claude "step 1 done".
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo  Something went wrong above. Take a screenshot of this
echo  window and send it to Claude.
echo ============================================================
pause
exit /b 1
