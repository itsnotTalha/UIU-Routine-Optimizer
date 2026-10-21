import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.catalog import ranked_schedules
from backend.preferences import preference_failure_advice, preference_report
from backend.tests.test_daily_class_limit import courses, section


@pytest.mark.parametrize(('patch', 'days', 'cause'), [
    ({'earliest_start': '11:00'}, None, 'earliest start'),
    ({'latest_end': '12:00'}, None, 'latest finish'),
    ({'min_gap': 80}, None, 'minimum break'),
    ({'faculties': {'One': ['Unavailable']}}, None, 'selected teachers'),
    ({}, 3, 'exactly 3 campus days'),
    ({'earliest_start': '11:00', 'latest_end': '12:00'}, None, 'cannot all be met'),
    ({'fixed_slots': [dict(title='Blocked', day='Monday', start_time=600, end_time=650)]}, None, 'fixed slots'),
])
def test_failed_preferences_explain_cause_and_fix(patch, days, cause):
    advice = preference_failure_advice(courses(), days, dict(priority='strict', **patch))
    assert cause in advice['cause']
    assert advice['suggestion']
    assert 'Suggested fix:' in advice['message']
    changes = dict(advice['changes'])
    new_days = changes.pop('campus_days', days)
    assert ranked_schedules(courses(), new_days, dict(priority='strict', **{**patch, **changes}))


def test_does_not_promise_fix_when_courses_overlap():
    overlapping = [dict(course_name=name, sections=[section()]) for name in ['One', 'Two']]
    advice = preference_failure_advice(overlapping, None, dict(priority='strict', earliest_start='11:00'))
    assert 'no tested preference change' in advice['message']
    assert 'suggestion' not in advice


def test_search_limit_does_not_claim_impossibility(monkeypatch):
    def exhausted(*args, **kwargs):
        raise ValueError('Search limit')
    monkeypatch.setattr('backend.optimizer.solve_schedules', exhausted)
    advice = preference_failure_advice(courses(), None, dict(priority='strict', earliest_start='11:00'))
    assert 'could not be verified' in advice['message']
    assert 'suggestion' not in advice


def test_manual_api_includes_advice_only_on_failure():
    payload = dict(courses=[dict(course_name='One', raw_text='A\nTeacher\nMonday 10:00-10:50')], earliest_start='11:00')
    client = TestClient(app)
    response = client.post('/api/optimize', json=payload)
    assert response.status_code == 200
    assert 'earliest start' in response.json()['preference_advice']['cause']
    payload.update(response.json()['preference_advice']['changes'])
    assert client.post('/api/optimize', json=payload).json()['preference_advice'] is None


def test_alternative_warnings_include_fixes():
    schedule = [dict(course_name='One', section=section()), dict(course_name='Two', section=section(start=660))]
    report = preference_report(schedule, dict(earliest_start='11:00', min_gap=30, faculties={'One': ['Other']}))
    assert len(report['warnings']) == 3
    assert all('Suggested fix:' in warning for warning in report['warnings'])
