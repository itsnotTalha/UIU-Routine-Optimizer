"""Preference scoring never permits class overlaps or changes the campus-day filter."""
from backend.optimizer import schedule_score


def minutes(value):
    if value is None:
        return None
    hour, minute = map(int, value.split(':'))
    return hour * 60 + minute


def outside_minutes(slot, earliest, latest):
    start, end = slot['start_mins'], slot['end_mins']
    within_start = max(start, earliest if earliest is not None else start)
    within_end = min(end, latest if latest is not None else end)
    return end - start - max(0, within_end - within_start)


def penalties(schedule, preferences):
    earliest = minutes(preferences.get('earliest_start'))
    latest = minutes(preferences.get('latest_end'))
    faculty = preferences.get('faculties', {})
    mismatch = outside = 0
    for item in schedule:
        section = item['section']
        wanted = faculty.get(item['course_name'], [])
        mismatch += bool(wanted and section['faculty'] not in wanted)
        outside += sum(outside_minutes(s, earliest, latest) for s in section['slots'])
    return outside, mismatch


def faculty_priority_rank(schedule, preferences):
    """Calculate preference rank penalty: 0 for 1st choice, 1 for 2nd choice, etc."""
    faculty = preferences.get('faculties', {})
    rank = 0
    for item in schedule:
        wanted = faculty.get(item['course_name'], [])
        if wanted and item['section']['faculty'] in wanted:
            rank += wanted.index(item['section']['faculty'])
    return rank


def preference_score(schedule, preferences):
    outside, mismatch = penalties(schedule, preferences)
    rank = faculty_priority_rank(schedule, preferences)
    primary = (mismatch, rank, outside) if preferences.get('priority') == 'faculty_first' else (outside, mismatch, rank)
    return (*primary, *schedule_score(schedule))


def filter_strict(courses, preferences):
    earliest = minutes(preferences.get('earliest_start'))
    latest = minutes(preferences.get('latest_end'))
    faculty = preferences.get('faculties', {})
    return [dict(course, sections=[s for s in course['sections']
            if (not faculty.get(course['course_name']) or s['faculty'] in faculty[course['course_name']])
            and all(outside_minutes(slot, earliest, latest) == 0 for slot in s['slots'])])
            for course in courses]


def preference_report(schedule, preferences):
    earliest = minutes(preferences.get('earliest_start'))
    latest = minutes(preferences.get('latest_end'))
    warnings = []
    for item in schedule:
        section = item['section']
        wanted = preferences.get('faculties', {}).get(item['course_name'], [])
        if wanted and section['faculty'] not in wanted:
            warnings.append(f"{item['course_name']}: section {section['name']} uses {section['faculty']}; preferred: {', '.join(wanted)}.")
        for slot in section['slots']:
            if outside_minutes(slot, earliest, latest):
                warnings.append(f"{item['course_name']}, section {section['name']}: {slot['day']} {slot['start_time']}–{slot['end_time']} is outside your preferred window ({preferences.get('earliest_start') or '00:00'}–{preferences.get('latest_end') or '24:00'}).")
    outside, mismatch = penalties(schedule, preferences)
    return dict(exact_match=not warnings, outside_minutes=outside,
                faculty_mismatches=mismatch, warnings=warnings)


def availability_notices(courses, preferences):
    """Only claim unavailability when individual catalog sections prove it."""
    notices = []
    earliest = minutes(preferences.get('earliest_start'))
    latest = minutes(preferences.get('latest_end'))
    for course in courses:
        for faculty in preferences.get('faculties', {}).get(course['course_name'], []):
            options = [s for s in course['sections'] if s['faculty'] == faculty]
            if options and not any(all(outside_minutes(slot, earliest, latest) == 0 for slot in s['slots']) for s in options):
                notices.append(f"{course['course_name']}: {faculty} has no section with every meeting inside your preferred time window.")
    return notices
