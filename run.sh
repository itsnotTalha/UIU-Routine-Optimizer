#!/bin/bash
# Start script for the Routine Schedule Optimizer application

set -e

VENV_DIR="venv"
ACTIVATE_SCRIPT="$VENV_DIR/bin/activate"

# 1. Create the venv if the activation script doesn't exist
if [ ! -f "$ACTIVATE_SCRIPT" ]; then
    echo "Virtual environment not found or incomplete. Creating venv..."
    # Clean up a broken directory if it exists
    rm -rf "$VENV_DIR"
    python3 -m venv "$VENV_DIR"
fi

# 2. Activate the venv
echo "Activating virtual environment..."
source "$ACTIVATE_SCRIPT"

# 3. Install all the dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# 4. Run the application
echo "Starting Routine Schedule Optimizer Server on http://127.0.0.1:8000 ..."
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
