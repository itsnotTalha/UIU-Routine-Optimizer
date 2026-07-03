@echo off
setlocal

cd /d "%~dp0"
set "PYTHONPATH=%~dp0lib;%PYTHONPATH%"
set "PYTHON_EXE=python"

if exist "%~dp0venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
) else (
    where py >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_EXE=py -3"
    )
)

echo Starting Routine Schedule Optimizer Server on http://127.0.0.1:8000 ...

if "%PYTHON_EXE%"=="py -3" (
    py -3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
) else (
    "%PYTHON_EXE%" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
)

endlocal