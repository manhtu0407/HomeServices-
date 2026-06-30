@echo off
setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "REMAINING_ARGS="

:collect_args
if "%~1"=="" goto run_supabase
if "%~1"=="--" (
  shift
  goto collect_args
)
set "REMAINING_ARGS=!REMAINING_ARGS! ^"%~1^""
shift
goto collect_args

:run_supabase
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run-supabase.ps1" %REMAINING_ARGS%
exit /b %ERRORLEVEL%
