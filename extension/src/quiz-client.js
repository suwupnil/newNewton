/**
 * Newton Enhancer - Quiz Solution Client & Interceptor
 *
 * 1. Checks if solutions already exist in Cloud Firestore before requesting functions.
 * 2. If not found in Firestore, sends { courseHash, assessmentHash, authToken }
 *    to Cloud Function 'archiveQuizSolution' to fetch from Newton LMS and archive.
 */

// Firebase Project Configuration
export const FIREBASE_CONFIG = {
  projectId: 'newnewton',
  region: 'asia-south2',
  useEmulator: false, // Set to true during local testing
  emulatorHost: 'http://127.0.0.1:5001',
  emulatorFirestoreHost: 'http://127.0.0.1:8080'
};

/**
 * Resolves the Cloud Function endpoint URL
 */
function getCloudFunctionUrl(functionName = 'archiveQuizSolution') {
  if (FIREBASE_CONFIG.useEmulator) {
    return `${FIREBASE_CONFIG.emulatorHost}/${FIREBASE_CONFIG.projectId}/${FIREBASE_CONFIG.region}/${functionName}`;
  }
  return `https://${FIREBASE_CONFIG.region}-${FIREBASE_CONFIG.projectId}.cloudfunctions.net/${functionName}`;
}

/**
 * Resolves the Firestore REST API document URL for a quiz
 */
function getFirestoreQuizDocUrl(assessmentHash) {
  if (FIREBASE_CONFIG.useEmulator) {
    return `${FIREBASE_CONFIG.emulatorFirestoreHost}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/quizzes/${assessmentHash}`;
  }
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/quizzes/${assessmentHash}`;
}

/**
 * Parses Firestore REST API field types into a clean JS object
 */
function decodeFirestoreValue(valueObj) {
  if (!valueObj || typeof valueObj !== 'object') return valueObj;

  if ('stringValue' in valueObj) return valueObj.stringValue;
  if ('integerValue' in valueObj) return parseInt(valueObj.integerValue, 10);
  if ('doubleValue' in valueObj) return parseFloat(valueObj.doubleValue);
  if ('booleanValue' in valueObj) return valueObj.booleanValue;
  if ('nullValue' in valueObj) return null;
  if ('timestampValue' in valueObj) return valueObj.timestampValue;

  if ('arrayValue' in valueObj) {
    const list = valueObj.arrayValue.values || [];
    return list.map(decodeFirestoreValue);
  }

  if ('mapValue' in valueObj) {
    const fields = valueObj.mapValue.fields || {};
    const result = {};
    for (const [k, v] of Object.entries(fields)) {
      result[k] = decodeFirestoreValue(v);
    }
    return result;
  }

  return valueObj;
}

/**
 * Step 1: Check if solutions already exist in Firestore via Firestore REST API
 * (1 single free read, 0 serverless compute cost)
 *
 * @param {string} assessmentHash
 * @returns {Promise<{exists: boolean, data?: object}>}
 */
export async function checkSolutionsInFirestore(assessmentHash) {
  if (!assessmentHash) return { exists: false };

  try {
    const url = getFirestoreQuizDocUrl(assessmentHash);
    const resp = await fetch(url, { method: 'GET' });

    if (resp.status === 404) {
      console.log(`[QuizClient] Firestore check: assessment ${assessmentHash} NOT yet archived.`);
      return { exists: false };
    }

    if (!resp.ok) {
      console.warn(`[QuizClient] Firestore REST returned HTTP ${resp.status}`);
      return { exists: false };
    }

    const json = await resp.json();
    if (json && json.fields) {
      const decoded = {};
      for (const [key, val] of Object.entries(json.fields)) {
        decoded[key] = decodeFirestoreValue(val);
      }

      const hasQuestions = Array.isArray(decoded.questions) && decoded.questions.length > 0;
      if (hasQuestions) {
        console.log(`[QuizClient] Firestore check: assessment ${assessmentHash} FOUND (${decoded.questions.length} questions).`);
        return { exists: true, data: decoded };
      }
    }

    return { exists: false };
  } catch (err) {
    console.warn(`[QuizClient] Could not check Firestore:`, err);
    return { exists: false };
  }
}

/**
 * Step 2: Request Cloud Function to fetch solutions from LMS and save to Firestore
 *
 * @param {string} courseHash
 * @param {string} assessmentHash
 * @param {string} authToken
 * @returns {Promise<object>}
 */
export async function triggerArchiveCloudFunction(courseHash, assessmentHash, authToken) {
  const endpoint = getCloudFunctionUrl();
  console.log(`[QuizClient] Invoking Cloud Function archiveQuizSolution for assessment ${assessmentHash}...`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      courseHash,
      assessmentHash,
      authToken
    })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Server responded with ${response.status}`);
  }

  return result;
}

/**
 * Step 3: Trigger full sync for all previously submitted quizzes on first install
 *
 * @param {string} authToken
 * @param {string} [uid]
 * @param {string} [courseHash]
 * @returns {Promise<object>}
 */
export async function triggerInitialSyncCloudFunction(authToken, uid = null, courseHash = null) {
  const endpoint = getCloudFunctionUrl('initialSyncSubmittedQuizzes');
  console.log(`[QuizClient] Calling initialSyncSubmittedQuizzes Cloud Function (UID: ${uid || 'anonymous'})...`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      authToken,
      uid,
      courseHash
    })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Server responded with ${response.status}`);
  }

  return result;
}

/**
 * Orchestrator: Safe execution on quiz submission
 *
 * 1. Checks if Firestore already has it
 * 2. If not, calls Cloud Function
 *
 * @param {string} courseHash
 * @param {string} assessmentHash
 * @param {string} [authToken] - Defaults to localStorage.getItem('auth-token')
 */
export async function handleQuizSubmissionArchival(courseHash, assessmentHash, authToken) {
  if (!courseHash || !assessmentHash) {
    console.warn('[QuizClient] Missing courseHash or assessmentHash, skipping archival.');
    return null;
  }

  // Resolve auth token
  let token = authToken;
  if (!token && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('auth-token');
      token = raw ? (raw.startsWith('"') ? JSON.parse(raw) : raw) : null;
    } catch (e) {}
  }

  if (!token) {
    console.warn('[QuizClient] No auth token available, cannot archive quiz.');
    return null;
  }

  try {
    // 1. Check Firestore first
    const existing = await checkSolutionsInFirestore(assessmentHash);
    if (existing.exists) {
      console.log('[QuizClient] Solutions already archived in Firestore. No cloud function invocation needed.');
      return { status: 'CACHE_HIT', data: existing.data };
    }

    // 2. Not in Firestore: Trigger Cloud Function
    const archiveResult = await triggerArchiveCloudFunction(courseHash, assessmentHash, token);
    console.log('[QuizClient] Cloud Function archived successfully:', archiveResult);
    return archiveResult;
  } catch (err) {
    console.error('[QuizClient] Failed to handle quiz archival:', err);
    return { error: err.message };
  }
}
