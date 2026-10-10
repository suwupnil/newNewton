/**
 * Newton Enhancer - Background Service Worker
 * Manages dynamic declarativeNetRequest rules to block telemetry, analytics,
 * tracking pixels, and diagnostic uploads when enabled.
 */

import {
  handleQuizSubmissionArchival,
  checkSolutionsInFirestore,
  syncHistoricalQuizzes,
  extractCleanAuthToken
} from './quiz-client.js';

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

// Helper: Attempt initial historical sync if auth token is present and not yet synced
async function checkAndTriggerInitialSync(force = false) {
  const syncState = await chrome.storage.local.get(['quiz_history_synced_at', 'nst_auth_token', 'nst_portal_uid', 'nst_portal_course_hash']);
  if (!force && syncState.quiz_history_synced_at) {
    return { status: 'ALREADY_SYNCED', syncedAt: syncState.quiz_history_synced_at };
  }

  let token = syncState.nst_auth_token;

  // If no token in storage, check cookies if available
  if (!token && typeof chrome !== 'undefined' && chrome.cookies) {
    try {
      const cookie = await chrome.cookies.get({
        url: 'https://my.newtonschool.co',
        name: 'access_token_ns_student_web'
      });
      if (cookie && cookie.value) {
        token = extractCleanAuthToken(cookie.value);
        if (token) {
          await chrome.storage.local.set({ nst_auth_token: token });
        }
      }
    } catch (e) {}
  }

  if (!token) {
    console.log('[Newton Enhancer] Initial sync pending: waiting for student authentication token...');
    return { status: 'PENDING_AUTH' };
  }

  try {
    const res = await syncHistoricalQuizzes(token, syncState.nst_portal_uid, syncState.nst_portal_course_hash);
    console.log('[Newton Enhancer] Initial quiz archival sync complete:', res);
    return res;
  } catch (err) {
    console.error('[Newton Enhancer] Initial quiz sync failed:', err);
    return { status: 'FAILED', error: err.message };
  }
}

// 1. Extension install / update: set initial defaults & flag first install
chrome.runtime.onInstalled.addListener(async (details) => {
  const result = await chrome.storage.sync.get(['blockTelemetry']);
  const isBlocked = result.blockTelemetry !== undefined ? result.blockTelemetry : true;
  await chrome.storage.sync.set({ blockTelemetry: isBlocked });
  await syncTelemetryBlockingRules(isBlocked);

  if (details.reason === 'install') {
    console.log('[Newton Enhancer] Fresh installation detected. Initializing first-install sync pipeline...');
    await chrome.storage.local.set({ is_first_install: true });
    await checkAndTriggerInitialSync();
  }
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
  if (message.action === 'ARCHIVE_QUIZ') {
    const { courseHash, assessmentHash, authToken } = message;
    handleQuizSubmissionArchival(courseHash, assessmentHash, authToken)
      .then((res) => {
        sendResponse({ success: true, result: res });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }
  if (message.action === 'CHECK_QUIZ_SOLUTIONS') {
    const { assessmentHash } = message;
    checkSolutionsInFirestore(assessmentHash)
      .then((res) => {
        sendResponse({ success: true, result: res });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
  if (message.action === 'PORTAL_AUTH_UPDATED') {
    // When student visits LMS and auth token is freshly captured, trigger first sync if pending
    checkAndTriggerInitialSync().then((res) => {
      sendResponse({ success: true, result: res });
    });
    return true;
  }
  if (message.action === 'TRIGGER_INITIAL_SYNC') {
    checkAndTriggerInitialSync(message.force || false).then((res) => {
      sendResponse({ success: true, result: res });
    });
    return true;
  }
});
