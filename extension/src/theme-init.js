/**
 * theme-init.js - Immediate Synchronous Theme Initializer
 *
 * Runs synchronously in <head> before stylesheets or <body> are parsed,
 * eliminating the paint gap and preventing theme flicker (FOUT).
 */
(function () {
  try {
    const mode = localStorage.getItem('popup_theme_mode') || 'system';
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
    } else {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
    }
    if (mode === 'system') {
      root.classList.add('theme-system');
    } else {
      root.classList.remove('theme-system');
    }
  } catch (e) {}
})();
