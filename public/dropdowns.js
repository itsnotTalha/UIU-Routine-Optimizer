// Shared select presentation. Native values/change events remain the source of truth.
(() => {
  let open = null;
  let active = 0;
  let typed = '';
  let typedAt = 0;
  const controls = [];
  const popup = document.createElement('div');
  popup.className = 'select-menu';
  popup.id = 'select-menu';
  popup.setAttribute('role', 'listbox');
  popup.hidden = true;
  document.body.append(popup);
  const options = () => [...open.select.options].filter(option => !option.hidden);
  function close() {
    if (open) {
      open.button.setAttribute('aria-expanded', 'false');
      open.button.removeAttribute('aria-activedescendant');
    }
    open = null;
    popup.hidden = true;
  }
  function highlight(index) {
    const rows = [...popup.children];
    if (!rows.length) return;
    active = Math.max(0, Math.min(index, rows.length - 1));
    rows.forEach((row, i) => row.classList.toggle('is-active', i === active));
    open.button.setAttribute('aria-activedescendant', rows[active].id);
    rows[active].scrollIntoView({block:'nearest'});
  }
  function choose(index) {
    const control = open;
    const option = options()[index];
    if (!option || option.disabled) return;
    close();
    control.select.value = option.value;
    control.select.dispatchEvent(new Event('input', {bubbles:true}));
    control.select.dispatchEvent(new Event('change', {bubbles:true}));
    controls.forEach(c => c.sync());
  }
  function show(control) {
    if (open === control) { close(); return; }
    close();
    open = control;
    typed = '';
    popup.replaceChildren();
    popup.setAttribute('aria-label', control.label);
    options().forEach((option, index) => {
      const row = document.createElement('div');
      row.id = `select-choice-${index}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.selected));
      row.setAttribute('aria-disabled', String(option.disabled));
      const text = document.createElement('span');
      text.textContent = option.textContent;
      const mark = document.createElement('span');
      mark.setAttribute('aria-hidden','true');
      mark.textContent = option.selected ? '✓' : '';
      row.append(text, mark);
      row.onpointerdown = event => event.preventDefault();
      row.onclick = () => choose(index);
      row.onpointermove = () => { active = index; [...popup.children].forEach((r, i) => r.classList.toggle('is-active', i === index)); control.button.setAttribute('aria-activedescendant', row.id); };
      popup.append(row);
    });
    const rect = control.button.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < 210 && above > below;
    const height = Math.max(80, Math.min(280, upwards ? above : below));
    popup.style.width = `${Math.min(Math.max(rect.width, 170), innerWidth - 24)}px`;
    popup.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - Math.max(rect.width, 170) - 12))}px`;
    popup.style.maxHeight = `${height}px`;
    popup.style.top = upwards ? 'auto' : `${rect.bottom + 6}px`;
    popup.style.bottom = upwards ? `${innerHeight - rect.top + 6}px` : 'auto';
    popup.hidden = false;
    control.button.setAttribute('aria-expanded', 'true');
    highlight(options().findIndex(o => o.selected));
  }
  document.querySelectorAll('select').forEach(select => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `${select.id}-control`;
    button.className = 'select-control';
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-controls', popup.id);
    button.setAttribute('aria-expanded', 'false');
    const labelNode = document.querySelector(`label[for="${select.id}"]`);
    const label = select.getAttribute('aria-label') || labelNode?.textContent.trim() || 'Choose an option';
    button.setAttribute('aria-label', label);
    if (select.hasAttribute('aria-describedby')) button.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    if (labelNode) labelNode.htmlFor = button.id;
    const value = document.createElement('span');
    value.className = 'select-value';
    const chevron = document.createElement('span');
    chevron.className = 'select-chevron';
    chevron.setAttribute('aria-hidden','true');
    chevron.textContent = '⌄';
    button.append(value, chevron);
    select.after(button);
    select.hidden = true;
    const control = {select, button, label, sync() {
      value.textContent = select.selectedOptions[0]?.textContent || 'Choose an option';
      button.disabled = select.disabled || !select.options.length;
    }};
    controls.push(control);
    control.sync();
    button.onclick = () => show(control);
    button.onkeydown = event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === 'Tab') { close(); return; }
      if (['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)) {
        event.preventDefault();
        if (open !== control) { show(control); return; }
        if (event.key === 'Enter' || event.key === ' ') choose(active);
        else {
          const step = event.key === 'ArrowUp' ? -1 : 1;
          let next = event.key === 'Home' ? 0 : event.key === 'End' ? options().length - 1 : active + step;
          while (options()[next]?.disabled) next += step;
          highlight(next);
        }
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (open !== control) show(control);
        typed = Date.now() - typedAt > 700 ? event.key : typed + event.key;
        typedAt = Date.now();
        const index = options().findIndex(o => !o.disabled && o.textContent.toLowerCase().startsWith(typed.toLowerCase()));
        if (index >= 0) highlight(index);
      }
    };
    select.addEventListener('change', () => control.sync());
    new MutationObserver(() => { control.sync(); if (open === control) close(); }).observe(select, {childList:true, subtree:true, attributes:true, characterData:true});
  });
  // Reset, restore and pagination update native values programmatically.
  ['click','change'].forEach(event => document.addEventListener(event, () => queueMicrotask(() => controls.forEach(c => c.sync()))));
  document.addEventListener('pointerdown', event => { if (open && !popup.contains(event.target) && !open.button.contains(event.target)) close(); });
  document.addEventListener('scroll', event => { if (open && event.target !== popup && !popup.contains(event.target)) close(); }, true);
  window.addEventListener('resize', close);
})();
