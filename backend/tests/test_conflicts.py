from backend.conflicts import course_conflicts
from backend.tests.test_daily_class_limit import section


def course(name, sections):
    return dict(course_name=name, sections=sections)


def test_proven_pair_overlap_and_available_alternative():
    alternate = section(start=720)
    alternate.update(name='B', faculty='Other')
    data = [course('One', [section(), alternate]), course('Two', [section()])]
    result = course_conflicts(data, dict(priority='strict', faculties={'One': ['Teacher']}))
    assert len(result) == 1
    assert 'One overlaps Two' in result[0]['message']
    assert 'Monday' in result[0]['message']
    assert 'section B (Other)' in result[0]['alternatives'][0]
    assert 'pair’s overlap only' in result[0]['note']
    assert not course_conflicts(data, dict(priority='time_first'))


def test_no_pair_alternative_does_not_invent_one():
    result = course_conflicts([course('One', [section()]), course('Two', [section()])], {})
    assert 'No non-overlapping section pair' in result[0]['note']


def test_fixed_commitment_is_named():
    result = course_conflicts([course('One', [section()])], dict(fixed_slots=[
        dict(title='FYDP', day='Monday', start_time=610, end_time=640)]))
    assert 'FYDP' in result[0]['message']


def test_empty_eligible_sections_explain_filters():
    result = course_conflicts([course('One', [section()])], dict(allowed_days=['Saturday']))
    assert 'no section' in result[0]['message']
    assert 'Monday 10:00' in result[0]['alternatives'][0]


def test_three_way_conflict_without_pairwise_conflicts():
    # Three courses competing for two slots: any pair works, all three cannot.
    data = [course(name, [section(start=600), section(start=720)]) for name in ['One', 'Two', 'Three']]
    result = course_conflicts(data, {})
    assert len(result) == 1
    assert all(name in result[0]['message'] for name in ['One', 'Two', 'Three'])
    assert 'Each pair may fit' in result[0]['note']


def test_touching_sections_are_not_conflicts():
    assert not course_conflicts([course('One', [section()]), course('Two', [section(start=650)])], {})


def test_exhausted_diagnostic_does_not_claim_multiway_conflict(monkeypatch):
    def exhausted(*args, **kwargs):
        raise ValueError('limit')
    monkeypatch.setattr('backend.conflicts.solve_schedules', exhausted)
    data = [course(name, [section(start=600), section(start=720)]) for name in ['One', 'Two', 'Three']]
    assert not course_conflicts(data, {})
