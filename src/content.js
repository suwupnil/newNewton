/**
 * Newton Enhancer - Content Script
 * Synchronizes and enforces the selected Grauity theme on Newton School pages.
 */

(function () {
  const GRAUITY_LIGHT = 'grauity-theme-light';
  const GRAUITY_DARK = 'grauity-theme-dark';
  const THEME_PREF_KEY = 'theme-preference';
  const APP_THEME_KEY = 'app_theme_enabled';

  function resolveEffectiveTheme(mode) {
    if (mode === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode;
  }

  /**
   * Apply Grauity theme class to document body and sync with Newton School localStorage
   */
  function applyGrauityTheme(themeName) {
    const isDark = themeName === 'dark';
    const targetClass = isDark ? GRAUITY_DARK : GRAUITY_LIGHT;
    const previousClass = isDark ? GRAUITY_LIGHT : GRAUITY_DARK;

    // 1. Update DOM body classes
    if (document.body) {
      document.body.classList.remove(previousClass);
      document.body.classList.add(targetClass);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.classList.remove(previousClass);
        document.body.classList.add(targetClass);
      }, { once: true });
    }

    // 2. Synchronize with Newton School internal theme state in localStorage
    try {
      localStorage.setItem(THEME_PREF_KEY, JSON.stringify({
        themeName: themeName,
        enable_platform_wide_dark_theme: isDark
      }));
      localStorage.setItem(APP_THEME_KEY, isDark ? 'true' : 'false');
    } catch (e) {
      console.warn('[Newton Enhancer] Could not persist theme to localStorage:', e);
    }
  }

  // Initial load: check chrome.storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['themeMode', 'themeName'], (result) => {
      const mode = result.themeMode || 'light';
      const effectiveTheme = resolveEffectiveTheme(mode);
      applyGrauityTheme(effectiveTheme);
    });
  }

  // Listen for system theme changes in background
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['themeMode'], (result) => {
          if (result.themeMode === 'system') {
            applyGrauityTheme(e.matches ? 'dark' : 'light');
          }
        });
      }
    });
  }

  // Listen for real-time messages from extension popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'SET_THEME') {
        applyGrauityTheme(request.themeName);
        sendResponse({ success: true, theme: request.themeName });
      }
      return true;
    });
  }

  /**
   * Automatically tag key Newton School UI components with stable semantic data attributes.
   * This ensures dark theme styling remains 100% resilient across frontend rebuilds
   * without relying on volatile styled-components class hashes.
   */
  function tagSemanticElements(root = document.body) {
    if (!root) return;

    // 1. Tag "due tomorrow" and deadline badges
    const elements = root.querySelectorAll('div, span, p, h1, h2, h3, h4');
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.children.length === 0 && el.textContent) {
        const text = el.textContent.trim();
        // Due / deadline badge (e.g. "due tomorrow", "due on 25 Sept")
        if (/^due\s+(tomorrow|today|on|\d)/i.test(text)) {
          el.setAttribute('data-newton-due-badge', 'true');
        }
        // Section headings
        if (text === 'Calendar' && el.parentElement) {
          el.parentElement.setAttribute('data-newton-calendar', 'true');
        } else if (text === 'Your lectures' && el.parentElement) {
          el.parentElement.setAttribute('data-newton-lectures', 'true');
        } else if (text === 'Your Sessions' && el.parentElement) {
          el.parentElement.setAttribute('data-newton-sessions', 'true');
        } else if (/^\d+%\s*(\(\d+\/\d+\))?$/.test(text) || /^(\d+\/\d+)$/.test(text)) {
          el.setAttribute('data-newton-perf-stat', 'true');
        }
      }
    }
  }

  let tagTimeout = null;
  function scheduleTagging() {
    if (tagTimeout) return;
    tagTimeout = setTimeout(() => {
      tagTimeout = null;
      tagSemanticElements(document.body);
    }, 150);
  }

  // Observer to ensure Next.js route transitions or re-renders do not strip the theme class
  // and keep semantic attributes synchronized
  const observer = new MutationObserver((mutations) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['themeMode', 'themeName'], (result) => {
        const mode = result.themeMode || 'light';
        const effectiveTheme = resolveEffectiveTheme(mode);
        const expectedClass = effectiveTheme === 'dark' ? GRAUITY_DARK : GRAUITY_LIGHT;
        if (document.body && !document.body.classList.contains(expectedClass)) {
          document.body.classList.forEach(c => {
            if (c.startsWith('grauity-theme-') && c !== expectedClass) {
              document.body.classList.remove(c);
            }
          });
          document.body.classList.add(expectedClass);
        }
      });
    }

    // Schedule semantic tagging on DOM changes
    scheduleTagging();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true
    });
  }

  // Initial tagging when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleTagging(), { once: true });
  } else {
    scheduleTagging();
  }
})();
