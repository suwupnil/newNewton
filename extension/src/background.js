/**
 * Newton Enhancer - Background Service Worker
 * Manages dynamic declarativeNetRequest rules to block telemetry, analytics,
 * tracking pixels, and diagnostic uploads when enabled.
 */

import {
  handleQuizSubmissionArchival,
  checkSolutionsInSupabase,
  syncHistoricalQuizzes,
  extractCleanAuthToken,
  submitQuizWithSupabaseSolutions
} from './quiz-client.js';

const chrome = globalThis.chrome || globalThis.browser;

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

let syncRulesQueue = Promise.resolve();

/**
 * Enable or disable declarativeNetRequest blocking rules based on user setting
 */
function syncTelemetryBlockingRules(shouldBlock) {
  syncRulesQueue = syncRulesQueue.then(async () => {
    if (!chrome.declarativeNetRequest) return;

    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const existingIds = existingRules
        .map(r => r.id)
        .filter(id => id >= RULE_ID_OFFSET && id < RULE_ID_OFFSET + 200);

      const targetIds = TELEMETRY_FILTERS.map((_, i) => RULE_ID_OFFSET + i);
      const allRemoveIds = Array.from(new Set([...existingIds, ...targetIds]));

      if (shouldBlock) {
        const rulesToAdd = buildBlockingRules();
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: allRemoveIds,
          addRules: rulesToAdd
        });
        console.log(`[Newton Enhancer] Telemetry blocking ACTIVE (${rulesToAdd.length} network rules enabled).`);
      } else {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: allRemoveIds
        });
        console.log('[Newton Enhancer] Telemetry blocking DISABLED (network rules removed).');
      }
    } catch (err) {
      console.error('[Newton Enhancer] Failed to update declarativeNetRequest rules:', err);
    }
  });

  return syncRulesQueue;
}

// Helper: Attempt initial historical sync if auth token is present and not yet synced
let isSyncInProgress = false;

async function checkAndTriggerInitialSync(force = false) {
  if (isSyncInProgress) {
    console.log('[Newton Enhancer] Initial quiz sync is already in progress, skipping duplicate call.');
    return { status: 'IN_PROGRESS' };
  }

  isSyncInProgress = true;
  try {
    const syncState = await chrome.storage.local.get(['quiz_history_synced_at', 'nst_auth_token', 'nst_portal_uid', 'nst_portal_course_hash']);
    if (!force && syncState.quiz_history_synced_at) {
      return { status: 'ALREADY_SYNCED', syncedAt: syncState.quiz_history_synced_at };
    }

    let token = syncState.nst_auth_token;

    // If no token in storage, check cookies if available
    if (!token && typeof chrome !== 'undefined' && chrome.cookies) {
      try {
        let cookie = await chrome.cookies.get({
          url: 'https://my.newtonschool.co',
          name: 'access_token_ns_student_web'
        });
        if (!cookie) {
          const allCookies = await chrome.cookies.getAll({ domain: 'newtonschool.co' });
          cookie = allCookies.find(c => c.name === 'access_token_ns_student_web' || c.name.toLowerCase().includes('token'));
        }
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

    const effectiveCourse = (syncState.nst_portal_course_hash && syncState.nst_portal_course_hash !== 'h')
      ? syncState.nst_portal_course_hash
      : null;

    const res = await syncHistoricalQuizzes(token, syncState.nst_portal_uid, effectiveCourse);
    if (res && res.status === 'PENDING_COURSE') {
      console.log('[Newton Enhancer] Initial sync waiting for course selection. Will automatically archive once student navigates to course.');
      return res;
    }
    console.log('[Newton Enhancer] Initial quiz archival sync complete:', res);
    return res;
  } catch (err) {
    console.error('[Newton Enhancer] Initial quiz sync failed:', err);
    return { status: 'FAILED', error: err.message };
  } finally {
    isSyncInProgress = false;
  }
}

// Listen to LMS session cookie updates on login
if (typeof chrome !== 'undefined' && chrome.cookies && chrome.cookies.onChanged) {
  chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!changeInfo.removed && changeInfo.cookie && (changeInfo.cookie.name === 'access_token_ns_student_web' || changeInfo.cookie.name.toLowerCase().includes('token'))) {
      const clean = extractCleanAuthToken(changeInfo.cookie.value);
      if (clean) {
        chrome.storage.local.set({ nst_auth_token: clean }, () => {
          checkAndTriggerInitialSync();
        });
      }
    }
  });
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
    checkSolutionsInSupabase(assessmentHash)
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

  // ========================================================
  // BACKGROUND QUIZ SUBMISSION ACTIONS
  // ========================================================
  if (message.action === 'START_SUBMISSION') {
    const { token, quizzes, lazySettings, batchName } = message;
    runBackgroundSubmission(token, quizzes, lazySettings, batchName)
      .then((state) => {
        sendResponse({ success: true, state });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (message.action === 'PAUSE_SUBMISSION') {
    submissionState.isPaused = true;
    persistAndBroadcastSubmissionState().then(() => {
      sendResponse({ success: true, isPaused: true });
    });
    return true;
  }

  if (message.action === 'RESUME_SUBMISSION') {
    submissionState.isPaused = false;
    persistAndBroadcastSubmissionState().then(() => {
      sendResponse({ success: true, isPaused: false });
    });
    return true;
  }

  if (message.action === 'STOP_SUBMISSION') {
    submissionState.isStopped = true;
    submissionState.isPaused = false;
    persistAndBroadcastSubmissionState().then(() => {
      sendResponse({ success: true, isStopped: true });
    });
    return true;
  }

  if (message.action === 'FAST_FORWARD_SUBMISSION') {
    submissionState.skipRemainingDelay = true;
    submissionState.isPaused = false;
    persistAndBroadcastSubmissionState().then(() => {
      sendResponse({ success: true, skipRemainingDelay: true });
    });
    return true;
  }

  if (message.action === 'GET_SUBMISSION_STATE') {
    sendResponse({ state: submissionState });
    return false;
  }
});

// ========================================================
// 5. BACKGROUND SUBMISSION RUNNER & NOTIFICATIONS
// ========================================================

let submissionState = {
  status: 'idle', // 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'error'
  quizzes: [],
  currentIndex: 0,
  successCount: 0,
  currentQuiz: null,
  currentProgress: null,
  isPaused: false,
  isStopped: false,
  skipRemainingDelay: false,
  lazySettings: {
    enabled: false,
    delay: 15,
    entropy: 5
  },
  batchName: '',
  startedAt: null
};

let keepAliveTimer = null;

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(async () => {
    try {
      await chrome.storage.local.get('_sw_keepalive');
    } catch (e) {}
  }, 15000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

async function persistAndBroadcastSubmissionState() {
  try {
    await chrome.storage.local.set({ nst_submission_state: submissionState });
    chrome.runtime.sendMessage({
      action: 'SUBMISSION_STATE_UPDATE',
      state: submissionState
    }).catch(() => {});
  } catch (e) {}
}

/**
 * Executes a pauseable, cancellable delay during background question countdown
 */
async function pauseableDelay({ targetDelayMs, delaySec, questionIndex, totalQuestions, onProgress }) {
  let remainingMs = targetDelayMs;
  const tickInterval = 100;

  while (remainingMs > 0) {
    if (submissionState.isStopped) {
      throw new Error('SUBMISSION_STOPPED');
    }

    if (submissionState.skipRemainingDelay) {
      break;
    }

    if (submissionState.isPaused) {
      if (onProgress) {
        onProgress({
          stage: 'waiting',
          isPaused: true,
          current: questionIndex + 1,
          total: totalQuestions,
          delaySec,
          remainingSec: remainingMs / 1000,
          message: `Paused (${(remainingMs / 1000).toFixed(1)}s remaining)`
        });
      }
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    const waitStep = Math.min(tickInterval, remainingMs);
    await new Promise(r => setTimeout(r, waitStep));
    remainingMs -= waitStep;

    if (onProgress) {
      const remSec = Math.max(0, remainingMs / 1000);
      onProgress({
        stage: 'waiting',
        isPaused: false,
        current: questionIndex + 1,
        total: totalQuestions,
        delaySec,
        remainingSec: remSec,
        message: `Q ${questionIndex + 1}/${totalQuestions} • Waiting ${remSec.toFixed(1)}s before submit...`
      });
    }
  }
}

/**
 * Runs sequential quiz submission in background service worker even if popup is closed
 */
async function runBackgroundSubmission(token, quizzes, lazySettings, batchName = 'quizzes') {
  if (submissionState.status === 'running') {
    return { status: 'ALREADY_RUNNING' };
  }

  submissionState = {
    status: 'running',
    quizzes: (quizzes || []).map(q => ({ ...q })),
    currentIndex: 0,
    successCount: 0,
    currentQuiz: null,
    currentProgress: null,
    isPaused: false,
    isStopped: false,
    skipRemainingDelay: false,
    lazySettings: lazySettings || { enabled: false, delay: 15, entropy: 5 },
    batchName,
    startedAt: Date.now()
  };

  startKeepAlive();
  await persistAndBroadcastSubmissionState();

  try {
    for (let i = 0; i < submissionState.quizzes.length; i++) {
      if (submissionState.isStopped) {
        break;
      }

      submissionState.currentIndex = i;
      const q = submissionState.quizzes[i];
      submissionState.currentQuiz = q;
      await persistAndBroadcastSubmissionState();

      const delayOptions = {
        enabled: submissionState.lazySettings.enabled,
        baseDelaySec: submissionState.lazySettings.delay,
        entropySec: submissionState.lazySettings.entropy,
        shouldSkipDelay: () => submissionState.skipRemainingDelay,
        isStopped: () => submissionState.isStopped,
        waitWithProgress: async ({ questionIndex, totalQuestions, targetDelayMs, delaySec, onTick }) => {
          await pauseableDelay({
            targetDelayMs,
            delaySec,
            questionIndex,
            totalQuestions,
            onProgress: (p) => {
              submissionState.currentProgress = p;
              persistAndBroadcastSubmissionState();
            }
          });
        }
      };

      try {
        const result = await submitQuizWithSupabaseSolutions({
          token,
          courseHash: q.courseHash,
          assessmentHash: q.hash,
          solutions: q.solutionData || null,
          delayOptions,
          onProgress: (p) => {
            submissionState.currentProgress = p;
            persistAndBroadcastSubmissionState();
          }
        });

        q.isSubmitted = true;
        submissionState.successCount++;

        // Update cached mystery data in local storage
        try {
          const stored = await chrome.storage.local.get(['nst_mystery_data']);
          if (stored && stored.nst_mystery_data) {
            const mData = stored.nst_mystery_data;
            const targetQ = (mData.quizzes || []).find(x => x.hash === q.hash);
            if (targetQ) {
              targetQ.isSubmitted = true;
            }
            if (mData.groupedBySubject) {
              Object.keys(mData.groupedBySubject).forEach(sk => {
                const grp = mData.groupedBySubject[sk];
                if (grp) {
                  grp.quizzes = (grp.quizzes || []).filter(x => x.hash !== q.hash);
                  grp.lectures = (grp.lectures || []).filter(x => x.hash !== q.hash);
                  grp.labs = (grp.labs || []).filter(x => x.hash !== q.hash);
                }
              });
            }
            mData.totalCount = (mData.quizzes || []).filter(x => !x.isSubmitted).length;
            mData.solvableCount = (mData.quizzes || []).filter(x => !x.isSubmitted && x.hasAnswersInDb).length;
            await chrome.storage.local.set({ nst_mystery_data: mData });
          }
        } catch (e) {}

        // Requirement 4: Send native notification when a quiz is submitted (if lazy submit is ON)
        if (submissionState.lazySettings?.enabled && typeof chrome !== 'undefined' && chrome.notifications) {
          try {
            chrome.notifications.create(`quiz-submitted-${q.hash}-${Date.now()}`, {
              type: 'basic',
              iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
              title: 'Quiz Submitted!',
              message: `"${q.title || 'Quiz'}" has been submitted successfully (${submissionState.successCount}/${submissionState.quizzes.length}).`,
              priority: 1
            });
          } catch (notifErr) {
            console.warn('[Newton Enhancer] Notification error:', notifErr);
          }
        }

        // Notify popup of individual card completion
        chrome.runtime.sendMessage({
          action: 'QUIZ_SUBMITTED_SUCCESS',
          quizHash: q.hash,
          subjectLabel: q.subjectLabel,
          isPractical: q.isPractical
        }).catch(() => {});

        await persistAndBroadcastSubmissionState();
      } catch (err) {
        if (err.message === 'SUBMISSION_STOPPED' || submissionState.isStopped) {
          console.log('[Newton Enhancer] Submission stopped by user');
          break;
        }
        console.error(`[Newton Enhancer] Failed to auto-submit quiz ${q.hash}:`, err);
        chrome.runtime.sendMessage({
          action: 'QUIZ_SUBMITTED_ERROR',
          quizHash: q.hash,
          error: err.message
        }).catch(() => {});
      }
    }

    if (submissionState.isStopped) {
      submissionState.status = 'stopped';
    } else {
      submissionState.status = 'completed';
      // Final completion notification if lazy submit was active
      if (submissionState.lazySettings?.enabled && submissionState.successCount > 0 && typeof chrome !== 'undefined' && chrome.notifications) {
        try {
          chrome.notifications.create(`submission-done-${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
            title: 'All Quizzes Completed!',
            message: `Successfully submitted ${submissionState.successCount} quizzes.`,
            priority: 2
          });
        } catch (e) {}
      }
    }
  } catch (batchErr) {
    console.error('[Newton Enhancer] Background batch submission error:', batchErr);
    submissionState.status = 'error';
    submissionState.error = batchErr.message;
  } finally {
    stopKeepAlive();
    await persistAndBroadcastSubmissionState();
  }

  return submissionState;
}
