from pydantic import BaseModel, Field, model_validator
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

class FixedSlot(BaseModel):
    title: str = Field(default="FYDP / Blocked", max_length=120)
    day: Literal['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    start_time: int = Field(ge=0, lt=1440, strict=True)
    end_time: int = Field(gt=0, le=1440, strict=True)

    @model_validator(mode='after')
    def valid_interval(self):
        if self.start_time >= self.end_time:
            raise ValueError('Fixed slot end must be after its start on the same day.')
        self.title = self.title.strip() or 'FYDP / Blocked'
        return self


class SchedulePreferences(BaseModel):
    allowed_days: List[Literal['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']] = Field(default_factory=list, max_length=7)
    fixed_slots: List[FixedSlot] = Field(default_factory=list, max_length=30)
    earliest_start: Optional[str] = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    latest_end: Optional[str] = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    priority: Literal['strict', 'time_first', 'faculty_first'] = 'strict'
    max_classes_per_day: Optional[int] = Field(default=None, ge=1, strict=True)
    min_gap: Optional[int] = Field(default=None, ge=0, le=240)
    prioritized_faculties: Optional[List[str]] = Field(default_factory=list)

    @model_validator(mode='after')
    def valid_window(self):
        if self.earliest_start and self.latest_end and self.earliest_start >= self.latest_end:
            raise ValueError('Earliest start must be before latest finish.')
        for i, slot in enumerate(self.fixed_slots):
            for other in self.fixed_slots[:i]:
                if slot.day == other.day and slot.start_time < other.end_time and other.start_time < slot.end_time:
                    raise ValueError('Fixed slots on the same day must not overlap.')
        return self

class OptimizeRequest(SchedulePreferences):
    campus_days: Optional[Literal[2, 3, 4, 5]] = None
    courses: List[CourseInput]

class CourseSectionMapping(BaseModel):
    is_fixed: bool = False
    course_name: str
    section: Section

class OptimizeResponse(BaseModel):
    schedules: List[List[CourseSectionMapping]]
    error: Optional[str] = None
    daily_class_limit: Optional[dict] = None
    preference_advice: Optional[dict] = None
    preference_reports: List[dict] = Field(default_factory=list)

class SavedCourse(BaseModel):
    id: int
    name: str
    text: str

class CatalogSelection(BaseModel):
    course_id: str
    faculties: List[str] = Field(default_factory=list)
    section_priorities: dict[str, List[str]] = Field(default_factory=dict)

class CatalogOptimizeRequest(SchedulePreferences):
    campus_days: Optional[Literal[2, 3, 4, 5]] = None
    catalog_id: str
    selections: List[CatalogSelection] = Field(..., min_length=1, max_length=12)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20, ge=1, le=100)
