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

  function extractCleanAuthToken(raw) {
    if (!raw) return null;
    let parsed = raw;
    let attempts = 0;
    while (typeof parsed === 'string' && attempts < 3) {
      try {
        const temp = JSON.parse(parsed);
        if (typeof temp === 'object' || typeof temp === 'string') {
          parsed = temp;
        } else {
          break;
        }
      } catch (e) {
        break;
      }
      attempts++;
    }

    let tokenStr = null;
    if (typeof parsed === 'string') {
      const tokenMatch = parsed.match(/['"]?(?:access_)?token['"]?\s*:\s*['"]?([^'"}\s]+)['"]?/i);
      if (tokenMatch) {
        tokenStr = tokenMatch[1];
      } else {
        tokenStr = parsed;
      }
    } else if (typeof parsed === 'object' && parsed !== null) {
      tokenStr = parsed.token || parsed.access_token || null;
    }

    if (typeof tokenStr === 'string') {
      return tokenStr.replace(/^Bearer\s+/i, '').trim();
    }
    return null;
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
          const raw = getRawPortalToken();
          token = extractCleanAuthToken(raw);
        } catch (e) {}
        const courseHash = window.location.pathname.match(/\/course\/([^/]+)/)?.[1] || null;
        sendResponse({ token, courseHash });
      }
      return true;
    });
  }

  // 5. Helper to retrieve raw auth token across storage keys and cookies
  function getRawPortalToken() {
    try {
      const candidates = [
        localStorage.getItem('auth-token'),
        localStorage.getItem('token'),
        localStorage.getItem('access_token'),
        localStorage.getItem('authToken'),
        sessionStorage.getItem('auth-token'),
        sessionStorage.getItem('token')
      ];
      for (const c of candidates) {
        if (c) return c;
      }
      const match = document.cookie.match(/(?:^|;\s*)access_token_ns_student_web=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
    } catch (e) {}
    return null;
  }

  // Sync portal auth token & UID for background attendance and quiz sync
  function syncPortalAuth() {
    try {
      const rawToken = getRawPortalToken();
      if (rawToken) {
        let courseHash = window.location.pathname.match(/\/course\/([^/]+)/)?.[1] || null;
        if (!courseHash) {
          try {
            const storedCourse = localStorage.getItem('current_course') || localStorage.getItem('active_course') || localStorage.getItem('active_course_hash');
            if (storedCourse) {
              courseHash = storedCourse.startsWith('{') ? JSON.parse(storedCourse).hash : storedCourse;
            }
          } catch (e) {}
        }

        // Try to obtain student UID from user object or local storage
        let uid = null;
        try {
          const userRaw = localStorage.getItem('user') || localStorage.getItem('user-info') || localStorage.getItem('user_profile');
          if (userRaw) {
            const parsedUser = JSON.parse(userRaw);
            uid = parsedUser.uid || parsedUser.id || parsedUser.username || null;
          }
        } catch (e) {}

        const token = extractCleanAuthToken(rawToken);

        chrome.storage.local.set({
          nst_auth_token: token,
          nst_portal_uid: uid,
          nst_portal_course_hash: courseHash,
          nst_portal_last_seen: Date.now()
        }, () => {
          // Notify background service worker to check if initial quiz sync is pending
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              action: 'PORTAL_AUTH_UPDATED',
              token,
              uid,
              courseHash
            });
          }
        });
      }
    } catch (e) {}
  }
  syncPortalAuth();
  document.addEventListener('DOMContentLoaded', syncPortalAuth);
  window.addEventListener('load', syncPortalAuth);

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

  // 6. Listen for quiz submission events intercepted from MAIN world
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'newton-enhancer-quiz-submitted') {
      const { courseHash, assessmentHash, authToken } = event.data;
      if (courseHash && assessmentHash) {
        console.log(`[Newton Enhancer] Quiz submitted: ${assessmentHash} (Course: ${courseHash}). Requesting archival check...`);
        chrome.runtime.sendMessage({
          action: 'ARCHIVE_QUIZ',
          courseHash,
          assessmentHash,
          authToken
        });
      }
    }
  });
})();