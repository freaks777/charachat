@echo off
chcp 65001 > nul
REM RP Standalone Server Launcher
REM Usage: start_server.bat [--debug] [--model MODEL_ID]

set "ROOT=%~dp0"
set "VENV_PYTHON=%ROOT%.venv\Scripts\python.exe"

set "BOOTSTRAP_PYTHON="
where py > nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys; raise SystemExit(sys.version_info < (3, 11))" > nul 2>&1
    if not errorlevel 1 set "BOOTSTRAP_PYTHON=py -3"
)
if not defined BOOTSTRAP_PYTHON (
    where python > nul 2>&1
    if not errorlevel 1 (
        python -c "import sys; raise SystemExit(sys.version_info < (3, 11))" > nul 2>&1
        if not errorlevel 1 set "BOOTSTRAP_PYTHON=python"
    )
)
if not defined BOOTSTRAP_PYTHON (
    echo [bootstrap] ERROR: Python 3.11 or newer was not found.
    exit /b 1
)

cd /d "%ROOT%"
set PYTHONPATH=

%BOOTSTRAP_PYTHON% "%ROOT%bootstrap.py"
if errorlevel 1 exit /b 1

echo === RP Standalone Server ===
echo Port: 8765
echo Python: %VENV_PYTHON%
echo.

"%VENV_PYTHON%" "%ROOT%backend\main.py" %*
