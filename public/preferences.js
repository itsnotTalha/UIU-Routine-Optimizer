const earliestInput = document.getElementById('earliest-start');
const latestInput = document.getElementById('latest-end');
const earliestSelect = document.getElementById('earliest-start-select');
const latestSelect = document.getElementById('latest-end-select');
const priorityInput = document.getElementById('preference-priority');

function getSchedulingPreferences() {
  return {earliest_start: earliestInput.value || null, latest_end: latestInput.value || null, priority: priorityInput.value};
}
function validateSchedulingPreferences() {
  latestInput.setCustomValidity(earliestInput.value && latestInput.value && earliestInput.value >= latestInput.value
    ? 'Finish time must be later than start time.' : '');
  if (!earliestInput.validity.valid || !latestInput.validity.valid) {
    document.getElementById('schedule-preferences').open = true;
    return earliestInput.reportValidity() && latestInput.reportValidity();
  }
  return true;
}
function syncFacultyPriorityInputs(priority) {
  const safePriority = ['strict', 'faculty_first', 'time_first'].includes(priority) ? priority : 'strict';
  if (priorityInput && priorityInput.value !== safePriority) priorityInput.value = safePriority;
  const quickSelect = document.getElementById('quick-faculty-priority');
  if (quickSelect && quickSelect.value !== safePriority) quickSelect.value = safePriority;
  const drawerSelect = document.getElementById('drawer-faculty-priority');
  if (drawerSelect && drawerSelect.value !== safePriority) drawerSelect.value = safePriority;
}

function refreshPreferenceSummary() {
  const {earliest_start, latest_end, priority} = getSchedulingPreferences();
  const labels = {strict:'All preferences', time_first:'Time first', faculty_first:'Faculty first'};
  const days = document.getElementById('campus-days').value;
  document.getElementById('preferences-summary').textContent = `${days ? `Exactly ${days} days` : 'Any'} · ${earliest_start || latest_end ? `${earliest_start || 'Any start'}–${latest_end || 'Any finish'} · ` : ''}${labels[priority]}`;
  document.getElementById('priority-help').textContent = {
    strict:'Only show routines within your time window and selected faculty. Leave either time blank for no limit.',
    time_first:'Minimize minutes outside your time window first, then courses without preferred faculty. Alternatives are labeled. Campus days and class clashes remain strict.',
    faculty_first:'Keep preferred faculty for as many courses as possible first, then minimize minutes outside your time window. Alternatives are labeled. Campus days and class clashes remain strict.'
  }[priority];
  syncFacultyPriorityInputs(priority);
  if (window.updateTimeFilterPill) window.updateTimeFilterPill();
}
function restoreSchedulingPreferences(saved) {
  earliestInput.value = saved.earliest_start || '';
  latestInput.value = saved.latest_end || '';
  priorityInput.value = ['strict','time_first','faculty_first'].includes(saved.priority) ? saved.priority : 'strict';
  if (earliestSelect) {
    if (earliestInput.value && [...earliestSelect.options].some(o => o.value === earliestInput.value)) {
      earliestSelect.value = earliestInput.value;
      earliestInput.classList.add('hidden');
    } else if (earliestInput.value) {
      earliestSelect.value = 'custom';
      earliestInput.classList.remove('hidden');
    } else {
      earliestSelect.value = '';
      earliestInput.classList.add('hidden');
    }
  }
  if (latestSelect) {
    if (latestInput.value && [...latestSelect.options].some(o => o.value === latestInput.value)) {
      latestSelect.value = latestInput.value;
      latestInput.classList.add('hidden');
    } else if (latestInput.value) {
      latestSelect.value = 'custom';
      latestInput.classList.remove('hidden');
    } else {
      latestSelect.value = '';
      latestInput.classList.add('hidden');
    }
  }
  refreshPreferenceSummary();
}
function preferencesChanged() {
  latestInput.setCustomValidity('');
  refreshPreferenceSummary();
  invalidateCatalogResults();
  if (catalog) persistCatalog();
}
[earliestInput, latestInput, priorityInput].forEach(input => input.addEventListener('change', preferencesChanged));

const quickFacultyPriority = document.getElementById('quick-faculty-priority');
if (quickFacultyPriority) {
  quickFacultyPriority.addEventListener('change', (e) => {
    priorityInput.value = e.target.value;
    preferencesChanged();
  });
}

const drawerFacultyPriority = document.getElementById('drawer-faculty-priority');
if (drawerFacultyPriority) {
  drawerFacultyPriority.addEventListener('change', (e) => {
    priorityInput.value = e.target.value;
    preferencesChanged();
  });
}

if (earliestSelect) {
  earliestSelect.addEventListener('change', () => {
    if (earliestSelect.value === 'custom') {
      earliestInput.classList.remove('hidden');
      earliestInput.focus();
    } else {
      earliestInput.classList.add('hidden');
      earliestInput.value = earliestSelect.value;
      preferencesChanged();
    }
  });
}

if (latestSelect) {
  latestSelect.addEventListener('change', () => {
    if (latestSelect.value === 'custom') {
      latestInput.classList.remove('hidden');
      latestInput.focus();
    } else {
      latestInput.classList.add('hidden');
      latestInput.value = latestSelect.value;
      preferencesChanged();
    }
  });
}

const btnToggleTimeFilter = document.getElementById('btn-toggle-time-filter');
if (btnToggleTimeFilter) {
  btnToggleTimeFilter.addEventListener('click', () => {
    const details = document.getElementById('schedule-preferences');
    if (details) {
      details.open = !details.open;
      if (details.open) {
        details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });
}

document.getElementById('clear-time-preferences').onclick = () => {
  earliestInput.value = latestInput.value = '';
  if (earliestSelect) earliestSelect.value = '';
  if (latestSelect) latestSelect.value = '';
  earliestInput.classList.add('hidden');
  latestInput.classList.add('hidden');
  preferencesChanged();
};
window.renderPreferenceReport = function(index) {
  const panel = document.getElementById('preference-report');
  const report = window.schedulePreferenceReports?.[index];
  panel.hidden = !report;
  if (!report) return;
  document.getElementById('preference-report-title').textContent = report.exact_match ? 'Matches all your preferences' : `Alternative · ${report.faculty_mismatches ? `${report.faculty_mismatches} faculty preference${report.faculty_mismatches === 1 ? '' : 's'} unmet` : 'Preferred faculty retained'} · ${report.outside_minutes} weekly minutes outside your time window`;
  panel.classList.toggle('preference-alternative', !report.exact_match);
  const list = document.getElementById('preference-report-list');
  list.replaceChildren();
  for (const text of [...(window.scheduleAvailabilityNotices || []), ...report.warnings]) {
    const item = document.createElement('li');
    item.textContent = text;
    list.append(item);
  }
};
refreshPreferenceSummary();


function renderConstraintFacultySummary() {
  const list = document.getElementById('constraint-faculty-list');
  list.replaceChildren();
  if (!document.getElementById('manual-panel').classList.contains('hidden')) {
    list.textContent = 'Manual routines use the faculty listed in your pasted sections; no separate faculty preferences are selected.';
    return;
  }
  if (!catalog || !selectedCourses.size) {
    list.textContent = 'Select courses and faculty below. Leaving faculty unchecked allows everyone.';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const [id, facultyNames] of selectedCourses) {
    const course = catalog.courses.find(course => course.id === id);
    if (!course) continue;
    const row = document.createElement('div');
    row.className = 'constraint-faculty-row';
    const title = document.createElement('strong');
    title.textContent = `${course.code} · ${course.title} (${course.program})`;
    const names = document.createElement('div');
    names.className = 'constraint-faculty-names';
    if (!facultyNames.length) {
      const chip = document.createElement('span');
      chip.textContent = 'Any faculty — no preference selected';
      names.appendChild(chip);
    } else {
      facultyNames.forEach((name, i) => {
        const chip = document.createElement('span');
        chip.textContent = facultyNames.length > 1 ? `#${i + 1} ${name}` : name;
        if (i === 0 && facultyNames.length > 1) {
          chip.className = 'font-bold text-orange-400';
        }
        names.appendChild(chip);
      });
    }
    row.append(title, names);
    fragment.appendChild(row);
  }
  list.appendChild(fragment);
}


function updateGlobalFacultyPriorityDropdown() {
  const sel = document.getElementById('global-faculty-priority-select');
  if (!sel) return;
  const currentVal = sel.value;
  // Collect all selected faculty names across all selected courses
  const allFaculty = new Set();
  if (typeof selectedCourses !== 'undefined' && catalog) {
    for (const [courseId, prefs] of selectedCourses) {
      const course = catalog.courses.find(c => c.id === courseId);
      if (!course) continue;
      if (prefs.length > 0) {
        prefs.forEach(f => allFaculty.add(f));
      }
    }
  }
  sel.innerHTML = '<option value="">No global preference</option>';
  for (const faculty of [...allFaculty].sort()) {
    const opt = document.createElement('option');
    opt.value = faculty;
    opt.textContent = faculty;
    if (faculty === currentVal) opt.selected = true;
    sel.appendChild(opt);
  }
  // Show/hide the label container based on whether any faculty have been selected
  const label = document.getElementById('global-faculty-priority-label');
  if (label) label.style.display = allFaculty.size > 0 ? '' : 'none';
}
window.updateGlobalFacultyPriorityDropdown = updateGlobalFacultyPriorityDropdown;

// Wire the global faculty priority select to trigger preferencesChanged
document.getElementById('global-faculty-priority-select')?.addEventListener('change', preferencesChanged);

// Initialize visibility on load
updateGlobalFacultyPriorityDropdown();
