import os
import json
from pathlib import Path
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from backend.models import OptimizeRequest, OptimizeResponse, SavedCourse
from backend.parser import parse_section_text
from backend.optimizer import solve_schedules
from backend.preferences import filter_strict, preference_score, preference_report, gap_violations, daily_class_limit_advice, preference_failure_advice
from backend.catalog import router as catalog_router

app = FastAPI(title="Routine Schedule Optimizer")
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=4)
app.include_router(catalog_router, prefix="/api")
app.include_router(catalog_router, prefix="")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/optimize", response_model=OptimizeResponse)
@app.post("/optimize", response_model=OptimizeResponse)
def optimize_schedules(request: OptimizeRequest):
    if not request.courses:
        return OptimizeResponse(schedules=[])
    
    course_groups = {}
    for c in request.courses:
        try:
            sections = parse_section_text(c.raw_text)
            if c.course_name not in course_groups:
                course_groups[c.course_name] = []
            course_groups[c.course_name].extend(sections)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Error in course '{c.course_name}': {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Unexpected error in course '{c.course_name}': {str(e)}")
            
    parsed_courses = [
        {"course_name": name, "sections": secs}
        for name, secs in course_groups.items()
    ]
            
    try:
        preferences = dict(
            allowed_days=request.allowed_days,
            fixed_slots=[slot.model_dump() for slot in request.fixed_slots],
            earliest_start=request.earliest_start,
            latest_end=request.latest_end,
            priority=request.priority,
            min_gap=request.min_gap,
            max_classes_per_day=request.max_classes_per_day,
            prioritized_faculties=request.prioritized_faculties or []
        )
        candidates = filter_strict(parsed_courses, preferences) if request.priority == 'strict' else parsed_courses
        schedules = solve_schedules(candidates, campus_days=request.campus_days, max_results=100_000, max_nodes=2_000_000, max_classes_per_day=request.max_classes_per_day, fixed_slots=preferences['fixed_slots'], allowed_days=request.allowed_days)
        if request.priority == 'strict' and request.min_gap:
            schedules = [s for s in schedules if gap_violations(s, request.min_gap)[0] == 0]
        schedules.sort(key=lambda s: preference_score(s, preferences))
        return OptimizeResponse(preference_advice=preference_failure_advice(parsed_courses, request.campus_days, preferences) if not schedules else None, daily_class_limit=daily_class_limit_advice(parsed_courses, request.campus_days, preferences) if not schedules else None, schedules=schedules, preference_reports=[preference_report(s, preferences) for s in schedules])
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate schedules: {str(e)}")

COURSES_FILE = Path(__file__).resolve().parent / "courses.json"
TMP_COURSES_FILE = Path("/tmp/courses.json")


def _courses_file_path() -> Path:
    if TMP_COURSES_FILE.exists():
        return TMP_COURSES_FILE
    return Path(COURSES_FILE)


def _ensure_courses_file_parent() -> None:
    path = _courses_file_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        TMP_COURSES_FILE.parent.mkdir(parents=True, exist_ok=True)


def _read_saved_courses() -> List[SavedCourse]:
    courses_file = _courses_file_path()

    if not courses_file.exists():
        if courses_file != TMP_COURSES_FILE and TMP_COURSES_FILE.exists():
            courses_file = TMP_COURSES_FILE
        else:
            return []

    try:
        with courses_file.open("r", encoding="utf-8") as f:
            raw_courses = json.load(f)
    except Exception:
        return []

    try:
        return [SavedCourse.model_validate(course) for course in raw_courses]
    except Exception:
        return []


def _write_saved_courses(courses: List[SavedCourse]) -> None:
    courses_file = _courses_file_path()
    try:
        _ensure_courses_file_parent()
        temp_file = courses_file.with_suffix(".json.tmp")
        with temp_file.open("w", encoding="utf-8") as f:
            json.dump([course.model_dump() for course in courses], f, indent=2)
        temp_file.replace(courses_file)
    except OSError:
        # Fallback to /tmp on serverless environments like Vercel
        TMP_COURSES_FILE.parent.mkdir(parents=True, exist_ok=True)
        temp_file = TMP_COURSES_FILE.with_suffix(".json.tmp")
        with temp_file.open("w", encoding="utf-8") as f:
            json.dump([course.model_dump() for course in courses], f, indent=2)
        temp_file.replace(TMP_COURSES_FILE)

@app.get("/api/courses", response_model=List[SavedCourse])
@app.get("/courses", response_model=List[SavedCourse])
def get_courses():
    return _read_saved_courses()

@app.post("/api/courses")
@app.post("/courses")
def save_courses(courses: List[SavedCourse]):
    try:
        _write_saved_courses(courses)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save courses: {str(e)}")


@app.put("/api/courses/{course_id}", response_model=SavedCourse)
@app.put("/courses/{course_id}", response_model=SavedCourse)
def update_course(course_id: int, course: SavedCourse):
    try:
        current_courses = _read_saved_courses()
        updated_courses: List[SavedCourse] = []
        replaced = False

        for existing_course in current_courses:
            if existing_course.id == course_id:
                updated_courses.append(course)
                replaced = True
            else:
                updated_courses.append(existing_course)

        if not replaced:
            raise HTTPException(status_code=404, detail=f"Course with id {course_id} was not found")

        _write_saved_courses(updated_courses)
        return course
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update course: {str(e)}")


@app.delete("/api/courses/{course_id}")
@app.delete("/courses/{course_id}")
def delete_course(course_id: int):
    try:
        current_courses = _read_saved_courses()
        filtered_courses = [course for course in current_courses if course.id != course_id]

        if len(filtered_courses) == len(current_courses):
            raise HTTPException(status_code=404, detail=f"Course with id {course_id} was not found")

        _write_saved_courses(filtered_courses)
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete course: {str(e)}")

# Mount static files (checks public/ first, then frontend/ for local and serverless environments)
def _find_frontend_dir() -> Path | None:
    for candidate in [
        Path(__file__).resolve().parent.parent / "public",
        Path(__file__).resolve().parent.parent / "frontend",
        Path("/var/task/public"),
        Path("/var/task/frontend"),
        Path(os.getcwd()) / "public",
        Path(os.getcwd()) / "frontend",
    ]:
        if candidate.exists() and (candidate / "index.html").exists():
            return candidate
    return None

frontend_path = _find_frontend_dir()
if frontend_path:
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
