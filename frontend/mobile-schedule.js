(() => {
  const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const agenda = document.getElementById('mobile-agenda');
  const picker = document.getElementById('mobile-routine-select');
  const previous = document.getElementById('routine-previous');
  const next = document.getElementById('routine-next');
  let navigating = false;
  document.body.dataset.calendarView = 'agenda';
  document.querySelectorAll('button[data-calendar-view]').forEach(button => {
    button.onclick = () => {
      document.body.dataset.calendarView = button.dataset.calendarView;
      document.querySelectorAll('button[data-calendar-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    };
  });
  function textNode(tag, text, className = '') {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  }
  window.renderMobileSchedule = function(schedule) {
    const offset = window.scheduleOffset || 0;
    const total = catalogRequest ? catalogTotal : optimizedSchedules.length;
    document.getElementById('mobile-routine-position').textContent = `Routine ${offset + selectedScheduleIndex + 1} of ${total.toLocaleString()}`;
    picker.replaceChildren();
    if (catalogRequest && offset > 0) {
      const option = new Option(`← Previous routines (${Math.max(1, offset - 19)}–${offset})`, `page:${Math.max(0, offset - 20)}`);
      picker.append(option);
    }
    optimizedSchedules.forEach((_, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `Routine ${offset + index + 1}`;
      option.title = offset + index === 0 ? 'Best-ranked routine' : `Routine ${offset + index + 1}`;
      picker.append(option);
    });
    if (catalogRequest && offset + optimizedSchedules.length < total) {
      const nextOffset = offset + optimizedSchedules.length;
      picker.append(new Option(`Next routines (${nextOffset + 1}–${Math.min(nextOffset + 20, total)}) →`, `page:${nextOffset}`));
    }
    picker.value = selectedScheduleIndex;
    previous.disabled = offset + selectedScheduleIndex === 0;
    next.disabled = offset + selectedScheduleIndex + 1 >= total;
    const groups = new Map(days.map(day => [day, []]));
    schedule.forEach(item => item.section.slots.forEach(slot => groups.get(slot.day)?.push({item, slot})));
    const activeDays = days.filter(day => groups.get(day).length);
    const meetings = [...groups.values()].reduce((count, slots) => count + slots.length, 0);
    document.getElementById('mobile-week-caption').textContent = `${activeDays.length} campus days · ${meetings} classes`;
    const fragment = document.createDocumentFragment();
    activeDays.forEach(day => {
      const group = document.createElement('section');
      group.className = 'agenda-day';
      const slots = groups.get(day).sort((a, b) => a.slot.start_mins - b.slot.start_mins);
      const heading = document.createElement('header');
      heading.append(textNode('h4', day), textNode('span', `${slots.length} ${slots.length === 1 ? 'class' : 'classes'}`));
      group.append(heading);
      slots.forEach(({item, slot}, index) => {
        if (index && slot.start_mins > slots[index - 1].slot.end_mins) {
          const gap = slot.start_mins - slots[index - 1].slot.end_mins;
          group.append(textNode('p', `${gap >= 60 ? `${Math.floor(gap / 60)}h ` : ''}${gap % 60 ? `${gap % 60}m ` : ''}break`, 'agenda-break'));
        }
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'agenda-class';
        const times = document.createElement('span');
        times.className = 'agenda-time';
        times.append(textNode('strong', slot.start_time), textNode('span', slot.end_time));
        const info = document.createElement('span');
        info.className = 'agenda-class-info';
        const [code, title] = item.course_name.split(' — ');
        info.append(textNode('strong', code), textNode('span', title || item.course_name, 'agenda-title'),
          textNode('span', `Section ${item.section.name} · ${item.section.faculty}`, 'agenda-faculty'));
        if (slot.room || item.section.room) info.append(textNode('span', `Room ${slot.room || item.section.room}`, 'agenda-room'));
        card.append(times, info, textNode('span', '›', 'agenda-chevron'));
        card.onclick = () => showDetailsModal(item.course_name, item.section);
        group.append(card);
      });
      fragment.append(group);
    });
    const freeDays = days.filter(day => !groups.get(day).length);
    if (freeDays.length) fragment.append(textNode('p', `Class-free: ${freeDays.join(', ')}`, 'agenda-free-days'));
    agenda.replaceChildren(fragment);
  };
  function selectOption(index) {
    selectedScheduleIndex = index;
    renderOptionSelectors();
    renderCalendarSchedule(optimizedSchedules[index]);
    window.updateScheduleMetrics?.(index);
  }
  async function loadPage(offset, last = false) {
    if (navigating || !catalogRequest) return;
    navigating = true;
    previous.disabled = next.disabled = picker.disabled = true;
    try {
      await fetchCatalogSchedules(offset);
      if (optimizedSchedules.length && window.scheduleOffset === offset) selectOption(last ? optimizedSchedules.length - 1 : 0);
    } finally {
      navigating = false;
      picker.disabled = false;
      if (optimizedSchedules.length) window.renderMobileSchedule(optimizedSchedules[selectedScheduleIndex]);
    }
  }
  picker.onchange = () => {
    if (picker.value.startsWith('page:')) loadPage(Number(picker.value.slice(5)));
    else selectOption(Number(picker.value));
  };
  function move(delta) {
    if (navigating) return;
    const index = selectedScheduleIndex + delta;
    if (index < 0 || index >= optimizedSchedules.length) {
      loadPage((window.scheduleOffset || 0) + (delta < 0 ? -20 : 20), delta < 0);
    } else selectOption(index);
  }
  previous.onclick = () => move(-1);
  next.onclick = () => move(1);
})();
