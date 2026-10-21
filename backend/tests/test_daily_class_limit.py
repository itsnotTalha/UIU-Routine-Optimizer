from collections import Counter

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend import catalog
from backend.optimizer import solve_schedules
from backend.preferences import daily_class_limit_advice


def section(day='Monday', start=600, extra=()):
    def slot(d, t):
        return dict(day=d, start_mins=t, end_mins=t + 50,
                    start_time=f'{t // 60:02}:{t % 60:02}', end_time=f'{(t + 50) // 60:02}:{(t + 50) % 60:02}')
    return dict(name='A', faculty='Teacher', slots=[slot(day, start)] + [slot(*x) for x in extra])


def courses():
    return [dict(course_name='One', sections=[section()]),
            dict(course_name='Two', sections=[section(start=660), section('Tuesday')]),
            dict(course_name='Three', sections=[section(start=720)])]


def test_daily_cap_prunes_and_counts_each_meeting():
    assert len(solve_schedules(courses())) == 2
    schedules = solve_schedules(courses(), max_classes_per_day=2)
    assert len(schedules) == 1
    for s in schedules:
        assert max(Counter(slot['day'] for item in s for slot in item['section']['slots']).values()) <= 2
    multi = [dict(course_name='Lab', sections=[section(extra=[('Monday', 720), ('Tuesday', 600)])])]
    assert not solve_schedules(multi, max_classes_per_day=1)
    assert solve_schedules(multi, max_classes_per_day=2)


def test_suggestion_is_nearest_and_keeps_other_constraints():
    prefs = dict(priority='strict', max_classes_per_day=1)
    assert daily_class_limit_advice(courses(), 2, prefs)['suggested'] == 2
    assert daily_class_limit_advice(courses(), None, {**prefs, 'min_gap': 20})['suggested'] == 2
    assert daily_class_limit_advice(courses(), None, {**prefs, 'latest_end': '12:00'})['suggested'] is None
    assert daily_class_limit_advice(courses(), 3, prefs)['suggested'] is None
    assert daily_class_limit_advice(courses(), None, {**prefs, 'min_gap': 80})['suggested'] is None


def test_suggestion_search_limit_does_not_invent_number(monkeypatch):
    def exhausted(*args, **kwargs):
        raise ValueError('Search limit')
    monkeypatch.setattr('backend.optimizer.solve_schedules', exhausted)
    advice = daily_class_limit_advice(courses(), None, dict(priority='strict', max_classes_per_day=1))
    assert advice['suggested'] is None
    assert 'too large to verify' in advice['message']


def test_catalog_limit_suggestion_and_cache(monkeypatch):
    data = dict(id='daily-test', courses=[dict(id=str(i), code=str(i), title=c['course_name'], program='Test', sections=c['sections']) for i, c in enumerate(courses())])
    monkeypatch.setattr(catalog, 'load_catalog', lambda _: data)
    client = TestClient(app)
    payload = dict(catalog_id=data['id'], selections=[dict(course_id=c['id']) for c in data['courses']])
    assert client.post('/api/catalogs/optimize', json=payload).json()['total'] == 2
    limited = client.post('/api/catalogs/optimize', json={**payload, 'max_classes_per_day': 1}).json()
    assert limited['total'] == 0
    assert limited['daily_class_limit']['suggested'] == 2
    working = client.post('/api/catalogs/optimize', json={**payload, 'max_classes_per_day': 2}).json()
    assert working['total'] == 1
    assert working['daily_class_limit'] is None


def test_manual_limit_and_warning():
    client = TestClient(app)
    payload = dict(courses=[dict(course_name=str(i), raw_text=f'A\nTeacher\nMonday {hour}:00-{hour}:50') for i, hour in enumerate([10, 11, 12])], max_classes_per_day=2)
    response = client.post('/api/optimize', json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['schedules'] == []
    assert response.json()['daily_class_limit']['suggested'] == 3
    payload['max_classes_per_day'] = 3
    assert len(client.post('/api/optimize', json=payload).json()['schedules']) == 1


@pytest.mark.parametrize('value', [0, -1, 1.5, True, '2'])
def test_invalid_daily_limits(value):
    response = TestClient(app).post('/api/optimize', json=dict(courses=[], max_classes_per_day=value))
    assert response.status_code == 422
