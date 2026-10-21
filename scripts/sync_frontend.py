"""Copy frontend assets to public and version local URLs by their file contents.
Run after editing frontend assets: python3 scripts/sync_frontend.py
"""
from pathlib import Path
import hashlib
import re
import shutil

root = Path(__file__).resolve().parents[1]
source = root / 'frontend'
html = (source / 'index.html').read_text()
def version(match):
    attribute, name = match.groups()
    digest = hashlib.sha256((source / name).read_bytes()).hexdigest()[:12]
    return f'{attribute}="{name}?v={digest}"'
html = re.sub(r'(href|src)="([\w-]+\.(?:css|js))(?:\?v=[\w-]+)?"', version, html)
(source / 'index.html').write_text(html)
for path in source.iterdir():
    if path.is_file():
        shutil.copy2(path, root / 'public' / path.name)
print('Synced frontend to public with content-versioned CSS and JavaScript.')
