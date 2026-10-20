// Move existing controls instead of duplicating IDs, state, or click handlers.
(() => {
  const mobile = matchMedia('(max-width: 900px)');
  const drawer = document.getElementById('mobile-menu');
  const content = document.getElementById('mobile-menu-content');
  const opener = document.getElementById('mobile-menu-open');
  const dock = document.getElementById('mobile-action-dock');
  const actions = document.getElementById('catalog-actions');
  const manualButton = document.getElementById('btn-optimize');
  const secondary = document.getElementById('header-secondary-actions');
  const source = document.getElementById('routine-dropdown-menu');
  const relocated = [secondary, source, actions, manualButton].map(node => {
    const anchor = document.createComment(`Original position: ${node.id}`);
    node.before(anchor);
    return {node, anchor};
  });
  for (const [selector, text] of [['#btn-theme-toggle', 'Toggle appearance'], ['#btn-reset-all', 'Reset selections'], ['a', 'GitHub repository']]) {
    const control = secondary.querySelector(selector);
    const label = document.createElement('span');
    label.className = 'mobile-control-label';
    label.textContent = text;
    control.append(label);
  }
  function closeMenu() { if (drawer.open) drawer.close(); }
  opener.addEventListener('click', () => {
    drawer.showModal();
    opener.setAttribute('aria-expanded', 'true');
    document.body.classList.add('mobile-menu-open');
  });
  document.getElementById('mobile-menu-close').onclick = closeMenu;
  drawer.addEventListener('close', () => {
    opener.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('mobile-menu-open');
    if (mobile.matches) opener.focus();
  });
  drawer.addEventListener('click', event => {
    if (event.target === drawer) {
      const rect = drawer.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeMenu();
    }
    if (event.target.closest('#tab-pdf, #tab-manual')) {
      setWorkspaceView('courses');
      closeMenu();
    }
  });
  function syncDock() {
    const selecting = document.body.dataset.workspace === 'courses';
    const manual = !document.getElementById('manual-panel').classList.contains('hidden');
    const hasCatalog = !document.getElementById('catalog-panel').hidden;
    dock.hidden = !mobile.matches || !selecting || (!manual && !hasCatalog);
    if (mobile.matches) {
      actions.hidden = manual;
      manualButton.hidden = !manual;
    }
  }
  function updateLayout() {
    closeMenu();
    if (mobile.matches) {
      content.append(secondary, source);
      dock.append(actions, manualButton);
    } else {
      relocated.forEach(({node, anchor}) => anchor.after(node));
      actions.hidden = false;
      manualButton.hidden = false;
      source.classList.add('hidden');
      document.getElementById('btn-routine-dropdown').setAttribute('aria-expanded', 'false');
    }
    syncDock();
  }
  new MutationObserver(syncDock).observe(document.body, {attributes: true, attributeFilter: ['data-workspace']});
  new MutationObserver(syncDock).observe(document.getElementById('manual-panel'), {attributes: true, attributeFilter: ['class']});
  new MutationObserver(syncDock).observe(document.getElementById('catalog-panel'), {attributes: true, attributeFilter: ['hidden']});
  mobile.addEventListener('change', updateLayout);
  updateLayout();
})();
