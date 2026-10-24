import pytest
from fastapi import HTTPException
from backend import catalog
from backend.models import CatalogOptimizeRequest


def offering():
    return {'id': 'test', 'courses': [{'id': 'one', 'code': 'C', 'title': 'Course', 'program': 'P',
        'sections': [{'name': name, 'faculty': teacher, 'slots': []}
                     for name, teacher in [('A', 'Teacher'), ('B', 'Teacher'), ('C', 'Other')]]}]}


def request(priorities, faculties=None):
    return CatalogOptimizeRequest(catalog_id='test', selections=[{
        'course_id': 'one', 'faculties': faculties or ['Teacher', 'Other'],
        'section_priorities': priorities}])


def test_section_priority_ranking_cache_and_fallback(monkeypatch):
    monkeypatch.setattr(catalog, 'load_catalog', lambda _: offering())
    result = catalog.optimize_catalog(request({'Teacher': ['B']}))
    assert [s[0]['section']['name'] for s in result['schedules']] == ['B', 'A', 'C']
    result = catalog.optimize_catalog(request({'Teacher': ['A']}))
    assert [s[0]['section']['name'] for s in result['schedules']] == ['A', 'B', 'C']
    # Teacher order takes precedence over section choices.
    result = catalog.optimize_catalog(request({'Teacher': ['B']}, ['Other', 'Teacher']))
    assert [s[0]['section']['name'] for s in result['schedules']] == ['C', 'B', 'A']


@pytest.mark.parametrize('priorities', [{'Teacher': ['missing']}, {'Teacher': ['C']},
                                      {'Teacher': ['A', 'A']}, {'Unknown': []}])
def test_invalid_section_priorities(monkeypatch, priorities):
    monkeypatch.setattr(catalog, 'load_catalog', lambda _: offering())
    with pytest.raises(HTTPException) as error:
        catalog.optimize_catalog(request(priorities))
    assert error.value.status_code == 400


def test_report_identifies_first_choices_and_fallbacks(monkeypatch):
    monkeypatch.setattr(catalog, 'load_catalog', lambda _: offering())
    reports = catalog.optimize_catalog(request({'Teacher': ['B']}))['preference_reports']
    first, fallback, other = [report['priority_matches'][0] for report in reports]
    assert (first['faculty_rank'], first['section_rank']) == (1, 1)
    assert fallback['has_section_priority'] and fallback['section_rank'] is None
    assert other['faculty_rank'] == 2 and not other['has_section_priority']


def test_priorities_outrank_fewer_campus_days():
    from backend.preferences import preference_score
    def routine(teacher, name, days):
        return [{'course_name': 'C', 'section': {'faculty': teacher, 'name': name, 'slots': [
            {'day': day, 'start_mins': 600, 'end_mins': 660} for day in days]}}]
    prefs = {'priority': 'strict', 'course_order': ['C'], 'faculties': {'C': ['T1', 'T2']},
             'section_priorities': {'C': {'T1': ['B', 'A']}}}
    preferred = routine('T1', 'B', ['Saturday', 'Sunday'])
    shorter = routine('T1', 'A', ['Saturday'])
    other = routine('T2', 'C', ['Saturday'])
    assert sorted([other, shorter, preferred], key=lambda s: preference_score(s, prefs)) == [preferred, shorter, other]
