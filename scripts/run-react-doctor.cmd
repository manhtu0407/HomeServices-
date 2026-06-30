@echo off
setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PS_ARGS="
set "REMAINING_ARGS="

if /I "%~1"=="changed" (
  set "PS_ARGS=-Changed"
  shift
) else if /I "%~1"=="lines" (
  set "PS_ARGS=-Lines"
  shift
)

if "%~1"=="--" (
  shift
)

:collect_args
if "%~1"=="" goto run_doctor
set "REMAINING_ARGS=!REMAINING_ARGS! ^"%~1^""
shift
goto collect_args

:run_doctor
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run-react-doctor.ps1" %PS_ARGS% %REMAINING_ARGS%
exit /b %ERRORLEVEL%
