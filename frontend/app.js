// State Management
let courses = [];
let nextCourseId = 1;
let optimizedSchedules = [];
let selectedScheduleIndex = 0;

// Configs for Calendar Rendering
const START_MINS = 8 * 60 + 30; // 08:30
const END_MINS = 20 * 60 + 30;  // 20:30
const TOTAL_MINS = END_MINS - START_MINS; // 720 mins (12 hours)

// DOM elements
const courseListContainer = document.getElementById('course-list-container');
const btnAddCourse = document.getElementById('btn-add-course');
const btnOptimize = document.getElementById('btn-optimize');
const btnDemo = document.getElementById('btn-demo');
const btnDownloadSchedule = document.getElementById('btn-download-schedule');
const emptyState = document.getElementById('empty-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const resultsView = document.getElementById('results-view');
const combinationsCount = document.getElementById('combinations-count');
const optionSelectorContainer = document.getElementById('option-selector-container');
const calendarTimeHeader = document.getElementById('calendar-time-header');
const courseCountBadge = document.getElementById('course-count');

// Details Modal DOM Elements
const detailsModal = document.getElementById('details-modal');
const modalClose = document.getElementById('modal-close');
const modalBtnOk = document.getElementById('modal-btn-ok');
const modalCourseName = document.getElementById('modal-course-name');
const modalSectionName = document.getElementById('modal-section-name');
const modalFacultyName = document.getElementById('modal-faculty-name');
const modalRoomName = document.getElementById('modal-room-name');
const modalScheduleSlots = document.getElementById('modal-schedule-slots');

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

  const originalLabel = btnDownloadSchedule.innerHTML;
  btnDownloadSchedule.disabled = true;
  btnDownloadSchedule.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting...';

  try {
    const canvas = await html2canvas(exportTarget, {
      backgroundColor: '#080B11',
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
        clonedTarget.style.overflow = 'visible';
        clonedTarget.style.webkitFontSmoothing = 'antialiased';
        clonedTarget.style.textRendering = 'geometricPrecision';

        clonedDocument.querySelectorAll('.calendar-header-row').forEach((node) => {
          node.style.fontSize = '0.95rem';
          node.style.padding = '16px 0';
        });

        clonedDocument.querySelectorAll('.day-row-label').forEach((node) => {
          node.style.fontSize = '0.92rem';
          node.style.minHeight = '110px';
        });

        clonedDocument.querySelectorAll('.day-row-timeline').forEach((node) => {
          node.style.height = '110px';
        });

        clonedDocument.querySelectorAll('.calendar-time-ticks span, .class-block-horizontal').forEach((node) => {
          node.style.transform = 'none';
          node.style.webkitFontSmoothing = 'antialiased';
          node.style.textRendering = 'geometricPrecision';
        });

        clonedDocument.querySelectorAll('.calendar-time-ticks span').forEach((node) => {
          node.style.fontSize = '0.92rem';
          node.style.fontWeight = '600';
        });

        clonedDocument.querySelectorAll('.class-block-horizontal').forEach((node) => {
          node.style.overflow = 'visible';
          node.style.overflowY = 'visible';
          node.style.overflowX = 'visible';
          node.style.fontSize = '10px';
          node.style.lineHeight = '1.4';
          node.style.alignItems = 'flex-start';
          node.style.justifyContent = 'flex-start';
          node.style.padding = '8px 10px';
          node.style.minHeight = '72px';
          node.style.height = 'auto';
          node.style.boxSizing = 'border-box';
          node.style.borderRadius = '10px';
        });

        clonedDocument.querySelectorAll('.class-block-horizontal > div').forEach((node) => {
          node.style.lineHeight = '1.4';
          node.style.whiteSpace = 'normal';
          node.style.overflow = 'visible';
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
    const optionNumber = selectedScheduleIndex + 1;
    const timestamp = new Date().toISOString().slice(0, 10);

    link.href = downloadUrl;
    link.download = `uiu-weekly-schedule-option-${optionNumber}-${timestamp}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } catch (err) {
    errorMessage.textContent = err.message || 'Failed to download the weekly calendar grid.';
    errorState.classList.remove('hidden');
  } finally {
    btnDownloadSchedule.innerHTML = originalLabel;
    updateDownloadButtonState();
  }
}

// Initialize Hour lines and labels
function initCalendarHours() {
  calendarTimeHeader.innerHTML = '';
  
  // Clear any existing grid lines in day rows
  const dayTimelines = document.querySelectorAll('.day-row-timeline');
  dayTimelines.forEach(timeline => {
    timeline.innerHTML = '';
  });

  for (let mins = START_MINS; mins <= END_MINS; mins += 60) {
    const hour = Math.floor(mins / 60);
    const minute = mins % 60;
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    // Create header label
    const label = document.createElement('span');
    label.textContent = timeStr;
    calendarTimeHeader.appendChild(label);

    // Create vertical line overlays in each day timeline
    const leftPercent = ((mins - START_MINS) / TOTAL_MINS) * 100;
    
    dayTimelines.forEach(timeline => {
      const line = document.createElement('div');
      line.className = 'vertical-grid-line';
      line.style.left = `${leftPercent}%`;
      timeline.appendChild(line);
    });
  }
}

// Debounce helper to prevent flooding save requests
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
  card.className = 'glass rounded-xl p-4 flex flex-col gap-3 border border-brandBorder bg-brandCard/40 transition-all duration-300 relative group hover:border-indigo-500/40';
  
  card.innerHTML = `
    <div class="flex justify-between items-center">
      <span class="text-xs font-bold text-indigo-400 uppercase tracking-wide">Course Info</span>
      <button class="btn-delete-course text-gray-500 hover:text-red-400 text-xs transition-colors p-1" title="Delete Course">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-[10px] uppercase font-bold text-gray-400">Course Name / PK</label>
      <input type="text" class="course-name-input px-3 py-2 text-xs rounded-lg glass-input w-full" placeholder="e.g. CSE 303" value="${name}">
    </div>
    <div class="flex flex-col gap-1">
      <div class="flex justify-between items-center">
        <label class="text-[10px] uppercase font-bold text-gray-400">Routine Sections Text</label>
        <span class="text-[9px] text-gray-500 font-mono-custom">Day HH:MM-HH:MM</span>
      </div>
      <textarea rows="4" class="course-text-input px-3 py-2 text-xs rounded-lg glass-input w-full font-mono-custom resize-y" placeholder="Paste sections schedule here...">${text}</textarea>
    </div>
  `;

  // Attach deletion handler
  const btnDelete = card.querySelector('.btn-delete-course');
  btnDelete.addEventListener('click', () => {
    removeCourseCard(courseId);
  });

  // Attach change listeners to update states in memory and trigger auto-save
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
  
  // Auto scroll list container
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
    }, 200);
  }
}

// Update badges
function updateCourseCount() {
  courseCountBadge.textContent = `${courses.length} ${courses.length === 1 ? 'Course' : 'Courses'}`;
}

// Load Demo Data
function loadDemoData() {
  // Clear existing
  courseListContainer.innerHTML = '';
  courses = [];
  
  const demoData = [
    {
      name: "CSE 303 (Database)",
      text: "A\nDr. Mohammad Kaykobad\nMonday 09:50-11:10\nWednesday 09:50-11:10\n\nB\nDr. Mohammad Kaykobad\nMonday 11:10-12:30\nWednesday 11:10-12:30"
    },
    {
      name: "CSE 305 (Algorithms)",
      text: "K\nMuhammad Sibgatullah Zunnun\nSunday 12:20-13:40\nWednesday 12:20-13:40\n\nL\nMuhammad Sibgatullah Zunnun\nSunday 13:50-15:10\nWednesday 13:50-15:10"
    },
    {
      name: "CSE 307 (Soft. Eng.)",
      text: "T1\nJohn Smith\nThursday 11:00-13:30\n\nT2\nJohn Smith\nTuesday 09:50-11:10\nThursday 09:50-11:10"
    }
  ];

  demoData.forEach(d => addCourseCard(d.name, d.text, false));
  debouncedSave();
}

// Render schedule on the calendar
function renderCalendarSchedule(schedule) {
  // Reset columns
  initCalendarHours();

  // Color mappings based on course list indices to keep colors persistent
  const courseNames = [...new Set(schedule.map(c => c.course_name))];
  
  schedule.forEach(item => {
    const courseName = item.course_name;
    const section = item.section;
    const colorIndex = courseNames.indexOf(courseName) % 8; // We have 8 colors defined in CSS

    section.slots.forEach(slot => {
      const day = slot.day;
      const row = document.getElementById(`row-${day}`);
      if (!row) return;

      // Check boundary limits
      if (slot.start_mins < START_MINS || slot.end_mins > END_MINS) {
        console.warn(`Class ${courseName} Slot lies outside visible time boundaries: ${slot.start_time}-${slot.end_time}`);
      }

      const leftPercent = ((slot.start_mins - START_MINS) / TOTAL_MINS) * 100;
      const widthPercent = ((slot.end_mins - slot.start_mins) / TOTAL_MINS) * 100;

      const block = document.createElement('div');
      block.className = `class-block-horizontal course-color-${colorIndex}`;
      block.style.left = `${leftPercent}%`;
      block.style.width = `${widthPercent}%`;
      
      block.innerHTML = `
        <div class="font-bold truncate text-[11px] leading-tight">${courseName}</div>
        <div class="text-[9px] opacity-90 truncate font-mono-custom mt-0.5">Sec ${section.name} | ${section.faculty}</div>
        ${section.room ? `<div class="text-[8px] opacity-80 truncate mt-0.5"><i class="fa-solid fa-location-dot"></i> ${section.room}</div>` : ''}
        <div class="text-[8px] opacity-80 mt-0.5"><i class="fa-regular fa-clock"></i> ${slot.start_time}-${slot.end_time}</div>
      `;

      // Simple tooltip hover
      block.title = `${courseName} (Sec ${section.name})\nFaculty: ${section.faculty}\nTime: ${day} ${slot.start_time}-${slot.end_time}`;

      // Open details modal on click
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
    slotDiv.className = 'flex items-center gap-2 mt-1.5 text-xs text-gray-300';
    slotDiv.innerHTML = `<i class="fa-regular fa-clock text-indigo-400"></i> <strong>${slot.day}</strong> ${slot.start_time} - ${slot.end_time}`;
    modalScheduleSlots.appendChild(slotDiv);
  });
  
  detailsModal.classList.remove('hidden');
}

function hideDetailsModal() {
  detailsModal.classList.add('hidden');
}

// Generate selectors for schedules
function renderOptionSelectors() {
  optionSelectorContainer.innerHTML = '';
  
  optimizedSchedules.forEach((sch, idx) => {
    const pill = document.createElement('button');
    pill.className = `px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
      idx === selectedScheduleIndex 
        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10' 
        : 'bg-brandCard text-gray-400 border-brandBorder hover:border-gray-600 hover:text-gray-200'
    }`;
    pill.textContent = `Option ${idx + 1}`;
    pill.addEventListener('click', () => {
      selectedScheduleIndex = idx;
      renderOptionSelectors();
      renderCalendarSchedule(optimizedSchedules[idx]);
    });
    optionSelectorContainer.appendChild(pill);
  });
}

// Show errors
function showError(msg) {
  errorMessage.textContent = msg;
  errorState.classList.remove('hidden');
  resultsView.classList.add('hidden');
  emptyState.classList.add('hidden');
  updateDownloadButtonState();
}

// Optimize Button Actions
async function optimizeRoutine() {
  // Clear states
  errorState.classList.add('hidden');
  
  if (courses.length === 0) {
    showError("Please add at least one course card before running the optimization.");
    return;
  }

  // Build Payload & Validate inputs
  const payloadCourses = [];
  for (const c of courses) {
    const name = c.name.trim();
    const text = c.text.trim();
    
    if (!name) {
      showError("Course Name cannot be empty. Please fill in the Course Name for all cards.");
      return;
    }
    if (!text) {
      showError(`Routine text details for course '${name}' are empty.`);
      return;
    }

    payloadCourses.push({
      course_name: name,
      raw_text: text
    });
  }

  // Set Button loading state
  btnOptimize.disabled = true;
  btnOptimize.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Optimizing...`;

  try {
    const response = await fetch('/api/optimize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ courses: payloadCourses })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || "Server error running optimization algorithm.");
    }

    const data = await response.json();
    optimizedSchedules = data.schedules;
    selectedScheduleIndex = 0;

    if (optimizedSchedules.length === 0) {
      showError("No valid conflict-free combinations could be found for the defined courses. Check for time slot clashes.");
      return;
    }

    // Success State
    emptyState.classList.add('hidden');
    resultsView.classList.remove('hidden');
    combinationsCount.textContent = `Found ${optimizedSchedules.length} conflict-free weekly schedule ${optimizedSchedules.length === 1 ? 'combination' : 'combinations'}.`;
    
    renderOptionSelectors();
    renderCalendarSchedule(optimizedSchedules[0]);
    updateDownloadButtonState();

  } catch (err) {
    showError(err.message);
  } finally {
    btnOptimize.disabled = false;
    btnOptimize.innerHTML = `<i class="fa-solid fa-compass-drafting"></i> Optimize Routine`;
  }
}

// Event Listeners
btnAddCourse.addEventListener('click', () => addCourseCard());
btnOptimize.addEventListener('click', optimizeRoutine);
btnDemo.addEventListener('click', loadDemoData);
btnDownloadSchedule.addEventListener('click', downloadCalendarGrid);

// Modal Event Listeners
modalClose.addEventListener('click', hideDetailsModal);
modalBtnOk.addEventListener('click', hideDetailsModal);
detailsModal.addEventListener('click', (e) => {
  if (e.target === detailsModal) {
    hideDetailsModal();
  }
});

// Initialize layout hours and load saved courses from server
initCalendarHours();
updateDownloadButtonState();

async function loadSavedCourses() {
  try {
    const response = await fetch('/api/courses');
    if (response.ok) {
      const saved = await response.json();
      if (saved && saved.length > 0) {
        // Clear default elements
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
  // If no saved courses or fetch failed, initialize with one empty course card
  addCourseCard('', '', false);
}

loadSavedCourses();
