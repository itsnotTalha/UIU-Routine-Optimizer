"""Explain proven section conflicts without guessing a globally feasible repair."""
from itertools import combinations

from backend.optimizer import fixed_courses, has_conflict, slots_overlap, solve_schedules
from backend.preferences import filter_strict


def course_conflicts(courses, preferences):
    filtered = filter_strict(courses, preferences) if preferences.get('priority') == 'strict' else courses
    originals = courses + fixed_courses(preferences.get('fixed_slots'))
    candidates = filtered + fixed_courses(preferences.get('fixed_slots'))
    allowed = preferences.get('allowed_days')
    if allowed:
        candidates = [dict(c, sections=[s for s in c['sections'] if all(t['day'] in allowed for t in s['slots'])]) for c in candidates]
    reports = []
    for original, candidate in zip(originals, candidates):
        if not candidate['sections']:
            options = original['sections'][:3]
            reports.append(dict(
                message=f"{candidate['course_name']} has no section within your current teacher, time, and allowed-day filters.",
                alternatives=[f"Review section {s['name']} with {s['faculty']}: " + ', '.join(f"{t['day']} {t['start_time']}–{t['end_time']}" for t in s['slots']) for s in options],
                note='These are available sections to review; their times or teachers require changing your filters.'))
    if reports:
        return reports
    # Limit pair checks independently of the optimizer's search budget.
    budget = 50_000
    for i, j in combinations(range(len(candidates)), 2):
        a, b = candidates[i], candidates[j]
        compatible = False
        for sa in a['sections']:
            for sb in b['sections']:
                budget -= 1
                if budget < 0:
                    return reports
                if not has_conflict([sa], sb):
                    compatible = True
                    break
            if compatible:
                break
        if compatible:
            continue
        sa, sb = a['sections'][0], b['sections'][0]
        overlap = next(( (x, y) for x in sa['slots'] for y in sb['slots'] if slots_overlap(x, y)), None)
        detail = ''
        if overlap:
            x, y = overlap
            detail = f" For example, section {sa['name']} ({x['start_time']}–{x['end_time']}) overlaps section {sb['name']} ({y['start_time']}–{y['end_time']}) on {x['day']}."
        alternatives = []
        for x in originals[i]['sections']:
            for y in originals[j]['sections']:
                budget -= 1
                if budget < 0:
                    break
                if not has_conflict([x], y):
                    alternatives.append(f"{a['course_name']}: section {x['name']} ({x['faculty']}) + {b['course_name']}: section {y['name']} ({y['faculty']}).")
                    break
            if alternatives or budget < 0:
                break
        if budget < 0:
            return reports
        reports.append(dict(message=f"Every currently eligible section of {a['course_name']} overlaps {b['course_name']}." + detail,
                            alternatives=alternatives or [f"Review or replace one of these courses/commitments: {a['course_name']} or {b['course_name']}."],
                            note='The section alternative avoids this pair’s overlap only; review its preferences and other courses before searching again.' if alternatives else 'No non-overlapping section pair exists in the supplied course data.'))
        if len(reports) >= 5:
            return reports
    if not reports and candidates:
        # A conflict can involve three or more courses even if each pair fits.
        try:
            if not solve_schedules(candidates, first_only=True, max_nodes=50_000):
                core = candidates[:]
                for course in candidates:
                    trial = [c for c in core if c is not course]
                    if trial and not solve_schedules(trial, first_only=True, max_nodes=20_000):
                        core = trial
                names = [c['course_name'] for c in core]
                reports.append(dict(message='These courses cannot all fit without overlaps: ' + '; '.join(names) + '.',
                                    alternatives=['Review section choices or replace one of these courses.'],
                                    note='Each pair may fit separately, but no section combination fits the entire group.'))
        except ValueError:
            pass
    return reports
