import sys
from pathlib import Path

# Add project root directory to sys.path so 'backend' package is importable
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.main import app

# Vercel looks for 'app' ASGI / WSGI application in api/index.py

