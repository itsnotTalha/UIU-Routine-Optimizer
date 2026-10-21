/* Planner navigation and a local shortlist; schedules remain owned by the solver. */
(() => {
  const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const $ = id => document.getElementById(id);
  const storageKey = 'uiu-planner-shortlist-v1';
  let focusedDay = 'All';
  let current = null;
  let saved = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) saved = stored.filter(s => typeof s.key === 'string' && Array.isArray(s.schedule) && s.schedule.every(c => typeof c.course_name === 'string' && c.section && Array.isArray(c.section.slots))).slice(0, 3);
  } catch (_) { /* Local storage may be unavailable. */ }
  function el(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function key(schedule) { return JSON.stringify(schedule); }
  function stats(schedule) {
    const slots = schedule.flatMap(c => c.section.slots);
    let gaps = 0;
    for (const day of days) {
      const meetings = slots.filter(s => s.day === day).sort((a,b) => a.start_mins - b.start_mins);
      for (let i = 1; i < meetings.length; i++) gaps += Math.max(0, meetings[i].start_mins - meetings[i-1].end_mins);
    }
    return {days: new Set(slots.map(s => s.day)).size, gaps, start: slots.length ? Math.min(...slots.map(s => s.start_mins)) : 0, end: slots.length ? Math.max(...slots.map(s => s.end_mins)) : 0};
  }
  const time = m => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  function updateSaved() {
    $('saved-count').textContent = $('compare-count').textContent = saved.length;
    const active = current && saved.some(s => s.key === key(current));
    $('save-routine').setAttribute('aria-pressed', String(!!active));
    $('save-routine').replaceChildren(el('span', active ? '✓ Saved' : '☆ Save'));
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(saved)); }
    catch (_) { $('planner-save-status').textContent = 'Saved for this visit. Browser storage is unavailable.'; }
    updateSaved();
  }
  function renderDays() {
    const nav = $('planner-days');
    nav.replaceChildren();
    const slots = current.flatMap(c => c.section.slots);
    ['All', ...days].forEach(day => {
      const count = slots.filter(s => s.day === day).length;
      const button = el('button', day === 'All' ? 'Week' : day.slice(0,3));
      button.type = 'button';
      button.setAttribute('aria-label', day === 'All' ? 'Show all days' : `${day}, ${count} classes`);
      button.setAttribute('aria-pressed', String(focusedDay === day));
      button.append(el('span', day === 'All' ? 'All' : count ? `${count}` : 'Free'));
      button.onclick = () => { focusedDay = day; applyDay(); renderDays(); };
      nav.append(button);
    });
  }
  function applyDay() {
    const agenda = $('mobile-agenda');
    agenda.querySelector('.planner-free-day')?.remove();
    let visible = 0;
    agenda.querySelectorAll('.agenda-day').forEach(group => {
      const show = focusedDay === 'All' || group.querySelector('h4').textContent === focusedDay;
      group.hidden = !show;
      visible += show ? 1 : 0;
    });
    const footer = agenda.querySelector('.agenda-free-days');
    if (footer) footer.hidden = focusedDay !== 'All';
    if (!visible) agenda.append(el('p', `${focusedDay} is class-free. A little room to breathe.`, 'planner-free-day'));
  }
  const originalRender = window.renderMobileSchedule;
  window.renderMobileSchedule = schedule => {
    originalRender(schedule);
    current = schedule;
    $('planner-save-status').textContent = '';
    renderDays(); applyDay(); updateSaved();
  };
  // The detailed timetable is the default on desktop; mobile starts with the agenda.
  if (window.matchMedia('(min-width:901px)').matches) {
    document.querySelector('button[data-calendar-view="grid"]').click();
  }
  $('selected-only').onclick = () => {
    const button = $('selected-only');
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    if (catalog) renderCatalogList();
  };
  $('planner-preferences').onclick = () => openFiltersDrawer();
  $('save-routine').onclick = () => {
    if (!current) return;
    const id = key(current);
    if (saved.some(s => s.key === id)) saved = saved.filter(s => s.key !== id);
    else {
      if (saved.length >= 3) {
        $('planner-save-status').textContent = 'Your shortlist has three routines. Remove one to save another.';
        openShortlist(); return;
      }
      saved.push({ key:id, schedule:structuredClone(current), label:`Routine ${(window.scheduleOffset || 0) + selectedScheduleIndex + 1}`, source: $('toolbar-routine-label').textContent });
      $('planner-save-status').textContent = 'Saved to your shortlist on this browser.';
    }
    persist();
  };
  const dialog = $('shortlist-dialog');
  function openShortlist() {
    const content = $('shortlist-content');
    content.replaceChildren();
    if (!saved.length) content.append(el('p', 'No saved routines yet. Tap Save on a routine you like, then come back to compare.'));
    saved.forEach((entry, index) => {
      const card = el('article', '', 'shortlist-card');
      card.append(el('h3', entry.label), el('p', entry.source || 'Saved routine'));
      const metric = stats(entry.schedule);
      card.append(el('p', `${metric.days} campus days · ${metric.gaps}m weekly breaks`), el('p', `${time(metric.start)} earliest start · ${time(metric.end)} latest finish`));
      const list = document.createElement('ul');
      entry.schedule.forEach(course => {
        const row = document.createElement('li');
        row.append(el('strong', course.course_name.split(' — ')[0]), document.createElement('br'), el('span', `${course.section.faculty} · Section ${course.section.name}`), document.createElement('br'), el('span', course.section.slots.map(s => `${s.day.slice(0,3)} ${s.start_time}–${s.end_time}`).join(' / ')));
        list.append(row);
      });
      const remove = el('button', 'Remove from shortlist');
      remove.onclick = () => { saved.splice(index, 1); persist(); openShortlist(); };
      card.append(list, remove); content.append(card);
    });
    if (!dialog.open) dialog.showModal();
  }
  $('drawer-shortlist').onclick = () => { $('mobile-menu').close(); openShortlist(); };
  $('close-shortlist').onclick = () => dialog.close();
  dialog.addEventListener('click', event => {
    const r = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
  });
  $('compare-routines').onclick = $('planner-shortlist-open').onclick = openShortlist;
  updateSaved();
})();
