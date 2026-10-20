"""Import UIU course-offering tables without losing overflowing cell text."""
import io
import re
from datetime import datetime

import pdfplumber

from backend.parser import DAYS_MAP


def clean(value):
    return ' '.join((value or '').split())


def row_values(page, row):
    # The supplied PDF draws each cell as a separate text run. Titles and names
    # can extend beyond their cell: assign whole runs by their starting position,
    # rather than clipping individual letters to column rectangles.
    cells = row.cells
    bounds = [c for c in cells if c]
    top, bottom = min(c[1] for c in bounds), max(c[3] for c in bounds)
    chars = [c for c in page.chars if top <= (c['top'] + c['bottom']) / 2 < bottom]
    runs = []
    for char in chars:
        if (not runs or abs(char['x0'] - runs[-1][-1]['x1']) > 1
                or abs(char['top'] - runs[-1][-1]['top']) > 2):
            runs.append([])
        runs[-1].append(char)
    # Only recover abutting cells when no separate text run starts in that
    # column. This avoids splitting a long title that crosses a later column.
    empty_cells = [c for c in cells if c and not any(c[0] <= r[0]['x0'] < c[2] for r in runs)]
    recovered = []
    for run in runs:
        piece = []
        for char in run:
            if piece and any(abs(char['x0'] - c[0] - 1.82) < 0.025
                             and piece[0]['x0'] < c[0] for c in empty_cells):
                recovered.append(piece)
                piece = []
            piece.append(char)
        recovered.append(piece)
    runs = recovered
    values = [''] * len(cells)
    for run in runs:
        for i, cell in enumerate(cells):
            if cell and cell[0] <= run[0]['x0'] < cell[2]:
                values[i] += ' ' + ''.join(c['text'] for c in run)
                break
    return [clean(v) for v in values]


def parse_time(value):
    value = re.sub(r':?\s*(AM|PM)$', r' \1', clean(value).upper())
    for fmt in ('%I:%M %p', '%H:%M'):
        try:
            dt = datetime.strptime(value, fmt)
            return dt.strftime('%H:%M'), dt.hour * 60 + dt.minute
        except ValueError:
            pass
    raise ValueError(f'Invalid time: {value}')


def parse_offering(data):
    code, title, section = data['coursecode'], data['title'], data['section']
    if not code or not title or not section:
        raise ValueError('Missing course code, title, or section')
    slots = []
    for suffix in ('1', '2'):
        day, time = data.get('day' + suffix, ''), data.get('time' + suffix, '')
        if day in ('', '-') and time in ('', '-'):
            continue
        if day.lower() not in DAYS_MAP:
            raise ValueError(f'Invalid or missing day: {day}')
        times = re.split(r'\s*[-–—]\s*', time)
        if len(times) != 2 or not all(times):
            raise ValueError(f'Invalid or missing time range: {time}')
        start, sm = parse_time(times[0])
        end, em = parse_time(times[1])
        if sm >= em:
            raise ValueError(f'Invalid time order: {time}')
        slots.append(dict(day=DAYS_MAP[day.lower()], start_time=start,
                          end_time=end, start_mins=sm, end_mins=em,
                          room=data.get('room' + suffix) or None))
    if not slots:
        raise ValueError('No class meeting times')
    rooms = list(dict.fromkeys(s['room'] for s in slots if s['room']))
    return dict(code=code, title=title, program=data.get('program', ''),
                section=dict(name=section, faculty=data.get('facultyname') or 'Unassigned',
                             room=' / '.join(rooms) or None, slots=slots))


def import_pdf(content):
    if not content.startswith(b'%PDF-'):
        raise ValueError('Please upload a valid PDF file.')
    courses, warnings, skipped = {}, [], 0
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            if len(pdf.pages) > 150:
                raise ValueError('PDF exceeds the 150-page limit.')
            for page_number, page in enumerate(pdf.pages, 1):
                recognized = False
                for table in page.find_tables():
                    headers = None
                    for row in table.rows:
                        values = row_values(page, row)
                        normalized = [re.sub(r'\s+', '', v).lower() for v in values]
                        if {'coursecode', 'title', 'section', 'day1', 'time1'} <= set(normalized):
                            headers = normalized
                            recognized = True
                            continue
                        if headers is None or not any(values):
                            continue
                        data = dict(zip(headers, values))
                        try:
                            offering = parse_offering(data)
                        except ValueError as exc:
                            skipped += 1
                            warnings.append(f"Page {page_number}, row {data.get('sl', '?')}: {exc}")
                            continue
                        key = f"{offering['program']}:{offering['code']}"
                        course = courses.setdefault(key, dict(id=key, code=offering['code'],
                            title=offering['title'], program=offering['program'], sections=[]))
                        if offering['section'] not in course['sections']:
                            course['sections'].append(offering['section'])
                if not recognized:
                    # Header/footer-only pages in UIU exports are harmless.
                    text = page.extract_text() or ''
                    if re.search(r'\b[A-Z]{2,5}\s+\d{4}\b', text):
                        warnings.append(f'Page {page_number}: course text found but no supported table; review this page.')
                page.close()
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError('Cannot read this PDF. Use an unencrypted, text-based course-offering PDF.') from exc
    if not courses:
        raise ValueError('No class offerings found. Expected a text-based table with Course Code, Title, Section, Day1/Day2, Time1/Time2 and Faculty Name. Scans and exam codes alone are not supported.')
    return dict(courses=sorted(courses.values(), key=lambda c: (c['code'], c['program'])),
                warnings=warnings, skipped_rows=skipped)
