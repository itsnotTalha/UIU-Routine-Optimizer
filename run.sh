#!/bin/bash
# Start script for the Routine Schedule Optimizer application

# Ensure we use the locally installed library dependencies in lib/
export PYTHONPATH=lib:.

echo "Starting Routine Schedule Optimizer Server on http://127.0.0.1:8000 ..."
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
