@echo off
setlocal
cd /d "%~dp0"
title Game Designer Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo 启动失败，退出码 %EXITCODE%。
  pause
)
exit /b %EXITCODE%
