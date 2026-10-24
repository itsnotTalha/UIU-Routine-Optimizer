let catalog = null;
let selectedCourses = new Map();
let sectionPriorities = new Map();
let catalogRequest = null;
let catalogTotal = 0;
let catalogMetrics = [];
let requestVersion = 0;
let activeProgramFilter = '';


function catalogSelections() {
  return [...selectedCourses].map(([course_id, faculties]) => {
    const course = catalog?.courses.find(c => c.id === course_id);
    const priorities = sectionPriorities.get(course_id) || {};
    return {course_id, faculties: [...faculties], section_priorities: Object.fromEntries(faculties.map(faculty =>
      [faculty, (Array.isArray(priorities[faculty]) ? priorities[faculty] : []).filter(name =>
        course?.sections.some(section => section.faculty === faculty && section.name === name))]))};
  });
}

function renderSectionPriorities(course, faculties) {
  const container = document.createElement('div');
  container.className = 'section-priorities';
  for (const faculty of faculties) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${faculty} · Section priority`;
    group.append(legend);
    const hint = document.createElement('p');
    hint.textContent = 'Choose sections in priority order. Others remain available as fallbacks. Click again to remove a priority.';
    group.append(hint);
    const priorities = catalogSelections().find(s => s.course_id === course.id)?.section_priorities[faculty] || [];
    for (const section of course.sections.filter(s => s.faculty === faculty)) {
      const button = document.createElement('button');
      button.type = 'button';
      const rank = priorities.indexOf(section.name);
      button.className = `faculty-pill section-priority-choice${rank >= 0 ? ' active' : ''}`;
      button.setAttribute('aria-pressed', String(rank >= 0));
      button.textContent = `${rank >= 0 ? `#${rank + 1} · ` : ''}Section ${section.name} · ${section.slots.map(s => `${s.day} ${s.start_time}–${s.end_time}`).join(' / ')}`;
      button.onclick = event => {
        event.stopPropagation();
        const current = catalogSelections().find(s => s.course_id === course.id)?.section_priorities[faculty] || [];
        const updated = current.includes(section.name) ? current.filter(name => name !== section.name) : [...current, section.name];
        sectionPriorities.set(course.id, {...sectionPriorities.get(course.id), [faculty]: updated});
        invalidateCatalogResults();
        persistCatalog();
        renderCatalogList();
        renderSelectedCourses();
      };
      group.append(button);
    }
    container.append(group);
  }
  return container;
}

const pdfInput = document.getElementById('routine-pdf');
const pdfButton = document.getElementById('btn-optimize-pdf');
const importStatus = document.getElementById('import-status');
const searchInput = document.getElementById('catalog-search');
const btnClearSearch = document.getElementById('btn-clear-search');
const pdfDropzone = document.getElementById('pdf-dropzone');
const pdfActiveCard = document.getElementById('pdf-active-card');
const pdfFileName = document.getElementById('pdf-file-name');
const pdfFileStats = document.getElementById('pdf-file-stats');
const btnChangePdf = document.getElementById('btn-change-pdf');
const btnClearSelected = document.getElementById('btn-clear-selected');
const pdfProgressOverlay = document.getElementById('pdf-progress-overlay');
const progressBar = document.getElementById('progress-bar');
const progressTitle = document.getElementById('progress-status-title');
const progressDesc = document.getElementById('progress-status-desc');
const pdfOriginBadge = document.getElementById('pdf-origin-badge');
const btnRevertDefault = document.getElementById('btn-revert-default');
const routineSourceBadge = document.getElementById('routine-source-badge');

const btnRoutineDropdown = document.getElementById('btn-routine-dropdown');
const routineDropdownMenu = document.getElementById('routine-dropdown-menu');
const toolbarDropdownChevron = document.getElementById('toolbar-dropdown-chevron');
const toolbarRoutineLabel = document.getElementById('toolbar-routine-label');
const statCoursesCount = document.getElementById('stat-courses-count');
const statSectionsCount = document.getElementById('stat-sections-count');

if (btnRoutineDropdown && routineDropdownMenu) {
  btnRoutineDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = routineDropdownMenu.classList.toggle('hidden');
    btnRoutineDropdown.setAttribute('aria-expanded', String(!isHidden));
    if (toolbarDropdownChevron) {
      toolbarDropdownChevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
    }
  });

  document.addEventListener('click', (e) => {
    if (!routineDropdownMenu.contains(e.target) && !btnRoutineDropdown.contains(e.target)) {
      routineDropdownMenu.classList.add('hidden');
      btnRoutineDropdown.setAttribute('aria-expanded', 'false');
      if (toolbarDropdownChevron) toolbarDropdownChevron.style.transform = 'rotate(0deg)';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      routineDropdownMenu.classList.add('hidden');
      btnRoutineDropdown.setAttribute('aria-expanded', 'false');
      if (toolbarDropdownChevron) toolbarDropdownChevron.style.transform = 'rotate(0deg)';
    }
  });
}

function showProgress(title, desc, percent) {
  if (pdfProgressOverlay) {
    pdfProgressOverlay.classList.remove('hidden');
    if (progressTitle) progressTitle.textContent = title;
    if (progressDesc) progressDesc.textContent = desc;
    if (progressBar) progressBar.style.width = `${Math.min(100, Math.max(5, percent))}%`;
  }
}

function hideProgress() {
  if (pdfProgressOverlay) pdfProgressOverlay.classList.add('hidden');
}

function updateStepper(step) {
  const s1 = document.getElementById('step-nav-1');
  const s2 = document.getElementById('step-nav-2');
  const s3 = document.getElementById('step-nav-3');
  if (!s1 || !s2 || !s3) return;

  const resetClass = (el) => {
    el.className = 'step-item text-[var(--text-muted)] flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-lg';
    const badge = el.querySelector('.step-badge');
    if (badge) badge.className = 'step-badge h-5 w-5 rounded-full bg-[var(--pill-bg)] text-fluid-2xs font-bold flex items-center justify-center';
  };

  resetClass(s1);
  resetClass(s2);
  resetClass(s3);

  if (step >= 1) {
    if (catalog) {
      s1.className = 'step-item completed text-[var(--text-secondary)] flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded-lg';
      const b = s1.querySelector('.step-badge');
      if (b) {
        b.className = 'step-badge h-5 w-5 rounded-full bg-emerald-600 text-white text-fluid-2xs font-bold flex items-center justify-center';
        b.innerHTML = '<i class="fa-solid fa-check text-[10px]"></i>';
      }
    } else {
      s1.className = 'step-item active flex items-center gap-1.5 font-bold px-2 py-0.5 rounded-lg text-[var(--text-primary)]';
      const b = s1.querySelector('.step-badge');
      if (b) {
        b.className = 'step-badge h-5 w-5 rounded-full bg-orange-600 text-white text-fluid-2xs font-bold flex items-center justify-center shadow-md shadow-orange-500/30';
        b.textContent = '1';
      }
    }
  }

  if (step >= 2) {
    if (selectedCourses.size > 0 && step > 2) {
      s2.className = 'step-item completed text-[var(--text-secondary)] flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded-lg';
      const b = s2.querySelector('.step-badge');
      if (b) {
        b.className = 'step-badge h-5 w-5 rounded-full bg-emerald-600 text-white text-fluid-2xs font-bold flex items-center justify-center';
        b.innerHTML = '<i class="fa-solid fa-check text-[10px]"></i>';
      }
    } else {
      s2.className = 'step-item active flex items-center gap-1.5 font-bold px-2 py-0.5 rounded-lg text-[var(--text-primary)]';
      const b = s2.querySelector('.step-badge');
      if (b) {
        b.className = 'step-badge h-5 w-5 rounded-full bg-orange-600 text-white text-fluid-2xs font-bold flex items-center justify-center shadow-md shadow-orange-500/30';
        b.textContent = '2';
      }
    }
  }

  if (step === 3) {
    s3.className = 'step-item active flex items-center gap-1.5 font-bold px-2 py-0.5 rounded-lg text-[var(--text-primary)]';
    const b = s3.querySelector('.step-badge');
    if (b) {
      b.className = 'step-badge h-5 w-5 rounded-full bg-orange-600 text-white text-fluid-2xs font-bold flex items-center justify-center shadow-md shadow-orange-500/30';
      b.textContent = '3';
    }
  }
}

function invalidateCatalogResults() {
  requestVersion++;
  scheduleController?.abort();
  pdfButton.disabled = !selectedCourses.size;
  pdfButton.innerHTML = '<span>Find routines</span><span aria-hidden="true">→</span>';
  btnOptimize.disabled = false;
  catalogRequest = null;
  catalogTotal = 0;
  optimizedSchedules = [];
  resultsView.classList.add('hidden');
  errorState.classList.add('hidden');
  emptyState.classList.remove('hidden');
  document.getElementById('schedule-pagination').hidden = true;
  updateDownloadButtonState();
  updateStepper(catalog ? 2 : 1);
  window.updateWorkspaceBadges?.();
}

function persistCatalog() {
  try {
    localStorage.setItem('uiu-pdf-selection', JSON.stringify({
      id: catalog.id, campus_days: getCampusDays(), ...getSchedulingPreferences(), selections: catalogSelections()
    }));
  } catch (_) { /* Safe fallback */ }
}

function renderProgramFilters() {
  const container = document.getElementById('program-filters');
  if (!container || !catalog) return;

  const programs = [...new Set(catalog.courses.map(c => c.program).filter(Boolean))].sort();
  container.replaceChildren();

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `filter-chip px-3 py-1 rounded-lg text-fluid-xs font-bold transition-all border ${!activeProgramFilter ? 'active' : ''}`;
  allBtn.textContent = 'All Programs';
  allBtn.onclick = () => {
    activeProgramFilter = '';
    renderProgramFilters();
    renderCatalogList();
  };
  container.appendChild(allBtn);

  for (const prog of programs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `filter-chip px-3 py-1 rounded-lg text-fluid-xs font-bold transition-all border ${activeProgramFilter === prog ? 'active' : ''}`;
    btn.textContent = prog;
    btn.onclick = () => {
      activeProgramFilter = activeProgramFilter === prog ? '' : prog;
      renderProgramFilters();
      renderCatalogList();
    };
    container.appendChild(btn);
  }
}

function showCatalog() {
  hideProgress();
  document.getElementById('catalog-panel').hidden = false;
  const count = catalog.courses.reduce((n, c) => n + c.sections.length, 0);
  
  if (statCoursesCount) statCoursesCount.textContent = catalog.courses.length;
  if (statSectionsCount) statSectionsCount.textContent = count;

  const drawerCourses = document.getElementById('drawer-courses-count');
  const drawerSections = document.getElementById('drawer-sections-count');
  const drawerTitle = document.getElementById('drawer-routine-title');
  if (drawerCourses) drawerCourses.textContent = catalog.courses.length;
  if (drawerSections) drawerSections.textContent = count;

  const isDefaultRoutine = Boolean(catalog.is_default || catalog.id === 'default');
  if (toolbarRoutineLabel) {
    toolbarRoutineLabel.textContent = isDefaultRoutine ? 'Fall 2026' : (catalog.filename ? catalog.filename.slice(0, 16) + '…' : 'Custom');
  }

  if (pdfFileName) {
    pdfFileName.textContent = catalog.filename || (isDefaultRoutine ? 'Class Routine with Faculty assign Fall 2026.pdf' : 'routine.pdf');
  }
  if (pdfFileStats) {
    pdfFileStats.textContent = `${catalog.courses.length} courses · ${count} sections imported`;
  }
  if (pdfOriginBadge) {
    if (isDefaultRoutine) {
      pdfOriginBadge.textContent = 'Official';
      pdfOriginBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60';
    } else {
      pdfOriginBadge.textContent = 'Custom';
      pdfOriginBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-950 text-orange-400 border border-orange-800/60';
    }
  }
  if (btnRevertDefault) {
    btnRevertDefault.classList.toggle('hidden', isDefaultRoutine);
  }

  importStatus.textContent = ''; // The active-file banner already shows the import summary.
  
  const warnings = document.getElementById('import-warning-list');
  warnings.replaceChildren();
  for (const warning of (catalog.warnings || [])) {
    const li = document.createElement('li');
    li.textContent = warning;
    warnings.append(li);
  }
  document.getElementById('import-warnings').hidden = !catalog.warnings?.length;
  
  renderProgramFilters();
  populateRoutineTimeDropdowns();
  renderCatalogList();
  renderSelectedCourses();
  updateStepper(2);
}

function formatTimeOption(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function updateTimeFilterPill() {
  const pillLabel = document.getElementById('time-filter-pill-label');
  const start = document.getElementById('earliest-start')?.value;
  const end = document.getElementById('latest-end')?.value;
  if (!pillLabel) return;
  if (start && end) {
    pillLabel.textContent = `${formatTimeOption(start)} – ${formatTimeOption(end)}`;
  } else if (start) {
    pillLabel.textContent = `≥ ${formatTimeOption(start)}`;
  } else if (end) {
    pillLabel.textContent = `≤ ${formatTimeOption(end)}`;
  } else {
    pillLabel.textContent = 'Time: Any';
  }
}
window.updateTimeFilterPill = updateTimeFilterPill;

function populateRoutineTimeDropdowns() {
  const startSelect = document.getElementById('earliest-start-select');
  const endSelect = document.getElementById('latest-end-select');
  if (!startSelect || !endSelect || !catalog) return;

  const rawStarts = new Set();
  const rawEnds = new Set();
  for (const course of catalog.courses) {
    for (const section of course.sections) {
      for (const slot of section.slots) {
        if (slot.start_time) {
          const [hour, minute] = slot.start_time.split(':').map(Number);
          const cutoff = Math.floor((hour * 60 + minute) / 30) * 30;
          rawStarts.add(`${String(Math.floor(cutoff / 60)).padStart(2, '0')}:${String(cutoff % 60).padStart(2, '0')}`);
        }
        if (slot.end_time) {
          // Offer familiar half-hour cutoffs instead of near-identical class endings.
          const [hour, minute] = slot.end_time.split(':').map(Number);
          const cutoff = Math.ceil((hour * 60 + minute) / 30) * 30;
          if (cutoff < 1440) {
            rawEnds.add(`${String(Math.floor(cutoff / 60)).padStart(2, '0')}:${String(cutoff % 60).padStart(2, '0')}`);
          }
        }
      }
    }
  }

  const currentStart = document.getElementById('earliest-start')?.value || '';
  const currentEnd = document.getElementById('latest-end')?.value || '';

  startSelect.innerHTML = '<option value="">Any time</option>';
  for (const t of [...rawStarts].sort()) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = formatTimeOption(t);
    startSelect.appendChild(opt);
  }
  const customStartOpt = document.createElement('option');
  customStartOpt.value = 'custom';
  customStartOpt.textContent = 'Custom time…';
  startSelect.appendChild(customStartOpt);

  endSelect.innerHTML = '<option value="">Any time</option>';
  for (const t of [...rawEnds].sort()) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = formatTimeOption(t);
    endSelect.appendChild(opt);
  }
  const customEndOpt = document.createElement('option');
  customEndOpt.value = 'custom';
  customEndOpt.textContent = 'Custom time…';
  endSelect.appendChild(customEndOpt);

  const startInput = document.getElementById('earliest-start');
  const endInput = document.getElementById('latest-end');

  if (currentStart) {
    if ([...startSelect.options].some(o => o.value === currentStart)) {
      startSelect.value = currentStart;
      startInput?.classList.add('hidden');
    } else {
      startSelect.value = 'custom';
      startInput?.classList.remove('hidden');
    }
  } else {
    startSelect.value = '';
    startInput?.classList.add('hidden');
  }

  if (currentEnd) {
    if ([...endSelect.options].some(o => o.value === currentEnd)) {
      endSelect.value = currentEnd;
      endInput?.classList.add('hidden');
    } else {
      endSelect.value = 'custom';
      endInput?.classList.remove('hidden');
    }
  } else {
    endSelect.value = '';
    endInput?.classList.add('hidden');
  }

  updateTimeFilterPill();
}
window.populateRoutineTimeDropdowns = populateRoutineTimeDropdowns;

// Advanced Course Search, Acronym Engine & Synonym Dictionary
const COURSE_SYNONYMS = {
  'ai': ['artificial intelligence'],
  'ml': ['machine learning'],
  'dl': ['deep learning'],
  'ds': ['data structure', 'data science'],
  'dsa': ['data structure and algorithms', 'data structure'],
  'algo': ['algorithm', 'algorithms', 'data structure and algorithms'],
  'spl': ['structured programming language'],
  'oop': ['object oriented programming'],
  'oops': ['object oriented programming'],
  'aoop': ['advanced object oriented programming'],
  'dld': ['digital logic design'],
  'db': ['database', 'database management'],
  'dbms': ['database management systems', 'database'],
  'os': ['operating systems', 'operating system'],
  'se': ['software engineering'],
  'cn': ['computer networks', 'data communication', 'networking'],
  'net': ['computer networks', 'networking', 'data communication'],
  'network': ['computer networks', 'networking', 'data communication'],
  'networking': ['computer networks', 'networking', 'data communication'],
  'toc': ['theory of computation'],
  'cd': ['compiler design', 'compiler'],
  'compiler': ['compiler design'],
  'cg': ['computer graphics'],
  'graphics': ['computer graphics'],
  'ca': ['computer architecture'],
  'sad': ['system analysis and design'],
  'hci': ['human computer interaction'],
  'nlp': ['natural language processing'],
  'cv': ['computer vision'],
  'dm': ['discrete mathematics'],
  'discrete': ['discrete mathematics'],
  'math': ['discrete mathematics', 'linear algebra', 'calculus', 'coordinate geometry', 'mathematics'],
  'linear': ['linear algebra'],
  'algebra': ['linear algebra'],
  'calc': ['calculus', 'differential and integral calculus'],
  'calculus': ['calculus', 'differential and integral calculus'],
  'stat': ['statistics', 'probability and statistics'],
  'stats': ['statistics', 'probability and statistics'],
  'statistics': ['probability and statistics', 'statistics'],
  'prob': ['probability and statistics'],
  'probability': ['probability and statistics'],
  'phy': ['physics'],
  'physics': ['physics'],
  'chem': ['chemistry'],
  'chemistry': ['chemistry'],
  'bio': ['biology', 'biology for engineers'],
  'biology': ['biology for engineers', 'biology'],
  'eng': ['english', 'basic functional english'],
  'english': ['english', 'basic functional english'],
  'bangla': ['history of the emergence of bangladesh'],
  'bangladesh': ['history of the emergence of bangladesh'],
  'heb': ['history of the emergence of bangladesh'],
  'history': ['history of the emergence of bangladesh'],
  'acc': ['accounting', 'financial and managerial accounting'],
  'accounting': ['financial and managerial accounting', 'accounting'],
  'fma': ['financial and managerial accounting'],
  'econ': ['economics', 'engineering economics'],
  'economics': ['engineering economics', 'economics'],
  'soc': ['sociology'],
  'sociology': ['sociology'],
  'ethics': ['professional ethics', 'cyber ethics'],
  'micro': ['microprocessors', 'microcontrollers', 'microprocessor and microcontroller'],
  'mp': ['microprocessors', 'microprocessor and microcontroller'],
  'circuit': ['electrical circuits', 'electronic devices and circuits'],
  'circuits': ['electrical circuits', 'electronic devices and circuits'],
  'edc': ['electronic devices and circuits'],
  'logic': ['digital logic design'],
  'lab': ['laboratory']
};

const STOP_WORDS = new Set(['and', 'of', 'for', 'the', 'in', 'to', 'with', 'a', 'an']);

function getCourseAcronyms(title) {
  const clean = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  const sigWords = words.filter(w => !STOP_WORDS.has(w));
  
  const fullAcronym = words.map(w => w[0]).join('');
  const sigAcronym = sigWords.map(w => w[0]).join('');
  const results = new Set([fullAcronym, sigAcronym]);
  
  // Non-laboratory variation (e.g. "Structured Programming Language Laboratory" -> "spl")
  const nonLab = sigWords.filter(w => w !== 'laboratory' && w !== 'lab');
  if (nonLab.length > 1) {
    results.add(nonLab.map(w => w[0]).join(''));
  }
  
  return [...results].filter(a => a && a.length >= 2);
}

function scoreCourse(course, query) {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const qCompact = q.replace(/[\s\-_]/g, '');
  const code = course.code.toLowerCase();
  const codeCompact = code.replace(/[\s\-_]/g, '');
  const title = course.title.toLowerCase();
  const program = (course.program || '').toLowerCase();
  const acronyms = getCourseAcronyms(course.title);

  // 1. Exact code match (e.g. "CSE 1111", "cse1111", "1111")
  if (code === q || codeCompact === qCompact) return 100;
  if (code.startsWith(q) || codeCompact.startsWith(qCompact)) return 85;

  // 2. Exact acronym match (e.g. "ai" matches "Artificial Intelligence")
  if (acronyms.includes(q)) return 95;

  // 3. Synonym / Keyword match (e.g. "ai", "dsa", "spl", "oop", "algo", "dbms")
  const syns = COURSE_SYNONYMS[q] || [];
  for (const syn of syns) {
    if (title.includes(syn)) return 90;
  }

  // 4. Exact title phrase
  if (title === q) return 92;
  if (title.startsWith(q)) return 80;

  // 5. Title word match
  const titleWords = title.split(/\s+/);
  if (titleWords.some(w => w === q)) return 78;
  if (titleWords.some(w => w.startsWith(q))) return 68;

  // 6. Multi-token match: all words in query must match
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    let allMatched = true;
    let tokenScore = 50;
    for (const t of tokens) {
      const tCompact = t.replace(/[\s\-_]/g, '');
      const tSyns = COURSE_SYNONYMS[t] || [];
      const match = 
        code.includes(t) ||
        codeCompact.includes(tCompact) ||
        title.includes(t) ||
        program.includes(t) ||
        acronyms.includes(t) ||
        tSyns.some(s => title.includes(s));
      
      if (!match) {
        allMatched = false;
        break;
      }
      tokenScore += 8;
    }
    if (allMatched) return tokenScore;
  }

  // 7. Substring match for longer queries (3+ chars)
  if (q.length >= 3) {
    if (title.includes(q)) return 50;
    if (code.includes(q)) return 45;
  }

  return 0;
}

function renderCatalogList() {
  const list = document.getElementById('catalog-list');
  const existing = new Map([...list.children].map(node => [node.dataset.courseId, node]));
  const fragment = document.createDocumentFragment();
  const scrollPositions = [list, document.body, document.documentElement].map(node => [node, node.scrollTop]);
  const focused = document.activeElement;
  const focusedCourse = focused.closest('[data-course-id]')?.dataset.courseId;
  const focusedText = focused.textContent;

  const query = searchInput.value.trim().toLowerCase();
  
  let candidates = catalog.courses;
  if (document.getElementById('selected-only')?.getAttribute('aria-pressed') === 'true') {
    candidates = candidates.filter(c => selectedCourses.has(c.id));
  }
  if (activeProgramFilter) {
    candidates = candidates.filter(c => c.program === activeProgramFilter || selectedCourses.has(c.id));
  }

  let matches = [];
  if (query) {
    matches = candidates
      .map(course => ({ course, score: scoreCourse(course, query) }))
      .filter(item => item.score > 0)
      .sort((a, b) => {
        const aSel = selectedCourses.has(a.course.id) ? 1 : 0;
        const bSel = selectedCourses.has(b.course.id) ? 1 : 0;
        if (aSel !== bSel) return bSel - aSel;
        return b.score - a.score;
      })
      .map(item => item.course);
  } else {
    // Automatically place all selected courses on top for instant access
    const selected = [];
    const unselected = [];
    for (const course of candidates) {
      if (selectedCourses.has(course.id)) {
        selected.push(course);
      } else {
        unselected.push(course);
      }
    }
    const selectionOrder = [...selectedCourses.keys()];
    selected.sort((a, b) => selectionOrder.indexOf(a.id) - selectionOrder.indexOf(b.id));
    matches = [...selected, ...unselected];
  }

  document.getElementById('catalog-count').textContent = `${matches.length} courses shown · ${selectedCourses.size} selected`;
  document.getElementById('catalog-search-status').textContent = `${matches.length} ${query ? 'results' : 'courses'} · ${selectedCourses.size} selected`;
  
  if (btnClearSearch) {
    btnClearSearch.classList.toggle('hidden', !query);
  }

  let renderedSelectedHeader = false;
  let renderedAvailableHeader = false;

  for (const course of matches) {
    const isSelected = selectedCourses.has(course.id);
    const acronyms = getCourseAcronyms(course.title);
    const matchedAcronym = query && (acronyms.includes(query) || (COURSE_SYNONYMS[query] && COURSE_SYNONYMS[query].some(s => course.title.toLowerCase().includes(s))));

    if (!query && selectedCourses.size > 0) {
      if (isSelected && !renderedSelectedHeader) {
        const header = document.createElement('div');
        header.className = 'catalog-section-header flex items-center justify-between text-fluid-2xs font-extrabold uppercase tracking-wider text-orange-500 pt-1 pb-0.5 px-1';
        header.innerHTML = `
          <span class="flex items-center gap-1.5"><i class="fa-solid fa-circle-check text-orange-500 text-xs"></i> Selected Courses (${selectedCourses.size})</span>
          <span class="text-fluid-2xs text-[var(--text-muted)] font-medium normal-case">Configured on top</span>
        `;
        fragment.appendChild(header);
        renderedSelectedHeader = true;
      } else if (!isSelected && !renderedAvailableHeader) {
        const header = document.createElement('div');
        header.className = 'catalog-section-header flex items-center justify-between text-fluid-2xs font-extrabold uppercase tracking-wider text-[var(--text-muted)] pt-3 pb-0.5 px-1 border-t border-brandBorder/60';
        header.innerHTML = `
          <span class="flex items-center gap-1.5"><i class="fa-solid fa-layer-group text-xs"></i> Available Courses</span>
          <span class="text-fluid-2xs text-[var(--text-muted)] font-medium normal-case">${candidates.length - selectedCourses.size} courses</span>
        `;
        fragment.appendChild(header);
        renderedAvailableHeader = true;
      }
    }

    const renderKey = JSON.stringify([catalog.id, sectionPriorities.get(course.id), selectedCourses.get(course.id) ?? null, matchedAcronym ? query : '']);
    const previous = existing.get(course.id);
    if (previous?.dataset.renderKey === renderKey) {
      fragment.appendChild(previous);
      continue;
    }
    const card = document.createElement('div');
    card.dataset.courseId = course.id;
    card.dataset.renderKey = renderKey;
    card.className = `catalog-course-item flex flex-col gap-2 p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
      isSelected ? 'selected active-course' : ''
    }`;

    // Top row with course info and checkbox
    const topRow = document.createElement('div');
    topRow.className = 'flex items-center justify-between gap-3 w-full';
    topRow.tabIndex = 0;
    topRow.setAttribute('role', 'button');
    topRow.setAttribute('aria-pressed', String(isSelected));
    topRow.setAttribute('aria-label', `${course.code}: ${course.title}`);
    topRow.addEventListener('keydown', event => {
      if (event.target === topRow && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); topRow.click();
      }
    });
    topRow.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          isSelected ? 'bg-orange-600 text-white shadow-sm' : 'border border-[var(--border-color)] bg-[var(--pill-bg)] text-transparent'
        }">
          <i class="fa-solid fa-check text-xs"></i>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-fluid-xs font-mono-custom text-[var(--text-primary)] tracking-tight">${escapeHtml(course.code)}</span>
            <span class="text-fluid-2xs px-2 py-0.5 rounded font-bold bg-[var(--pill-bg)] text-[var(--text-secondary)] border border-brandBorder">${escapeHtml(course.program)}</span>
            ${matchedAcronym ? `<span class="text-fluid-2xs px-1.5 py-0.2 rounded font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center gap-1"><i class="fa-solid fa-wand-magic-sparkles text-[9px]"></i> ${escapeHtml(query.toUpperCase())}</span>` : ''}
          </div>
          <p class="text-fluid-xs text-[var(--text-secondary)] font-medium truncate mt-0.5" title="${escapeHtml(course.title)}">${escapeHtml(course.title)}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span class="text-fluid-2xs font-bold text-[var(--text-secondary)] whitespace-nowrap px-2.5 py-1 rounded-lg bg-[var(--pill-bg)] border border-brandBorder">
          ${course.sections.length} ${course.sections.length === 1 ? 'sec' : 'secs'}
        </span>
        ${isSelected ? `<button type="button" class="mobile-remove-btn text-xs text-[var(--text-muted)] hover:text-red-400 p-1"><i class="fa-solid fa-xmark"></i></button>` : ''}
      </div>
    `;

    card.addEventListener('click', (e) => {
      // Prevent toggling when clicking inside mobile faculty preference pills
      if (e.target.closest('.mobile-faculty-wrapper')) return;
      const willSelect = !selectedCourses.has(course.id);
      if (selectedCourses.has(course.id)) {
        selectedCourses.delete(course.id);
      } else {
        if (selectedCourses.size >= 12) {
          alert('You can select a maximum of 12 courses.');
          return;
        }
        selectedCourses.set(course.id, []);
      }
      invalidateCatalogResults();
      persistCatalog();
      renderCatalogList();
      renderSelectedCourses();
      if (willSelect) {
        const targetCard = list.querySelector(`[data-course-id="${course.id}"]`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });

    card.appendChild(topRow);

    // If selected, render faculty preference chips for mobile/tablet (hidden on desktop)
    if (isSelected) {
      const preferences = selectedCourses.get(course.id) || [];
      const facultyWrapper = document.createElement('div');
      facultyWrapper.className = 'mobile-faculty-wrapper w-full mt-1 pt-2 border-t border-brandBorder flex flex-col gap-1.5';

      const facultyHeader = document.createElement('div');
      const priorityLabel = preferences.length > 1 
        ? `${preferences.length} selected (Priority: #${preferences.map((_, i) => i + 1).join(' > #')})` 
        : (preferences.length === 1 ? '1 selected (Priority #1)' : 'All allowed');
      facultyHeader.className = 'flex items-center justify-between text-[11px]';
      facultyHeader.innerHTML = `
        <span class="font-bold uppercase tracking-wider text-[var(--text-muted)]">Preferred Faculty:</span>
        <span class="text-orange-500 font-semibold">${priorityLabel}</span>
      `;
      facultyWrapper.appendChild(facultyHeader);

      const pillsRow = document.createElement('div');
      pillsRow.className = 'flex flex-wrap gap-1.5 items-center';

      const availableFaculties = [...new Set(course.sections.map(s => s.faculty))].sort();

      // All Faculty pill
      const allPill = document.createElement('button');
      allPill.type = 'button';
      allPill.className = `faculty-pill px-2.5 py-1 rounded-lg text-fluid-2xs font-bold border transition-all ${
        preferences.length === 0 ? 'active' : ''
      }`;
      allPill.setAttribute('aria-pressed', String(preferences.length === 0));
      allPill.textContent = 'All Faculty';
      allPill.onclick = (e) => {
        e.stopPropagation();
        selectedCourses.set(course.id, []);
        invalidateCatalogResults();
        persistCatalog();
        renderCatalogList();
        renderSelectedCourses();
      };
      pillsRow.appendChild(allPill);

      // Specific Faculty Pills with Priority Badging
      for (const faculty of availableFaculties) {
        const isChecked = preferences.includes(faculty);
        const priorityIndex = isChecked ? preferences.indexOf(faculty) + 1 : 0;
        const facPill = document.createElement('button');
        facPill.type = 'button';
        facPill.setAttribute('aria-pressed', String(isChecked));
        const secCount = course.sections.filter(s => s.faculty === faculty).length;
        facPill.className = `faculty-pill px-2.5 py-1 rounded-lg text-fluid-2xs font-bold border transition-all flex items-center gap-1.5 ${
          isChecked ? 'active' : ''
        }`;
        const badgeHtml = isChecked 
          ? `<span class="priority-badge">#${priorityIndex}</span>` 
          : '';
        facPill.innerHTML = `${badgeHtml}<span>${escapeHtml(faculty)}</span> <span class="text-fluid-2xs opacity-75 font-normal">(${secCount})</span>`;
        facPill.onclick = (e) => {
          e.stopPropagation();
          let updated;
          if (isChecked) {
            updated = preferences.filter(f => f !== faculty);
          } else {
            updated = [...preferences, faculty];
          }
          selectedCourses.set(course.id, updated);
          invalidateCatalogResults();
          persistCatalog();
          renderCatalogList();
          renderSelectedCourses();
        };
        pillsRow.appendChild(facPill);
      }

      facultyWrapper.appendChild(pillsRow);
      facultyWrapper.appendChild(renderSectionPriorities(course, preferences));

      card.appendChild(facultyWrapper);
    }

    fragment.appendChild(card);
  }

  if (!matches.length) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'p-6 text-center text-fluid-xs text-[var(--text-muted)] flex flex-col items-center gap-2 font-medium';
    emptyDiv.innerHTML = '<i class="fa-solid fa-magnifying-glass text-slate-500 text-xl"></i> No courses match your search or filter.';
    fragment.appendChild(emptyDiv);
  }

  list.replaceChildren(fragment);
  scrollPositions.forEach(([node, top]) => { node.scrollTop = top; });
  if (focusedCourse) {
    const card = [...list.children].find(node => node.dataset.courseId === focusedCourse);
    const target = card && [...card.querySelectorAll('button, [tabindex]')].find(node => node.textContent === focusedText);
    if (target) target.focus({preventScroll: true});
  }

}

function renderSelectedCourses() {
  document.getElementById('catalog-panel').dataset.hasSelections = String(selectedCourses.size > 0);
  renderConstraintFacultySummary();
  window.updateGlobalFacultyPriorityDropdown?.();
  window.updateWorkspaceBadges?.();
  window.syncMobileOptimizeBar?.();
  const container = document.getElementById('selected-courses');
  const scrollTop = container.scrollTop;
  const existing = new Map([...container.children].filter(node => node.dataset.courseId).map(node => [node.dataset.courseId, node]));
  const fragment = document.createDocumentFragment();
  const focused = document.activeElement;
  const focusedCard = focused.closest('.selected-course-card')?.dataset.courseId;
  const focusedFaculty = focused.dataset.facultyChoice;
  const focusedDetails = focused.tagName === 'SUMMARY';
  
  const hasSelections = selectedCourses.size > 0;
  pdfButton.disabled = !hasSelections;
  
  pdfButton.classList.remove('pulse-ready');
  pdfButton.innerHTML = '<span>Find routines</span><span aria-hidden="true">→</span>';

  if (!hasSelections) {
    const empty = document.createElement('p');
    empty.className = 'text-fluid-xs text-[var(--text-muted)] italic py-3 text-center font-medium';
    empty.textContent = 'Search for a course on the left and select it. Your courses and faculty choices will appear here.';
    container.replaceChildren(empty);
    return;
  }

  const selectedArray = [...selectedCourses];
  selectedArray.forEach(([id, preferences], idx) => {
    const course = catalog.courses.find(c => c.id === id);
    if (!course) return;

    const renderKey = JSON.stringify([catalog.id, preferences, sectionPriorities.get(id)]);
    const oldCard = existing.get(id);
    if (oldCard?.dataset.renderKey === renderKey) {
      fragment.append(oldCard);
      return;
    }
    const card = document.createElement('div');
    card.dataset.courseId = id;
    card.dataset.renderKey = renderKey;
    // Preserve the masonry footprint until the changed card has been measured.
    if (oldCard) card.style.gridRowEnd = oldCard.style.gridRowEnd;
    card.className = 'selected-course-card rounded-xl p-3.5 bg-[var(--bg-subtle)] border border-brandBorder flex flex-col gap-2.5 relative transition-all shadow-sm';
    card.style.borderLeft = `4px solid var(--accent, #C2410C)`;

    // Top info bar
    const topBar = document.createElement('div');
    topBar.className = 'selected-course-heading flex items-center justify-between gap-2';
    
    topBar.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="text-fluid-xs font-bold font-mono-custom text-[var(--text-primary)]">${escapeHtml(course.code)}</span>
        <span class="text-fluid-xs text-[var(--text-secondary)] font-medium truncate max-w-[200px]" title="${escapeHtml(course.title)}">${escapeHtml(course.title)}</span>
      </div>
      <button type="button" class="btn-remove-course text-[var(--text-muted)] hover:text-red-500 text-sm p-1 transition-colors" aria-label="Remove ${escapeHtml(course.code)}" title="Remove course">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    topBar.querySelector('.btn-remove-course').onclick = () => {
      selectedCourses.delete(id);
      invalidateCatalogResults();
      persistCatalog();
      renderCatalogList();
      renderSelectedCourses();
    };

    card.appendChild(topBar);

    // Faculty selection pills container
    const facultySection = document.createElement('div');
    facultySection.className = 'flex flex-col gap-1.5';
    
    const priorityLabel = preferences.length ? `${preferences.length} selected` : 'Any faculty';
    const facultyLabel = document.createElement('div');
    facultyLabel.className = 'selected-faculty-heading flex items-center justify-between text-fluid-2xs';
    facultyLabel.innerHTML = `
      <span class="font-bold uppercase tracking-wider text-[var(--text-muted)]">Preferred Faculty:</span>
      <span class="text-orange-500 font-semibold">${priorityLabel}</span>
    `;
    facultySection.appendChild(facultyLabel);

    const pillsRow = document.createElement('div');
    pillsRow.className = 'flex flex-wrap gap-1.5 items-center';

    const availableFaculties = [...new Set(course.sections.map(s => s.faculty))].sort();

    // "All Faculty" Pill
    const allPill = document.createElement('button');
    allPill.type = 'button';
    allPill.dataset.facultyChoice = '';
    const isAll = preferences.length === 0;
    allPill.className = `faculty-pill px-2.5 py-1 rounded-lg text-fluid-2xs font-bold border transition-all ${
      isAll ? 'active' : ''
    }`;
    allPill.setAttribute('aria-pressed', String(preferences.length === 0));
    allPill.textContent = 'All Faculty';
    allPill.onclick = () => {
      selectedCourses.set(id, []);
      invalidateCatalogResults();
      persistCatalog();
      renderCatalogList();
      renderSelectedCourses();
    };
    pillsRow.appendChild(allPill);

    // Specific Faculty Pills with Priority Badging
    for (const faculty of availableFaculties) {
      const isChecked = preferences.includes(faculty);
      const priorityIndex = isChecked ? preferences.indexOf(faculty) + 1 : 0;
      const facPill = document.createElement('button');
      facPill.type = 'button';
      facPill.dataset.facultyChoice = faculty;
      facPill.setAttribute('aria-pressed', String(isChecked));
      const secCount = course.sections.filter(s => s.faculty === faculty).length;
      facPill.className = `faculty-pill px-2.5 py-1 rounded-lg text-fluid-2xs font-bold border transition-all flex items-center gap-1.5 ${
        isChecked ? 'active' : ''
      }`;
      const badgeHtml = isChecked 
        ? `<span class="priority-badge">#${priorityIndex}</span>` 
        : '';
      facPill.innerHTML = `${badgeHtml}<span>${escapeHtml(faculty)}</span> <span class="text-fluid-2xs opacity-75 font-normal">(${secCount})</span>`;
      facPill.onclick = () => {
        let updated;
        if (isChecked) {
          updated = preferences.filter(f => f !== faculty);
        } else {
          updated = [...preferences, faculty];
        }
        selectedCourses.set(id, updated);
        invalidateCatalogResults();
        persistCatalog();
        renderCatalogList();
        renderSelectedCourses();
      };
      pillsRow.appendChild(facPill);
    }
    facultySection.appendChild(pillsRow);
    facultySection.appendChild(renderSectionPriorities(course, preferences));

    card.appendChild(facultySection);

    // Collapsible Section Details
    const details = document.createElement('details');
    details.className = 'text-fluid-2xs text-[var(--text-muted)] border-t border-brandBorder/60 pt-2 mt-1';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer text-orange-500 font-bold hover:text-orange-600';
    summary.textContent = `View ${course.sections.length} sections & schedule times`;
    details.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'mt-2 space-y-1.5 pl-1 max-h-28 overflow-y-auto';
    const populateDetails = () => {
      if (!details.open || list.childElementCount) return;
      for (const sec of course.sections) {
        const p = document.createElement('p');
        p.className = 'text-[var(--text-secondary)] font-medium';
        p.innerHTML = `<strong class="text-[var(--text-primary)] font-bold">Sec ${escapeHtml(sec.name)}</strong> (${escapeHtml(sec.faculty)}): ` + 
          sec.slots.map(s => `${escapeHtml(s.day)} ${escapeHtml(s.start_time)}–${escapeHtml(s.end_time)}${s.room ? ` · ${escapeHtml(s.room)}` : ''}`).join('; ');
        list.appendChild(p);
      }
    };
    details.addEventListener('toggle', populateDetails);
    details.open = oldCard?.querySelector('details')?.open || false;
    populateDetails();
    details.appendChild(list);
    card.appendChild(details);

    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
  window.layoutSelectedCourseCards?.();
  container.scrollTop = scrollTop;
  if (focusedCard) {
    const card = [...container.children].find(node => node.dataset.courseId === focusedCard);
    const target = focusedDetails ? card?.querySelector('summary') : [...(card?.querySelectorAll('[data-faculty-choice]') || [])].find(button => button.dataset.facultyChoice === focusedFaculty);
    target?.focus({preventScroll:true});
  }
}

// PDF File Input Listener
pdfInput.addEventListener('change', async () => {
  const file = pdfInput.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    importStatus.textContent = 'PDF must be no larger than 20 MB.';
    return;
  }
  pdfInput.disabled = true;
  pdfButton.disabled = true;
  const version = ++requestVersion;

  // Show animated progress bar
  showProgress('Uploading Custom Routine PDF...', `Reading ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`, 20);

  let progress = 20;
  const progressTimer = setInterval(() => {
    if (progress < 85) {
      progress += Math.floor(Math.random() * 8) + 4;
      if (progressBar) progressBar.style.width = `${progress}%`;
      if (progress > 45 && progressTitle) {
        progressTitle.textContent = 'Parsing timetable & room schedules...';
        progressDesc.textContent = 'Extracting course offerings and faculty assignments...';
      }
    }
  }, 200);

  const form = new FormData();
  form.append('file', file);
  try {
    const response = await fetch('/api/catalogs/import', {method: 'POST', body: form});
    clearInterval(progressTimer);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Import failed.');
    if (version !== requestVersion) return;

    showProgress('Ready!', 'Custom routine imported successfully', 100);
    setTimeout(() => {
      catalog = data;
      catalog.is_default = false;
      selectedCourses = new Map();
      sectionPriorities.clear();
      searchInput.value = '';
      activeProgramFilter = '';
      invalidateCatalogResults();
      persistCatalog();
      showCatalog();
    }, 300);
  } catch (error) {
    clearInterval(progressTimer);
    hideProgress();
    if (catalog) {
      pdfActiveCard.classList.remove('hidden');
    } else {
      pdfDropzone.classList.remove('hidden');
    }
    importStatus.textContent = `${error.message} ${catalog ? 'Your previous routine catalog is still available.' : ''}`;
  } finally {
    pdfInput.disabled = false;
    pdfButton.disabled = !selectedCourses.size;
    pdfInput.value = '';
  }
});

// Dropzone Drag & Drop Handling
if (pdfDropzone) {
  pdfDropzone.addEventListener('click', (e) => {
    pdfInput.click();
  });

  pdfDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    pdfDropzone.classList.add('dragover');
  });

  pdfDropzone.addEventListener('dragleave', () => {
    pdfDropzone.classList.remove('dragover');
  });

  pdfDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    pdfDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      pdfInput.files = e.dataTransfer.files;
      pdfInput.dispatchEvent(new Event('change'));
    }
  });
}

if (btnChangePdf) {
  btnChangePdf.addEventListener('click', () => {
    pdfInput.click();
  });
}

if (btnClearSearch) {
  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    renderCatalogList();
  });
}

if (btnClearSelected) {
  btnClearSelected.addEventListener('click', () => {
    selectedCourses.clear();
    sectionPriorities.clear();
    invalidateCatalogResults();
    persistCatalog();
    renderCatalogList();
    renderSelectedCourses();
  });
}

window.cancelCatalogSearch = function() {
  requestVersion++;
  catalogRequest = null;
};

window.updateScheduleMetrics = function(index) {
  const metric = catalogMetrics[index];
  const metricsEl = document.getElementById('schedule-metrics');
  if (!metricsEl) return;
  if (metric) {
    metricsEl.innerHTML = `<i class="fa-solid fa-calendar-day text-orange-500"></i> ${metric.campus_days} Campus ${metric.campus_days === 1 ? 'Day' : 'Days'} &nbsp;&bull;&nbsp; <i class="fa-solid fa-clock text-orange-500"></i> ${metric.gap_minutes}m Gaps`;
  } else {
    metricsEl.textContent = '';
  }
};

let scheduleController = null;
async function fetchCatalogSchedules(offset = 0) {
  scheduleController?.abort();
  scheduleController = new AbortController();
  const version = ++requestVersion;
  pdfButton.disabled = true;
  btnOptimize.disabled = true;
  document.getElementById('page-prev').disabled = true;
  document.getElementById('page-next').disabled = true;
  pdfButton.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Finding routines…`;
  errorState.classList.add('hidden');
  try {
    const response = await fetch('/api/catalogs/optimize', {
      signal: scheduleController.signal,
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...catalogRequest, offset, limit: 20})
    });
    const data = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Check your time window (start must be before finish) and select between 1 and 12 courses.');
    optimizedSchedules = data.schedules;
    window.optimizedSchedules = data.schedules;
    catalogTotal = data.total;
    catalogMetrics = data.metrics;
    window.schedulePreferenceReports = data.preference_reports || [];
    window.scheduleAvailabilityNotices = data.notices || [];
    window.scheduleOffset = offset;
    selectedScheduleIndex = 0;
    window.selectedScheduleIndex = 0;
    if (!catalogTotal) {
      if (data.preference_advice?.message || data.daily_class_limit?.message) {
        const error = new Error(data.daily_class_limit?.suggested
          ? data.daily_class_limit.message
          : data.preference_advice?.message || data.daily_class_limit.message);
        error.dailyLimit = data.daily_class_limit;
        error.preferenceAdvice = data.preference_advice;
        throw error;
      }
      const noticeText = (data.notices && data.notices.length) ? ` ${data.notices.join(' ')}` : '';
      throw new Error(`No conflict-free routines satisfy your current filters.${noticeText} Try widening your time window, choosing different campus days, or relaxing teacher preferences.`);
    }
    
    emptyState.classList.add('hidden');
    resultsView.classList.remove('hidden');
    const totalCount = catalogTotal || 0;
    const matchCount = data.exact_matches;
    const matchInfo = (matchCount !== undefined && matchCount !== null) 
      ? ` · ${matchCount.toLocaleString()} meet time, teacher and break filters`
      : '';
    combinationsCount.textContent = `Found ${totalCount.toLocaleString()} conflict-free combinations${matchInfo}`;
    document.getElementById('schedule-pagination').hidden = false;
    document.getElementById('page-label').textContent = `${offset + 1}–${offset + optimizedSchedules.length} of ${totalCount.toLocaleString()}`;
    
    if (window.renderOptionSelectors) window.renderOptionSelectors();
    else if (typeof renderOptionSelectors === 'function') renderOptionSelectors();
    renderCalendarSchedule(optimizedSchedules[0]);
    updateScheduleMetrics(0);
    updateDownloadButtonState();
    window.updateWorkspaceBadges?.();
    updateStepper(3);
    setWorkspaceView('schedules');
  } catch (error) {
    if (version === requestVersion) {
      optimizedSchedules = [];
      showError(error.message, 'schedules', error.dailyLimit, 'catalog', error.preferenceAdvice);
    }
  } finally {
    if (version !== requestVersion) return;
    pdfButton.innerHTML = `<span>Find routines</span><span aria-hidden="true">→</span>`;
    pdfButton.disabled = !selectedCourses.size;
    btnOptimize.disabled = false;
    document.getElementById('page-prev').disabled = !catalogRequest || (window.scheduleOffset || 0) === 0;
    document.getElementById('page-next').disabled = !catalogRequest || (window.scheduleOffset || 0) + 20 >= catalogTotal;
  }
}

pdfButton.addEventListener('click', (e) => {
  if (!validateSchedulingPreferences()) return;
  catalogRequest = {
    catalog_id: catalog.id, campus_days: getCampusDays(), ...getSchedulingPreferences(),
    selections: catalogSelections()
  };
  setWorkspaceView('schedules');
  fetchCatalogSchedules();
});

// Conflict/Error card action buttons
const btnErrorResetFilters = document.getElementById('btn-error-reset-filters');
if (btnErrorResetFilters) {
  btnErrorResetFilters.addEventListener('click', () => {
    if (typeof resetAllFilters === 'function') {
      resetAllFilters();
    }
    if (catalog && selectedCourses.size > 0) {
      catalogRequest = {
        catalog_id: catalog.id,
        campus_days: null,
        ...getSchedulingPreferences(),
        selections: catalogSelections()
      };
      setWorkspaceView('schedules');
      fetchCatalogSchedules();
    }
  });
}

const btnErrorToCourses = document.getElementById('btn-error-to-courses');
if (btnErrorToCourses) {
  btnErrorToCourses.addEventListener('click', () => {
    setWorkspaceView('courses');
  });
}

document.getElementById('page-prev').onclick = () => fetchCatalogSchedules(window.scheduleOffset - 20);
document.getElementById('page-next').onclick = () => fetchCatalogSchedules(window.scheduleOffset + 20);
searchInput.oninput = debounce(() => { if (catalog) renderCatalogList(); }, 100);

if (btnRevertDefault) {
  btnRevertDefault.addEventListener('click', async () => {
    localStorage.removeItem('uiu-pdf-selection');
    selectedCourses.clear();
    sectionPriorities.clear();
    await loadDefaultRoutine();
  });
}

async function loadDefaultRoutine() {
  const version = ++requestVersion;
  showProgress('Loading Official Routine...', 'Fetching pre-loaded UIU routine (Fall 2026)...', 35);
  let progress = 35;
  const timer = setInterval(() => {
    if (progress < 90) {
      progress += 12;
      if (progressBar) progressBar.style.width = `${progress}%`;
    }
  }, 120);

  try {
    const response = await fetch('/api/catalogs/default');
    clearInterval(timer);
    if (!response.ok) throw new Error('Official routine catalog is currently unavailable.');
    const data = await response.json();
    if (version !== requestVersion) return;
    catalog = data;
    catalog.is_default = true;
    showProgress('Loaded!', 'All 107 courses ready', 100);
    setTimeout(() => {
      showCatalog();
    }, 200);
  } catch (err) {
    clearInterval(timer);
    hideProgress();
    if (pdfDropzone) pdfDropzone.classList.remove('hidden');
    importStatus.textContent = 'Could not pre-load official routine. Please upload a PDF routine.';
  }
}

// Restore saved catalog on reload, or automatically load default routine
(async function initRoutine() {
  const version = requestVersion;
  try {
    const saved = JSON.parse(localStorage.getItem('uiu-pdf-selection') || 'null');
    if (saved && saved.id) {
      showProgress('Restoring Routine...', 'Loading your previously selected courses...', 40);
      const endpoint = saved.id === 'default' ? '/api/catalogs/default' : `/api/catalogs/${encodeURIComponent(saved.id)}`;
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        if (version !== requestVersion) return;
        catalog = data;
        if (saved.id === 'default') catalog.is_default = true;
        showCatalog();
        restoreSchedulingPreferences(saved);
        document.getElementById('campus-days').value = [2, 3, 4, 5].includes(saved.campus_days) ? String(saved.campus_days) : '';
        refreshPreferenceSummary();
        selectedCourses = new Map((saved.selections || []).filter(s => catalog.courses.some(c => c.id === s.course_id)).map(s => [s.course_id, s.faculties]));
        sectionPriorities = new Map((saved.selections || []).map(s => [s.course_id, s.section_priorities || {}]));
        renderCatalogList();
        renderSelectedCourses();
        return;
      }
    }
  } catch (_) {
    // If error in saved parsing, fallback to default routine
  }

  // Pre-load official routine automatically for immediate zero-click readiness!
  await loadDefaultRoutine();
})();


// One primary action per viewport; both controls use the same request handler.
(function setupOptimizeActions() {
  const mobileBar = document.getElementById('mobile-optimize-bar');
  const mobileBtn = document.getElementById('btn-optimize-pdf-mobile');
  const panel = document.getElementById('catalog-panel');
  const pdfContainer = document.getElementById('pdf-container');
  const nav = document.querySelector('.workspace-nav-bar');
  const mobile = matchMedia('(max-width: 900px)');
  function measureDock() {
    document.body.style.setProperty('--mobile-nav-height', `${nav.getBoundingClientRect().height}px`);
    if (mobileBar.classList.contains('visible')) document.body.style.setProperty('--optimize-dock-height', `${mobileBar.getBoundingClientRect().height}px`);
  }
  function sync() {
    mobileBtn.disabled = pdfButton.disabled;
    mobileBtn.innerHTML = pdfButton.innerHTML;
    const busy = !!pdfButton.querySelector('.animate-spin');
    [pdfButton, mobileBtn].forEach(button => button.setAttribute('aria-busy', String(busy)));
    const count = selectedCourses.size;
    const summary = count ? `${count} ${count === 1 ? 'course' : 'courses'} selected` : 'Choose your courses';
    document.getElementById('optimize-selection-summary').textContent = summary;
    document.getElementById('mobile-optimize-summary').textContent = count ? `${count} ${count === 1 ? 'course' : 'courses'}` : 'Choose courses';
    document.getElementById('optimize-selection-help').textContent = count ? 'Ready to find your clash-free week.' : 'Select at least one course to get started.';
    document.getElementById('mobile-optimize-help').textContent = count ? 'Ready when you are' : 'Select at least one';
  }
  function visibility() {
    const visible = mobile.matches && !panel.hidden && !pdfContainer.classList.contains('hidden') && document.body.dataset.workspace === 'courses';
    mobileBar.classList.toggle('visible', visible);
    document.body.classList.toggle('has-mobile-optimize-bar', visible);
    sync();
    measureDock();
  }
  window.syncMobileOptimizeBar = sync;
  window.updateMobileBarVisibility = visibility;
  new MutationObserver(visibility).observe(panel, {attributes:true, attributeFilter:['hidden']});
  new MutationObserver(visibility).observe(pdfContainer, {attributes:true, attributeFilter:['class']});
  new MutationObserver(visibility).observe(document.body, {attributes:true, attributeFilter:['data-workspace']});
  new MutationObserver(sync).observe(pdfButton, {attributes:true, attributeFilter:['disabled'], childList:true, subtree:true});
  const observer = new ResizeObserver(measureDock);
  observer.observe(nav);
  observer.observe(mobileBar);
  mobile.addEventListener('change', visibility);
  mobileBtn.addEventListener('click', () => pdfButton.click());
  visibility();
})();
