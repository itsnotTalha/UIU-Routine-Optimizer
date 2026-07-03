import os
import json
from pathlib import Path
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.models import OptimizeRequest, OptimizeResponse, SavedCourse
from backend.parser import parse_section_text
from backend.optimizer import solve_schedules

app = FastAPI(title="Routine Schedule Optimizer")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/optimize", response_model=OptimizeResponse)
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
        schedules = solve_schedules(parsed_courses)
        return OptimizeResponse(schedules=schedules)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate schedules: {str(e)}")

COURSES_FILE = Path(__file__).resolve().parent / "courses.json"


def _courses_file_path() -> Path:
    return Path(COURSES_FILE)


def _ensure_courses_file_parent() -> None:
    _courses_file_path().parent.mkdir(parents=True, exist_ok=True)


def _read_saved_courses() -> List[SavedCourse]:
    courses_file = _courses_file_path()

    if not courses_file.exists():
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
    _ensure_courses_file_parent()

    courses_file = _courses_file_path()
    temp_file = courses_file.with_suffix(".json.tmp")
    with temp_file.open("w", encoding="utf-8") as f:
        json.dump([course.model_dump() for course in courses], f, indent=2)
    temp_file.replace(courses_file)

@app.get("/api/courses", response_model=List[SavedCourse])
def get_courses():
    return _read_saved_courses()

@app.post("/api/courses")
def save_courses(courses: List[SavedCourse]):
    try:
        _write_saved_courses(courses)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save courses: {str(e)}")


@app.put("/api/courses/{course_id}", response_model=SavedCourse)
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

# Mount the static files for the frontend application
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    # If frontend doesn't exist yet, we still allow starting backend for tests
    pass
