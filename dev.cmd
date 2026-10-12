@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0.cache\toolchain\node-v24.19.0-win-x64;%PATH%"
if not exist "%~dp0.cache\toolchain\node-v24.19.0-win-x64\npm.cmd" (
  echo Local Node.js/npm is missing.
  exit /b 1
)
if "%~1"=="" (
  call npm.cmd run dev
) else (
  call npm.cmd %*
)
exit /b %errorlevel%
