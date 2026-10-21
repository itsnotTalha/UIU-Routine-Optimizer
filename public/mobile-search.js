/* Reuse the catalog controls in a keyboard-sized mobile search dialog. */
(() => {
  const input = document.getElementById('catalog-search');
  const list = document.getElementById('catalog-list');
  const controls = document.getElementById('catalog-view-controls');
  const search = input.parentElement.parentElement;
  const mobile = window.matchMedia('(max-width: 900px)');
  const dialog = document.createElement('dialog');
  dialog.id = 'mobile-search-dialog';
  dialog.setAttribute('aria-labelledby', 'mobile-search-title');
  dialog.innerHTML = '<header><h2 id="mobile-search-title">Find courses</h2><button type="button" id="mobile-search-done">Done</button></header>';
  document.body.append(dialog);
  let anchors = [];
  let closing = false;
  let scrollY = 0;

  function sizeToViewport() {
    if (!dialog.open) return;
    const viewport = window.visualViewport;
    dialog.style.height = `${viewport?.height ?? window.innerHeight}px`;
    dialog.style.top = `${viewport?.offsetTop ?? 0}px`;
  }

  function open() {
    if (!mobile.matches || dialog.open || closing) return;
    scrollY = window.scrollY;
    anchors = [search, controls, list].map(node => {
      const anchor = document.createComment('mobile search position');
      node.before(anchor);
      dialog.append(node);
      return [node, anchor];
    });
    document.documentElement.classList.add('mobile-search-open');
    dialog.showModal();
    sizeToViewport();
    input.focus({ preventScroll: true });
  }

  dialog.addEventListener('close', () => {
    closing = true;
    input.blur();
    anchors.forEach(([node, anchor]) => anchor.replaceWith(node));
    anchors = [];
    document.documentElement.classList.remove('mobile-search-open');
    window.scrollTo(0, scrollY);
    // Restore an accessible position without reopening the software keyboard.
    list.focus({ preventScroll: true });
    closing = false;
  });
  dialog.querySelector('button').addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    dialog.close();
  });
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  input.addEventListener('input', () => { list.scrollTop = 0; });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && dialog.open) {
      event.preventDefault();
      input.blur();
      list.focus({ preventScroll: true });
    }
  });
  document.getElementById('btn-clear-search').addEventListener('click', () => {
    list.scrollTop = 0;
    input.focus({ preventScroll: true });
  });
  controls.addEventListener('click', () => { list.scrollTop = 0; });
  search.addEventListener('click', event => {
    if (event.target.closest('[data-program]')) list.scrollTop = 0;
  });
  window.visualViewport?.addEventListener('resize', sizeToViewport);
  window.visualViewport?.addEventListener('scroll', sizeToViewport);
  window.addEventListener('resize', sizeToViewport);
  mobile.addEventListener('change', () => {
    if (!mobile.matches && dialog.open) dialog.close();
  });
})();
