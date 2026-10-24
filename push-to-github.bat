@echo off
REM ============================================================
REM  Vault - uploads this project to GitHub (private repo)
REM  Just double-click. Sign in to GitHub when the window pops up.
REM ============================================================
title Upload Vault to GitHub
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\Git\cmd"

echo.
echo [1/5] Cleaning up the earlier Git setup in your user folder...
if exist "%USERPROFILE%\.git" (
  ren "%USERPROFILE%\.git" .git-mistake
  echo     Renamed %USERPROFILE%\.git to .git-mistake - your files were not touched.
) else (
  echo     Nothing to clean up.
)

echo.
echo [2/5] Setting your Git name and email...
git config --global user.name "Israel"
git config --global user.email "yisraelben7172@gmail.com"
git config --global init.defaultBranch main

echo.
echo [3/5] Preparing the project...
if not exist ".git" git init
git add .

REM Safety check: never upload passwords/keys
git ls-files --cached | findstr /r /x "\.env" >nul
if %errorlevel%==0 (
  echo.
  echo  STOP: the .env file with passwords was about to be uploaded. Nothing was sent.
  git rm --cached .env >nul
  pause
  exit /b 1
)

echo.
echo [4/5] Saving a snapshot (commit)...
git commit -m "Initial backend setup" || echo     (nothing new to save)
git branch -M main

echo.
echo [5/5] Uploading to GitHub - sign in if a window pops up...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/yisraelben7172/savings-app.git
git push -u origin main

echo.
if %errorlevel%==0 (
  echo ============================================================
  echo  Done! Your code is on GitHub: github.com/yisraelben7172/savings-app
  echo ============================================================
) else (
  echo  Upload failed - take a screenshot of this window and send it to Claude.
)
pause
