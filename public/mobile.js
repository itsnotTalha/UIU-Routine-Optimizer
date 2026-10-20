// Clean Mobile Sidebar Drawer Controller
(() => {
  const drawer = document.getElementById('mobile-menu');
  const openBtn = document.getElementById('mobile-menu-open');
  const closeBtn = document.getElementById('mobile-menu-close');
  const drawerThemeBtn = document.getElementById('drawer-theme-toggle');
  const drawerThemeIcon = document.getElementById('drawer-theme-icon');
  const drawerThemeLabel = document.getElementById('drawer-theme-label');
  const drawerResetBtn = document.getElementById('drawer-reset-all');

  function updateDrawerThemeDisplay() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    if (drawerThemeIcon) {
      drawerThemeIcon.className = isDark ? 'fa-solid fa-sun text-amber-400 text-base' : 'fa-solid fa-moon text-orange-600 text-base';
    }
    if (drawerThemeLabel) {
      drawerThemeLabel.textContent = isDark ? 'Dark Mode' : 'Light Mode';
    }
  }

  function openMenu() {
    if (drawer && !drawer.open) {
      updateDrawerThemeDisplay();
      drawer.showModal();
      openBtn?.setAttribute('aria-expanded', 'true');
      document.body.classList.add('mobile-menu-open');
    }
  }

  function closeMenu() {
    if (drawer && drawer.open) {
      drawer.close();
      openBtn?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('mobile-menu-open');
    }
  }

  if (openBtn) openBtn.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);

  if (drawer) {
    drawer.addEventListener('click', (event) => {
      if (event.target === drawer) {
        const rect = drawer.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
          closeMenu();
        }
      }
    });
    drawer.addEventListener('close', () => {
      openBtn?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('mobile-menu-open');
    });
  }

  if (drawerThemeBtn) {
    drawerThemeBtn.addEventListener('click', () => {
      document.getElementById('btn-theme-toggle')?.click();
      updateDrawerThemeDisplay();
    });
  }

  if (drawerResetBtn) {
    drawerResetBtn.addEventListener('click', () => {
      closeMenu();
      document.getElementById('btn-reset-all')?.click();
    });
  }
})();
