(function () {
  // Two fixes for the language switcher inside the mobile drawer.
  //
  // 1. The theme's nav handler toggles the drawer on any click inside #theme-nav,
  //    so choosing a language would close the drawer mid-interaction. Clicks on
  //    the switcher are stopped in the capture phase, before that handler runs.
  // 2. The drawer sizes itself (--open-height) from the collapsed menu, so
  //    expanding the switcher needs a recalculation or the last entry is clipped.
  function inLanguageSwitcher(target) {
    var el = target && target.closest ? target.closest('.nav-lang') : null;
    return Boolean(el);
  }

  function syncDrawerHeight() {
    if (window.innerWidth > 600) return;
    if (!document.body.classList.contains('nav-open')) return;

    var items = document.querySelector('#theme-nav .nav-items');
    if (!items) return;

    document.body.style.setProperty('--open-height', 48 + items.clientHeight + 'px');
  }

  document.addEventListener(
    'click',
    function (event) {
      if (window.innerWidth > 600) return;
      if (inLanguageSwitcher(event.target)) event.stopPropagation();
    },
    true
  );

  document.addEventListener(
    'toggle',
    function (event) {
      if (event.target && event.target.classList && event.target.classList.contains('nav-lang')) syncDrawerHeight();
    },
    true
  );

  window.addEventListener('resize', syncDrawerHeight);
})();
