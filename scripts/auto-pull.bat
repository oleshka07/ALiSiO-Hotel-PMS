@echo off
:: ALiSiO PMS — Auto-pull from GitHub
:: Runs git pull on the local repo. Safe: does nothing if there's nothing new.
:: Scheduled via Windows Task Scheduler every 5 minutes.

cd /d "D:\Antigraviti\ALiSiO PMS"

:: Only pull if there are no uncommitted changes (to avoid conflicts)
git diff --quiet 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [%DATE% %TIME%] Skipping pull — local changes detected >> "%~dp0auto-pull.log"
    exit /b 0
)

git diff --cached --quiet 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [%DATE% %TIME%] Skipping pull — staged changes detected >> "%~dp0auto-pull.log"
    exit /b 0
)

:: Pull latest
git pull origin main >> "%~dp0auto-pull.log" 2>&1
echo [%DATE% %TIME%] Pull completed (exit code: %ERRORLEVEL%) >> "%~dp0auto-pull.log"
