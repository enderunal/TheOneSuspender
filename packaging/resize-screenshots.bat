@echo off
echo.
echo ==========================================
echo     Screenshot Resizer for Chrome Store
echo ==========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://python.org
    pause
    exit /b 1
)

REM Check if Pillow is installed
python -c "import PIL" >nul 2>&1
if errorlevel 1 (
    echo Installing Pillow dependency...
    pip install Pillow
    if errorlevel 1 (
        echo ERROR: Failed to install Pillow
        pause
        exit /b 1
    )
)

REM Run the screenshot resizer
echo Running screenshot resizer...
echo.
python resize-screenshots.py

echo.
echo ==========================================
echo Press any key to continue...
pause >nul 