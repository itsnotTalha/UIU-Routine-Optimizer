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
        if item.get('is_fixed'):
            continue
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
    # Faculty order remains primary; section choices break ties before schedule metrics.
    section_ranks = []
    selected = {item['course_name']: item['section'] for item in schedule if not item.get('is_fixed')}
    for name in preferences.get('course_order', list(faculty)):
        section = selected.get(name)
        wanted = preferences.get('section_priorities', {}).get(name, {}).get(section['faculty'], []) if section else []
        section_ranks.append(wanted.index(section['name']) if section and section['name'] in wanted else len(wanted))
    return tuple(ranks + section_ranks)


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
                warnings.append(f"{day}: only {gap}m gap between {a[2].split(' — ')[0]} (Sec {a[3]}) ending {a[5]} and {b[2].split(' — ')[0]} (Sec {b[3]}) starting {b[4]} (preferred ≥{min_gap}m). Suggested fix: reduce the minimum break to {gap} minutes or choose sections farther apart.")
    return violations, warnings


def preference_score(schedule, preferences):
    outside, mismatch = penalties(schedule, preferences)
    rank = faculty_priority_rank(schedule, preferences)
    min_gap = preferences.get('min_gap') if preferences else None
    gaps, _ = gap_violations(schedule, min_gap)
    if preferences.get('priority') == 'strict':
        primary = (rank, outside, gaps, mismatch)
    else:
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


def priority_matches(schedule, preferences):
    selected = {item['course_name']: item['section'] for item in schedule if not item.get('is_fixed')}
    matches = []
    faculties = preferences.get('faculties', {})
    for name in preferences.get('course_order', list(faculties)):
        section = selected.get(name)
        if section is None:
            continue
        teachers = faculties.get(name, [])
        sections = preferences.get('section_priorities', {}).get(name, {}).get(section['faculty'], [])
        if not teachers and not sections:
            continue
        matches.append(dict(course_name=name, faculty=section['faculty'], section=section['name'],
                            faculty_rank=teachers.index(section['faculty']) + 1 if section['faculty'] in teachers else None,
                            section_rank=sections.index(section['name']) + 1 if section['name'] in sections else None,
                            has_section_priority=bool(sections)))
    return matches


def preference_report(schedule, preferences):
    earliest = minutes(preferences.get('earliest_start')) if preferences else None
    latest = minutes(preferences.get('latest_end')) if preferences else None
    warnings = []
    for item in schedule:
        if item.get('is_fixed'):
            continue
        section = item['section']
        wanted = preferences.get('faculties', {}).get(item['course_name'], []) if preferences else []
        if wanted and section['faculty'] not in wanted:
            warnings.append(f"{item['course_name']}: section {section['name']} uses {section['faculty']}; preferred: {', '.join(wanted)}. Suggested fix: include {section['faculty']} in this course’s teacher choices, or choose another routine with a preferred teacher.")
        for slot in section['slots']:
            if outside_minutes(slot, earliest, latest):
                warnings.append(f"{item['course_name']}, section {section['name']}: {slot['day']} {slot['start_time']}–{slot['end_time']} is outside your preferred window ({preferences.get('earliest_start') or '00:00'}–{preferences.get('latest_end') or '24:00'}). Suggested fix: widen your time window to include {slot['start_time']}–{slot['end_time']}, or choose a section inside your window.")
    if preferences and preferences.get('min_gap'):
        _, gap_warns = gap_violations(schedule, preferences['min_gap'])
        warnings.extend(gap_warns)
    outside, mismatch = penalties(schedule, preferences)
    return dict(exact_match=not warnings, outside_minutes=outside,
                faculty_mismatches=mismatch, warnings=warnings, priority_matches=priority_matches(schedule, preferences or {}))


def availability_notices(courses, preferences):
    """Only claim unavailability when individual catalog sections prove it."""
    notices = []
    earliest = minutes(preferences.get('earliest_start'))
    latest = minutes(preferences.get('latest_end'))
    for course in courses:
        for faculty in preferences.get('faculties', {}).get(course['course_name'], []):
            options = [s for s in course['sections'] if s['faculty'] == faculty]
            if options and not any(all(outside_minutes(slot, earliest, latest) == 0 for slot in s['slots']) for s in options):
                notices.append(f"{course['course_name']}: {faculty} has no section with every meeting inside your preferred time window. Suggested fix: widen the time window or choose another teacher for this course.")
    return notices


def daily_class_limit_advice(courses, campus_days, preferences):
    """Find the smallest feasible cap without changing any other active constraint."""
    from collections import Counter
    from backend.optimizer import solve_schedules, fixed_courses

    requested = preferences.get('max_classes_per_day')
    if requested is None:
        return None
    candidates = filter_strict(courses, preferences) if preferences.get('priority') == 'strict' else courses
    min_gap = preferences.get('min_gap') if preferences.get('priority') == 'strict' else None

    def feasible(limit):
        return bool(solve_schedules(
            candidates, campus_days=campus_days, max_classes_per_day=limit,
            fixed_slots=preferences.get('fixed_slots'), allowed_days=preferences.get('allowed_days'),
            max_nodes=2_000_000, first_only=True,
            accept_schedule=(lambda s: gap_violations(s, min_gap)[0] == 0) if min_gap else None))

    advice = dict(requested=requested, suggested=None)
    upper = sum(max((max(Counter(slot['day'] for slot in sec['slots']).values(), default=0)
                     for sec in c['sections']), default=0) for c in candidates + fixed_courses(preferences.get('fixed_slots')))
    try:
        if upper <= requested or not feasible(upper):
            advice['message'] = 'No routine satisfies your current filters. Increasing the daily class limit alone will not help; review your fixed slots, campus days, time window, breaks, or teacher choices.'
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


def _preference_failure_advice(courses, campus_days, preferences):
    """Explain a failed search using a verified relaxation, preserving other filters.

    Only call after a search returns no schedules. A bounded diagnostic search
    must never turn an unverified change into a promised solution.
    """
    from backend.optimizer import solve_schedules

    def find_schedule(prefs, days):
        strict = prefs.get('priority') == 'strict'
        candidates = filter_strict(courses, prefs) if strict else courses
        gap = prefs.get('min_gap') if strict else None
        return solve_schedules(
            candidates, campus_days=days,
            max_classes_per_day=prefs.get('max_classes_per_day'),
            fixed_slots=prefs.get('fixed_slots'), allowed_days=prefs.get('allowed_days'), max_nodes=200_000,
            first_only=True,
            accept_schedule=(lambda s: gap_violations(s, gap)[0] == 0) if gap else None)

    # Obtain a concrete routine before proposing extra allowed days.
    incomplete = False
    allowed = preferences.get('allowed_days') or []
    if allowed:
        try:
            alternatives = find_schedule({**preferences, 'allowed_days': []}, campus_days)
            if alternatives:
                used = {slot['day'] for item in alternatives[0] for slot in item['section']['slots']}
                extra = used - set(allowed)
                order = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
                suggested = [day for day in order if day in used or day in allowed]
                fixed_outside = {slot['day'] for slot in preferences.get('fixed_slots', [])} - set(allowed)
                cause = ('Your fixed slots include days outside your allowed class days.' if fixed_outside else
                         'No routine fits your allowed class days with the other filters.')
                suggestion = f"Also allow {', '.join(day for day in order if day in extra)} and find routines again."
                return dict(message=f'{cause} Suggested fix: {suggestion}', cause=cause,
                            suggestion=suggestion, changes={'allowed_days': suggested})
        except ValueError:
            incomplete = True

    changes = []
    if preferences.get('priority') == 'strict':
        if preferences.get('earliest_start'):
            changes.append(({'earliest_start': None}, campus_days,
                f"Your earliest start of {preferences['earliest_start']} rules out the available routines.",
                'Set Earliest start to Any time in Preferences and apply again.'))
        if preferences.get('latest_end'):
            changes.append(({'latest_end': None}, campus_days,
                f"Your latest finish of {preferences['latest_end']} rules out the available routines.",
                'Set Latest finish to Any time in Preferences and apply again.'))
        if preferences.get('min_gap'):
            changes.append(({'min_gap': None}, campus_days,
                f"The available routines cannot provide your {preferences['min_gap']}-minute minimum break.",
                'Set the Minimum break to No minimum and apply again.'))
        if any(preferences.get('faculties', {}).values()):
            changes.append(({'faculties': {}}, campus_days,
                'Your selected teachers cannot form a routine with the other filters.',
                'Allow any teacher for your selected courses and apply again.'))
    if campus_days is not None:
        changes.append(({}, None,
            f'No routine fits exactly {campus_days} campus days with your other filters.',
            'Set Days on campus to Any days and apply again.'))
    if preferences.get('fixed_slots'):
        changes.append(({'fixed_slots': []}, campus_days,
            'Your fixed slots prevent a routine with the other filters.',
            'Review the times of your fixed slots. Removing them allows a routine, but only remove commitments you no longer need.'))
    if preferences.get('priority') == 'strict':
        changes.append(({'earliest_start': None, 'latest_end': None, 'min_gap': None, 'faculties': {}}, campus_days,
            'Your time, break, and teacher preferences cannot all be met together.',
            'Set both time limits to Any time, Minimum break to No minimum, and allow any teacher, then apply again.'))
    for patch, days, cause, suggestion in changes:
        try:
            if find_schedule({**preferences, **patch}, days):
                return dict(message=f'{cause} Suggested fix: {suggestion}',
                            cause=cause, suggestion=suggestion,
                            changes={**patch, **({'campus_days': days} if days != campus_days else {})})
        except ValueError:
            incomplete = True
    if incomplete:
        message = 'No matching routine was found. The diagnostic search reached its limit, so a fix could not be verified. Try fewer course or section choices, then apply again.'
    else:
        message = 'No matching routine was found, and no tested preference change alone produced one. Review overlapping course meetings and fixed slots, or relax multiple filters together and apply again.'
    return dict(message=message)


def preference_failure_advice(courses, campus_days, preferences):
    from backend.conflicts import course_conflicts
    advice = _preference_failure_advice(courses, campus_days, preferences)
    advice['conflicts'] = course_conflicts(courses, preferences)
    return advice
