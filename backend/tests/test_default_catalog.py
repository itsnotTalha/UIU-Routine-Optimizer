import json
import os
import pytest
from fastapi import HTTPException
from backend import catalog


@pytest.fixture
def storage(monkeypatch, tmp_path):
    for name in ('CATALOG_DIR', 'TMP_CATALOG_DIR', 'ROUTINES_DIR', 'BACKEND_ROUTINES_DIR'):
        directory = tmp_path / name
        directory.mkdir()
        monkeypatch.setattr(catalog, name, directory)
    calls = []
    def parse(content):
        calls.append(content)
        if content == b'bad':
            raise ValueError('Invalid PDF')
        return {'courses': [{'id': content.decode()}]}
    monkeypatch.setattr(catalog, 'import_pdf', parse)
    return calls


def test_same_filename_same_size_and_timestamp_refreshes(storage):
    pdf = catalog.ROUTINES_DIR / 'routine.pdf'
    pdf.write_bytes(b'old')
    stamp = pdf.stat()
    first = catalog.get_default_catalog()
    assert catalog.get_default_catalog() == first
    assert len(storage) == 1
    pdf.write_bytes(b'new')
    os.utime(pdf, ns=(stamp.st_atime_ns, stamp.st_mtime_ns))
    second = catalog.get_default_catalog()
    assert second['courses'] == [{'id': 'new'}]
    assert second['source_sha256'] != first['source_sha256']
    assert len(storage) == 2
    assert catalog.get_default_pdf().path == pdf


def test_stale_temp_and_legacy_cache_do_not_override_pdf(storage):
    for directory in (catalog.CATALOG_DIR, catalog.TMP_CATALOG_DIR):
        (directory / 'default.json').write_text(json.dumps({'courses': [{'id': 'stale'}]}))
    (catalog.ROUTINES_DIR / 'routine.pdf').write_bytes(b'new')
    assert catalog.get_default_catalog()['courses'] == [{'id': 'new'}]
    assert catalog.get_default_catalog()['courses'] == [{'id': 'new'}]
    assert len(storage) == 1


def test_bad_replacement_does_not_silently_serve_old_catalog(storage):
    pdf = catalog.ROUTINES_DIR / 'routine.pdf'
    pdf.write_bytes(b'old')
    catalog.get_default_catalog()
    pdf.write_bytes(b'bad')
    with pytest.raises(HTTPException) as error:
        catalog.get_default_catalog()
    assert error.value.status_code == 422


def test_read_only_cache_falls_back_to_temporary_directory(storage, monkeypatch):
    (catalog.ROUTINES_DIR / 'routine.pdf').write_bytes(b'new')
    blocked = catalog.CATALOG_DIR / 'file'
    blocked.write_text('not a directory')
    monkeypatch.setattr(catalog, 'CATALOG_DIR', blocked)
    assert catalog.get_default_catalog()['courses'] == [{'id': 'new'}]
    assert (catalog.TMP_CATALOG_DIR / 'default.json').exists()


def test_json_only_default_supported_but_custom_upload_not_promoted(storage):
    (catalog.CATALOG_DIR / ('a' * 32 + '.json')).write_text('{"courses": []}')
    with pytest.raises(HTTPException) as error:
        catalog.get_default_catalog()
    assert error.value.status_code == 404
    (catalog.CATALOG_DIR / 'default.json').write_text('{"courses": []}')
    assert catalog.get_default_catalog()['id'] == 'default'
