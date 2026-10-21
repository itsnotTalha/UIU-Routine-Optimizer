// A compact, paged routine chooser. The native select owns selection/loading.
(() => {
  const select = document.getElementById('mobile-routine-select');
  if (!select) return;
  function element(tag, text, className = '') {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  }
  function button(text, label) {
    const node = element('button', text);
    node.type = 'button';
    node.setAttribute('aria-label', label);
    return node;
  }
  const trigger = button('Choose routine', 'Choose a routine');
  trigger.id = `${select.id}-control`;
  trigger.className = 'select-control';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'routine-picker');
  select.hidden = true;
  select.after(trigger);
  const label = document.querySelector(`label[for="${select.id}"]`);
  if (label) label.htmlFor = trigger.id;
  const panel = element('div', '');
  panel.id = 'routine-picker';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Choose a routine');
  document.body.append(panel);
  let restoreFocus = false;
  function close(focus = false) {
    panel.hidden = true;
    restoreFocus = false;
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus({preventScroll: true});
  }
  function position() {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(300, innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
    const height = panel.offsetHeight;
    panel.style.top = `${Math.max(12, rect.bottom + height + 18 <= innerHeight ? rect.bottom + 6 : rect.top - height - 6)}px`;
  }
  function change(value) {
    select.value = value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
    sync();
  }
  function render() {
    restoreFocus ||= panel.contains(document.activeElement);
    panel.replaceChildren();
    const all = [...select.options];
    const routines = all.filter(option => !option.value.startsWith('page:'));
    const total = catalogRequest ? catalogTotal : optimizedSchedules.length;
    const header = element('header', '');
    const heading = element('div', '');
    heading.append(element('strong', 'Choose a routine'));
    const first = routines[0]?.textContent.replace('Routine ', '') || '0';
    const last = routines.at(-1)?.textContent.replace('Routine ', '') || '0';
    heading.append(element('p', select.disabled ? 'Loading routines…' : `${first}–${last} of ${total.toLocaleString()}`));
    const dismiss = button('×', 'Close routine picker');
    dismiss.onclick = () => close(true);
    header.append(heading, dismiss);
    const grid = element('div', '', 'routine-number-grid');
    routines.forEach(option => {
      const item = button(option.textContent.replace('Routine ', ''), option.textContent);
      item.title = option.title;
      item.setAttribute('aria-pressed', String(option.selected));
      item.disabled = select.disabled;
      item.onclick = () => { close(true); change(option.value); };
      grid.append(item);
    });
    grid.onkeydown = event => {
      const steps = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5};
      if (!(event.key in steps)) return;
      event.preventDefault();
      const items = [...grid.children];
      const index = items.indexOf(document.activeElement);
      items[Math.max(0, Math.min(items.length - 1, index + steps[event.key]))]?.focus({preventScroll: true});
    };
    const footer = element('footer', '');
    const pages = all.filter(option => option.value.startsWith('page:'));
    [true, false].forEach(previous => {
      const option = pages.find(item => item.textContent.startsWith('←') === previous);
      const control = button(previous ? '← Previous' : 'Next →', previous ? 'Previous page of routines' : 'Next page of routines');
      control.disabled = select.disabled || !option;
      control.onclick = () => { restoreFocus = true; change(option.value); };
      footer.append(control);
    });
    panel.setAttribute('aria-busy', String(select.disabled));
    panel.append(header, grid, footer);
    position();
    if (restoreFocus && !select.disabled) {
      grid.querySelector('[aria-pressed="true"]')?.focus({preventScroll: true});
      restoreFocus = false;
    }
  }
  function sync() {
    const selected = select.selectedOptions[0];
    if (selected && !selected.value.startsWith('page:')) {
      const chevron = element('span', '⌄', 'select-chevron');
      chevron.setAttribute('aria-hidden', 'true');
      trigger.replaceChildren(element('span', selected.textContent, 'select-value'), chevron);
    }
    trigger.disabled = select.disabled || !select.options.length;
    if (!panel.hidden) render();
  }
  trigger.onclick = () => {
    if (!panel.hidden) return close();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    restoreFocus = true;
    render();
  };
  panel.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
  };
  document.addEventListener('pointerdown', event => {
    if (!panel.contains(event.target) && !trigger.contains(event.target)) close();
  });
  document.addEventListener('focusin', event => {
    if (!panel.contains(event.target) && !trigger.contains(event.target)) close();
  });
  document.addEventListener('scroll', event => {
    if (!panel.hidden && !panel.contains(event.target)) close();
  }, true);
  window.addEventListener('resize', () => close());
  select.addEventListener('change', sync);
  new MutationObserver(sync).observe(select, {childList: true, subtree: true, attributes: true, characterData: true});
  sync();
})();
