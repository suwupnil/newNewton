/**
 * Newton Enhancer - Background Service Worker
 * Manages dynamic declarativeNetRequest rules to block telemetry, analytics,
 * tracking pixels, and diagnostic uploads when enabled.
 */

const RULE_ID_OFFSET = 1000;

const TELEMETRY_FILTERS = [
  // Google Analytics & GTM
  '||google-analytics.com',
  '||analytics.google.com',
  '||googletagmanager.com',
  // Microsoft Clarity (Screen & session telemetry)
  '||clarity.ms',
  '||c.clarity.ms',
  // Product Analytics & Event Tracking
  '||mixpanel.com',
  '||api.mixpanel.com',
  '||clevertap.com',
  '||wizrocket.com',
  '||openpanel.dev',
  '||api.openpanel.dev',
  '||openpanel-api.newtonschool.co',
  // Ad pixels & third-party tracking
  '||facebook.com/tr',
  '||connect.facebook.net',
  '||px.ads.linkedin.com',
  '||snap.licdn.com',
  '||trc.taboola.com',
  '||q.quora.com',
  '||hotjar.com',
  // Error & diagnostic telemetry
  '||sentry.io',
  '||datadoghq.com',
  '||fullstory.com',
  '||logrocket.io',
  // Newton School internal diagnostic reporting endpoint
  '||newtonschool.co/api/v1/user/report/'
];

/**
 * Generate declarativeNetRequest rules for telemetry blocking
 */
function buildBlockingRules() {
  return TELEMETRY_FILTERS.map((filter, index) => ({
    id: RULE_ID_OFFSET + index,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: filter,
      initiatorDomains: ['newtonschool.co', 'my.newtonschool.co']
    }
  }));
}

/**
 * Enable or disable declarativeNetRequest blocking rules based on user setting
 */
async function syncTelemetryBlockingRules(shouldBlock) {
  if (!chrome.declarativeNetRequest) return;

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules
      .map(r => r.id)
      .filter(id => id >= RULE_ID_OFFSET && id < RULE_ID_OFFSET + 100);

    if (shouldBlock) {
      const rulesToAdd = buildBlockingRules();
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingIds,
        addRules: rulesToAdd
      });
      console.log(`[Newton Enhancer] Telemetry blocking ACTIVE (${rulesToAdd.length} network rules enabled).`);
    } else {
      if (existingIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existingIds
        });
      }
      console.log('[Newton Enhancer] Telemetry blocking DISABLED (network rules removed).');
    }
  } catch (err) {
    console.error('[Newton Enhancer] Failed to update declarativeNetRequest rules:', err);
  }
}

// 1. Extension install / update: set initial defaults
chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.sync.get(['blockTelemetry']);
  // Default to true (telemetry blocking enabled)
  const isBlocked = result.blockTelemetry !== undefined ? result.blockTelemetry : true;
  await chrome.storage.sync.set({ blockTelemetry: isBlocked });
  await syncTelemetryBlockingRules(isBlocked);
});

// 2. Extension / browser startup: ensure rules are synchronized
chrome.runtime.onStartup.addListener(async () => {
  const result = await chrome.storage.sync.get(['blockTelemetry']);
  const isBlocked = result.blockTelemetry !== undefined ? result.blockTelemetry : true;
  await syncTelemetryBlockingRules(isBlocked);
});

// 3. Listen to storage changes to update declarativeNetRequest in real-time
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync' && changes.blockTelemetry !== undefined) {
    await syncTelemetryBlockingRules(changes.blockTelemetry.newValue);
  }
});

// 4. Listen to runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SET_TELEMETRY_BLOCK') {
    syncTelemetryBlockingRules(message.blockTelemetry).then(() => {
      sendResponse({ success: true, blockTelemetry: message.blockTelemetry });
    });
    return true; // Keep message channel open for async response
  }
  if (message.action === 'GET_TELEMETRY_STATUS') {
    chrome.storage.sync.get(['blockTelemetry'], (result) => {
      const isBlocked = result.blockTelemetry !== undefined ? result.blockTelemetry : true;
      sendResponse({ blockTelemetry: isBlocked });
    });
    return true;
  }
});
