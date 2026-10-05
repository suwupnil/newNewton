/**
 * Newton Enhancer - Content Script
 * Synchronizes and enforces the selected Grauity theme on Newton School pages
 * and relays telemetry blocking preferences to the main-world execution context.
 */

(function () {
  const GRAUITY_LIGHT = 'grauity-theme-light';
  const GRAUITY_DARK = 'grauity-theme-dark';
  const THEME_PREF_KEY = 'theme-preference';
  const APP_THEME_KEY = 'app_theme_enabled';
  const TELEMETRY_STORAGE_KEY = 'newton_enhancer_block_telemetry';

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

  /**
   * Synchronize telemetry blocker state with main-world script and localStorage
   */
  function syncTelemetryState(shouldBlock) {
    try {
      localStorage.setItem(TELEMETRY_STORAGE_KEY, shouldBlock ? 'true' : 'false');
    } catch (e) {}

    if (document.documentElement) {
      document.documentElement.setAttribute('data-newton-block-telemetry', shouldBlock ? 'true' : 'false');
    }

    // Broadcast to main world script
    window.dispatchEvent(new CustomEvent('newton_enhancer_telemetry_toggle', {
      detail: { enabled: shouldBlock }
    }));
    window.postMessage({
      source: 'newton-enhancer-telemetry',
      enabled: shouldBlock
    }, '*');
  }

  // 1. Initial load: check chrome.storage for theme and telemetry
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['themeMode', 'themeName', 'blockTelemetry'], (result) => {
      // Theme
      const mode = result.themeMode || 'light';
      const effectiveTheme = resolveEffectiveTheme(mode);
      applyGrauityTheme(effectiveTheme);

      // Telemetry
      const shouldBlock = result.blockTelemetry !== undefined ? result.blockTelemetry : true;
      syncTelemetryState(shouldBlock);
    });
  }

  // 2. Listen for system theme changes in background
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

  // 3. Listen for chrome.storage changes (e.g. from popup toggle)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        if (changes.blockTelemetry !== undefined) {
          syncTelemetryState(changes.blockTelemetry.newValue);
        }
        if (changes.themeMode !== undefined || changes.themeName !== undefined) {
          chrome.storage.sync.get(['themeMode', 'themeName'], (result) => {
            const mode = result.themeMode || 'light';
            const effectiveTheme = resolveEffectiveTheme(mode);
            applyGrauityTheme(effectiveTheme);
          });
        }
      }
    });
  }

  // 4. Listen for real-time runtime messages from extension popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'SET_THEME') {
        applyGrauityTheme(request.themeName);
        sendResponse({ success: true, theme: request.themeName });
      } else if (request.action === 'SET_TELEMETRY_BLOCK') {
        syncTelemetryState(request.blockTelemetry);
        sendResponse({ success: true, blockTelemetry: request.blockTelemetry });
      } else if (request.action === 'GET_PORTAL_AUTH') {
        let token = null;
        try {
          const raw = localStorage.getItem('auth-token');
          token = raw ? (raw.startsWith('"') ? JSON.parse(raw) : raw) : null;
        } catch (e) {}
        const courseHash = window.location.pathname.match(/\/course\/([^/]+)/)?.[1] || null;
        sendResponse({ token, courseHash });
      }
      return true;
    });
  }

  // 5. Sync portal auth token for background attendance access
  function syncPortalAuth() {
    try {
      const raw = localStorage.getItem('auth-token');
      if (raw) {
        const token = raw.startsWith('"') ? JSON.parse(raw) : raw;
        const courseHash = window.location.pathname.match(/\/course\/([^/]+)/)?.[1] || null;
        chrome.storage.local.set({
          nst_auth_token: token,
          nst_portal_course_hash: courseHash,
          nst_portal_last_seen: Date.now()
        });
      }
    } catch (e) {}
  }
  syncPortalAuth();

  // 5. Observer to ensure Next.js route transitions or re-renders do not strip the theme class
  const observer = new MutationObserver(() => {
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
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: false
    });
  }
})();