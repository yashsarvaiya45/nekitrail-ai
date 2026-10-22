@echo off
setlocal
cd /d "%~dp0"
echo Installing project dependencies (first run may take a few minutes)...
call npm install
if errorlevel 1 (
  echo.
  echo Dependency installation failed. Check Node.js/npm and internet connectivity.
  pause
  exit /b 1
)
echo.
echo Starting frontend and backend...
call npm run dev
pause
