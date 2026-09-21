/**
 * Newton Enhancer - Popup Controller
 * Manages 3-way theme selection (Light, Dark, System), popup theme styling,
 * chrome.storage persistence, and active tab message passing.
 */

const currentThemeTag = document.getElementById('currentThemeTag');
const applyBtn = document.getElementById('applyBtn');
const statusMessage = document.getElementById('statusMessage');
const segmentBtns = document.querySelectorAll('.segment-btn');

/**
 * Determine effective theme considering system preferences
 */
function resolveEffectiveTheme(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode; // 'light' or 'dark'
}

/**
 * Update popup DOM styling and segmented button state
 */
function updatePopupUI(mode) {
  // Update segmented control buttons
  segmentBtns.forEach(btn => {
    if (btn.getAttribute('data-theme') === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const effectiveTheme = resolveEffectiveTheme(mode);

  // Update popup body theme
  document.body.className = '';
  if (mode === 'system') {
    document.body.classList.add('theme-system');
  } else if (mode === 'dark') {
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.add('theme-light');
  }

  // Update badge tag
  currentThemeTag.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
}

function showStatus(text, isSuccess = true) {
  statusMessage.textContent = text;
  statusMessage.className = isSuccess ? 'status-message success' : 'status-message';
  setTimeout(() => {
    statusMessage.textContent = '';
  }, 2500);
}

// 1. Load saved theme mode on popup open
chrome.storage.sync.get(['themeMode', 'themeName'], (result) => {
  const mode = result.themeMode || (result.themeName === 'dark' ? 'dark' : 'light');
  updatePopupUI(mode);
});

// 2. Handle Segment Button clicks (Light / Dark / System)
segmentBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    const selectedMode = btn.getAttribute('data-theme');
    updatePopupUI(selectedMode);

    const effectiveTheme = resolveEffectiveTheme(selectedMode);
    const targetClass = effectiveTheme === 'dark' ? 'grauity-theme-dark' : 'grauity-theme-light';

    // Persist user selection
    await chrome.storage.sync.set({
      themeMode: selectedMode,
      themeName: effectiveTheme,
      isThemeEnabled: effectiveTheme === 'dark'
    });

    // Notify tab
    await notifyActiveTab(effectiveTheme, targetClass, selectedMode);
    showStatus(`Theme set to ${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)}`);
  });
});

// 3. Listen to system preference changes when in 'system' mode
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
  chrome.storage.sync.get(['themeMode'], async (result) => {
    if (result.themeMode === 'system') {
      const newTheme = e.matches ? 'dark' : 'light';
      const targetClass = newTheme === 'dark' ? 'grauity-theme-dark' : 'grauity-theme-light';
      updatePopupUI('system');
      await chrome.storage.sync.set({ themeName: newTheme });
      await notifyActiveTab(newTheme, targetClass, 'system');
    }
  });
});

// 4. Manual "Apply to Active Tab" button
applyBtn.addEventListener('click', async () => {
  chrome.storage.sync.get(['themeMode', 'themeName'], async (result) => {
    const mode = result.themeMode || 'light';
    const effectiveTheme = resolveEffectiveTheme(mode);
    const targetClass = effectiveTheme === 'dark' ? 'grauity-theme-dark' : 'grauity-theme-light';
    await notifyActiveTab(effectiveTheme, targetClass, mode);
    showStatus('Theme applied to tab');
  });
});

/**
 * Safely send message to content script or execute fallback script
 */
async function notifyActiveTab(themeName, targetClass, themeMode) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (tab.url && tab.url.includes('newtonschool.co')) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'SET_THEME',
        themeName: themeName,
        targetClass: targetClass,
        themeMode: themeMode
      }, (response) => {
        // Check for runtime error (e.g. content script not yet connected)
        if (chrome.runtime.lastError) {
          // Verify if scripting API is available before calling
          if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (cls, name) => {
                document.body.classList.forEach(c => {
                  if (c.startsWith('grauity-theme-') && c !== cls) {
                    document.body.classList.remove(c);
                  }
                });
                document.body.classList.add(cls);
                try {
                  localStorage.setItem('theme-preference', JSON.stringify({
                    themeName: name,
                    enable_platform_wide_dark_theme: name === 'dark'
                  }));
                  localStorage.setItem('app_theme_enabled', name === 'dark' ? 'true' : 'false');
                } catch (e) {}
              },
              args: [targetClass, themeName]
            }).catch(err => console.warn('Script execution fallback failed:', err));
          }
        }
      });
    }
  } catch (err) {
    console.error('Error updating active tab theme:', err);
  }
}
