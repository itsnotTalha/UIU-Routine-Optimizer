const earliestInput = document.getElementById('earliest-start');
const latestInput = document.getElementById('latest-end');
const earliestSelect = document.getElementById('earliest-start-select');
const latestSelect = document.getElementById('latest-end-select');

// Drawer & Backdrop elements
const filtersDrawerBackdrop = document.getElementById('filters-drawer-backdrop');
const filtersDrawer = document.getElementById('filters-drawer');
const btnOpenFilters = document.getElementById('btn-open-filters');
const btnCloseFilters = document.getElementById('btn-close-filters');
const btnResetFilters = document.getElementById('btn-reset-filters');
const btnApplyFilters = document.getElementById('btn-apply-filters');
const btnErrorOpenFilters = document.getElementById('btn-error-open-filters');


function getGlobalPrioritizedFaculties() {
  return []; // Faculty priority is per course, represented by the ordered selections.
}
window.getGlobalPrioritizedFaculties = getGlobalPrioritizedFaculties;

function readFixedSlots() {
  return [...document.querySelectorAll('.fixed-slot-row')].map(row => {
    const value = field => row.querySelector(`[data-field="${field}"]`).value;
    const minutes = text => text ? Number(text.split(':')[0]) * 60 + Number(text.split(':')[1]) : null;
    return {title: value('title').trim() || 'FYDP / Blocked', day: value('day'),
      start_time: minutes(value('start_time')), end_time: minutes(value('end_time'))};
  });
}

function addFixedSlot(slot = {day: 'Saturday', start_time: 510, end_time: 660}) {
  const list = document.getElementById('fixed-slots-list');
  if (list.children.length >= 30) return;
  const row = document.createElement('div');
  row.className = 'fixed-slot-row';
  for (const [field, labelText, type] of [['title', 'Name (optional)', 'text'], ['day', 'Day', 'select'], ['start_time', 'Start time', 'time'], ['end_time', 'End time', 'time']]) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    input.dataset.field = field;
    input.className = 'glass-input rounded-xl px-3 py-2 w-full';
    if (type === 'select') {
      for (const day of ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) input.add(new Option(day, day));
    } else input.type = type;
    if (type === 'time') {
      input.step = '60';
      input.required = true;
      const mins = slot[field];
      input.value = Number.isInteger(mins) ? `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` : '';
    } else input.value = slot[field] || '';
    if (field === 'title') { input.maxLength = 120; input.placeholder = 'CSE 4000A (FYDP-I)'; }
    label.append(input);
    row.append(label);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove blocked time';
  remove.onclick = () => { row.remove(); document.getElementById('add-fixed-slot').disabled = false; preferencesChanged(); };
  row.append(remove);
  row.addEventListener('input', () => {
    row.querySelector('[data-field="end_time"]').setCustomValidity('');
    preferencesChanged();
  });
  list.append(row);
  document.getElementById('add-fixed-slot').disabled = list.children.length >= 30;
}
document.getElementById('add-fixed-slot').addEventListener('click', () => {
  addFixedSlot();
  document.querySelector('.fixed-slot-row:last-child input')?.focus();
  preferencesChanged();
});

function getAllowedDays() {
  return [...document.querySelectorAll('#allowed-days input:checked')].map(input => input.value);
}

function setAllowedDays(days = []) {
  document.querySelectorAll('#allowed-days input').forEach(input => {
    input.checked = days.includes(input.value);
  });
}

document.getElementById('allowed-days').addEventListener('change', preferencesChanged);
document.querySelectorAll('[data-allowed-days]').forEach(button => {
  button.addEventListener('click', () => {
    setAllowedDays(button.dataset.allowedDays.split(',').filter(Boolean));
    preferencesChanged();
  });
});

function getSchedulingPreferences() {
  const minGapVal = document.getElementById('min-gap-select')?.value;
  return {
    allowed_days: getAllowedDays(),
    fixed_slots: readFixedSlots(),
    earliest_start: earliestInput?.value || null,
    latest_end: latestInput?.value || null,
    priority: 'strict',
    max_classes_per_day: document.getElementById('max-classes-per-day')?.value ? Number(document.getElementById('max-classes-per-day').value) : null,
    min_gap: minGapVal ? Number(minGapVal) : null,
    prioritized_faculties: getGlobalPrioritizedFaculties()
  };
}

function validateSchedulingPreferences() {
  const rows = [...document.querySelectorAll('.fixed-slot-row')];
  const slots = readFixedSlots();
  for (let i = 0; i < rows.length; i++) {
    const end = rows[i].querySelector('[data-field="end_time"]');
    const slot = slots[i];
    const overlaps = slots.slice(0, i).some(other => other.day === slot.day && slot.start_time < other.end_time && other.start_time < slot.end_time);
    end.setCustomValidity(slot.start_time >= slot.end_time ? 'End must be after start on the same day.' : overlaps ? 'Fixed slots on the same day must not overlap.' : '');
    for (const input of rows[i].querySelectorAll('input, select')) {
      if (!input.validity.valid) { openFiltersDrawer(); return input.reportValidity(); }
    }
  }
  const dailyLimit = document.getElementById('max-classes-per-day');
  if (dailyLimit && !dailyLimit.validity.valid) {
    openFiltersDrawer();
    return dailyLimit.reportValidity();
  }
  if (earliestInput && latestInput) {
    latestInput.setCustomValidity(earliestInput.value && latestInput.value && earliestInput.value >= latestInput.value
      ? 'Finish time must be later than start time.' : '');
    if (!earliestInput.validity.valid || !latestInput.validity.valid) {
      openFiltersDrawer();
      return earliestInput.reportValidity() && latestInput.reportValidity();
    }
  }
  return true;
}

function updateActiveFiltersBadge() {
  let count = readFixedSlots().length;
  if (getAllowedDays().length) count++;
  if (document.getElementById('campus-days')?.value) count++;
  if (earliestInput?.value) count++;
  if (latestInput?.value) count++;
  if (document.getElementById('min-gap-select')?.value) count++;
  if (document.getElementById('max-classes-per-day')?.value) count++;

  const badge = document.getElementById('active-filters-badge');
  const drawerBadge = document.getElementById('drawer-active-badge');
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }
  if (drawerBadge) {
    drawerBadge.textContent = `${count} active`;
    drawerBadge.classList.toggle('hidden', count === 0);
  }
}
window.updateActiveFiltersBadge = updateActiveFiltersBadge;

function refreshPreferenceSummary() {
  const {earliest_start, latest_end, min_gap, max_classes_per_day} = getSchedulingPreferences();
  const days = document.getElementById('campus-days')?.value;
  const parts = [];
  const allowedDays = getAllowedDays();
  if (allowedDays.length) parts.push(allowedDays.map(day => day.slice(0, 3)).join(' + '));
  const fixedCount = readFixedSlots().length;
  if (fixedCount) parts.push(`${fixedCount} fixed slot${fixedCount === 1 ? '' : 's'}`);
  if (days) parts.push(`${days} days/week`);
  const displayTime = value => {
    const [hour, minute] = value.split(':');
    return `${Number(hour) % 12 || 12}:${minute} ${Number(hour) >= 12 ? 'PM' : 'AM'}`;
  };
  if (earliest_start) parts.push(`From ${displayTime(earliest_start)}`);
  if (latest_end) parts.push(`Until ${displayTime(latest_end)}`);
  if (max_classes_per_day) parts.push(`Max ${max_classes_per_day} classes/day`);
  if (min_gap) parts.push(`${document.getElementById('min-gap-select').selectedOptions[0].textContent} minimum break`);

  const summaryEl = document.getElementById('preferences-summary');
  if (summaryEl) {
    summaryEl.textContent = parts.length > 0 ? parts.join(' · ') : 'Days, times and teacher choices';
  }
  if (window.updateTimeFilterPill) window.updateTimeFilterPill();
  updateActiveFiltersBadge();
}

function restoreSchedulingPreferences(saved) {
  if (!saved) return;
  setAllowedDays(saved.allowed_days || []);
  document.getElementById('fixed-slots-list').replaceChildren();
  document.getElementById('add-fixed-slot').disabled = false;
  for (const slot of (saved.fixed_slots || [])) addFixedSlot(slot);
  document.getElementById('max-classes-per-day').value = saved.max_classes_per_day ?? '';
  if (earliestInput) earliestInput.value = saved.earliest_start || '';
  if (latestInput) latestInput.value = saved.latest_end || '';

  const minGap = document.getElementById('min-gap-select');
  if (minGap && saved.min_gap) minGap.value = String(saved.min_gap);


  if (earliestSelect) {
    if (earliestInput?.value && [...earliestSelect.options].some(o => o.value === earliestInput.value)) {
      earliestSelect.value = earliestInput.value;
      earliestInput.classList.add('hidden');
    } else if (earliestInput?.value) {
      earliestSelect.value = 'custom';
      earliestInput.classList.remove('hidden');
    } else {
      earliestSelect.value = '';
      earliestInput?.classList.add('hidden');
    }
  }

  if (latestSelect) {
    if (latestInput?.value && [...latestSelect.options].some(o => o.value === latestInput.value)) {
      latestSelect.value = latestInput.value;
      latestInput.classList.add('hidden');
    } else if (latestInput?.value) {
      latestSelect.value = 'custom';
      latestInput.classList.remove('hidden');
    } else {
      latestSelect.value = '';
      latestInput?.classList.add('hidden');
    }
  }

  refreshPreferenceSummary();
  updateActiveFiltersBadge();
}

function preferencesChanged() {
  if (latestInput) latestInput.setCustomValidity('');
  refreshPreferenceSummary();
  if (catalog) persistCatalog();
}

if (earliestInput) earliestInput.addEventListener('change', preferencesChanged);
if (latestInput) latestInput.addEventListener('change', preferencesChanged);
document.getElementById('campus-days')?.addEventListener('change', preferencesChanged);
document.getElementById('min-gap-select')?.addEventListener('change', preferencesChanged);
document.getElementById('max-classes-per-day')?.addEventListener('change', preferencesChanged);

if (earliestSelect) {
  earliestSelect.addEventListener('change', () => {
    if (earliestSelect.value === 'custom') {
      earliestInput?.classList.remove('hidden');
      earliestInput?.focus();
    } else if (earliestInput) {
      earliestInput.classList.add('hidden');
      earliestInput.value = earliestSelect.value;
      preferencesChanged();
    }
  });
}

if (latestSelect) {
  latestSelect.addEventListener('change', () => {
    if (latestSelect.value === 'custom') {
      latestInput?.classList.remove('hidden');
      latestInput?.focus();
    } else if (latestInput) {
      latestInput.classList.add('hidden');
      latestInput.value = latestSelect.value;
      preferencesChanged();
    }
  });
}

// Open / Close Drawer
let filtersReturnFocus = null;
let filtersCloseTimer;
function openFiltersDrawer() {
  if (!filtersDrawerBackdrop || !filtersDrawer) return;
  clearTimeout(filtersCloseTimer);
  filtersReturnFocus = document.activeElement;
  document.body.classList.add("filters-open");
  renderGlobalFacultyChecklist();
  updateActiveFiltersBadge();
  filtersDrawerBackdrop.classList.remove('hidden');
  requestAnimationFrame(() => {
    filtersDrawer.classList.remove('translate-x-full');
    btnCloseFilters?.focus({preventScroll:true});
  });
}

function closeFiltersDrawer() {
  if (!filtersDrawerBackdrop || !filtersDrawer) return;
  window.cancelPriorityDrag?.();
  filtersDrawer.classList.add('translate-x-full');
  document.body.classList.remove('filters-open');
  filtersReturnFocus?.focus({preventScroll:true});
  filtersCloseTimer = setTimeout(() => {
    filtersDrawerBackdrop.classList.add('hidden');
  }, 280);
}

window.openFiltersDrawer = openFiltersDrawer;
window.closeFiltersDrawer = closeFiltersDrawer;

if (btnOpenFilters) btnOpenFilters.addEventListener('click', openFiltersDrawer);
if (btnErrorOpenFilters) btnErrorOpenFilters.addEventListener('click', openFiltersDrawer);
if (btnCloseFilters) btnCloseFilters.addEventListener('click', closeFiltersDrawer);
if (filtersDrawerBackdrop) {
  filtersDrawerBackdrop.addEventListener('click', (e) => {
    if (e.target === filtersDrawerBackdrop) closeFiltersDrawer();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && filtersDrawerBackdrop && !filtersDrawerBackdrop.classList.contains('hidden')) {
    const controls = [...filtersDrawer.querySelectorAll('button, input, select, a[href], [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
  if (e.key === 'Escape' && filtersDrawerBackdrop && !filtersDrawerBackdrop.classList.contains('hidden')) {
    closeFiltersDrawer();
  }
});

// Quick Time filter button opens the filter drawer
const btnToggleTimeFilter = document.getElementById('btn-toggle-time-filter');
if (btnToggleTimeFilter) {
  btnToggleTimeFilter.addEventListener('click', () => {
    openFiltersDrawer();
  });
}

// Clear Times button
document.getElementById('clear-time-preferences')?.addEventListener('click', () => {
  if (earliestInput) earliestInput.value = '';
  if (latestInput) latestInput.value = '';
  if (earliestSelect) earliestSelect.value = '';
  if (latestSelect) latestSelect.value = '';
  earliestInput?.classList.add('hidden');
  latestInput?.classList.add('hidden');
  preferencesChanged();
});

// Ordered course groups and teacher choices share the request's selection order.
function renderGlobalFacultyChecklist() {
  window.cancelPriorityDrag?.();
  const container = document.getElementById('global-faculty-checklist');
  const emptyHint = document.getElementById('no-faculty-selected-hint');
  // The priority list lives inside the drawer's scrolling body.
  const scrollRegions = [];
  for (let node = container; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight) scrollRegions.push([node, node.scrollTop]);
  }
  container.replaceChildren();
  emptyHint.classList.toggle('hidden', selectedCourses.size > 0);
  function node(tag, text, className) {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function commit(message) {
    selectedCourses = new Map([...container.children].map(group => [group.dataset.courseId,
      [...group.querySelectorAll('.faculty-rank-row')].map(row => row.dataset.faculty)]));
    persistCatalog();
    renderCatalogList();
    renderSelectedCourses();
    document.getElementById('priority-order-status').textContent = message + ' Apply preferences to update routines.';
  }
  function controls(item, label) {
    const grip = node('button', '⠿', 'priority-drag-handle');
    grip.type = 'button';
    grip.setAttribute('aria-label', `Reorder ${label}`);
    grip.title = 'Drag to reorder, or use the up and down arrow keys';
    const move = delta => {
      const peer = delta < 0 ? item.previousElementSibling : item.nextElementSibling;
      if (!peer) return;
      const parent = item.parentElement;
      if (delta < 0) parent.insertBefore(item, peer);
      else parent.insertBefore(peer, item);
      commit(`${label} moved ${delta < 0 ? 'up' : 'down'}.`);
      [...container.querySelectorAll('.priority-drag-handle')].find(b => b.getAttribute('aria-label') === `Reorder ${label}`)?.focus({preventScroll:true});
    };
    grip.onkeydown = event => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); move(event.key === 'ArrowUp' ? -1 : 1);
      }
    };
    const actions = node('span', '', 'priority-move-actions');
    for (const [delta, symbol] of [[-1, '↑'], [1, '↓']]) {
      const button = node('button', symbol);
      button.type = 'button';
      button.setAttribute('aria-label', `Move ${label} ${delta < 0 ? 'up' : 'down'}`);
      button.onclick = () => move(delta);
      actions.append(button);
    }
    return [grip, actions];
  }
  [...selectedCourses].forEach(([id, names], courseIndex) => {
    const course = catalog.courses.find(c => c.id === id);
    if (!course) return;
    const group = node('section', '', 'faculty-rank-group');
    group.dataset.courseId = id;
    const header = node('header', '', 'priority-course-header');
    const [grip, actions] = controls(group, course.code);
    header.append(grip, node('h4', `${courseIndex + 1}. ${course.code} · ${course.title}`), actions);
    group.append(header);
    const teachers = node('div', '', 'priority-teachers');
    names.forEach((name, index) => {
      const row = node('div', '', 'faculty-rank-row');
      row.dataset.faculty = name;
      const [grip, actions] = controls(row, `${course.code}: ${name}`);
      row.append(grip, node('span', `${index + 1}. ${name}`), actions);
      teachers.append(row);
    });
    if (!names.length) group.append(node('p', 'Any faculty. Choose teachers on the course card to rank them here.'));
    group.append(teachers);
    group.append(renderSectionPriorities(course, names));
    container.append(group);
  });
  container.querySelectorAll('.priority-move-actions').forEach(actions => {
    const item = actions.closest('.faculty-rank-row') || actions.closest('.faculty-rank-group');
    actions.children[0].disabled = !item.previousElementSibling;
    actions.children[1].disabled = !item.nextElementSibling;
  });
  window.initPrioritySorting(container, commit);
  scrollRegions.forEach(([node, top]) => { node.scrollTop = top; });
}
window.renderGlobalFacultyChecklist = renderGlobalFacultyChecklist;

function renderConstraintFacultySummary() {
  renderGlobalFacultyChecklist();
}
window.renderConstraintFacultySummary = renderConstraintFacultySummary;

document.getElementById('btn-select-all-faculty')?.addEventListener('click', () => {
  document.querySelectorAll('#global-faculty-checklist input').forEach(input => {
    input.checked = true;
    input.dispatchEvent(new Event('change'));
  });
});

document.getElementById('btn-clear-all-faculty')?.addEventListener('click', () => {
  document.querySelectorAll('#global-faculty-checklist input').forEach(input => {
    input.checked = false;
    input.dispatchEvent(new Event('change'));
  });
});

// Shared action for the drawer and the suggested-limit shortcut.
async function applySchedulingPreferences(source = null) {
  if (!validateSchedulingPreferences()) return;
  if (!filtersDrawerBackdrop.classList.contains('hidden')) closeFiltersDrawer();
  preferencesChanged();
  if (source !== 'manual' && typeof fetchCatalogSchedules === 'function' && catalog && selectedCourses.size > 0) {
    catalogRequest = {
      catalog_id: catalog.id,
      campus_days: getCampusDays(),
      ...getSchedulingPreferences(),
      selections: catalogSelections()
    };
    await fetchCatalogSchedules();
  } else if (typeof optimizeRoutine === 'function' && courses.length > 0) {
    await optimizeRoutine();
  }
}
btnApplyFilters?.addEventListener('click', () => applySchedulingPreferences());

function dailyLimitContext() {
  return JSON.stringify({
    preferences: getSchedulingPreferences(), days: getCampusDays(),
    catalog: catalog?.id, selections: typeof catalogSelections === 'function' ? catalogSelections() : [...selectedCourses],
    manual: [...document.querySelectorAll('.course-name-input, .course-text-input')].map(input => input.value)
  });
}

// Apply only the fields named by a verified suggestion.
function applySuggestedChanges(changes) {
  if (Object.hasOwn(changes, 'allowed_days')) setAllowedDays(changes.allowed_days);
  for (const [key, input, select] of [
    ['earliest_start', earliestInput, earliestSelect],
    ['latest_end', latestInput, latestSelect]
  ]) {
    if (Object.hasOwn(changes, key)) {
      input.value = changes[key] || '';
      select.value = input.value;
      input.classList.add('hidden');
    }
  }
  for (const [key, id] of [['min_gap', 'min-gap-select'], ['campus_days', 'campus-days'], ['max_classes_per_day', 'max-classes-per-day']]) {
    if (Object.hasOwn(changes, key)) document.getElementById(id).value = changes[key] ?? '';
  }
  if (Object.hasOwn(changes, 'fixed_slots')) {
    document.getElementById('fixed-slots-list').replaceChildren();
    document.getElementById('add-fixed-slot').disabled = false;
    for (const slot of changes.fixed_slots) addFixedSlot(slot);
  }
  if (Object.hasOwn(changes, 'faculties')) {
    for (const id of selectedCourses.keys()) selectedCourses.set(id, []);
    renderCatalogList();
    renderSelectedCourses();
    renderGlobalFacultyChecklist();
  }
}

window.renderDailyLimitSuggestion = function(advice, source, preferenceAdvice = null) {
  const panel = document.getElementById('daily-limit-suggestion');
  const button = document.getElementById('btn-apply-daily-limit');
  panel.hidden = true;
  button.onclick = null;
  button.disabled = false;
  const daily = Number.isInteger(advice?.suggested) && advice.suggested > advice.requested &&
    getSchedulingPreferences().max_classes_per_day === advice.requested;
  const changes = daily ? {max_classes_per_day: advice.suggested} : preferenceAdvice?.changes;
  if (!changes || !Object.keys(changes).length) return;
  const context = dailyLimitContext();
  document.getElementById('daily-limit-suggestion-detail').textContent = daily
    ? `Daily limit: ${advice.requested} → ${advice.suggested} classes`
    : preferenceAdvice.suggestion;
  panel.querySelector('.suggestion-note').textContent = 'Applies the changes shown above, keeps your other preferences, and finds routines again.';
  button.textContent = daily ? `Apply ${advice.suggested} classes/day & find routines` : 'Apply changes & find routines';
  panel.hidden = false;
  button.onclick = async () => {
    if (context !== dailyLimitContext()) {
      showError('Your courses or preferences have changed. Apply your preferences again to get an updated suggestion.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Applying & finding routines…';
    try {
      applySuggestedChanges(changes);
      await applySchedulingPreferences(source);
    } finally {
      // A fresh failed search may have supplied a new suggestion.
      if (button.disabled) panel.hidden = true;
    }
  };
};

// Reset All Filters
function resetAllFilters() {
  setAllowedDays();
  document.getElementById('fixed-slots-list').replaceChildren();
  document.getElementById('add-fixed-slot').disabled = false;
  document.getElementById('max-classes-per-day').value = '';
  const campusDays = document.getElementById('campus-days');
  if (campusDays) campusDays.value = '';
  if (earliestInput) earliestInput.value = '';
  if (latestInput) latestInput.value = '';
  if (earliestSelect) earliestSelect.value = '';
  if (latestSelect) latestSelect.value = '';
  earliestInput?.classList.add('hidden');
  latestInput?.classList.add('hidden');
  const minGap = document.getElementById('min-gap-select');
  if (minGap) minGap.value = '';
  renderGlobalFacultyChecklist();
  updateActiveFiltersBadge();
  refreshPreferenceSummary();
  if (catalog) persistCatalog();
}
window.resetAllFilters = resetAllFilters;

if (btnResetFilters) {
  btnResetFilters.addEventListener('click', resetAllFilters);
}

function renderRoutinePriorityNote(report) {
  const note = document.getElementById('routine-priority-note');
  if (!note) return;
  const matches = report?.priority_matches || [];
  note.hidden = !matches.length;
  const list = document.getElementById('routine-priority-matches');
  list.replaceChildren();
  if (!matches.length) return;
  const facultyFirst = matches.filter(item => item.faculty_rank === 1).length;
  const sectionChoices = matches.filter(item => item.has_section_priority);
  const sectionFirst = sectionChoices.filter(item => item.section_rank === 1).length;
  document.getElementById('routine-priority-summary').textContent =
    `Priority match · Faculty #1: ${facultyFirst}/${matches.length}` +
    (sectionChoices.length ? ` · Section #1: ${sectionFirst}/${sectionChoices.length}` : '');
  for (const item of matches) {
    const row = document.createElement('li');
    row.textContent = `${item.course_name.split(' — ')[0]}: ${item.faculty} (${item.faculty_rank ? `#${item.faculty_rank}` : 'fallback'}) · Section ${item.section}` +
      (item.has_section_priority ? ` (${item.section_rank ? `#${item.section_rank}` : 'fallback'})` : ' (unranked)');
    list.append(row);
  }
}

window.renderPreferenceReport = function(index) {
  const panel = document.getElementById('preference-report');
  const report = window.schedulePreferenceReports?.[index];
  renderRoutinePriorityNote(report);
  if (!panel) return;
  panel.hidden = !report;
  if (!report) return;
  document.getElementById('preference-report-title').textContent = report.exact_match
    ? 'Matches all your preferences'
    : `Alternative · ${report.faculty_mismatches ? `${report.faculty_mismatches} faculty preference${report.faculty_mismatches === 1 ? '' : 's'} unmet` : 'Preferred faculty retained'} · ${report.outside_minutes} weekly minutes outside your time window`;
  panel.classList.toggle('preference-alternative', !report.exact_match);
  const list = document.getElementById('preference-report-list');
  if (list) {
    list.replaceChildren();
    for (const text of [...(window.scheduleAvailabilityNotices || []), ...report.warnings]) {
      const item = document.createElement('li');
      item.textContent = text;
      list.append(item);
    }
  }
};

refreshPreferenceSummary();

window.renderCourseConflicts = function(conflicts) {
  const panel = document.getElementById('course-conflicts');
  panel.replaceChildren();
  panel.hidden = !conflicts.length;
  for (const conflict of conflicts) {
    const card = document.createElement('article');
    const heading = document.createElement('h4');
    heading.textContent = conflict.message;
    card.append(heading);
    const list = document.createElement('ul');
    for (const alternative of conflict.alternatives || []) {
      const item = document.createElement('li');
      item.textContent = alternative;
      list.append(item);
    }
    const note = document.createElement('p');
    note.textContent = conflict.note;
    card.append(list, note);
    panel.append(card);
  }
};
