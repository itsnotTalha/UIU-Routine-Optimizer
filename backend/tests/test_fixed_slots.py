import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend import catalog
from backend.models import SchedulePreferences
from backend.optimizer import solve_schedules
from backend.preferences import daily_class_limit_advice
from backend.tests.test_daily_class_limit import section

BLOCK = dict(title='CSE 4000A (FYDP-I)', day='Saturday', start_time=510, end_time=660)


def test_overlap_boundaries_and_all_meetings():
    courses = [dict(course_name='Course', sections=[
        section('Saturday', 600), section('Saturday', 660),
        section('Saturday', 460), section('Tuesday', 600, [('Saturday', 630)])])]
    schedules = solve_schedules(courses, fixed_slots=[BLOCK])
    assert len(schedules) == 2
    assert {s[1]['section']['slots'][0]['start_mins'] for s in schedules} == {460, 660}
    assert all(s[0]['is_fixed'] and s[0]['course_name'] == BLOCK['title'] for s in schedules)
    assert len(courses[0]['sections']) == 4


@pytest.mark.parametrize('priority', ['strict', 'time_first', 'faculty_first'])
def test_both_endpoints_and_cache(monkeypatch, priority):
    data = dict(id='fixed-test', courses=[dict(id='one', code='CSE1', title='Course',
        program='Test', sections=[section('Saturday', 600), section('Saturday', 660)])])
    monkeypatch.setattr(catalog, 'load_catalog', lambda _: data)
    client = TestClient(app)
    payload = dict(catalog_id=data['id'], selections=[dict(course_id='one')], priority=priority)
    assert client.post('/api/catalogs/optimize', json=payload).json()['total'] == 2
    result = client.post('/api/catalogs/optimize', json={**payload, 'fixed_slots': [BLOCK]}).json()
    assert result['total'] == 1
    assert result['schedules'][0][0]['is_fixed']
    manual = dict(courses=[dict(course_name='Course', raw_text='A\nTeacher\nSaturday 10:00-10:50')],
                  priority=priority, fixed_slots=[BLOCK], max_classes_per_day=1)
    result = client.post('/api/optimize', json=manual)
    assert result.status_code == 200
    assert result.json()['schedules'] == []
    assert result.json()['daily_class_limit']['suggested'] is None
    manual['courses'][0]['raw_text'] = 'A\nTeacher\nSaturday 11:00-11:50'
    manual['max_classes_per_day'] = 2
    result = client.post('/api/optimize', json=manual).json()
    assert len(result['schedules']) == 1
    assert result['schedules'][0][0]['is_fixed']


def test_workload_advice_and_fixed_outside_window():
    courses = [dict(course_name='Course', sections=[section('Saturday', 660)])]
    prefs = dict(priority='strict', fixed_slots=[BLOCK], max_classes_per_day=1, earliest_start='11:00')
    assert daily_class_limit_advice(courses, None, prefs)['suggested'] == 2
    schedules = catalog.ranked_schedules(courses, None, {**prefs, 'max_classes_per_day': 2})
    assert len(schedules) == 1
    assert not catalog.ranked_schedules(courses, None, {**prefs, 'max_classes_per_day': 2, 'min_gap': 10})
    other_day = [dict(course_name='Course', sections=[section('Tuesday')])]
    assert solve_schedules(other_day, campus_days=2, fixed_slots=[BLOCK])
    assert not solve_schedules(other_day, campus_days=3, fixed_slots=[BLOCK])


@pytest.mark.parametrize('changes', [dict(day='Sat'), dict(start_time=-1), dict(end_time=1441),
    dict(start_time=True), dict(start_time=510.5), dict(end_time=510), dict(end_time=500)])
def test_invalid_blocks(changes):
    response = TestClient(app).post('/api/optimize', json=dict(courses=[], fixed_slots=[{**BLOCK, **changes}]))
    assert response.status_code == 422


def test_overlapping_blocks_rejected_and_empty_title_defaulted():
    with pytest.raises(ValueError, match='must not overlap'):
        SchedulePreferences(fixed_slots=[BLOCK, BLOCK])
    prefs = SchedulePreferences(fixed_slots=[{**BLOCK, 'title': '  '}])
    assert prefs.fixed_slots[0].title == 'FYDP / Blocked'
    assert SchedulePreferences().fixed_slots == []
