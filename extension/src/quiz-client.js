/**
 * Newton Enhancer - Quiz Solution Client & Interceptor
 *
 * Handles:
 * 1. Client-side LMS queries (avoids Cloud Function 403 IP block from Newton WAF)
 * 2. Question normalization
 * 3. Firestore caching checks (free reads via REST API)
 * 4. Ingestion of extracted quizzes to Cloud Functions / Firestore
 * 5. LMS auth-token validation and live diagnostics
 */

// Firebase Project Configuration
export const FIREBASE_CONFIG = {
  projectId: 'newnewton',
  region: 'asia-south2',
  useEmulator: false, // Set to true during local testing
  emulatorHost: 'http://127.0.0.1:5001',
  emulatorFirestoreHost: 'http://127.0.0.1:8080'
};

const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Extracts and sanitizes Bearer auth token from any format:
 * - Plain JWT / Bearer string
 * - JSON stringified object: {"token":"..."} or {"access_token":"..."}
 * - Double-stringified JSON
 */
export function extractCleanAuthToken(raw) {
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
    tokenStr = parsed.token || parsed.access_token || parsed.authToken || null;
  }

  if (typeof tokenStr === 'string') {
    return tokenStr.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

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
 * Normalizes raw Newton LMS questions array into clean, structured questions
 */
export function normalizeNewtonQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) return [];

  return rawQuestions.map((q) => {
    const mcq = q.multiple_choice_question || {};
    const questionType = mcq.question_type || q.question_type || 1;

    const options = [];
    CHOICE_LETTERS.forEach((letter) => {
      const textKey = `choice_${letter}_text`;
      const imgKey = `choice_${letter}_image`;
      const text = mcq[textKey];
      const image = mcq[imgKey] || null;

      if (text !== undefined && text !== null && text !== '') {
        options.push({
          id: letter,
          text: String(text).trim(),
          image: image,
        });
      }
    });

    const correctChoice = typeof mcq.correct_choice === 'number' ? mcq.correct_choice : null;
    const correctLetter = correctChoice && correctChoice >= 1 && correctChoice <= 5
      ? CHOICE_LETTERS[correctChoice - 1]
      : null;

    return {
      questionHash: q.hash || '',
      mcqHash: mcq.hash || undefined,
      questionText: mcq.question_text || '',
      questionType: questionType,
      marks: mcq.marks || 0,
      options: options,
      correctChoice: correctChoice,
      correctChoiceLetter: correctLetter,
      correctExplanation: mcq.correct_choice_explanation || null,
      correctPuzzleAnswer: mcq.correct_puzzle_answer || null,
    };
  });
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
 * Live test of Newton LMS auth token from the browser
 * Hits applied courses API directly to verify validity
 */
export async function testLMSAuthToken(token) {
  const clean = extractCleanAuthToken(token);
  if (!clean) {
    return {
      valid: false,
      reason: 'MISSING_TOKEN',
      message: 'No auth-token found in browser. Please open my.newtonschool.co and log in.'
    };
  }

  try {
    const url = 'https://my.newtonschool.co/api/v2/course/all/applied/?pagination=false&completed=false';
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${clean}`
      }
    });

    if (res.status === 200) {
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : 0;
      let activeCourse = null;
      if (Array.isArray(data) && data[0]) {
        const adminCourses = data[0]?.children_courses?.admin_unit_courses || [];
        const active = adminCourses.find(c => c.is_active_admin_unit_course) || adminCourses[0] || data[0];
        activeCourse = {
          title: active.title || data[0].title || 'Enrolled Course',
          hash: active.hash || data[0].hash
        };
      }

      return {
        valid: true,
        statusCode: 200,
        tokenPreview: clean.slice(0, 10) + '...' + clean.slice(-6),
        enrolledCount: count,
        activeCourse,
        message: `Token is valid! Found ${count} enrolled course(s).`
      };
    }

    if (res.status === 401) {
      return {
        valid: false,
        statusCode: 401,
        reason: 'EXPIRED',
        tokenPreview: clean.slice(0, 10) + '...' + clean.slice(-6),
        message: 'Newton LMS returned HTTP 401 Unauthorized. Your login session has expired.'
      };
    }

    if (res.status === 403) {
      return {
        valid: false,
        statusCode: 403,
        reason: 'FORBIDDEN',
        tokenPreview: clean.slice(0, 10) + '...' + clean.slice(-6),
        message: 'Newton LMS returned HTTP 403 Forbidden.'
      };
    }

    return {
      valid: false,
      statusCode: res.status,
      reason: `HTTP_${res.status}`,
      message: `Newton LMS returned HTTP ${res.status}.`
    };
  } catch (err) {
    return {
      valid: false,
      reason: 'NETWORK_ERROR',
      message: `Failed to connect to Newton LMS: ${err.message}`
    };
  }
}

/**
 * Fetches completed assessments list from LMS (attempt_statuses=3)
 * Runs from browser extension with resident session cookies / IP
 */
export async function fetchCompletedAssessmentsFromLMS(token, courseHash) {
  const clean = extractCleanAuthToken(token);
  if (!clean || !courseHash) return [];

  const url = `https://my.newtonschool.co/api/v2/course/h/${courseHash}/assessment/all/?attempt_statuses=3&limit=100&offset=0`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${clean}`
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch completed assessments: HTTP ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * Fetches questions and answers for a specific assessment from LMS
 */
export async function fetchAssessmentQuestionsFromLMS(token, courseHash, assessmentHash) {
  const clean = extractCleanAuthToken(token);
  if (!clean || !courseHash || !assessmentHash) return [];

  const url = `https://my.newtonschool.co/api/v1/course/h/${courseHash}/assessment/h/${assessmentHash}/questions/`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${clean}`
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch questions for assessment ${assessmentHash}: HTTP ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : (data.questions || []);
}

const EXTENSION_SIGNING_SECRET = 'nst_enhancer_v1_8e4f1a9b2c3d5e7f';

/**
 * Generates cryptographic HMAC-SHA256 signature headers using browser WebCrypto
 */
async function createSignatureHeaders(bodyString) {
  const timestamp = Date.now().toString();
  const nonce = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : (Math.random().toString(36).slice(2) + Date.now().toString(36));
  const message = `${timestamp}:${nonce}:${bodyString}`;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(EXTENSION_SIGNING_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    const sigHex = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      'X-NST-Timestamp': timestamp,
      'X-NST-Nonce': nonce,
      'X-NST-Signature': sigHex
    };
  } catch (e) {
    console.warn('[QuizClient] WebCrypto signature generation error:', e);
    return {};
  }
}

/**
 * Saves a single quiz directly to Cloud Functions
 */
export async function saveQuizSolutionToCloud(courseHash, assessmentHash, quizPayload, authToken = null) {
  const endpoint = getCloudFunctionUrl('archiveQuizSolution');
  const cleanToken = extractCleanAuthToken(authToken);

  const bodyObj = {
    courseHash,
    assessmentHash,
    title: quizPayload.title || null,
    questions: quizPayload.questions,
    hasAnswersRevealed: quizPayload.hasAnswersRevealed ?? true,
    authToken: cleanToken || null
  };
  const bodyString = JSON.stringify(bodyObj);
  const sigHeaders = await createSignatureHeaders(bodyString);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cleanToken ? { 'Authorization': `Bearer ${cleanToken}` } : {}),
      ...sigHeaders
    },
    body: bodyString
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.error || `Failed to save quiz: HTTP ${res.status}`);
  }
  return result;
}

/**
 * Ingests a batch of extracted quizzes into Firestore via Cloud Function
 */
export async function batchSaveQuizzesToCloud(quizzes, uid = null, authToken = null) {
  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    return { status: 'SUCCESS', savedCount: 0 };
  }

  const endpoint = getCloudFunctionUrl('batchSaveQuizzes');
  const cleanToken = extractCleanAuthToken(authToken);

  const bodyObj = { quizzes, uid, authToken: cleanToken || null };
  const bodyString = JSON.stringify(bodyObj);
  const sigHeaders = await createSignatureHeaders(bodyString);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cleanToken ? { 'Authorization': `Bearer ${cleanToken}` } : {}),
      ...sigHeaders
    },
    body: bodyString
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.error || `Batch save failed: HTTP ${res.status}`);
  }
  return result;
}

/**
 * Orchestrator: Full historical sync performed safely on client
 *
 * 1. Resolves active semester
 * 2. Fetches completed assessments list
 * 3. Checks Firestore for each assessment
 * 4. Extracts questions from LMS for unarchived assessments
 * 5. Batch-saves all new quizzes to Firestore
 */
export async function syncHistoricalQuizzes(token, uid = null, preferredCourseHash = null, onProgress = null) {
  const cleanToken = extractCleanAuthToken(token);
  if (!cleanToken) {
    return { status: 'PENDING_AUTH', error: 'No valid auth token found' };
  }

  // 1. Resolve active semester
  let courseHash = preferredCourseHash;
  if (!courseHash) {
    const { resolveActiveSemester } = await import('./attendance/portal-api.js');
    const resolved = await resolveActiveSemester(cleanToken);
    if (resolved && resolved.semesterHash) {
      courseHash = resolved.semesterHash;
      await chrome.storage.local.set({ nst_portal_course_hash: courseHash });
    }
  }

  if (!courseHash) {
    throw new Error('Unable to resolve active semester course hash from LMS');
  }

  if (onProgress) onProgress({ stage: 'listing', message: 'Fetching completed assessments list from LMS...' });

  // 2. Fetch completed assessments
  const assessments = await fetchCompletedAssessmentsFromLMS(cleanToken, courseHash);
  console.log(`[QuizClient] Found ${assessments.length} completed assessments on LMS for semester ${courseHash}`);

  const summary = {
    totalFound: assessments.length,
    alreadyExisted: 0,
    newlyArchived: 0,
    failed: 0
  };

  const quizzesToSave = [];

  // 3. Process each assessment
  for (let i = 0; i < assessments.length; i++) {
    const item = assessments[i];
    const assessmentHash = item.hash;
    const childCourseHash = item.course?.hash || courseHash;
    const title = item.title || 'Quiz Assessment';

    if (!assessmentHash) continue;

    if (onProgress) {
      onProgress({
        stage: 'processing',
        current: i + 1,
        total: assessments.length,
        title,
        message: `Checking assessment ${i + 1}/${assessments.length}: ${title}`
      });
    }

    try {
      // Check Firestore cache first
      const existing = await checkSolutionsInFirestore(assessmentHash);
      if (existing.exists) {
        summary.alreadyExisted += 1;
        continue;
      }

      // Fetch questions from LMS
      const rawQuestions = await fetchAssessmentQuestionsFromLMS(cleanToken, childCourseHash, assessmentHash);
      if (rawQuestions && rawQuestions.length > 0) {
        const normalized = normalizeNewtonQuestions(rawQuestions);
        const hasSolutions = normalized.some(q => q.correctChoice !== null || q.correctExplanation !== null);

        quizzesToSave.push({
          assessmentHash,
          courseHash: childCourseHash,
          title,
          totalQuestions: normalized.length,
          hasAnswersRevealed: hasSolutions,
          questions: normalized
        });
      } else {
        summary.failed += 1;
      }
    } catch (itemErr) {
      console.warn(`[QuizClient] Error processing assessment ${assessmentHash}:`, itemErr);
      summary.failed += 1;
    }
  }

  // 4. Batch save unarchived quizzes to Firestore
  if (quizzesToSave.length > 0) {
    if (onProgress) {
      onProgress({
        stage: 'saving',
        count: quizzesToSave.length,
        message: `Saving ${quizzesToSave.length} quiz(zes) to Cloud Firestore...`
      });
    }

    await batchSaveQuizzesToCloud(quizzesToSave, uid, cleanToken);
    summary.newlyArchived = quizzesToSave.length;
  }

  // 5. Update local storage sync state
  await chrome.storage.local.set({
    quiz_history_synced_at: Date.now(),
    quiz_sync_summary: summary
  });

  return { status: 'SUCCESS', summary };
}

/**
 * Real-time interceptor when student submits a quiz
 */
export async function handleQuizSubmissionArchival(courseHash, assessmentHash, authToken) {
  if (!courseHash || !assessmentHash) {
    console.warn('[QuizClient] Missing courseHash or assessmentHash, skipping archival.');
    return null;
  }

  let token = extractCleanAuthToken(authToken);
  if (!token && typeof localStorage !== 'undefined') {
    try {
      token = extractCleanAuthToken(localStorage.getItem('auth-token'));
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
      return { status: 'CACHE_HIT', data: existing.data };
    }

    // 2. Fetch questions from LMS using student's browser session
    const rawQuestions = await fetchAssessmentQuestionsFromLMS(token, courseHash, assessmentHash);
    const normalized = normalizeNewtonQuestions(rawQuestions);
    const hasSolutions = normalized.some(q => q.correctChoice !== null || q.correctExplanation !== null);

    // 3. Save to Cloud Functions / Firestore
    const result = await saveQuizSolutionToCloud(courseHash, assessmentHash, {
      questions: normalized,
      hasAnswersRevealed: hasSolutions
    }, token);

    console.log('[QuizClient] Quiz solutions archived successfully to Firestore:', result);
    return result;
  } catch (err) {
    console.error('[QuizClient] Failed to handle quiz archival:', err);
    return { error: err.message };
  }
}
