from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class Slot(BaseModel):
    day: str
    room: Optional[str] = None
    start_time: str
    end_time: str
    start_mins: int
    end_mins: int

class Section(BaseModel):
    name: str
    faculty: str
    room: Optional[str] = None
    slots: List[Slot]

class CourseInput(BaseModel):
    course_name: str = Field(..., min_length=1)
    raw_text: str = Field(..., min_length=1)

class OptimizeRequest(BaseModel):
    campus_days: Optional[Literal[3, 4, 5]] = None
    courses: List[CourseInput]

class CourseSectionMapping(BaseModel):
    course_name: str
    section: Section

class OptimizeResponse(BaseModel):
    schedules: List[List[CourseSectionMapping]]
    error: Optional[str] = None

class SavedCourse(BaseModel):
    id: int
    name: str
    text: str

class CatalogSelection(BaseModel):
    course_id: str
    faculties: List[str] = Field(default_factory=list)

class CatalogOptimizeRequest(BaseModel):
    campus_days: Optional[Literal[3, 4, 5]] = None
    catalog_id: str
    selections: List[CatalogSelection] = Field(..., min_length=1, max_length=12)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20, ge=1, le=100)
