"""PDF catalogs are stored separately from the legacy manually entered courses."""
import json
import hashlib
import time
from collections import OrderedDict
from threading import Lock
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile
from backend.models import CatalogOptimizeRequest
from backend.optimizer import solve_schedules, schedule_score
from backend.pdf_import import import_pdf
from backend.preferences import preference_score, preference_report, filter_strict, availability_notices, penalties, gap_violations, daily_class_limit_advice, preference_failure_advice

router = APIRouter()
CATALOG_DIR = Path(__file__).parent / 'catalogs'
TMP_CATALOG_DIR = Path('/tmp/catalogs')
ROUTINES_DIR = Path(__file__).parent.parent / 'routines'
BACKEND_ROUTINES_DIR = Path(__file__).parent / 'routines'
MAX_UPLOAD = 20 * 1024 * 1024


# Small, expiring process-local cache: useful on local servers and warm workers.
# Keys include section data, so changed PDFs/preferences cannot reuse old results.
_SCHEDULE_CACHE = OrderedDict()
_CACHE_LOCK = Lock()
_CACHE_TTL = 120
_CACHE_MAX_ENTRIES = 4
_CACHE_MAX_RESULTS = 20_000


def ranked_schedules(courses, campus_days, preferences=None):
    signature = json.dumps([courses, campus_days, preferences], sort_keys=True, separators=(',', ':'))
    key = hashlib.sha256(signature.encode()).digest()
    now = time.monotonic()
    with _CACHE_LOCK:
        for expired in [k for k, (deadline, _) in _SCHEDULE_CACHE.items() if deadline <= now]:
            del _SCHEDULE_CACHE[expired]
        if key in _SCHEDULE_CACHE:
            _SCHEDULE_CACHE.move_to_end(key)
            return _SCHEDULE_CACHE[key][1]
    candidates = filter_strict(courses, preferences) if preferences and preferences.get('priority') == 'strict' else courses
    schedules = solve_schedules(candidates, max_results=100_000, max_nodes=2_000_000, campus_days=campus_days, max_classes_per_day=(preferences or {}).get('max_classes_per_day'), fixed_slots=(preferences or {}).get('fixed_slots'), allowed_days=(preferences or {}).get('allowed_days'))
    if preferences and preferences.get('priority') == 'strict' and preferences.get('min_gap'):
        schedules = [s for s in schedules if gap_violations(s, preferences['min_gap'])[0] == 0]
    schedules.sort(key=(lambda s: preference_score(s, preferences)) if preferences else schedule_score)
    if len(schedules) <= _CACHE_MAX_RESULTS:
        with _CACHE_LOCK:
            _SCHEDULE_CACHE[key] = (time.monotonic() + _CACHE_TTL, schedules)
            _SCHEDULE_CACHE.move_to_end(key)
            while len(_SCHEDULE_CACHE) > _CACHE_MAX_ENTRIES:
                _SCHEDULE_CACHE.popitem(last=False)
    return schedules


def default_pdf_path():
    """Use the same bundled source for parsing and the source-PDF endpoint."""
    for directory in (ROUTINES_DIR, BACKEND_ROUTINES_DIR):
        pdfs = sorted(directory.glob('*.pdf'))
        if pdfs:
            return pdfs[-1]
    return None


def cache_default_catalog(catalog):
    data = json.dumps(catalog, ensure_ascii=False)
    for directory in (CATALOG_DIR, TMP_CATALOG_DIR):
        temporary = directory / f'.default-{uuid4().hex}.tmp'
        try:
            directory.mkdir(parents=True, exist_ok=True)
            temporary.write_text(data, encoding='utf-8')
            temporary.replace(directory / 'default.json')
            return
        except OSError:
            pass
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
    # A read-only cache must not prevent using a successfully parsed PDF.


def get_default_catalog():
    source = default_pdf_path()
    content = None
    if source is not None:
        try:
            content = source.read_bytes()
        except OSError as exc:
            raise HTTPException(503, 'The default routine PDF could not be read.') from exc
    digest = hashlib.sha256(content).hexdigest() if content is not None else None
    for directory in (TMP_CATALOG_DIR, CATALOG_DIR):
        try:
            cached = json.loads((directory / 'default.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        if not isinstance(cached, dict) or not isinstance(cached.get('courses'), list):
            continue
        if source is None or (cached.get('source_sha256') == digest and cached.get('filename') == source.name):
            return dict(cached, id='default', is_default=True)

    if source is not None:
        try:
            parsed = import_pdf(content)
        except ValueError as exc:
            raise HTTPException(422, f'The default routine PDF could not be parsed: {exc}') from exc
        parsed.update(id='default', filename=source.name, is_default=True, source_sha256=digest)
        cache_default_catalog(parsed)
        return parsed

    raise HTTPException(404, 'No default routine catalog found. Add a bundled routine PDF or upload a custom PDF.')


def load_catalog(catalog_id):
    if catalog_id == 'default':
        return get_default_catalog()
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


@router.get('/catalogs/default')
def get_default_catalog_endpoint():
    from fastapi.responses import JSONResponse
    return JSONResponse(get_default_catalog(), headers={'Cache-Control': 'no-store'})


@router.get('/catalogs/pdf')
def get_default_pdf():
    source = default_pdf_path()
    if source is None:
        raise HTTPException(404, 'Routine PDF not found.')
    from fastapi.responses import FileResponse
    return FileResponse(source, media_type='application/pdf', filename=source.name,
                        headers={'Cache-Control': 'no-cache'})


@router.get('/catalogs/{catalog_id}')
def get_catalog(catalog_id: str):
    return load_catalog(catalog_id)


@router.post('/catalogs/optimize')
def optimize_catalog(request: CatalogOptimizeRequest):
    catalog = load_catalog(request.catalog_id)
    available = {c['id']: c for c in catalog['courses']}
    courses, seen = [], set()
    preferences = dict(
        allowed_days=request.allowed_days,
        fixed_slots=[slot.model_dump() for slot in request.fixed_slots],
        earliest_start=request.earliest_start,
        latest_end=request.latest_end,
        priority=request.priority,
        min_gap=request.min_gap,
        max_classes_per_day=request.max_classes_per_day,
        prioritized_faculties=request.prioritized_faculties or [],
        faculties={},
        section_priorities={},
        course_order=[]
    )
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
        for teacher, sections in selection.section_priorities.items():
            available_sections = {s['name'] for s in course['sections'] if s['faculty'] == teacher}
            if teacher not in faculties or not set(sections) <= available_sections or len(sections) != len(set(sections)):
                raise HTTPException(400, f"Invalid section priorities for {course['code']}.")
        name = f"{course['code']} — {course['title']} ({course['program']})"
        preferences['section_priorities'][name] = selection.section_priorities
        preferences['course_order'].append(name)
        preferences['faculties'][name] = [f for f in selection.faculties if f in faculties]
        courses.append(dict(course_name=name, sections=course['sections']))
    # Search constrained courses first; preserve every valid result within limits.
    courses.sort(key=lambda c: len(c['sections']))
    try:
        schedules = ranked_schedules(courses, request.campus_days, preferences)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    page = schedules[request.offset:request.offset + request.limit]
    return dict(preference_advice=preference_failure_advice(courses, request.campus_days, preferences) if not schedules else None, daily_class_limit=daily_class_limit_advice(courses, request.campus_days, preferences) if not schedules else None,
                schedules=page, total=len(schedules), offset=request.offset,
                preference_reports=[preference_report(s, preferences) for s in page],
                notices=availability_notices(courses, preferences),
                exact_matches=sum(penalties(s, preferences) == (0, 0) for s in schedules),
                limit=request.limit, metrics=[dict(zip(('campus_days', 'gap_minutes'), schedule_score(s))) for s in page])
