// State Management
let courses = [];
let nextCourseId = 1;
let optimizedSchedules = [];
let selectedScheduleIndex = 0;

// Configs for Calendar Rendering
let START_MINS = 8 * 60 + 30; // 08:30
let END_MINS = 20 * 60 + 30;  // 20:30
let TOTAL_MINS = END_MINS - START_MINS; // 720 mins (12 hours)

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

// DOM Elements
const courseListContainer = document.getElementById('course-list-container');
const btnAddCourse = document.getElementById('btn-add-course');
const btnOptimize = document.getElementById('btn-optimize');
const btnResetAll = document.getElementById('btn-reset-all');
const btnDownloadSchedule = document.getElementById('btn-download-schedule');
const emptyState = document.getElementById('empty-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const resultsView = document.getElementById('results-view');
const combinationsCount = document.getElementById('combinations-count');
const optionSelectorContainer = document.getElementById('option-selector-container');
const calendarTimeHeader = document.getElementById('calendar-time-header');
const courseCountBadge = document.getElementById('course-count');

// Theme Switcher Elements
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const themeToggleIcon = document.getElementById('theme-toggle-icon');

function updateThemeIcon(theme) {
  if (!themeToggleIcon) return;
  if (theme === 'light') {
    themeToggleIcon.className = 'fa-solid fa-moon text-orange-600 text-sm';
    btnThemeToggle.setAttribute('title', 'Switch to Dark Mode');
  } else {
    themeToggleIcon.className = 'fa-solid fa-sun text-amber-400 text-sm';
    btnThemeToggle.setAttribute('title', 'Switch to Light Mode');
  }
}

if (btnThemeToggle) {
  btnThemeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('uiu-theme', newTheme);
    updateThemeIcon(newTheme);
  });
}

// Initialize theme icon on load
updateThemeIcon(document.documentElement.getAttribute('data-theme') || 'dark');

// Tab Mode Elements
const tabPdf = document.getElementById('tab-pdf');
const tabManual = document.getElementById('tab-manual');
const pdfContainer = document.getElementById('pdf-container');
const manualPanel = document.getElementById('manual-panel');

// Details Modal DOM Elements
const detailsModal = document.getElementById('details-modal');
const modalClose = document.getElementById('modal-close');
const modalBtnOk = document.getElementById('modal-btn-ok');
const modalCourseName = document.getElementById('modal-course-name');
const modalSectionName = document.getElementById('modal-section-name');
const modalFacultyName = document.getElementById('modal-faculty-name');
const modalRoomName = document.getElementById('modal-room-name');
const modalScheduleSlots = document.getElementById('modal-schedule-slots');

// Mode Tab Switching
function switchMode(mode) {
  if (mode === 'pdf') {
    if (tabPdf) {
      tabPdf.className = 'flex-1 py-2 px-3 rounded-lg text-fluid-xs font-bold transition-all flex items-center justify-center gap-2 bg-orange-600 text-white shadow-sm';
    }
    if (tabManual) {
      tabManual.className = 'flex-1 py-2 px-3 rounded-lg text-fluid-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-2';
    }
    if (pdfContainer) pdfContainer.classList.remove('hidden');
    if (manualPanel) manualPanel.classList.add('hidden');
  } else {
    if (tabManual) {
      tabManual.className = 'flex-1 py-2 px-3 rounded-lg text-fluid-xs font-bold transition-all flex items-center justify-center gap-2 bg-orange-600 text-white shadow-sm';
    }
    if (tabPdf) {
      tabPdf.className = 'flex-1 py-2 px-3 rounded-lg text-fluid-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center gap-2';
    }
    if (pdfContainer) pdfContainer.classList.add('hidden');
    if (manualPanel) manualPanel.classList.remove('hidden');
  }
}

if (tabPdf) tabPdf.addEventListener('click', () => { switchMode('pdf'); renderConstraintFacultySummary(); });
if (tabManual) tabManual.addEventListener('click', () => { switchMode('manual'); renderConstraintFacultySummary(); });

function updateDownloadButtonState() {
  if (!btnDownloadSchedule) return;
  btnDownloadSchedule.disabled = optimizedSchedules.length === 0;
}

async function downloadCalendarGrid() {
  if (!btnDownloadSchedule || !optimizedSchedules.length) return;

  const exportTarget = document.getElementById('calendar-export-target');
  if (!exportTarget || typeof html2canvas !== 'function') {
    showError('Download is unavailable right now. Please refresh and try again.');
    return;
  }

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const previousCalendarView = document.body.dataset.calendarView;
  document.body.dataset.calendarView = 'grid';
  const originalLabel = btnDownloadSchedule.innerHTML;
  btnDownloadSchedule.disabled = true;
  btnDownloadSchedule.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Exporting...';

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  try {
    const canvas = await html2canvas(exportTarget, {
      backgroundColor: isLight ? '#FFFFFF' : '#111111',
      scale: 2,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
      windowWidth: exportTarget.scrollWidth,
      windowHeight: exportTarget.scrollHeight,
      onclone: (clonedDocument) => {
        const clonedTarget = clonedDocument.getElementById('calendar-export-target');
        if (!clonedTarget) return;

        clonedTarget.style.width = `${exportTarget.scrollWidth}px`;
        clonedTarget.style.maxWidth = 'none';
        // Expand scroll ancestors only in the export clone so all seven days
        // remain in the PNG, even when the on-screen timetable scrolls.
        for (let parent = clonedTarget.parentElement; parent; parent = parent.parentElement) {
          parent.style.overflow = 'visible';
          parent.style.height = 'auto';
          parent.style.maxHeight = 'none';
        }
        clonedTarget.style.height = 'auto';
        clonedTarget.style.minHeight = '0';
        clonedDocument.getElementById('calendar-grid-body').style.flex = 'none';
        clonedDocument.querySelectorAll('.day-row').forEach(node => {
          node.style.flex = 'none';
          node.style.height = '100px';
        });
        clonedTarget.style.overflow = 'visible';
        clonedTarget.style.webkitFontSmoothing = 'antialiased';
        clonedTarget.style.textRendering = 'geometricPrecision';
        clonedTarget.style.backgroundColor = isLight ? '#FFFFFF' : '#111111';

        clonedDocument.querySelectorAll('.calendar-header-row').forEach((node) => {
          node.style.fontSize = '0.95rem';
          node.style.padding = '14px 0';
          node.style.color = isLight ? '#404040' : '#A3A3A3';
        });

        clonedDocument.querySelectorAll('.day-row-label').forEach((node) => {
          node.style.fontSize = '0.92rem';
          node.style.minHeight = '100px';
          node.style.color = isLight ? '#171717' : '#FAFAFA';
        });

        clonedDocument.querySelectorAll('.day-row-timeline').forEach((node) => {
          node.style.height = '100px';
        });

        clonedDocument.querySelectorAll('.calendar-time-ticks span, .class-block-horizontal').forEach((node) => {
          node.style.transform = 'none';
          node.style.webkitFontSmoothing = 'antialiased';
          node.style.textRendering = 'geometricPrecision';
        });

        clonedDocument.querySelectorAll('.calendar-time-ticks span').forEach((node) => {
          node.style.fontSize = '0.9rem';
          node.style.fontWeight = '600';
          node.style.color = isLight ? '#737373' : '#A3A3A3';
        });

        clonedDocument.querySelectorAll('.class-block-horizontal').forEach((node) => {
          node.style.overflow = 'visible';
          node.style.fontSize = '11px';
          node.style.lineHeight = '1.4';
          node.style.alignItems = 'flex-start';
          node.style.justifyContent = 'flex-start';
          node.style.padding = '8px 10px';
          node.style.minHeight = '70px';
          node.style.height = 'auto';
          node.style.boxSizing = 'border-box';
          node.style.borderRadius = '9px';
        });

        clonedDocument.querySelectorAll('.class-block-horizontal > div').forEach(node => {
          node.style.overflow = 'visible';
          node.style.whiteSpace = 'normal';
          node.style.overflowWrap = 'anywhere';
          node.style.lineHeight = '1.6';
          node.style.flex = 'none';
        });

        clonedDocument.querySelectorAll('.glass, .calendar-container').forEach((node) => {
          node.style.backdropFilter = 'none';
          node.style.webkitBackdropFilter = 'none';
        });
      },
    });

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Failed to create the PNG file.'));
        }
      }, 'image/png');
    });

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const optionNumber = selectedScheduleIndex + 1 + (window.scheduleOffset || 0);
    const timestamp = new Date().toISOString().slice(0, 10);
    link.href = downloadUrl;
    link.download = `uiu-weekly-schedule-option-${optionNumber}-${timestamp}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } catch (err) {
    showError(err.message || 'Failed to download the weekly timetable image.');
  } finally {
    document.body.dataset.calendarView = previousCalendarView || 'agenda';
    btnDownloadSchedule.innerHTML = originalLabel;
    updateDownloadButtonState();
  }
}

// Initialize Hour lines and labels
function initCalendarHours() {
  calendarTimeHeader.innerHTML = '';
  
  const dayTimelines = document.querySelectorAll('.day-row-timeline');
  dayTimelines.forEach(timeline => {
    timeline.innerHTML = '';
  });

  for (let mins = START_MINS; mins <= END_MINS; mins += 60) {
    const hour = Math.floor(mins / 60);
    const minute = mins % 60;
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    const label = document.createElement('span');
    label.textContent = timeStr;
    calendarTimeHeader.appendChild(label);

    const leftPercent = ((mins - START_MINS) / TOTAL_MINS) * 100;
    
    dayTimelines.forEach(timeline => {
      const line = document.createElement('div');
      line.className = 'vertical-grid-line';
      line.style.left = `${leftPercent}%`;
      timeline.appendChild(line);
    });
  }
}

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Auto-save courses to backend server
async function saveCoursesToServer() {
  try {
    await fetch('/api/courses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(courses)
    });
  } catch (err) {
    console.error("Failed to auto-save courses to server:", err);
  }
}
const debouncedSave = debounce(saveCoursesToServer, 500);

// Add Course Card
function addCourseCard(name = '', text = '', triggerSave = true) {
  const courseId = nextCourseId++;
  courses.push({ id: courseId, name, text });
  
  const card = document.createElement('div');
  card.id = `course-card-${courseId}`;
  card.className = 'rounded-xl p-3.5 flex flex-col gap-3 border border-brandBorder bg-[var(--bg-subtle)] transition-all duration-200 relative group hover:border-orange-500/50 shadow-sm';
  
  card.innerHTML = `
    <div class="flex justify-between items-center">
      <span class="text-fluid-2xs font-bold text-orange-500 uppercase tracking-wider flex items-center gap-1.5">
        <i class="fa-solid fa-book-bookmark"></i> Course Info
      </span>
      <button class="btn-delete-course text-[var(--text-muted)] hover:text-red-500 text-sm transition-colors p-1" title="Delete Course">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-fluid-2xs uppercase font-bold text-[var(--text-muted)]">Course Name / Code</label>
      <input type="text" class="course-name-input px-3 py-2 text-fluid-xs rounded-lg glass-input w-full font-semibold" placeholder="e.g. CSE 303" value="${escapeHtml(name)}">
    </div>
    <div class="flex flex-col gap-1">
      <div class="flex justify-between items-center">
        <label class="text-fluid-2xs uppercase font-bold text-[var(--text-muted)]">Routine Sections Text</label>
        <span class="text-fluid-2xs text-[var(--text-muted)] font-mono-custom font-semibold">Day HH:MM-HH:MM</span>
      </div>
      <textarea rows="3" class="course-text-input px-3 py-2 text-fluid-xs rounded-lg glass-input w-full font-mono-custom resize-y" placeholder="Paste sections schedule here...">${escapeHtml(text)}</textarea>
    </div>
  `;

  const btnDelete = card.querySelector('.btn-delete-course');
  btnDelete.addEventListener('click', () => {
    removeCourseCard(courseId);
  });

  const nameInput = card.querySelector('.course-name-input');
  nameInput.addEventListener('input', (e) => {
    const idx = courses.findIndex(c => c.id === courseId);
    if (idx !== -1) {
      courses[idx].name = e.target.value;
      debouncedSave();
    }
  });

  const textInput = card.querySelector('.course-text-input');
  textInput.addEventListener('input', (e) => {
    const idx = courses.findIndex(c => c.id === courseId);
    if (idx !== -1) {
      courses[idx].text = e.target.value;
      debouncedSave();
    }
  });

  courseListContainer.appendChild(card);
  updateCourseCount();
  courseListContainer.scrollTop = courseListContainer.scrollHeight;

  if (triggerSave) {
    debouncedSave();
  }
}

// Remove Course Card
function removeCourseCard(id) {
  courses = courses.filter(c => c.id !== id);
  const card = document.getElementById(`course-card-${id}`);
  if (card) {
    card.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      card.remove();
      updateCourseCount();
      debouncedSave();
    }, 150);
  }
}

// Update badges
function updateCourseCount() {
  if (courseCountBadge) {
    courseCountBadge.textContent = `${courses.length} ${courses.length === 1 ? 'Course' : 'Courses'}`;
  }
}

// Render schedule on the calendar
function renderCalendarSchedule(schedule) {
  window.renderMobileSchedule?.(schedule);
  window.renderPreferenceReport?.(selectedScheduleIndex);
  const slots = schedule.flatMap(item => item.section.slots);
  START_MINS = Math.floor(Math.min(...(slots.length ? slots.map(s => s.start_mins) : [510])) / 60) * 60;
  END_MINS = Math.ceil(Math.max(...(slots.length ? slots.map(s => s.end_mins) : [1230])) / 60) * 60;
  TOTAL_MINS = END_MINS - START_MINS;
  initCalendarHours();

  const courseNames = [...new Set(schedule.map(c => c.course_name))];
  
  // Highlight active day rows
  const activeDays = new Set(slots.map(s => s.day));
  ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach(day => {
    const row = document.getElementById(`row-${day}`);
    if (!row) return;
    const parentRow = row.closest('.day-row');
    if (parentRow) {
      if (activeDays.has(day)) {
        parentRow.classList.remove('opacity-40');
      } else {
        parentRow.classList.add('opacity-40');
      }
    }
  });

  schedule.forEach(item => {
    const courseName = item.course_name;
    const section = item.section;
    const colorIndex = courseNames.indexOf(courseName) % 8;

    section.slots.forEach(slot => {
      const day = slot.day;
      const row = document.getElementById(`row-${day}`);
      if (!row) return;

      const leftPercent = ((slot.start_mins - START_MINS) / TOTAL_MINS) * 100;
      const widthPercent = ((slot.end_mins - slot.start_mins) / TOTAL_MINS) * 100;

      const block = document.createElement('div');
      block.setAttribute('role', 'button');
      block.tabIndex = 0;
      block.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); block.click(); }
      });
      block.className = `class-block-horizontal course-color-${colorIndex}`;
      block.style.left = `${leftPercent}%`;
      block.style.width = `${widthPercent}%`;
      
      block.innerHTML = `
        <div class="calendar-course">${escapeHtml(courseName.split(' — ')[0])}</div>
        <div class="calendar-section">Sec ${escapeHtml(section.name)} · ${escapeHtml(section.faculty)}</div>
        <div class="calendar-time">${slot.start_time}–${slot.end_time}</div>
      `;

      block.title = `${courseName} (Sec ${section.name})\nFaculty: ${section.faculty}\nTime: ${day} ${slot.start_time}-${slot.end_time}`;

      block.addEventListener('click', () => {
        showDetailsModal(courseName, section);
      });

      row.appendChild(block);
    });
  });
}

// Modal helper functions
function showDetailsModal(courseName, section) {
  modalCourseName.textContent = courseName;
  modalSectionName.textContent = `Section ${section.name}`;
  modalFacultyName.textContent = section.faculty || 'Not Assigned';
  if (modalRoomName) {
    modalRoomName.textContent = section.room || 'Not Assigned';
  }
  
  modalScheduleSlots.innerHTML = '';
  section.slots.forEach(slot => {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'flex items-center gap-2 mt-1 text-fluid-xs text-[var(--text-secondary)] font-medium';
    slotDiv.innerHTML = `<i class="fa-regular fa-clock text-orange-500"></i> <strong class="text-[var(--text-primary)] font-bold">${escapeHtml(slot.day)}</strong> ${escapeHtml(slot.start_time)} - ${escapeHtml(slot.end_time)} ${slot.room ? ` &bull; Room ${escapeHtml(slot.room)}` : ''}`;
    modalScheduleSlots.appendChild(slotDiv);
  });
  
  detailsModal.classList.remove('hidden');
}

function hideDetailsModal() {
  detailsModal.classList.add('hidden');
}

// Generate selectors for schedules
function renderOptionSelectors() {
  const container = document.getElementById('option-selector-container');
  if (!container) return;
  container.innerHTML = '';
  
  const schedules = (typeof optimizedSchedules !== 'undefined' && Array.isArray(optimizedSchedules)) ? optimizedSchedules : [];
  schedules.forEach((sch, idx) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    const isSelected = idx === selectedScheduleIndex;
    pill.className = `px-3.5 py-1.5 text-fluid-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm flex-shrink-0 cursor-pointer ${
      isSelected 
        ? 'bg-orange-600 text-white border-orange-500 shadow-orange-600/30 ring-2 ring-orange-500/30' 
        : 'bg-[var(--pill-bg)] text-[var(--text-secondary)] border-brandBorder hover:border-neutral-500 hover:text-[var(--text-primary)]'
    }`;
    
    const isBest = idx === 0 && (window.scheduleOffset || 0) === 0;
    pill.innerHTML = `Option ${idx + 1 + (window.scheduleOffset || 0)}${isBest ? ' <span class="text-amber-400 text-fluid-xs">★</span>' : ''}`;
    
    pill.addEventListener('click', () => {
      selectedScheduleIndex = idx;
      renderOptionSelectors();
      renderCalendarSchedule(schedules[idx]);
      if (window.updateScheduleMetrics) window.updateScheduleMetrics(idx);
    });
    container.appendChild(pill);
  });
}
window.renderOptionSelectors = renderOptionSelectors;

// Show errors
function showError(msg, targetWorkspace = 'schedules') {
  setWorkspaceView(targetWorkspace);
  errorMessage.textContent = msg;
  errorState.classList.remove('hidden');
  resultsView.classList.add('hidden');
  emptyState.classList.add('hidden');
  updateDownloadButtonState();
}

// Optimize Routine Action (Manual)
async function optimizeRoutine() {
  if (!validateSchedulingPreferences()) return;
  if (window.cancelCatalogSearch) window.cancelCatalogSearch();
  window.scheduleOffset = 0;
  const pagination = document.getElementById('schedule-pagination');
  if (pagination) pagination.hidden = true;
  optimizedSchedules = [];
  updateDownloadButtonState();
  errorState.classList.add('hidden');
  
  if (courses.length === 0) {
    showError("Please add at least one course before running the optimization.", 'courses');
    return;
  }

  const payloadCourses = [];
  for (const c of courses) {
    const name = c.name.trim();
    const text = c.text.trim();
    
    if (!name) {
      showError("Course Name cannot be empty. Please fill in the Course Name for all cards.", 'courses');
      return;
    }
    if (!text) {
      showError(`Routine text details for course '${name}' are empty.`, 'courses');
      return;
    }

    payloadCourses.push({
      course_name: name,
      raw_text: text
    });
  }

  btnOptimize.disabled = true;
  btnOptimize.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Optimizing...`;

  try {
    const response = await fetch('/api/optimize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ courses: payloadCourses, campus_days: getCampusDays(), ...getSchedulingPreferences() })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || "Server error running optimization algorithm.");
    }

    const data = await response.json();
    optimizedSchedules = data.schedules;
    window.schedulePreferenceReports = data.preference_reports || [];
    window.scheduleAvailabilityNotices = [];
    selectedScheduleIndex = 0;

    if (optimizedSchedules.length === 0) {
      showError(data.daily_class_limit?.message || "No valid conflict-free combinations could be found for the defined courses. Try widening the time window or relaxing filters.", 'schedules');
      return;
    }

    emptyState.classList.add('hidden');
    resultsView.classList.remove('hidden');
    combinationsCount.textContent = `Found ${optimizedSchedules.length} conflict-free ${optimizedSchedules.length === 1 ? 'combination' : 'combinations'}`;
    
    const metricsEl = document.getElementById('schedule-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = `<i class="fa-solid fa-calendar-check text-orange-500"></i> ${courses.length} Courses`;
    }

    renderOptionSelectors();
    renderCalendarSchedule(optimizedSchedules[0]);
    updateDownloadButtonState();
    setWorkspaceView('schedules');

  } catch (err) {
    showError(err.message);
  } finally {
    btnOptimize.disabled = false;
    btnOptimize.innerHTML = `<i class="fa-solid fa-bolt"></i> Optimize Routine`;
  }
}

// Reset All
if (btnResetAll) {
  btnResetAll.addEventListener('click', () => {
    localStorage.removeItem('uiu-pdf-selection');
    window.location.reload();
  });
}

// Event Listeners
btnAddCourse.addEventListener('click', () => addCourseCard());
btnOptimize.addEventListener('click', optimizeRoutine);
btnDownloadSchedule.addEventListener('click', downloadCalendarGrid);

// Modal Event Listeners
modalClose.addEventListener('click', hideDetailsModal);
modalBtnOk.addEventListener('click', hideDetailsModal);
detailsModal.addEventListener('click', (e) => {
  if (e.target === detailsModal) {
    hideDetailsModal();
  }
});

// Initialize layout hours and load saved courses
initCalendarHours();
updateDownloadButtonState();

async function loadSavedCourses() {
  try {
    const response = await fetch('/api/courses');
    if (response.ok) {
      const saved = await response.json();
      if (saved && saved.length > 0) {
        courseListContainer.innerHTML = '';
        courses = [];
        let maxId = 0;
        saved.forEach(c => {
          addCourseCard(c.name, c.text, false);
          if (c.id > maxId) maxId = c.id;
        });
        nextCourseId = maxId + 1;
        return;
      }
    }
  } catch (err) {
    console.error("Failed to load saved courses from server:", err);
  }
  // Initialize with one clean course card if empty
  addCourseCard('', '', false);
}

loadSavedCourses();


function updateWorkspaceBadges() {
  const courseBadge = document.getElementById('tab-course-badge');
  const scheduleBadge = document.getElementById('tab-schedule-badge');
  if (courseBadge) {
    const count = (typeof selectedCourses !== 'undefined' && selectedCourses) ? selectedCourses.size : (typeof courses !== 'undefined' ? courses.length : 0);
    courseBadge.textContent = count;
  }
  if (scheduleBadge) {
    const total = (typeof catalogTotal !== 'undefined' && catalogTotal) ? catalogTotal : (typeof optimizedSchedules !== 'undefined' ? optimizedSchedules.length : 0);
    scheduleBadge.textContent = total;
    scheduleBadge.classList.toggle('hidden', !total);
  }
}
window.updateWorkspaceBadges = updateWorkspaceBadges;

function setWorkspaceView(view) {
  const changed = document.body.dataset.workspace !== view;
  document.body.dataset.workspace = view;
  if (changed && window.matchMedia('(max-width: 900px)').matches) {
    window.scrollTo({top: 0, behavior: 'instant'});
    document.body.scrollTop = 0;
  }
  document.querySelectorAll('[data-workspace]').forEach(button => {
    if (button.tagName === 'BUTTON') {
      const isSelected = button.dataset.workspace === view;
      button.setAttribute('aria-pressed', String(isSelected));
    }
  });
  updateWorkspaceBadges();
}
document.querySelectorAll('button[data-workspace]').forEach(button => {
  button.addEventListener('click', () => setWorkspaceView(button.dataset.workspace));
});
setWorkspaceView('courses');

function getCampusDays() {
  return Number(document.getElementById('campus-days')?.value) || null;
}
