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
