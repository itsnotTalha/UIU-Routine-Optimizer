import re
from typing import List, Dict, Any, Optional

DAYS_MAP = {
    'monday': 'Monday', 'mon': 'Monday',
    'tuesday': 'Tuesday', 'tue': 'Tuesday',
    'wednesday': 'Wednesday', 'wed': 'Wednesday',
    'thursday': 'Thursday', 'thu': 'Thursday',
    'friday': 'Friday', 'fri': 'Friday',
    'saturday': 'Saturday', 'sat': 'Saturday',
    'sunday': 'Sunday', 'sun': 'Sunday'
}

# Regex to match: Day HH:MM-HH:MM
# Days can be any alphanumeric word (which we validate against DAYS_MAP)
SLOT_RE = re.compile(r'^([a-zA-Z]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$')

def parse_time_to_minutes(time_str: str) -> int:
    parts = time_str.strip().split(':')
    if len(parts) != 2:
        raise ValueError(f"Invalid time format: '{time_str}'. Must be HH:MM.")
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
    except ValueError:
        raise ValueError(f"Non-numeric values in time: '{time_str}'")
    if not (0 <= hours < 24) or not (0 <= minutes < 60):
        raise ValueError(f"Time value out of range: '{time_str}'")
    return hours * 60 + minutes

def parse_section_text(raw_text: str) -> List[Dict[str, Any]]:
    lines = [line.strip() for line in raw_text.split('\n')]
    # filter out empty lines
    lines = [line for line in lines if line]
    if not lines:
        raise ValueError("Routine text is empty.")
    
    sections = []
    current_section: Optional[Dict[str, Any]] = None
    
    for line in lines:
        match = SLOT_RE.match(line)
        if match:
            # This is a day-time line
            day_raw, start_str, end_str = match.groups()
            day_lower = day_raw.lower()
            if day_lower not in DAYS_MAP:
                raise ValueError(f"Invalid day name: '{day_raw}'")
            day_normalized = DAYS_MAP[day_lower]
            
            start_mins = parse_time_to_minutes(start_str)
            end_mins = parse_time_to_minutes(end_str)
            
            if start_mins >= end_mins:
                raise ValueError(f"Start time '{start_str}' must be before end time '{end_str}'")
            
            slot = {
                "day": day_normalized,
                "start_time": start_str,
                "end_time": end_str,
                "start_mins": start_mins,
                "end_mins": end_mins
            }
            
            if current_section is None:
                raise ValueError(f"Found a schedule slot '{line}' before section name and faculty were defined.")
            
            current_section["slots"].append(slot)
        else:
            # This is NOT a day-time line. It must be either:
            # 1. A new section name (if current_section is None OR we just finished parsing slot(s) for the previous section)
            # 2. A faculty name (if current_section exists but has no faculty name)
            
            if current_section is None or len(current_section["slots"]) > 0:
                # We start a new section
                current_section = {
                    "name": line,
                    "faculty": "",
                    "slots": []
                }
                sections.append(current_section)
            elif not current_section["faculty"]:
                # Faculty name is set to this line
                current_section["faculty"] = line
            else:
                # This would mean we have a section and faculty name, but we got a third non-slot line.
                raise ValueError(f"Unexpected line '{line}'. Expected a day-time slot (e.g. 'Monday 10:00-11:30').")

    # Post-validation: ensure every parsed section has slots
    for sec in sections:
        if not sec["name"]:
            raise ValueError("Parsed a section with an empty name.")
        if not sec["faculty"]:
            raise ValueError(f"Section '{sec['name']}' is missing a faculty name.")
        if not sec["slots"]:
            raise ValueError(f"Section '{sec['name']}' has no schedule slots defined.")
            
    return sections
