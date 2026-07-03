@echo off
setlocal

:: Move to the directory where this script is located
cd /d "%~dp0"
set "PYTHONPATH=%~dp0lib;%PYTHONPATH%"

set "VENV_DIR=%~dp0venv"
set "ACTIVATE_SCRIPT=%VENV_DIR%\Scripts\activate.bat"

:: 1. Create the venv if the activation script doesn't exist
if not exist "%ACTIVATE_SCRIPT%" (
    echo Virtual environment not found or incomplete. Creating venv...
    
    :: Clean up a broken directory if it exists
    if exist "%VENV_DIR%" rmdir /s /q "%VENV_DIR%"
    
    :: Detect best Python command to create the venv
    where py >nul 2>nul
    if not errorlevel 1 (
        py -3 -m venv "%VENV_DIR%"
    ) else (
        python -m venv "%VENV_DIR%"
    )
)

:: 2. Activate the venv
echo Activating virtual environment...
call "%ACTIVATE_SCRIPT%"

:: 3. Install all the dependencies
echo Installing dependencies...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

:: 4. Run the application
echo Starting Routine Schedule Optimizer Server on http://127.0.0.1:8000 ...
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

endlocal