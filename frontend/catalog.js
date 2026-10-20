let catalog = null;
let selectedCourses = new Map();
let catalogRequest = null;
let catalogTotal = 0;
let catalogMetrics = [];
let requestVersion = 0;
let activeProgramFilter = '';

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
  setWorkspaceView('courses');
  catalogRequest = null;
  optimizedSchedules = [];
  resultsView.classList.add('hidden');
  errorState.classList.add('hidden');
  emptyState.classList.remove('hidden');
  document.getElementById('schedule-pagination').hidden = true;
  updateDownloadButtonState();
  updateStepper(catalog ? 2 : 1);
}

function persistCatalog() {
  try {
    localStorage.setItem('uiu-pdf-selection', JSON.stringify({
      id: catalog.id, campus_days: getCampusDays(), selections: [...selectedCourses].map(([course_id, faculties]) => ({course_id, faculties}))
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
  document.getElementById('catalog-panel').hidden = false;
  const count = catalog.courses.reduce((n, c) => n + c.sections.length, 0);
  
  if (pdfActiveCard && pdfDropzone) {
    pdfDropzone.classList.add('hidden');
    pdfActiveCard.classList.remove('hidden');
    if (pdfFileName) pdfFileName.textContent = catalog.filename || 'routine.pdf';
    if (pdfFileStats) pdfFileStats.textContent = `${catalog.courses.length} courses · ${count} sections imported`;
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
  renderCatalogList();
  renderSelectedCourses();
  updateStepper(2);
}

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
  list.replaceChildren();
  const query = searchInput.value.trim().toLowerCase();
  
  let candidates = catalog.courses;
  if (activeProgramFilter) {
    candidates = candidates.filter(c => c.program === activeProgramFilter);
  }

  let matches = [];
  if (query) {
    matches = candidates
      .map(course => ({ course, score: scoreCourse(course, query) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.course);
  } else {
    matches = candidates;
  }

  document.getElementById('catalog-count').textContent = `${matches.length} courses shown · ${selectedCourses.size} selected`;
  
  if (btnClearSearch) {
    btnClearSearch.classList.toggle('hidden', !query);
  }

  for (const course of matches) {
    const isSelected = selectedCourses.has(course.id);
    const acronyms = getCourseAcronyms(course.title);
    const matchedAcronym = query && (acronyms.includes(query) || (COURSE_SYNONYMS[query] && COURSE_SYNONYMS[query].some(s => course.title.toLowerCase().includes(s))));

    const card = document.createElement('div');
    card.className = `catalog-course-item flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
      isSelected ? 'selected' : ''
    }`;

    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'border border-[var(--border-color)] bg-[var(--pill-bg)] text-transparent'
        }">
          <i class="fa-solid fa-check text-xs"></i>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-fluid-xs font-mono-custom text-[var(--text-primary)] tracking-tight">${escapeHtml(course.code)}</span>
            <span class="text-fluid-2xs px-2 py-0.5 rounded font-bold bg-[var(--pill-bg)] text-[var(--text-secondary)] border border-brandBorder">${escapeHtml(course.program)}</span>
            ${matchedAcronym ? `<span class="text-fluid-2xs px-1.5 py-0.2 rounded font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center gap-1"><i class="fa-solid fa-wand-magic-sparkles text-[9px]"></i> ${escapeHtml(query.toUpperCase())}</span>` : ''}
          </div>
          <p class="text-fluid-xs text-[var(--text-secondary)] font-medium truncate mt-0.5" title="${escapeHtml(course.title)}">${escapeHtml(course.title)}</p>
        </div>
      </div>
      <span class="text-fluid-2xs font-bold text-[var(--text-secondary)] whitespace-nowrap px-2.5 py-1 rounded-lg bg-[var(--pill-bg)] border border-brandBorder flex-shrink-0">
        ${course.sections.length} ${course.sections.length === 1 ? 'sec' : 'secs'}
      </span>
    `;

    card.addEventListener('click', () => {
      if (selectedCourses.has(course.id)) {
        selectedCourses.delete(course.id);
      } else {
        selectedCourses.set(course.id, []);
      }
      invalidateCatalogResults();
      persistCatalog();
      renderCatalogList();
      renderSelectedCourses();
    });

    list.appendChild(card);
  }

  if (!matches.length) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'p-6 text-center text-fluid-xs text-[var(--text-muted)] flex flex-col items-center gap-2 font-medium';
    emptyDiv.innerHTML = '<i class="fa-solid fa-magnifying-glass text-slate-500 text-xl"></i> No courses match your search or filter.';
    list.appendChild(emptyDiv);
  }
}

function renderSelectedCourses() {
  const container = document.getElementById('selected-courses');
  container.replaceChildren();
  
  const hasSelections = selectedCourses.size > 0;
  pdfButton.disabled = !hasSelections;
  
  if (hasSelections) {
    pdfButton.classList.add('pulse-ready');
  } else {
    pdfButton.classList.remove('pulse-ready');
  }

  if (!hasSelections) {
    const empty = document.createElement('p');
    empty.className = 'text-fluid-xs text-[var(--text-muted)] italic py-3 text-center font-medium';
    empty.textContent = 'Select courses above to configure faculty preferences.';
    container.appendChild(empty);
    return;
  }

  const selectedArray = [...selectedCourses];
  selectedArray.forEach(([id, preferences], idx) => {
    const course = catalog.courses.find(c => c.id === id);
    if (!course) return;

    const card = document.createElement('div');
    card.className = 'rounded-xl p-3.5 bg-[var(--bg-subtle)] border border-brandBorder flex flex-col gap-2.5 relative transition-all shadow-sm';
    card.style.borderLeft = `4px solid var(--accent, #C2410C)`;

    // Top info bar
    const topBar = document.createElement('div');
    topBar.className = 'flex items-center justify-between gap-2';
    
    topBar.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="text-fluid-xs font-bold font-mono-custom text-[var(--text-primary)]">${escapeHtml(course.code)}</span>
        <span class="text-fluid-xs text-[var(--text-secondary)] font-medium truncate max-w-[200px]" title="${escapeHtml(course.title)}">${escapeHtml(course.title)}</span>
      </div>
      <button type="button" class="btn-remove-course text-[var(--text-muted)] hover:text-red-500 text-sm p-1 transition-colors" title="Remove course">
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
    
    const facultyLabel = document.createElement('span');
    facultyLabel.className = 'text-fluid-2xs font-bold uppercase tracking-wider text-[var(--text-muted)]';
    facultyLabel.textContent = 'Preferred Faculty:';
    facultySection.appendChild(facultyLabel);

    const pillsRow = document.createElement('div');
    pillsRow.className = 'flex flex-wrap gap-1.5 items-center';

    const availableFaculties = [...new Set(course.sections.map(s => s.faculty))].sort();

    // "All Faculty" Pill
    const allPill = document.createElement('button');
    allPill.type = 'button';
    const isAll = preferences.length === 0;
    allPill.className = `faculty-pill px-2.5 py-1 rounded-lg text-fluid-2xs font-bold border transition-all ${
      isAll ? 'active' : ''
    }`;
    allPill.textContent = 'All Faculty';
    allPill.onclick = () => {
      selectedCourses.set(id, []);
      invalidateCatalogResults();
      persistCatalog();
      renderSelectedCourses();
    };
    pillsRow.appendChild(allPill);

    // Specific Faculty Pills
    for (const faculty of availableFaculties) {
      const isChecked = preferences.includes(faculty);
      const facPill = document.createElement('button');
      facPill.type = 'button';
      const secCount = course.sections.filter(s => s.faculty === faculty).length;
      facPill.className = `faculty-pill px-2.5 py-1 rounded-lg text-fluid-2xs font-bold border transition-all flex items-center gap-1.5 ${
        isChecked ? 'active' : ''
      }`;
      facPill.innerHTML = `<span>${escapeHtml(faculty)}</span> <span class="text-fluid-2xs opacity-75 font-normal">(${secCount})</span>`;
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
        renderSelectedCourses();
      };
      pillsRow.appendChild(facPill);
    }
    facultySection.appendChild(pillsRow);
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
    for (const sec of course.sections) {
      const p = document.createElement('p');
      p.className = 'text-[var(--text-secondary)] font-medium';
      p.innerHTML = `<strong class="text-[var(--text-primary)] font-bold">Sec ${escapeHtml(sec.name)}</strong> (${escapeHtml(sec.faculty)}): ` + 
        sec.slots.map(s => `${escapeHtml(s.day)} ${escapeHtml(s.start_time)}–${escapeHtml(s.end_time)}${s.room ? ` · ${escapeHtml(s.room)}` : ''}`).join('; ');
      list.appendChild(p);
    }
    details.appendChild(list);
    card.appendChild(details);

    container.appendChild(card);
  });
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
  importStatus.textContent = 'Parsing routine PDF tables…';
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await fetch('/api/catalogs/import', {method: 'POST', body: form});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Import failed.');
    if (version !== requestVersion) return;
    catalog = data;
    selectedCourses = new Map();
    searchInput.value = '';
    activeProgramFilter = '';
    invalidateCatalogResults();
    persistCatalog();
    showCatalog();
  } catch (error) {
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

async function fetchCatalogSchedules(offset = 0) {
  const version = ++requestVersion;
  pdfButton.disabled = true;
  btnOptimize.disabled = true;
  document.getElementById('page-prev').disabled = true;
  document.getElementById('page-next').disabled = true;
  pdfButton.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Finding Combinations...`;
  errorState.classList.add('hidden');
  try {
    const response = await fetch('/api/catalogs/optimize', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...catalogRequest, offset, limit: 20})
    });
    const data = await response.json();
    if (version !== requestVersion) return;
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Please select between 1 and 12 courses.');
    optimizedSchedules = data.schedules;
    catalogTotal = data.total;
    catalogMetrics = data.metrics;
    window.scheduleOffset = offset;
    selectedScheduleIndex = 0;
    if (!catalogTotal) throw new Error('No conflict-free combinations match your selections. Try allowing more faculty, changing campus days to Any number, or removing a conflicting course.');
    
    emptyState.classList.add('hidden');
    resultsView.classList.remove('hidden');
    combinationsCount.textContent = `Found ${catalogTotal.toLocaleString()} conflict-free combinations`;
    document.getElementById('schedule-pagination').hidden = false;
    document.getElementById('page-label').textContent = `${offset + 1}–${offset + optimizedSchedules.length} of ${catalogTotal.toLocaleString()}`;
    
    renderOptionSelectors();
    renderCalendarSchedule(optimizedSchedules[0]);
    updateScheduleMetrics(0);
    updateDownloadButtonState();
    updateStepper(3);
    setWorkspaceView('schedules');
  } catch (error) {
    if (version === requestVersion) {
      optimizedSchedules = [];
      showError(error.message);
    }
  } finally {
    pdfButton.innerHTML = `<i class="fa-solid fa-bolt"></i> Find Clash-Free Routines`;
    pdfButton.disabled = !selectedCourses.size;
    btnOptimize.disabled = false;
    document.getElementById('page-prev').disabled = !catalogRequest || (window.scheduleOffset || 0) === 0;
    document.getElementById('page-next').disabled = !catalogRequest || (window.scheduleOffset || 0) + 20 >= catalogTotal;
  }
}

pdfButton.addEventListener('click', () => {
  catalogRequest = {
    catalog_id: catalog.id, campus_days: getCampusDays(),
    selections: [...selectedCourses].map(([course_id, faculties]) => ({course_id, faculties: [...faculties]}))
  };
  fetchCatalogSchedules();
});

document.getElementById('page-prev').onclick = () => fetchCatalogSchedules(window.scheduleOffset - 20);
document.getElementById('page-next').onclick = () => fetchCatalogSchedules(window.scheduleOffset + 20);
searchInput.oninput = () => { if (catalog) renderCatalogList(); };

// Restore saved catalog on reload
(async function restoreCatalog() {
  const version = requestVersion;
  try {
    const saved = JSON.parse(localStorage.getItem('uiu-pdf-selection') || 'null');
    if (!saved) return;
    const response = await fetch(`/api/catalogs/${encodeURIComponent(saved.id)}`);
    if (!response.ok) throw new Error('Saved PDF routine is unavailable. Please upload it again.');
    const data = await response.json();
    if (version !== requestVersion) return;
    catalog = data;
    document.getElementById('campus-days').value = [3, 4, 5].includes(saved.campus_days) ? String(saved.campus_days) : '';
    selectedCourses = new Map(saved.selections.filter(s => catalog.courses.some(c => c.id === s.course_id)).map(s => [s.course_id, s.faculties]));
    showCatalog();
  } catch (error) {
    if (version === requestVersion) importStatus.textContent = error.message;
  }
})();
