/* Pure comparison data shared by the shortlist and its regression tests. */
function routineComparisonRows(left, right) {
  const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const time = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  function summary(schedule) {
    const meetings = schedule.flatMap(course => course.section.slots);
    const daily = days.map(day => {
      const slots = meetings.filter(slot => slot.day === day).sort((a, b) => a.start_mins - b.start_mins);
      const gaps = slots.slice(1).reduce((total, slot, i) => total + Math.max(0, slot.start_mins - slots[i].end_mins), 0);
      return {day, slots, gaps};
    });
    return {daily, count: daily.filter(d => d.slots.length).length,
      gaps: daily.reduce((total, d) => total + d.gaps, 0),
      start: meetings.length ? time(Math.min(...meetings.map(s => s.start_mins))) : 'No meetings',
      end: meetings.length ? time(Math.max(...meetings.map(s => s.end_mins))) : 'No meetings'};
  }
  const a = summary(left), b = summary(right);
  const rows = [
    ['Campus days', String(a.count), String(b.count)],
    ['Weekly gaps', `${a.gaps} min`, `${b.gaps} min`],
    ['Earliest start', a.start, b.start], ['Latest finish', a.end, b.end]
  ];
  const dayText = d => d.slots.length ? `${time(d.slots[0].start_mins)}–${time(Math.max(...d.slots.map(s => s.end_mins)))} · ${d.gaps} min gaps` : 'Free';
  days.forEach((day, i) => rows.push([day, dayText(a.daily[i]), dayText(b.daily[i])]));
  const identity = item => `${item.is_fixed ? 'Fixed: ' : ''}${item.course_name}`;
  const names = [...new Set([...left, ...right].map(identity))];
  const courseText = (schedule, name) => {
    const items = schedule.filter(item => identity(item) === name);
    return items.length ? items.map(item => `${item.section.faculty} · Section ${item.section.name}\n` +
      item.section.slots.map(s => `${s.day.slice(0, 3)} ${s.start_time}–${s.end_time}`).join(' / ')).join('\n') : 'Not in this routine';
  };
  names.forEach(name => rows.push([name, courseText(left, name), courseText(right, name)]));
  return rows;
}
window.routineComparisonRows = routineComparisonRows;

/* Planner navigation and a local shortlist; schedules remain owned by the solver. */
(() => {
  const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const $ = id => document.getElementById(id);
  const storageKey = 'uiu-planner-shortlist-v1';
  const shortlistLimit = 20;
  let focusedDay = 'All';
  let current = null;
  let saved = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) saved = stored.filter(s => typeof s.key === 'string' && Array.isArray(s.schedule) && s.schedule.every(c => typeof c.course_name === 'string' && c.section && Array.isArray(c.section.slots))).slice(0, shortlistLimit);
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
      if (saved.length >= shortlistLimit) {
        $('planner-save-status').textContent = `Your shortlist has ${shortlistLimit} routines. Remove one to save another.`;
        openShortlist(); return;
      }
      saved.push({ key:id, schedule:structuredClone(current), label:`Routine ${(window.scheduleOffset || 0) + selectedScheduleIndex + 1}`, source: $('toolbar-routine-label').textContent });
      $('planner-save-status').textContent = 'Saved to your shortlist on this browser.';
    }
    persist();
  };
  let comparisonKeys = [];
  function renderComparison() {
    const panel = $('routine-comparison');
    panel.replaceChildren();
    if (saved.length < 2) {
      panel.append(el('p', 'Save two routines to see their differences side by side.'));
      return;
    }
    comparisonKeys = comparisonKeys.filter(id => saved.some(entry => entry.key === id));
    for (const entry of saved) {
      if (comparisonKeys.length < 2 && !comparisonKeys.includes(entry.key)) comparisonKeys.push(entry.key);
    }
    panel.append(el('h3', 'Compare two routines'));
    const selectors = el('div', '', 'comparison-selectors');
    comparisonKeys.forEach((id, side) => {
      const label = el('label', side === 0 ? 'Routine A' : 'Routine B');
      const select = document.createElement('select');
      saved.forEach((entry, index) => {
        const option = el('option', `${index + 1}. ${entry.label} · ${entry.source || 'Saved routine'}`);
        option.value = entry.key;
        option.selected = entry.key === id;
        option.disabled = entry.key === comparisonKeys[1 - side];
        select.append(option);
      });
      select.onchange = () => { comparisonKeys[side] = select.value; renderComparison(); };
      label.append(select); selectors.append(label);
    });
    panel.append(selectors, el('p', 'Highlighted rows differ. Saved routines are snapshots and may use different courses or preferences.'));
    const entries = comparisonKeys.map(id => saved.find(entry => entry.key === id));
    const rows = window.routineComparisonRows(entries[0].schedule, entries[1].schedule);
    const scroll = el('div', '', 'comparison-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', 'Routine comparison; scroll horizontally on small screens');
    const table = document.createElement('table');
    table.append(el('caption', 'Campus days, breaks, times and teachers'));
    const head = document.createElement('thead');
    const header = document.createElement('tr');
    ['Comparison', `A · ${entries[0].label}`, `B · ${entries[1].label}`].forEach(text => {
      const th = el('th', text); th.scope = 'col'; header.append(th);
    });
    head.append(header); table.append(head);
    const body = document.createElement('tbody');
    rows.forEach(([label, a, b]) => {
      const row = el('tr', '', a !== b ? 'comparison-different' : '');
      const heading = el('th', label + (a !== b ? ' · Different' : ''));
      heading.scope = 'row';
      row.append(heading, el('td', a), el('td', b)); body.append(row);
    });
    table.append(body); scroll.append(table); panel.append(scroll);
  }
  const dialog = $('shortlist-dialog');
  function openShortlist() {
    renderComparison();
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

// Pack variable-height faculty cards without reserving a tall row for every course.
(() => {
  const container = document.getElementById('selected-courses');
  let frame;
  function layoutCards() {
    if (!matchMedia('(min-width:901px)').matches) return;
    container.querySelectorAll('.selected-course-card').forEach(card => {
      const height = card.getBoundingClientRect().height;
      if (height) card.style.gridRowEnd = `span ${Math.ceil((height + 12) / 20)}`;
    });
  }
  window.layoutSelectedCourseCards = layoutCards;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layoutCards);
  });
  function watchCards() {
    observer.disconnect();
    observer.observe(container);
    container.querySelectorAll('.selected-course-card').forEach(card => observer.observe(card));
  }
  new MutationObserver(watchCards).observe(container, {childList:true});
  watchCards();
})();
