"""PDF catalogs are stored separately from the legacy manually entered courses."""
import json
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile
from backend.models import CatalogOptimizeRequest
from backend.optimizer import solve_schedules, schedule_score
from backend.pdf_import import import_pdf

router = APIRouter(prefix='/api')
CATALOG_DIR = Path(__file__).parent / 'catalogs'
TMP_CATALOG_DIR = Path('/tmp/catalogs')
MAX_UPLOAD = 20 * 1024 * 1024


def load_catalog(catalog_id):
    if not re.fullmatch(r'[a-f0-9]{32}', catalog_id):
        raise HTTPException(404, 'Catalog not found. Upload the PDF again.')
    # Check /tmp first (for newly uploaded files in serverless like Vercel)
    tmp_path = TMP_CATALOG_DIR / f'{catalog_id}.json'
    if tmp_path.exists():
        return json.loads(tmp_path.read_text(encoding='utf-8'))
    # Check bundled catalogs dir
    path = CATALOG_DIR / f'{catalog_id}.json'
    if not path.exists():
        raise HTTPException(404, 'Catalog not found. Upload the PDF again.')
    return json.loads(path.read_text(encoding='utf-8'))


@router.post('/catalogs/import')
def upload_catalog(file: UploadFile):
    try:
        content = file.file.read(MAX_UPLOAD + 1)
        if len(content) > MAX_UPLOAD:
            raise HTTPException(413, 'PDF must be no larger than 20 MB.')
        try:
            catalog = import_pdf(content)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        catalog['id'] = uuid4().hex
        catalog['filename'] = Path(file.filename or 'routine.pdf').name
        
        # Write to CATALOG_DIR, fallback to /tmp/catalogs on read-only environments (e.g. Vercel)
        data = json.dumps(catalog, ensure_ascii=False)
        try:
            CATALOG_DIR.mkdir(parents=True, exist_ok=True)
            path = CATALOG_DIR / f"{catalog['id']}.json"
            path.write_text(data, encoding='utf-8')
        except OSError:
            TMP_CATALOG_DIR.mkdir(parents=True, exist_ok=True)
            path = TMP_CATALOG_DIR / f"{catalog['id']}.json"
            path.write_text(data, encoding='utf-8')
            
        return catalog
    finally:
        file.file.close()


@router.get('/catalogs/{catalog_id}')
def get_catalog(catalog_id: str):
    return load_catalog(catalog_id)


@router.post('/catalogs/optimize')
def optimize_catalog(request: CatalogOptimizeRequest):
    catalog = load_catalog(request.catalog_id)
    available = {c['id']: c for c in catalog['courses']}
    courses, seen = [], set()
    for selection in request.selections:
        if selection.course_id in seen:
            raise HTTPException(400, 'Select each course only once.')
        seen.add(selection.course_id)
        course = available.get(selection.course_id)
        if course is None:
            raise HTTPException(400, 'Selected course is not in this PDF catalog.')
        faculties = set(selection.faculties)
        if not faculties <= {s['faculty'] for s in course['sections']}:
            raise HTTPException(400, f"Unknown faculty for {course['code']}.")
        sections = [s for s in course['sections'] if not faculties or s['faculty'] in faculties]
        courses.append(dict(course_name=f"{course['code']} — {course['title']} ({course['program']})", sections=sections))
    # Search constrained courses first; preserve every valid result within limits.
    courses.sort(key=lambda c: len(c['sections']))
    try:
        schedules = solve_schedules(courses, max_results=100_000, max_nodes=2_000_000, campus_days=request.campus_days)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    schedules.sort(key=schedule_score)
    page = schedules[request.offset:request.offset + request.limit]
    return dict(schedules=page, total=len(schedules), offset=request.offset,
                limit=request.limit, metrics=[dict(zip(('campus_days', 'gap_minutes'), schedule_score(s))) for s in page])
