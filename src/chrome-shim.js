/**
 * chrome-shim.js - Web compatibility layer for newNewton Chrome Extension APIs.
 * Translates chrome.storage, chrome.runtime, chrome.tabs into standard browser localStorage & Web APIs.
 */

import defaultMenu from '../menu.json';

const STORAGE_PREFIX = 'newnewton_';
const storageListeners = [];
const messageListeners = [];

// Seed default initial state if empty
function initializeDefaults() {
  try {
    if (!localStorage.getItem(STORAGE_PREFIX + 'mess_menu_data')) {
      localStorage.setItem(STORAGE_PREFIX + 'mess_menu_data', JSON.stringify(defaultMenu));
      localStorage.setItem(STORAGE_PREFIX + 'mess_menu_last_fetched', String(Date.now()));
    }

    if (!localStorage.getItem(STORAGE_PREFIX + 'nst_attendance_target')) {
      localStorage.setItem(STORAGE_PREFIX + 'nst_attendance_target', '0.75');
    }

    if (!localStorage.getItem(STORAGE_PREFIX + 'nst_attendance_data')) {
      // Seed realistic NST course sample data
      const sampleAttendance = {
        semesterTitle: 'Semester 1 - Newton School of Technology',
        timestamp: Date.now(),
        target: 0.75,
        subjects: [
          {
            key: 'psp',
            label: 'Problem Solving & Programming (Theory & Lab)',
            units: [
              { courseHash: 'c_psp_th', name: 'Problem Solving & Programming - Theory', held: 28, attended: 24, component: 'Lecture', isPractical: false },
              { courseHash: 'c_psp_lab', name: 'Problem Solving & Programming - Lab', held: 14, attended: 13, component: 'Lab', isPractical: true }
            ],
            attended: 37,
            held: 42,
            percentage: 37 / 42,
            percentageFormatted: `${((37 / 42) * 100).toFixed(1)}%`,
            meetsTarget: true,
            headline: 'Safe to skip 7 classes',
            skipsAffordable: 7,
            classesToRecover: 0,
            missedLectures: [
              { id: '1', title: 'Recursion Trees & Memoization', start: new Date(Date.now() - 86400000 * 2).toISOString(), attended: false, component: 'Lecture', isPractical: false },
              { id: '2', title: 'Two Pointers & Sliding Window', start: new Date(Date.now() - 86400000 * 5).toISOString(), attended: false, component: 'Lecture', isPractical: false },
              { id: '3', title: 'Lab 4: Array Pointers Practice', start: new Date(Date.now() - 86400000 * 9).toISOString(), attended: false, component: 'Lab', isPractical: true }
            ]
          },
          {
            key: 'sai',
            label: 'Systems & Artificial Intelligence',
            units: [
              { courseHash: 'c_sai_th', name: 'Systems & Artificial Intelligence - Theory', held: 22, attended: 18, component: 'Lecture', isPractical: false },
              { courseHash: 'c_sai_lab', name: 'Systems & Artificial Intelligence - Lab', held: 10, attended: 8, component: 'Lab', isPractical: true }
            ],
            attended: 26,
            held: 32,
            percentage: 26 / 32,
            percentageFormatted: `${((26 / 32) * 100).toFixed(1)}%`,
            meetsTarget: true,
            headline: 'Safe to skip 2 classes',
            skipsAffordable: 2,
            classesToRecover: 0,
            missedLectures: [
              { id: '4', title: 'Gradient Descent & Loss Functions', start: new Date(Date.now() - 86400000 * 3).toISOString(), attended: false, component: 'Lecture', isPractical: false },
              { id: '5', title: 'Matrix Factorization Lab', start: new Date(Date.now() - 86400000 * 7).toISOString(), attended: false, component: 'Lab', isPractical: true }
            ]
          },
          {
            key: 'maths',
            label: 'Mathematics I (Calculus & Linear Algebra)',
            units: [
              { courseHash: 'c_math_th', name: 'Mathematics I - Theory', held: 25, attended: 17, component: 'Lecture', isPractical: false }
            ],
            attended: 17,
            held: 25,
            percentage: 17 / 25,
            percentageFormatted: `${((17 / 25) * 100).toFixed(1)}%`,
            meetsTarget: false,
            headline: 'Attend next 7 classes to reach 75%',
            skipsAffordable: 0,
            classesToRecover: 7,
            missedLectures: [
              { id: '6', title: 'Eigenvalues and Eigenvectors', start: new Date(Date.now() - 86400000 * 1).toISOString(), attended: false, component: 'Lecture', isPractical: false },
              { id: '7', title: 'Partial Derivatives & Chain Rule', start: new Date(Date.now() - 86400000 * 4).toISOString(), attended: false, component: 'Lecture', isPractical: false },
              { id: '8', title: 'Vector Spaces & Subspaces', start: new Date(Date.now() - 86400000 * 8).toISOString(), attended: false, component: 'Lecture', isPractical: false }
            ]
          },
          {
            key: 'comm',
            label: 'Effective Technical Communication',
            units: [
              { courseHash: 'c_comm_th', name: 'Effective Technical Communication', held: 16, attended: 15, component: 'Lecture', isPractical: false }
            ],
            attended: 15,
            held: 16,
            percentage: 15 / 16,
            percentageFormatted: `${((15 / 16) * 100).toFixed(1)}%`,
            meetsTarget: true,
            headline: 'Safe to skip 4 classes',
            skipsAffordable: 4,
            classesToRecover: 0,
            missedLectures: [
              { id: '9', title: 'Executive Summary Pitching', start: new Date(Date.now() - 86400000 * 6).toISOString(), attended: false, component: 'Lecture', isPractical: false }
            ]
          }
        ]
      };
      localStorage.setItem(STORAGE_PREFIX + 'nst_attendance_data', JSON.stringify(sampleAttendance));
    }

    if (!localStorage.getItem(STORAGE_PREFIX + 'nst_mystery_data')) {
      const sampleQuizzes = {
        timestamp: Date.now(),
        quizzes: [
          {
            hash: 'q_psp_trees',
            assessmentHash: 'a_tree_traversal',
            courseTitle: 'Problem Solving & Programming',
            shortCourse: 'PSP',
            title: 'Week 6 Quiz: Binary Tree In-Order & Post-Order',
            type: 'Lab Assessment',
            totalQuestions: 5,
            hasAnswers: true,
            status: 'unsubmitted'
          },
          {
            hash: 'q_sai_neural',
            assessmentHash: 'a_neural_nets',
            courseTitle: 'Systems & Artificial Intelligence',
            shortCourse: 'S&AI',
            title: 'Quiz 3: Backpropagation & Activation Functions',
            type: 'Theory Quiz',
            totalQuestions: 8,
            hasAnswers: true,
            status: 'unsubmitted'
          }
        ]
      };
      localStorage.setItem(STORAGE_PREFIX + 'nst_mystery_data', JSON.stringify(sampleQuizzes));
    }
  } catch (e) {
    console.warn('[chrome-shim] Could not initialize defaults:', e);
  }
}

initializeDefaults();

function createStorageArea() {
  return {
    get: (keys, callback) => {
      const result = {};
      const keyList = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : keys ? Object.keys(keys) : [];

      for (const k of keyList) {
        const raw = localStorage.getItem(STORAGE_PREFIX + k);
        if (raw !== null) {
          try {
            result[k] = JSON.parse(raw);
          } catch {
            result[k] = raw;
          }
        } else if (typeof keys === 'object' && !Array.isArray(keys) && k in keys) {
          result[k] = keys[k];
        }
      }

      if (typeof callback === 'function') {
        callback(result);
      }
      return Promise.resolve(result);
    },
    set: (items, callback) => {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        const oldRaw = localStorage.getItem(STORAGE_PREFIX + k);
        let oldValue = null;
        try { oldValue = oldRaw ? JSON.parse(oldRaw) : null; } catch { oldValue = oldRaw; }

        localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(v));
        changes[k] = { oldValue, newValue: v };
      }

      // Notify listeners
      for (const listener of storageListeners) {
        try { listener(changes, 'local'); } catch (e) { console.error(e); }
      }

      if (typeof callback === 'function') {
        callback();
      }
      return Promise.resolve();
    },
    remove: (keys, callback) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        localStorage.removeItem(STORAGE_PREFIX + k);
      }
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    clear: (callback) => {
      Object.keys(localStorage)
        .filter(k => k.startsWith(STORAGE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    }
  };
}

let submissionState = {
  active: false,
  isPaused: false,
  currentQuiz: null,
  currentIndex: 0,
  totalQuizzes: 0,
  successCount: 0,
  failedCount: 0,
  progress: 0,
  statusText: 'Idle',
  lazySettings: {
    enabled: false,
    delaySeconds: 15,
    entropySeconds: 5
  }
};

const chromePolyfill = {
  storage: {
    local: createStorageArea(),
    sync: createStorageArea(),
    onChanged: {
      addListener: (listener) => {
        storageListeners.push(listener);
      },
      removeListener: (listener) => {
        const idx = storageListeners.indexOf(listener);
        if (idx !== -1) storageListeners.splice(idx, 1);
      }
    }
  },
  runtime: {
    getManifest: () => ({
      name: 'newNewton',
      version: '1.2.2',
      description: 'Campus companion for Newton School of Technology'
    }),
    getURL: (path) => path,
    lastError: null,
    onMessage: {
      addListener: (listener) => {
        messageListeners.push(listener);
      },
      removeListener: (listener) => {
        const idx = messageListeners.indexOf(listener);
        if (idx !== -1) messageListeners.splice(idx, 1);
      }
    },
    onInstalled: {
      addListener: () => {}
    },
    onStartup: {
      addListener: () => {}
    },
    sendMessage: (message, callback) => {
      let response = { success: true };

      if (message && message.action === 'GET_SUBMISSION_STATE') {
        response = submissionState;
      } else if (message && message.action === 'PAUSE_SUBMISSION') {
        submissionState.isPaused = true;
        submissionState.statusText = 'Paused';
        response = { success: true };
      } else if (message && message.action === 'RESUME_SUBMISSION') {
        submissionState.isPaused = false;
        submissionState.statusText = 'Submitting...';
        response = { success: true };
      } else if (message && message.action === 'STOP_SUBMISSION') {
        submissionState.active = false;
        submissionState.isPaused = false;
        submissionState.statusText = 'Stopped';
        response = { success: true };
      }

      // Dispatch to all onMessage listeners
      for (const listener of messageListeners) {
        try {
          listener(message, {}, () => {});
        } catch (e) {
          console.error(e);
        }
      }

      if (typeof callback === 'function') {
        callback(response);
      }
      return Promise.resolve(response);
    }
  },
  tabs: {
    query: (queryInfo, callback) => {
      const tabs = [];
      if (typeof callback === 'function') callback(tabs);
      return Promise.resolve(tabs);
    },
    create: (createProperties, callback) => {
      if (createProperties && createProperties.url) {
        window.open(createProperties.url, '_blank', 'noopener,noreferrer');
      }
      if (typeof callback === 'function') callback({});
      return Promise.resolve({});
    },
    sendMessage: (tabId, message, callback) => {
      if (typeof callback === 'function') callback({});
      return Promise.resolve({});
    }
  },
  cookies: {
    get: (details, callback) => {
      const res = null;
      if (typeof callback === 'function') callback(res);
      return Promise.resolve(res);
    },
    getAll: (details, callback) => {
      const res = [];
      if (typeof callback === 'function') callback(res);
      return Promise.resolve(res);
    },
    onChanged: {
      addListener: () => {}
    }
  },
  notifications: {
    create: (id, options, callback) => {
      if (typeof callback === 'function') callback(id);
      return Promise.resolve(id);
    }
  },
  declarativeNetRequest: {
    getDynamicRules: () => Promise.resolve([]),
    updateDynamicRules: () => Promise.resolve()
  }
};

window.chrome = chromePolyfill;
export default chromePolyfill;
