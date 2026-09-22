/**
 * Newton Enhancer - Popup Controller
 * Manages 3-way theme selection (Light, Dark, System), popup theme styling,
 * telemetry/diagnostic blocking toggle, chrome.storage persistence,
 * and active tab message passing.
 */

const applyBtn = document.getElementById('applyBtn');
const statusMessage = document.getElementById('statusMessage');
const segmentBtns = document.querySelectorAll('.segment-btn');
const telemetryToggle = document.getElementById('telemetryToggle');
const telemetryStatusTag = document.getElementById('telemetryStatusTag');
const privacyItems = document.querySelectorAll('.privacy-item');

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

  // Update popup body theme
  document.body.className = '';
  if (mode === 'system') {
    document.body.classList.add('theme-system');
  } else if (mode === 'dark') {
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.add('theme-light');
  }
}

/**
 * Update telemetry status tag and checklist visual states
 */
function updateTelemetryUI(isBlocked) {
  telemetryToggle.checked = isBlocked;
  if (isBlocked) {
    telemetryStatusTag.textContent = 'Blocked';
    telemetryStatusTag.className = 'theme-tag tag-blocked';
    privacyItems.forEach(item => item.classList.remove('disabled'));
  } else {
    telemetryStatusTag.textContent = 'Allowed';
    telemetryStatusTag.className = 'theme-tag tag-allowed';
    privacyItems.forEach(item => item.classList.add('disabled'));
  }
}

function showStatus(text, isSuccess = true) {
  statusMessage.textContent = text;
  statusMessage.className = isSuccess ? 'status-message success' : 'status-message';
  setTimeout(() => {
    statusMessage.textContent = '';
  }, 2500);
}

// 1. Load saved settings on popup open
chrome.storage.sync.get(['themeMode', 'themeName', 'blockTelemetry'], (result) => {
  const mode = result.themeMode || (result.themeName === 'dark' ? 'dark' : 'light');
  updatePopupUI(mode);

  const isBlocked = result.blockTelemetry !== undefined ? result.blockTelemetry : true;
  updateTelemetryUI(isBlocked);
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

// 3. Handle Telemetry Blocker Toggle
telemetryToggle.addEventListener('change', async () => {
  const isBlocked = telemetryToggle.checked;
  updateTelemetryUI(isBlocked);

  // Persist preference
  await chrome.storage.sync.set({ blockTelemetry: isBlocked });

  // Update background service worker dynamic rules immediately
  chrome.runtime.sendMessage({
    action: 'SET_TELEMETRY_BLOCK',
    blockTelemetry: isBlocked
  });

  // Notify active tab
  await notifyActiveTabTelemetry(isBlocked);

  showStatus(isBlocked ? 'Telemetry blocking enabled' : 'Telemetry blocking disabled');
});

// 4. Listen to system preference changes when in 'system' mode
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

// 5. Manual "Apply to Active Tab" button
applyBtn.addEventListener('click', async () => {
  chrome.storage.sync.get(['themeMode', 'themeName', 'blockTelemetry'], async (result) => {
    const mode = result.themeMode || 'light';
    const effectiveTheme = resolveEffectiveTheme(mode);
    const targetClass = effectiveTheme === 'dark' ? 'grauity-theme-dark' : 'grauity-theme-light';
    const isBlocked = result.blockTelemetry !== undefined ? result.blockTelemetry : true;

    await notifyActiveTab(effectiveTheme, targetClass, mode);
    await notifyActiveTabTelemetry(isBlocked);

    showStatus('Settings applied to active tab');
  });
});

/**
 * Safely send theme message to content script or execute fallback script
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
      }, () => {
        if (chrome.runtime.lastError) {
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

/**
 * Send telemetry blocker toggle to content script
 */
async function notifyActiveTabTelemetry(isBlocked) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (tab.url && tab.url.includes('newtonschool.co')) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'SET_TELEMETRY_BLOCK',
        blockTelemetry: isBlocked
      }, () => {
        if (chrome.runtime.lastError) {
          // Tab may not have content script initialized or needs reload
          if (chrome.scripting && chrome.scripting.executeScript) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (blocked) => {
                try {
                  localStorage.setItem('newton_enhancer_block_telemetry', blocked ? 'true' : 'false');
                } catch (e) {}
                if (document.documentElement) {
                  document.documentElement.setAttribute('data-newton-block-telemetry', blocked ? 'true' : 'false');
                }
                window.dispatchEvent(new CustomEvent('newton_enhancer_telemetry_toggle', {
                  detail: { enabled: blocked }
                }));
                window.postMessage({
                  source: 'newton-enhancer-telemetry',
                  enabled: blocked
                }, '*');
              },
              args: [isBlocked]
            }).catch(err => console.warn('Telemetry script fallback failed:', err));
          }
        }
      });
    }
  } catch (err) {
    console.error('Error notifying tab of telemetry change:', err);
  }
}
