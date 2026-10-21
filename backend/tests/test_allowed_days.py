import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend import catalog
from backend.optimizer import solve_schedules
from backend.preferences import daily_class_limit_advice, preference_failure_advice
from backend.tests.test_daily_class_limit import section


def courses():
    return [dict(course_name='One', sections=[
        section('Saturday', extra=[('Tuesday', 600)]),
        section('Sunday', extra=[('Wednesday', 600)])])]


def test_allowed_days_check_every_meeting_and_preserve_exact_count():
    assert len(solve_schedules(courses())) == 2
    assert len(solve_schedules(courses(), allowed_days=[])) == 2
    assert len(solve_schedules(courses(), allowed_days=['Saturday', 'Tuesday'], campus_days=2)) == 1
    assert not solve_schedules(courses(), allowed_days=['Saturday'])
    assert not solve_schedules(courses(), allowed_days=['Saturday', 'Tuesday'], campus_days=3)


@pytest.mark.parametrize('priority', ['strict', 'time_first', 'faculty_first'])
def test_catalog_api_filters_and_caches_allowed_days(monkeypatch, priority):
    monkeypatch.setattr(catalog, 'load_catalog', lambda _: dict(courses=[dict(
        id='one', code='ONE', title='One', program='Test', sections=courses()[0]['sections'])]))
    client = TestClient(app)
    payload = dict(catalog_id='allowed-test', selections=[dict(course_id='one')], priority=priority)
    for allowed in [[], ['Saturday', 'Tuesday'], ['Sunday', 'Wednesday']]:
        result = client.post('/api/catalogs/optimize', json={**payload, 'allowed_days': allowed})
        assert result.status_code == 200
        data = result.json()
        assert data['total'] == (1 if allowed else 2)
        assert all(slot['day'] in allowed for schedule in data['schedules'] for item in schedule
                   for slot in item['section']['slots']) if allowed else True


def test_manual_api_and_apply_suggested_days():
    client = TestClient(app)
    payload = dict(courses=[dict(course_name='One', raw_text='A\nTeacher\nSaturday 10:00-10:50\nTuesday 10:00-10:50')],
                   campus_days=2, allowed_days=['Saturday'])
    result = client.post('/api/optimize', json=payload)
    assert result.status_code == 200
    data = result.json()
    assert not data['schedules']
    assert data['preference_advice']['changes'] == {'allowed_days': ['Saturday', 'Tuesday']}
    payload.update(data['preference_advice']['changes'])
    assert client.post('/api/optimize', json=payload).json()['schedules']


def test_fixed_slots_obey_allowed_days_and_are_explained():
    prefs = dict(priority='strict', allowed_days=['Saturday', 'Tuesday'], fixed_slots=[
        dict(title='FYDP', day='Thursday', start_time=600, end_time=650)])
    assert not catalog.ranked_schedules(courses(), 3, prefs)
    advice = preference_failure_advice(courses(), 3, prefs)
    assert 'fixed slots' in advice['cause']
    assert advice['changes']['allowed_days'] == ['Saturday', 'Tuesday', 'Thursday']
    assert catalog.ranked_schedules(courses(), 3, {**prefs, **advice['changes']})


def test_daily_limit_advice_never_ignores_allowed_days():
    prefs = dict(priority='strict', allowed_days=['Monday'], max_classes_per_day=1)
    assert daily_class_limit_advice(courses(), None, prefs)['suggested'] is None


def test_invalid_day_rejected():
    response = TestClient(app).post('/api/optimize', json=dict(courses=[], allowed_days=['Sat']))
    assert response.status_code == 422
