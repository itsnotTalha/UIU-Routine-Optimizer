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
    """Lexicographic faculty ranks in the user's course order, independent of solver order."""
    faculty = preferences.get('faculties', {})
    chosen = {item['course_name']: item['section']['faculty'] for item in schedule}
    ranks = []
    for name in preferences.get('course_order', list(faculty)):
        wanted = faculty.get(name, [])
        teacher = chosen.get(name)
        ranks.append(wanted.index(teacher) if teacher in wanted else len(wanted))
    return tuple(ranks)


def gap_violations(schedule, min_gap):
    """Check how many consecutive class pairs on the same day have less than min_gap minutes between them."""
    if not min_gap or min_gap <= 0:
        return 0, []
    days = {}
    for item in schedule:
        for slot in item['section']['slots']:
            days.setdefault(slot['day'], []).append((
                slot['start_mins'], slot['end_mins'],
                item['course_name'], item['section']['name'],
                slot['start_time'], slot['end_time']
            ))
    violations = 0
    warnings = []
    for day, slots in days.items():
        slots.sort(key=lambda s: s[0])
        for a, b in zip(slots, slots[1:]):
            gap = b[0] - a[1]
            if gap < min_gap:
                violations += 1
                warnings.append(f"{day}: only {gap}m gap between {a[2].split(' — ')[0]} (Sec {a[3]}) ending {a[5]} and {b[2].split(' — ')[0]} (Sec {b[3]}) starting {b[4]} (preferred ≥{min_gap}m).")
    return violations, warnings


def preference_score(schedule, preferences):
    outside, mismatch = penalties(schedule, preferences)
    rank = faculty_priority_rank(schedule, preferences)
    min_gap = preferences.get('min_gap') if preferences else None
    gaps, _ = gap_violations(schedule, min_gap)
    primary = (mismatch, rank, outside, gaps) if preferences.get('priority') == 'faculty_first' else (outside, gaps, mismatch, rank)
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
    earliest = minutes(preferences.get('earliest_start')) if preferences else None
    latest = minutes(preferences.get('latest_end')) if preferences else None
    warnings = []
    for item in schedule:
        section = item['section']
        wanted = preferences.get('faculties', {}).get(item['course_name'], []) if preferences else []
        if wanted and section['faculty'] not in wanted:
            warnings.append(f"{item['course_name']}: section {section['name']} uses {section['faculty']}; preferred: {', '.join(wanted)}.")
        for slot in section['slots']:
            if outside_minutes(slot, earliest, latest):
                warnings.append(f"{item['course_name']}, section {section['name']}: {slot['day']} {slot['start_time']}–{slot['end_time']} is outside your preferred window ({preferences.get('earliest_start') or '00:00'}–{preferences.get('latest_end') or '24:00'}).")
    if preferences and preferences.get('min_gap'):
        _, gap_warns = gap_violations(schedule, preferences['min_gap'])
        warnings.extend(gap_warns)
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


def daily_class_limit_advice(courses, campus_days, preferences):
    """Find the smallest feasible cap without changing any other active constraint."""
    from collections import Counter
    from backend.optimizer import solve_schedules

    requested = preferences.get('max_classes_per_day')
    if requested is None:
        return None
    candidates = filter_strict(courses, preferences) if preferences.get('priority') == 'strict' else courses
    min_gap = preferences.get('min_gap') if preferences.get('priority') == 'strict' else None

    def feasible(limit):
        return bool(solve_schedules(
            candidates, campus_days=campus_days, max_classes_per_day=limit,
            max_nodes=2_000_000, first_only=True,
            accept_schedule=(lambda s: gap_violations(s, min_gap)[0] == 0) if min_gap else None))

    advice = dict(requested=requested, suggested=None)
    upper = sum(max((max(Counter(slot['day'] for slot in sec['slots']).values(), default=0)
                     for sec in c['sections']), default=0) for c in candidates)
    try:
        if upper <= requested or not feasible(upper):
            advice['message'] = 'No routine satisfies your current filters. Increasing the daily class limit alone will not help; review your campus days, time window, breaks, or teacher choices.'
            return advice
        lower = requested + 1
        while lower < upper:
            mid = (lower + upper) // 2
            if feasible(mid):
                upper = mid
            else:
                lower = mid + 1
        advice['suggested'] = lower
        noun = 'class' if requested == 1 else 'classes'
        advice['message'] = f'No routine can fit at most {requested} {noun} per day with your other filters. Try {lower} classes per day — this is the closest workable limit. Update it in Preferences and apply again.'
    except ValueError:
        advice['message'] = f'No routine fits your daily limit of {requested}. The search is too large to verify a nearby limit; narrow your course or teacher choices and try again.'
    return advice
