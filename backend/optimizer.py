from typing import List, Dict, Any

def slots_overlap(s1: Dict[str, Any], s2: Dict[str, Any]) -> bool:
    """Checks if two slots on the same day overlap."""
    if s1["day"] != s2["day"]:
        return False
    # Standard interval intersection: s1.start < s2.end and s2.start < s1.end
    # If they overlap by even 1 minute, this returns True.
    # E.g. A: 12:00-13:00 (720-780), B: 13:00-14:00 (780-840).
    # 720 < 840 and 780 < 780 (False) -> no overlap (they touch, which is fine).
    return s1["start_mins"] < s2["end_mins"] and s2["start_mins"] < s1["end_mins"]

def has_conflict(selected_sections: List[Dict[str, Any]], next_section: Dict[str, Any]) -> bool:
    """
    Checks if a next_section has a conflict with already selected sections.
    """
    for sec in selected_sections:
        for slot1 in sec["slots"]:
            for slot2 in next_section["slots"]:
                if slots_overlap(slot1, slot2):
                    return True
    return False

def solve_schedules(courses: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """
    Finds all combinations of sections (one per course) that are conflict-free.
    
    Input format:
    courses = [
      {
        "course_name": "Math 101",
        "sections": [
          {
            "name": "K",
            "faculty": "Muhammad Sibgatullah Zunnun",
            "slots": [
              {"day": "Sunday", "start_time": "12:31", "end_time": "13:50", "start_mins": 751, "end_mins": 830}
            ]
          }
        ]
      },
      ...
    ]
    
    Output format:
    A list of combinations, where each combination is a list of mappings:
    [
      [
        {"course_name": "Math 101", "section": {...}},
        {"course_name": "CSE 110", "section": {...}}
      ],
      ...
    ]
    """
    if not courses:
        return []

    # Validate that every course has at least one section
    for course in courses:
        if not course.get("sections"):
            return []

    results = []
    
    def backtrack(course_idx: int, current_selection: List[Dict[str, Any]]):
        if course_idx == len(courses):
            # Found a valid combination
            results.append(list(current_selection))
            return
        
        course = courses[course_idx]
        course_name = course["course_name"]
        
        current_section_objs = [item["section"] for item in current_selection]
        
        for section in course["sections"]:
            if not has_conflict(current_section_objs, section):
                current_selection.append({
                    "course_name": course_name,
                    "section": section
                })
                backtrack(course_idx + 1, current_selection)
                current_selection.pop()

    backtrack(0, [])
    return results
