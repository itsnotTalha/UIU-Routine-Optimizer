import sys
import urllib.parse
from pathlib import Path

# Add project root directory to sys.path so 'backend' package is importable
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.main import app as fastapi_app


class VercelPathMiddleware:
    """
    Normalizes Vercel serverless request paths.
    When Vercel rewrites /api/(.*) to /api/index.py, the ASGI scope['path'] can be
    overwritten by Vercel with '/api/index.py'. This middleware restores the
    original client request path using Vercel headers (x-matched-path, x-forwarded-uri)
    or the __path query parameter.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            headers = dict(scope.get("headers", []))

            # 1. Try Vercel's internal routing headers
            matched = (
                headers.get(b"x-matched-path")
                or headers.get(b"x-forwarded-uri")
                or headers.get(b"x-vercel-matched-path")
            )
            if matched:
                orig_path = matched.decode("utf-8").split("?")[0]
                # Ensure the path begins with /
                if not orig_path.startswith("/"):
                    orig_path = "/" + orig_path
                scope["path"] = orig_path
                scope["raw_path"] = orig_path.encode("utf-8")
            elif path in ("/api/index.py", "/api/index", "/index.py", "/api", "/api/"):
                # 2. Fallback to query parameter __path from vercel.json rewrite
                qs = scope.get("query_string", b"").decode("utf-8")
                params = urllib.parse.parse_qs(qs)
                if "__path" in params:
                    p = params.pop("__path")[0]
                    clean_path = "/" + p.lstrip("/")
                    if not clean_path.startswith("/api"):
                        clean_path = "/api" + clean_path
                    scope["path"] = clean_path
                    scope["raw_path"] = clean_path.encode("utf-8")
                    new_qs = urllib.parse.urlencode(params, doseq=True)
                    scope["query_string"] = new_qs.encode("utf-8")

        await self.app(scope, receive, send)


app = VercelPathMiddleware(fastapi_app)
