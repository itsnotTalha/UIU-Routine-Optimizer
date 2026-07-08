from pydantic import BaseModel, Field
from typing import List, Optional

class Slot(BaseModel):
    day: str
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
    courses: List[CourseInput]

class CourseSectionMapping(BaseModel):
    course_name: str
    section: Section

class OptimizeResponse(BaseModel):
    schedules: List[List[CourseSectionMapping]]
    error: str = None

class SavedCourse(BaseModel):
    id: int
    name: str
    text: str
