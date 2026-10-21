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



def test_ranked_cache_reuses_pages_and_invalidates_data(monkeypatch):
    catalog._SCHEDULE_CACHE.clear()
    actual = catalog.solve_schedules
    calls = []
    def counted(*args, **kwargs):
        calls.append(1)
        return actual(*args, **kwargs)
    monkeypatch.setattr(catalog, 'solve_schedules', counted)
    courses = [{'course_name':'Cache test', 'sections':[{'name':'A', 'slots':[
        {'day':'Monday', 'start_mins':600, 'end_mins':660}]}]}]
    assert catalog.ranked_schedules(courses, None) == catalog.ranked_schedules(courses, None)
    assert len(calls) == 1
    catalog.ranked_schedules(courses, 3)
    courses[0]['sections'][0]['slots'][0]['start_mins'] = 610
    catalog.ranked_schedules(courses, None)
    assert len(calls) == 3
    monkeypatch.setattr(catalog, '_CACHE_TTL', -1)
    catalog._SCHEDULE_CACHE.clear()
    catalog.ranked_schedules(courses, None)
    catalog.ranked_schedules(courses, None)
    assert len(calls) == 5
    catalog._SCHEDULE_CACHE.clear()


def test_time_and_faculty_priorities_explain_alternatives(api):
    data = upload(api)
    payload = {'catalog_id': data['id'], 'selections': [
        {'course_id': 'BSCSE:CSE 1112', 'faculties':['Teacher One']}],
        'earliest_start':'11:00', 'latest_end':'14:00'}
    strict = api.post('/api/catalogs/optimize', json=payload).json()
    assert strict['total'] == 0
    assert 'no section' in strict['notices'][0]
    time_first = api.post('/api/catalogs/optimize', json={**payload, 'priority':'time_first', 'limit':1}).json()
    assert time_first['total'] == 2
    assert time_first['exact_matches'] == 0
    assert time_first['schedules'][0][0]['section']['faculty'] == 'Teacher Two'
    report = time_first['preference_reports'][0]
    assert report['outside_minutes'] == 0
    assert report['faculty_mismatches'] == 1
    assert 'preferred: Teacher One' in report['warnings'][0]
    faculty_first = api.post('/api/catalogs/optimize', json={**payload, 'priority':'faculty_first'}).json()
    assert faculty_first['schedules'][0][0]['section']['faculty'] == 'Teacher One'
    assert faculty_first['preference_reports'][0]['outside_minutes'] == 150
    assert faculty_first['preference_reports'][0]['faculty_mismatches'] == 0
    assert 'outside your preferred window' in faculty_first['preference_reports'][0]['warnings'][0]
    second = api.post('/api/catalogs/optimize', json={**payload, 'priority':'time_first', 'offset':1, 'limit':1}).json()
    assert second['preference_reports'][0]['outside_minutes'] == 150
    # Hard campus-day constraints are not relaxed by priority mode.
    assert api.post('/api/catalogs/optimize', json={**payload, 'priority':'time_first','campus_days':3}).json()['total'] == 0


def test_exact_boundaries_open_ended_and_invalid_windows(api):
    data = upload(api)
    payload = {'catalog_id':data['id'], 'selections':[{'course_id':'BSCSE:CSE 1112'}]}
    exact = api.post('/api/catalogs/optimize', json={**payload,'earliest_start':'08:30','latest_end':'11:00'}).json()
    assert exact['total'] == exact['exact_matches'] == 1
    assert exact['preference_reports'][0]['exact_match']
    for key, time in [('earliest_start','11:00'),('latest_end','11:00')]:
        assert api.post('/api/catalogs/optimize',json={**payload,key:time}).json()['total'] == 1
    for extra in [{'earliest_start':'14:00','latest_end':'10:00'}, {'earliest_start':'11:00','latest_end':'11:00'}, {'earliest_start':'24:00'}, {'latest_end':'09:99'}, {'priority':'unknown'}]:
        assert api.post('/api/catalogs/optimize',json={**payload,**extra}).status_code == 422


def test_joint_faculty_clash_is_not_claimed_as_individual_unavailability(api):
    data = upload(api)
    payload = {'catalog_id':data['id'], 'priority':'faculty_first', 'earliest_start':'08:00','latest_end':'14:00',
        'selections':[{'course_id':'BSCSE:CSE 1112','faculties':['Teacher One']},
                      {'course_id':'BSCSE:ACT 2111','faculties':['Teacher One']}]}
    result = api.post('/api/catalogs/optimize',json=payload).json()
    assert result['exact_matches'] == 0
    assert result['notices'] == []
    assert result['preference_reports'][0]['faculty_mismatches'] == 1
    assert result['total'] == 3  # Overlapping A/A is still excluded.


def test_manual_time_preference_reports(api):
    payload = {'courses':[{'course_name':'Course','raw_text':'A\nTeacher\nMonday 09:00-10:00'}], 'earliest_start':'11:00'}
    assert api.post('/api/optimize',json=payload).json()['schedules'] == []
    result = api.post('/api/optimize',json={**payload,'priority':'time_first'}).json()
    assert len(result['schedules']) == 1
    assert result['preference_reports'][0]['outside_minutes'] == 60


def test_faculty_preference_priority_ordering(api):
    data = upload(api)
    # CSE 1112 has Teacher One (sec A, Saturday 08:30-11:00) and Teacher Two (sec B, Saturday 11:10-13:40).
    # Prioritizing Teacher Two first should rank Teacher Two as schedule #0.
    payload2 = {'catalog_id': data['id'], 'selections': [{'course_id': 'BSCSE:CSE 1112', 'faculties': ['Teacher Two', 'Teacher One']}]}
    res2 = api.post('/api/catalogs/optimize', json=payload2).json()
    assert res2['total'] == 2
    assert res2['schedules'][0][0]['section']['faculty'] == 'Teacher Two'
    assert res2['schedules'][1][0]['section']['faculty'] == 'Teacher One'

    # Reversing priority to Teacher One first should rank Teacher One as schedule #0.
    payload1 = {'catalog_id': data['id'], 'selections': [{'course_id': 'BSCSE:CSE 1112', 'faculties': ['Teacher One', 'Teacher Two']}]}
    res1 = api.post('/api/catalogs/optimize', json=payload1).json()
    assert res1['total'] == 2
    assert res1['schedules'][0][0]['section']['faculty'] == 'Teacher One'
    assert res1['schedules'][1][0]['section']['faculty'] == 'Teacher Two'


def test_course_priority_resolves_conflicting_first_choice_teachers(api):
    data = upload(api)
    lab = {'course_id': 'BSCSE:CSE 1112', 'faculties': ['Teacher One', 'Teacher Two']}
    accounting = {'course_id': 'BSCSE:ACT 2111', 'faculties': ['Teacher One', 'Unassigned']}
    # Their first-choice sections clash. Changing course order must change the
    # winner even with an already-warm result cache and solver search reordering.
    for selections, expected in [
        ([lab, accounting], {'CSE 1112': 'Teacher One', 'ACT 2111': 'Unassigned'}),
        ([accounting, lab], {'CSE 1112': 'Teacher Two', 'ACT 2111': 'Teacher One'}),
        ([lab, accounting], {'CSE 1112': 'Teacher One', 'ACT 2111': 'Unassigned'}),
    ]:
        response = api.post('/api/catalogs/optimize', json={
            'catalog_id': data['id'], 'selections': selections})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['total'] == 3
        first = result['schedules'][0]
        assert len(first) == 2
        for code, teacher in expected.items():
            assert next(c['section']['faculty'] for c in first if c['course_name'].startswith(code)) == teacher
