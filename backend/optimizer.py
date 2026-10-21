from collections import Counter
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

def solve_schedules(courses: List[Dict[str, Any]], max_results=None, max_nodes=None, campus_days=None, max_classes_per_day=None, accept_schedule=None, first_only=False) -> List[List[Dict[str, Any]]]:
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

    # Encode occupied minutes once. Half-open intervals preserve adjacent classes.
    day_names = {slot['day'] for c in courses for sec in c['sections'] for slot in sec['slots']}
    day_indices = {day: i for i, day in enumerate(sorted(day_names))}
    encoded = []
    for course in courses:
        options = []
        for section in course['sections']:
            occupied = days = 0
            for slot in section['slots']:
                day = day_indices[slot['day']]
                duration = slot['end_mins'] - slot['start_mins']
                occupied |= ((1 << duration) - 1) << (day * 1440 + slot['start_mins'])
                days |= 1 << day
            options.append((section, occupied, days, Counter(slot['day'] for slot in section['slots'])))
        encoded.append(options)

    results = []
    nodes = 0
    current_selection = []
    daily_counts = Counter()

    def backtrack(course_idx, occupied, days):
        nonlocal nodes
        if first_only and results:
            return
        nodes += 1
        if max_nodes is not None and nodes > max_nodes:
            raise ValueError("Too many combinations to search. Select fewer courses or narrow faculty preferences.")
        if campus_days is not None and days.bit_count() > campus_days:
            return
        if course_idx == len(courses):
            if campus_days is not None and days.bit_count() != campus_days:
                return
            if accept_schedule is not None and not accept_schedule(current_selection):
                return
            if max_results is not None and len(results) >= max_results:
                raise ValueError(f"More than {max_results:,} valid combinations. Narrow faculty preferences or select fewer courses.")
            results.append(list(current_selection))
            return
        for section, section_mask, section_days, counts in encoded[course_idx]:
            if max_classes_per_day is not None and any(daily_counts[d] + n > max_classes_per_day for d, n in counts.items()):
                continue
            if not occupied & section_mask:
                if max_classes_per_day is not None:
                    daily_counts.update(counts)
                current_selection.append({'course_name': courses[course_idx]['course_name'], 'section': section})
                backtrack(course_idx + 1, occupied | section_mask, days | section_days)
                current_selection.pop()
                if max_classes_per_day is not None:
                    daily_counts.subtract(counts)

    backtrack(0, 0, 0)
    return results


def schedule_score(schedule):
    """Prefer fewer campus days, then fewer idle minutes between classes."""
    days = {}
    for item in schedule:
        for slot in item['section']['slots']:
            days.setdefault(slot['day'], []).append((slot['start_mins'], slot['end_mins']))
    gaps = 0
    for slots in days.values():
        slots.sort()
        gaps += sum(b[0] - a[1] for a, b in zip(slots, slots[1:]))
    return len(days), gaps
