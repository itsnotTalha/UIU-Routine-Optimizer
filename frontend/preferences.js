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

function getSchedulingPreferences() {
  const minGapVal = document.getElementById('min-gap-select')?.value;
  return {
    earliest_start: earliestInput?.value || null,
    latest_end: latestInput?.value || null,
    priority: 'strict',
    min_gap: minGapVal ? Number(minGapVal) : null,
    prioritized_faculties: getGlobalPrioritizedFaculties()
  };
}

function validateSchedulingPreferences() {
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
  let count = 0;
  if (document.getElementById('campus-days')?.value) count++;
  if (earliestInput?.value) count++;
  if (latestInput?.value) count++;
  if (document.getElementById('min-gap-select')?.value) count++;

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
  const {earliest_start, latest_end, min_gap} = getSchedulingPreferences();
  const days = document.getElementById('campus-days')?.value;
  const parts = [];
  if (days) parts.push(`${days} days`);
  if (earliest_start || latest_end) parts.push(`${earliest_start || 'Any'}–${latest_end || 'Any'}`);
  if (min_gap) parts.push(`≥${min_gap}m break`);

  const summaryEl = document.getElementById('preferences-summary');
  if (summaryEl) {
    summaryEl.textContent = parts.length > 0 ? parts.join(' · ') : 'Fine-tune days, time windows, breaks & teachers';
  }
  if (window.updateTimeFilterPill) window.updateTimeFilterPill();
  updateActiveFiltersBadge();
}

function restoreSchedulingPreferences(saved) {
  if (!saved) return;
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
    renderGlobalFacultyChecklist();
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
    container.append(group);
  });
  container.querySelectorAll('.priority-move-actions').forEach(actions => {
    const item = actions.closest('.faculty-rank-row') || actions.closest('.faculty-rank-group');
    actions.children[0].disabled = !item.previousElementSibling;
    actions.children[1].disabled = !item.nextElementSibling;
  });
  window.initPrioritySorting(container, commit);
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

// Apply Filters Action
if (btnApplyFilters) {
  btnApplyFilters.addEventListener('click', () => {
    if (!validateSchedulingPreferences()) return;
    closeFiltersDrawer();
    updateActiveFiltersBadge();
    refreshPreferenceSummary();
    if (typeof fetchCatalogSchedules === 'function' && catalog && selectedCourses.size > 0) {
      catalogRequest = {
        catalog_id: catalog.id,
        campus_days: getCampusDays(),
        ...getSchedulingPreferences(),
        selections: [...selectedCourses].map(([course_id, faculties]) => ({
          course_id,
          faculties: [...faculties]
        }))
      };
      fetchCatalogSchedules();
    } else if (typeof optimizeRoutine === 'function' && courses.length > 0) {
      optimizeRoutine();
    }
  });
}

// Reset All Filters
function resetAllFilters() {
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

window.renderPreferenceReport = function(index) {
  const panel = document.getElementById('preference-report');
  const report = window.schedulePreferenceReports?.[index];
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
