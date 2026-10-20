import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend import catalog
from backend.pdf_import import import_pdf, parse_time, parse_offering
from backend.optimizer import schedule_score, solve_schedules

FIXTURE = Path(__file__).parent / 'fixtures' / 'course-offerings.pdf'


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setattr(catalog, 'CATALOG_DIR', tmp_path)
    return TestClient(app)


def upload(api):
    response = api.post('/api/catalogs/import', files={'file': ('routine.pdf', FIXTURE.read_bytes(), 'application/pdf')})
    assert response.status_code == 200, response.text
    return response.json()


def test_pdf_overflow_rooms_programs_and_unassigned():
    result = import_pdf(FIXTURE.read_bytes())
    assert result['warnings'] == []
    assert len(result['courses']) == 3
    courses = {c['id']: c for c in result['courses']}
    lab = courses['BSCSE:CSE 1112']
    assert lab['title'] == 'Structured Programming Language Laboratory'
    assert lab['sections'][0]['name'] == 'A'
    assert len(lab['sections'][0]['slots']) == 1
    accounting = courses['BSCSE:ACT 2111']
    assert accounting['sections'][0]['slots'][1]['room'] == '302'
    assert accounting['sections'][1]['faculty'] == 'Unassigned'
    assert accounting['sections'][1]['slots'][0]['start_time'] == '12:31'


@pytest.mark.parametrize('raw,expected', [('12:30:AM', ('00:30',30)), ('12:30:PM',('12:30',750)), ('01:50:PM',('13:50',830)), ('08:30',('08:30',510))])
def test_time(raw, expected):
    assert parse_time(raw) == expected


def test_import_restore_filter_conflicts_and_pagination(api):
    data = upload(api)
    assert api.get(f"/api/catalogs/{data['id']}").json() == data
    payload = {'catalog_id': data['id'], 'selections': [
        {'course_id': 'BSCSE:CSE 1112'}, {'course_id': 'BSCSE:ACT 2111'}], 'limit': 1}
    first = api.post('/api/catalogs/optimize', json=payload).json()
    assert first['total'] == 3  # A/A overlaps; all other combinations are valid.
    pages = [api.post('/api/catalogs/optimize', json={**payload, 'offset': n}).json() for n in range(3)]
    schedules = [p['schedules'][0] for p in pages]
    assert len({json.dumps(s, sort_keys=True) for s in schedules}) == 3
    assert [schedule_score(s) for s in schedules] == sorted(schedule_score(s) for s in schedules)
    payload['selections'][0]['faculties'] = ['Teacher One']
    filtered = api.post('/api/catalogs/optimize', json=payload).json()
    assert filtered['total'] == 1
    payload['selections'][1]['faculties'] = ['Teacher One']
    assert api.post('/api/catalogs/optimize', json=payload).json()['total'] == 0
    payload['selections'][0]['faculties'] = ['Teacher One', 'Teacher Two']
    assert api.post('/api/catalogs/optimize', json=payload).json()['total'] == 1


def test_bad_upload_and_selections(api, monkeypatch):
    assert api.post('/api/catalogs/import', files={'file': ('bad.pdf', b'EXAM ROUTINE ACT 2111 D2 T3')}).status_code == 400
    data = upload(api)
    for selections in ([{'course_id': 'missing'}], [{'course_id': 'BSCSE:CSE 1112', 'faculties': ['missing']}], [{'course_id': 'BSCSE:CSE 1112'}]*2):
        assert api.post('/api/catalogs/optimize', json={'catalog_id':data['id'],'selections':selections}).status_code == 400
    assert api.get('/api/catalogs/not-a-catalog').status_code == 404
    monkeypatch.setattr(catalog, 'MAX_UPLOAD', 3)
    assert api.post('/api/catalogs/import', files={'file': ('big.pdf', b'%PDF-123')}).status_code == 413


def test_limits_fail_explicitly_instead_of_returning_partial_schedules():
    courses = [{'course_name': 'C', 'sections': [{'name':'A','slots':[]}, {'name':'B','slots':[]}]}]
    with pytest.raises(ValueError, match='combinations'):
        solve_schedules(courses, max_results=1)
    with pytest.raises(ValueError, match='search'):
        solve_schedules(courses, max_nodes=1)


def test_incomplete_meeting_is_rejected():
    with pytest.raises(ValueError, match='time range'):
        parse_offering(dict(coursecode='CSE 1111', title='Course', section='A', day1='Sat', time1='-'))


@pytest.mark.skipif(not os.environ.get('UIU_TEST_PDF'), reason='Set UIU_TEST_PDF to run the supplied Fall 2026 PDF regression')
def test_full_fall_2026_pdf():
    data = import_pdf(Path(os.environ['UIU_TEST_PDF']).read_bytes())
    assert data['warnings'] == []
    assert sum(len(c['sections']) for c in data['courses']) == 791
    courses = {c['id']: c for c in data['courses']}
    assert courses['BSDS:DS 3120']['title'] == 'Technical Report Writing and Presentation'
    assert [s['name'] for s in courses['BSDS:DS 3120']['sections']] == ['BA', 'BB']
    assert courses['BSDS:DS 1116']['title'] == 'Object Oriented Programming for Data Science Laboratory'
    assert courses['BSCSE:BDS 1201']['sections'][-1]['name'] == 'AE (If Required)'
    assert any(s['faculty'] == 'Golam Mohammed Bhuiyan' for s in courses['BSCSE:PHY 2105']['sections'])


def test_campus_days_filter_and_pagination(api):
    data = upload(api)
    payload = {'catalog_id': data['id'], 'selections': [
        {'course_id': 'BSCSE:CSE 1112'}, {'course_id': 'BSCSE:ACT 2111'}],
        'campus_days': 3, 'limit': 1}
    response = api.post('/api/catalogs/optimize', json=payload)
    assert response.status_code == 200
    assert response.json()['total'] == 2
    assert response.json()['metrics'][0]['campus_days'] == 3
    second = api.post('/api/catalogs/optimize', json={**payload, 'offset': 1}).json()
    assert second['total'] == 2
    assert second['schedules'] != response.json()['schedules']
    for days in [4, 5]:
        assert api.post('/api/catalogs/optimize', json={**payload, 'campus_days': days}).json()['total'] == 0
    assert api.post('/api/catalogs/optimize', json={**payload, 'campus_days': 6}).status_code == 422


def test_day_filter_counts_distinct_days_before_result_limit():
    slot = lambda day: {'day':day, 'start_mins':600, 'end_mins':660}
    sections = [{'name':str(n), 'slots':[slot(d) for d in ['Monday','Tuesday','Wednesday','Thursday','Friday'][:n]]} for n in [2,3,4,5]]
    for days in [3,4,5]:
        result = solve_schedules([{'course_name':'Test', 'sections':sections}], max_results=1, campus_days=days)
        assert len(result) == 1
        assert schedule_score(result[0])[0] == days


def test_manual_campus_days(api):
    payload = {'courses':[{'course_name':'Course', 'raw_text':'A\nTeacher\nMonday 10:00-11:00\nTuesday 10:00-11:00\nWednesday 10:00-11:00'}], 'campus_days':3}
    assert len(api.post('/api/optimize', json=payload).json()['schedules']) == 1
    assert api.post('/api/optimize', json={**payload, 'campus_days':4}).json()['schedules'] == []


def test_get_default_catalog(api, tmp_path):
    (tmp_path / 'default.json').write_text(json.dumps({'id': 'default', 'courses': []}), encoding='utf-8')
    resp = api.get('/api/catalogs/default')
    assert resp.status_code == 200
    assert resp.json()['id'] == 'default'

