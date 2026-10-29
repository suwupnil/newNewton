/**
 * Newton Enhancer - Quiz Solution Client & Interceptor
 * Powered by Supabase Edge Functions (AWS Mumbai ap-south-1)
 *
 * Security Architecture:
 * 1. CLIENT HAS ZERO WRITE ACCESS TO THE DATABASE (Enforced by PostgreSQL Table Privileges & RLS)
 * 2. CLIENT NEVER FETCHES QUIZ ANSWERS
 * 3. Client only sends the student's auth-token and course/assessment hashes to the Supabase Edge Function
 * 4. Supabase Edge Function (running in AWS Mumbai) fetches authentic solutions directly from Newton LMS
 *    and writes them into the PostgreSQL database using service role privileges
 * 5. Client only performs read-only checks to see if verified solutions already exist
 */

import { groupUnits, componentLabel, parseCourseName, normalizeKey } from './attendance/grouping.js';
import { PLATFORM_CONFIG, COURSE_ALIASES } from './generated-specs.js';

export const SUPABASE_CONFIG = {
  url: PLATFORM_CONFIG.supabaseUrl,
  anonKey: PLATFORM_CONFIG.supabaseAnonKey,
  edgeFunctionUrl: PLATFORM_CONFIG.supabaseEdgeFunctionUrl
};

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
    tokenStr = parsed.token || parsed.access_token || parsed.authToken || parsed.auth_token || null;
  }

  if (typeof tokenStr === 'string') {
    return tokenStr.replace(/^Bearer\s+/i, '').trim();
  }
  return null;
}

/**
 * Normalizes course / subject titles into short, concise subject labels
 * (e.g. "PSP", "S&AI", "Maths I") instead of long institutional titles.
 */
export function extractShortCourseName(rawName) {
  if (!rawName) return 'Course';
  let s = String(rawName).trim();
  // Strip leading institution prefix: "Newton School of Technology'26 (RU) - "
  s = s.replace(/^Newton School of Technology\S*\s*(?:\([^)]*\)\s*)?[-–—]\s*/i, '');
  // Strip trailing section: "- D", "- B"
  s = s.replace(/\s*[-–—]\s*[A-Za-z0-9]+$/, '').trim();
  // Strip practical / lab markers: "Lab 1", "Practical 2"
  s = s.replace(/\s*[-–—:]?\s*\b(Labs?|Practicals?|Pracs?|Tutorials?|Tuts?|Workshops?)\b\s*\d*$/i, '').trim();

  const lower = s.toLowerCase();
  if (COURSE_ALIASES[lower]) {
    return COURSE_ALIASES[lower];
  }

  return s;
}

/**
 * Read-Only Check: Checks if verified solutions exist in Supabase via PostgREST API
 * (Clients only have SELECT privileges on the quizzes table)
 *
 * @param {string} assessmentHash
 * @returns {Promise<{exists: boolean, hasAnswers?: boolean, data?: object}>}
 */
export async function checkSolutionsInSupabase(assessmentHash) {
  if (!assessmentHash || !SUPABASE_CONFIG.url) {
    return { exists: false, hasAnswers: false };
  }

  try {
    const cleanHash = assessmentHash.replace(/^h\//i, '').replace(/^\/+|\/+$/g, '');
    const url = `${SUPABASE_CONFIG.url}/rest/v1/quizzes?assessment_hash=eq.${encodeURIComponent(cleanHash)}&select=*`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      console.warn(`[QuizClient] Supabase REST returned HTTP ${resp.status}`);
      return { exists: false, hasAnswers: false };
    }

    const list = await resp.json();
    if (Array.isArray(list) && list.length > 0) {
      const doc = list[0];
      const hasQuestions = Array.isArray(doc.questions) && doc.questions.length > 0;
      const hasAnswers = Boolean(doc.has_answers_revealed);

      if (hasQuestions) {
        return {
          exists: true,
          hasAnswers,
          data: {
            assessmentHash: doc.assessment_hash,
            courseHash: doc.course_hash,
            title: doc.title,
            totalQuestions: doc.total_questions,
            hasAnswersRevealed: doc.has_answers_revealed,
            questions: doc.questions,
            createdAt: doc.created_at,
            updatedAt: doc.updated_at
          }
        };
      }
    }

    return { exists: false, hasAnswers: false };
  } catch (err) {
    console.warn('[QuizClient] Could not check Supabase cache:', err);
    return { exists: false, hasAnswers: false };
  }
}

// Backward compatibility alias
export const checkSolutionsInFirestore = checkSolutionsInSupabase;

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
 * Historical Sync: Sends auth-token to Supabase Edge Function
 * The Edge Function fetches all completed assessments from Newton LMS,
 * checks what is missing in the database, fetches questions, and saves them.
 * Client does not fetch answers or write to the database.
 */
export async function syncHistoricalQuizzes(token, uid = null, preferredCourseHash = null, onProgress = null) {
  const cleanToken = extractCleanAuthToken(token);
  if (!cleanToken) {
    return { status: 'PENDING_AUTH', error: 'No valid auth token found' };
  }

  let courseHash = (preferredCourseHash && preferredCourseHash !== 'h') ? preferredCourseHash : null;
  if (!courseHash && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const stored = await chrome.storage.local.get(['nst_portal_course_hash']);
      if (stored.nst_portal_course_hash && stored.nst_portal_course_hash !== 'h') {
        courseHash = stored.nst_portal_course_hash;
      }
    } catch (e) {}
  }

  if (onProgress) onProgress({ stage: 'syncing', message: 'Triggering server-side historical sync on Supabase...' });
  console.log('[QuizClient] Delegating historical quiz sync to Supabase Edge Function (AWS Mumbai)...');

  try {
    const res = await fetch(SUPABASE_CONFIG.edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
      },
      body: JSON.stringify({
        action: 'SYNC_ALL',
        authToken: cleanToken,
        courseHash: courseHash || null,
        uid: uid || null
      })
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || `Server sync failed: HTTP ${res.status}`);
    }

    if (result.status === 'PENDING_COURSE') {
      console.log('[QuizClient] Server sync is pending course selection.');
      return result;
    }

    console.log('[QuizClient] Server-side historical sync complete:', result);

    const summary = result.summary || { totalFound: 0, alreadyExisted: 0, newlyArchived: 0 };
    await chrome.storage.local.set({
      quiz_history_synced_at: Date.now(),
      quiz_sync_summary: summary
    });

    return { status: 'SUCCESS', summary };
  } catch (err) {
    console.error('[QuizClient] Server-side historical sync failed:', err);
    throw err;
  }
}

/**
 * Quiz Submission Archival:
 * Sends auth-token, courseHash, and assessmentHash to Supabase Edge Function.
 * The Edge Function fetches the quiz answers directly from Newton LMS and saves them.
 * Client does not touch the answers or write to the database.
 */
export async function handleQuizSubmissionArchival(courseHash, assessmentHash, authToken) {
  if (!assessmentHash || assessmentHash === 'h') {
    console.warn('[QuizClient] Invalid assessmentHash, skipping archival.');
    return null;
  }

  let token = extractCleanAuthToken(authToken);
  if (!token && typeof localStorage !== 'undefined') {
    try {
      token = extractCleanAuthToken(localStorage.getItem('auth-token') || localStorage.getItem('token'));
    } catch (e) {}
  }

  if (!token) {
    console.warn('[QuizClient] No auth token available, cannot archive quiz.');
    return null;
  }

  const cleanAssessment = assessmentHash.replace(/^h\//i, '').replace(/^\/+|\/+$/g, '');
  const cleanCourse = (courseHash && courseHash !== 'h') ? courseHash.replace(/^h\//i, '').replace(/^\/+|\/+$/g, '') : null;

  try {
    // 1. Quick read-only check: if already archived with answers, skip calling Edge Function
    const existing = await checkSolutionsInSupabase(cleanAssessment);
    if (existing.exists && existing.hasAnswers) {
      console.log(`[QuizClient] Quiz ${cleanAssessment} already archived with answers in Supabase. Skipping redundant server call.`);
      return { status: 'CACHE_HIT', data: existing.data };
    }

    // 2. Delegate to Supabase Edge Function: Server fetches answers from Newton LMS and saves to DB
    console.log(`[QuizClient] Delegating quiz archival to Supabase Edge Function for ${cleanAssessment}...`);
    const res = await fetch(SUPABASE_CONFIG.edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
      },
      body: JSON.stringify({
        action: 'ARCHIVE_ONE',
        authToken: token,
        courseHash: cleanCourse,
        assessmentHash: cleanAssessment
      })
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || `Server archival failed: HTTP ${res.status}`);
    }

    console.log(`[QuizClient] Server archival succeeded for ${cleanAssessment}:`, result);
    return result;
  } catch (err) {
    console.error('[QuizClient] Failed to delegate quiz archival:', err);
    return { error: err.message };
  }
}

/**
 * Strips HTML tags, unescapes entities, and collapses whitespace for robust text comparison
 */
export function cleanHtmlText(str) {
  if (!str) return '';
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Batch Check: Queries Supabase for multiple assessment hashes in a single HTTP request
 * @param {string[]} assessmentHashes
 * @returns {Promise<Record<string, {exists: boolean, hasAnswers: boolean, data?: object}>>}
 */
export async function batchCheckSolutionsInSupabase(assessmentHashes) {
  if (!Array.isArray(assessmentHashes) || assessmentHashes.length === 0 || !SUPABASE_CONFIG.url) {
    return {};
  }

  const cleanList = Array.from(new Set(
    assessmentHashes
      .filter(Boolean)
      .map(h => String(h).replace(/^h\//i, '').replace(/^\/+|\/+$/g, '').trim())
      .filter(Boolean)
  ));

  if (cleanList.length === 0) return {};

  const resultMap = {};
  cleanList.forEach(h => {
    resultMap[h] = { exists: false, hasAnswers: false };
  });

  try {
    const filter = cleanList.map(h => encodeURIComponent(h)).join(',');
    const url = `${SUPABASE_CONFIG.url}/rest/v1/quizzes?assessment_hash=in.(${filter})&select=*`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      console.warn(`[QuizClient] Batch check returned HTTP ${resp.status}`);
      return resultMap;
    }

    const rows = await resp.json();
    if (Array.isArray(rows)) {
      rows.forEach(doc => {
        const hash = doc.assessment_hash;
        const hasQuestions = Array.isArray(doc.questions) && doc.questions.length > 0;
        const hasAnswers = Boolean(doc.has_answers_revealed);

        if (hash) {
          resultMap[hash] = {
            exists: true,
            hasAnswers: hasAnswers && hasQuestions,
            data: {
              assessmentHash: doc.assessment_hash,
              courseHash: doc.course_hash,
              title: doc.title,
              totalQuestions: doc.total_questions,
              hasAnswersRevealed: doc.has_answers_revealed,
              questions: doc.questions,
              createdAt: doc.created_at,
              updatedAt: doc.updated_at
            }
          };
        }
      });
    }

    return resultMap;
  } catch (err) {
    console.warn('[QuizClient] Batch solution check failed:', err);
    return resultMap;
  }
}

/**
 * Matches an active question in a Newton LMS attempt with its corresponding solution in the Supabase questions array
 */
export function findMatchingDbQuestion(activeQ, dbQuestions, index) {
  if (!Array.isArray(dbQuestions) || dbQuestions.length === 0) return null;

  const mcq = activeQ?.multiple_choice_question || activeQ || {};
  const activeMcqHash = mcq.hash || mcq.id || null;
  const activeHash = activeQ?.hash || null;

  // 1. Primary match: by MCQ internal hash
  if (activeMcqHash) {
    const match = dbQuestions.find(d => d.mcqHash === activeMcqHash || d.questionHash === activeMcqHash);
    if (match) return match;
  }

  // 2. Secondary match: by attempt response mapping hash
  if (activeHash) {
    const match = dbQuestions.find(d => d.questionHash === activeHash || d.mcqHash === activeHash);
    if (match) return match;
  }

  // 3. Tertiary match: by cleaned question text
  const activeCleanText = cleanHtmlText(mcq.question_text || activeQ?.question_text || '');
  if (activeCleanText.length > 10) {
    const match = dbQuestions.find(d => {
      const dbText = cleanHtmlText(d.questionText || '');
      return dbText.length > 10 && dbText === activeCleanText;
    });
    if (match) return match;
  }

  // 4. Index-based alignment fallback
  if (typeof index === 'number' && dbQuestions[index]) {
    return dbQuestions[index];
  }

  return null;
}

/**
 * Determines the exact answer value (option letter or string puzzle answer) to transmit to Newton LMS
 */
export function determineAnswerValue(activeQ, dbQ) {
  if (!dbQ) return 'A';

  const mcq = activeQ?.multiple_choice_question || activeQ || {};
  const questionType = Number(mcq.question_type ?? dbQ.questionType ?? 1);

  // Type 1: Multiple Choice Question
  if (questionType === 1) {
    const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'];
    let targetLetter = dbQ.correctChoiceLetter || null;
    if (!targetLetter && typeof dbQ.correctChoice === 'number' && dbQ.correctChoice >= 1 && dbQ.correctChoice <= 5) {
      targetLetter = CHOICE_LETTERS[dbQ.correctChoice - 1];
    }

    // Verify if options might be shuffled in the active attempt
    if (Array.isArray(dbQ.options) && targetLetter) {
      const correctOption = dbQ.options.find(o => o.id === targetLetter);
      const correctOptionClean = correctOption ? cleanHtmlText(correctOption.text) : null;

      if (correctOptionClean) {
        for (const letter of CHOICE_LETTERS) {
          const liveText = cleanHtmlText(mcq[`choice_${letter}_text`] || '');
          if (liveText && liveText === correctOptionClean) {
            return letter;
          }
        }
      }
    }

    return targetLetter || 'A';
  }

  // Type 2 or 3: Numerical / Puzzle / Fill In Blanks
  return String(dbQ.correctPuzzleAnswer ?? dbQ.input_answer ?? dbQ.correctChoice ?? '');
}

/**
 * Maps slider position (0-1000) non-linearly to seconds.
 * Precise at low values (1s increments), gradually shifting to larger ranges (up to maxSec).
 */
export function sliderPosToSeconds(pos, minSec = 1, maxSec = 1000, power = 2.6) {
  const norm = Math.max(0, Math.min(1000, Number(pos) || 0)) / 1000;
  const raw = minSec + (maxSec - minSec) * Math.pow(norm, power);
  if (raw <= 30) return Math.max(minSec, Math.round(raw));
  if (raw <= 120) return Math.round(raw / 2) * 2;
  if (raw <= 300) return Math.round(raw / 5) * 5;
  return Math.min(maxSec, Math.round(raw / 10) * 10);
}

/**
 * Inverse mapping: converts seconds to slider position (0-1000).
 */
export function secondsToSliderPos(sec, minSec = 1, maxSec = 1000, power = 2.6) {
  const clamped = Math.max(minSec, Math.min(maxSec, Number(sec) || minSec));
  const norm = Math.pow((clamped - minSec) / (maxSec - minSec), 1 / power);
  return Math.round(norm * 1000);
}

/**
 * Computes question delay: assigned time +- (random float from 0 to entropy).
 */
export function computeQuestionDelay(baseDelaySec, entropySec) {
  const base = Math.max(0, Number(baseDelaySec) || 0);
  let entropy = Math.max(0, Number(entropySec) || 0);
  // Entropy cannot be more than delay
  if (entropy > base) {
    entropy = base;
  }
  if (entropy === 0) return base;
  const randomFloat = Math.random() * entropy;
  const sign = Math.random() < 0.5 ? -1 : 1;
  const finalDelay = base + (sign * randomFloat);
  return Math.max(0.1, finalDelay);
}

/**
 * Fetches all unsubmitted quizzes across the student's enrolled courses and cross-references Supabase for solutions
 *
 * @param {object} options
 * @param {string} options.token - Student LMS Bearer auth token
 * @param {string} [options.preferredCourseHash] - Optional course hash to prioritize
 * @param {string} [options.origin] - LMS base URL (default: https://my.newtonschool.co)
 * @returns {Promise<{quizzes: any[], groupedByCourse: Record<string, any[]>, totalCount: number, solvableCount: number}>}
 */
export async function fetchUnsubmittedQuizzes({ token, preferredCourseHash = null, origin = 'https://my.newtonschool.co' } = {}) {
  const cleanToken = extractCleanAuthToken(token);
  if (!cleanToken) {
    throw new Error('NO_TOKEN');
  }

  // 1. Fetch applied/enrolled programs from LMS
  const appliedUrl = `${origin}/api/v2/course/all/applied/?pagination=false&completed=false`;
  const appliedRes = await fetch(appliedUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${cleanToken}`
    }
  });

  if (appliedRes.status === 401 || appliedRes.status === 403) {
    throw new Error('AUTH_EXPIRED');
  }
  if (!appliedRes.ok) {
    throw new Error(`HTTP_${appliedRes.status}`);
  }

  const programs = await appliedRes.json();
  const programsList = Array.isArray(programs) ? programs : (programs?.results || [programs]);

  // Requirement 4: Only fetch quizzes for courses with "is_parent_admin_unit_course": true.
  const parentAdminPrograms = programsList.filter(p => {
    if (p?.children_courses?.is_parent_admin_unit_course !== undefined) {
      return Boolean(p.children_courses.is_parent_admin_unit_course);
    }
    if (p?.is_parent_admin_unit_course !== undefined) {
      return Boolean(p.is_parent_admin_unit_course);
    }
    // Fallback for mock structures with admin units
    return Boolean(p?.children_courses?.admin_unit_courses);
  });

  if (parentAdminPrograms.length === 0) {
    return { quizzes: [], groupedBySubject: {}, groupedByCourse: {}, totalCount: 0, solvableCount: 0 };
  }

  // 2. Discover course containers & index all learning units for subject grouping
  const queryContainers = [];
  const seenContainers = new Set();
  const rawUnitsForGrouping = [];
  const adminCourseHashes = new Set();
  const validHierarchyHashes = new Set();

  const addContainer = (hash, title, isChild = false) => {
    if (!hash || hash === 'h' || seenContainers.has(hash)) return;
    seenContainers.add(hash);
    queryContainers.push({ hash, title: title || 'Enrolled Course', isChild });
  };

  for (const prog of parentAdminPrograms) {
    if (!prog) continue;
    if (prog.hash) validHierarchyHashes.add(prog.hash);
    const adminCourses = prog.children_courses?.admin_unit_courses || prog.admin_unit_courses || [];
    for (const admin of adminCourses) {
      if (!admin?.hash) continue;
      adminCourseHashes.add(admin.hash);
      validHierarchyHashes.add(admin.hash);
      addContainer(admin.hash, admin.title || admin.short_display_name || prog.title, false);

      const learningCourses = admin.learning_unit_courses || [];
      for (const lu of learningCourses) {
        if (lu?.hash) {
          validHierarchyHashes.add(lu.hash);
          addContainer(lu.hash, lu.title || lu.short_display_name || admin.title, true);
          rawUnitsForGrouping.push({
            courseHash: lu.hash,
            name: lu.short_display_name || lu.title || lu.hash,
            fullName: lu.title || lu.short_display_name || lu.hash
          });
        }
      }
    }
  }

  // Requirement 4: Only query preferredCourseHash if it belongs to parent admin hierarchy
  if (preferredCourseHash && preferredCourseHash !== 'h' && validHierarchyHashes.has(preferredCourseHash)) {
    addContainer(preferredCourseHash, 'Current Course', !adminCourseHashes.has(preferredCourseHash));
  }

  if (queryContainers.length === 0) {
    return { quizzes: [], groupedBySubject: {}, groupedByCourse: {}, totalCount: 0, solvableCount: 0 };
  }

  // 3. Map learning units to subjects using grouping logic from attendance
  const subjectGroups = groupUnits(rawUnitsForGrouping);
  const courseLookup = new Map();

  for (const group of subjectGroups) {
    const shortLabel = extractShortCourseName(group.label);
    for (const u of group.units) {
      const compLabel = componentLabel(u);
      const isPractical = Boolean(u.parsed?.isPractical || compLabel.toLowerCase() !== 'lecture');
      courseLookup.set(u.courseHash, {
        subjectKey: group.key,
        subjectLabel: shortLabel,
        component: compLabel,
        isPractical,
        unitName: u.name,
        fullName: u.fullName
      });
    }
  }

  const resolveSubjectInfo = (cHash, cTitle, cShort) => {
    if (cHash && courseLookup.has(cHash)) {
      return courseLookup.get(cHash);
    }
    const name = cShort || cTitle || 'General';
    const parsed = parseCourseName(name);
    const compLabel = parsed.isPractical ? (parsed.marker || 'Lab') : 'Lecture';
    const shortLabel = extractShortCourseName(parsed.base || name);
    return {
      subjectKey: parsed.key || normalizeKey(shortLabel),
      subjectLabel: shortLabel,
      component: compLabel.charAt(0).toUpperCase() + compLabel.slice(1).toLowerCase(),
      isPractical: parsed.isPractical,
      unitName: name,
      fullName: cTitle || name
    };
  };

  // 4. Query assessments across containers
  const rawAssessments = [];
  const seenAssessmentHashes = new Set();

  for (const container of queryContainers) {
    try {
      const assessUrl = `${origin}/api/v2/course/h/${encodeURIComponent(container.hash)}/assessment/all/?pagination=false`;
      let aRes = await fetch(assessUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${cleanToken}`
        }
      });

      // Fallback if pagination=false not supported
      if (!aRes.ok && aRes.status !== 401 && aRes.status !== 403) {
        const pagedUrl = `${origin}/api/v2/course/h/${encodeURIComponent(container.hash)}/assessment/all/?limit=100&offset=0`;
        aRes = await fetch(pagedUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          }
        });
      }

      if (aRes.ok) {
        const aData = await aRes.json();
        const results = Array.isArray(aData.results) ? aData.results : (Array.isArray(aData) ? aData : []);
        results.forEach(item => {
          if (item?.hash && !seenAssessmentHashes.has(item.hash)) {
            seenAssessmentHashes.add(item.hash);
            rawAssessments.push({ item, container });
          }
        });
      }
    } catch (e) {
      console.warn(`[QuizClient] Failed to fetch assessments for container ${container.hash}:`, e);
    }
  }

  // 5. Filter strictly for unsubmitted assessments (Requirement 3)
  // - If mapping is null: client has not started the quiz -> include
  // - If mapping is not null and completed === false: client started but did not submit -> include
  // - If mapping is not null and completed === true: submitted -> exclude
  const unsubmittedList = [];

  for (const { item, container } of rawAssessments) {
    const mapping = item.course_user_assessment_mapping || null;

    if (mapping && mapping.completed === true) {
      continue;
    }

    const courseObj = item.course || {};
    // Ensure courseHash points to child learning unit, never an admin unit container
    let resolvedCourseHash = courseObj.hash || item.course_hash || (container.isChild ? container.hash : null);
    if (resolvedCourseHash && adminCourseHashes.has(resolvedCourseHash)) {
      resolvedCourseHash = null;
    }
    if (!resolvedCourseHash && container.isChild) {
      resolvedCourseHash = container.hash;
    }
    if (!resolvedCourseHash) {
      const matchUnit = rawUnitsForGrouping.find(u =>
        (courseObj.short_display_name && normalizeKey(u.name) === normalizeKey(courseObj.short_display_name)) ||
        (courseObj.title && normalizeKey(u.fullName) === normalizeKey(courseObj.title)) ||
        (item.course_title && normalizeKey(u.name) === normalizeKey(item.course_title))
      );
      if (matchUnit) {
        resolvedCourseHash = matchUnit.courseHash;
      }
    }

    const effectiveCourseHash = resolvedCourseHash || item.course_hash || (container.isChild ? container.hash : (rawUnitsForGrouping[0]?.courseHash || container.hash));
    const subjectInfo = resolveSubjectInfo(effectiveCourseHash, courseObj.title, courseObj.short_display_name || item.course_title);

    // Requirement 2: Deadline and earnable XP halving calculation
    const earnableXpObj = item.earnable_xp || {};
    const rawXP = Number(
      earnableXpObj.earnable_points ??
      earnableXpObj.earnable_point ??
      item.earnable_points ??
      item.earnable_point ??
      item.max_xp ??
      item.max_marks ??
      item.total_marks ??
      mapping?.marks ??
      0
    );

    const deadlineRaw = earnableXpObj.deadline || item.end_timestamp || null;
    let deadlineTs = null;
    if (deadlineRaw) {
      const parsedD = new Date(deadlineRaw).getTime();
      if (!isNaN(parsedD)) {
        deadlineTs = parsedD;
      }
    }

    const isPastDeadline = Boolean(deadlineTs && Date.now() > deadlineTs);
    // Newton LMS awards half the earnable XP if submitted after deadline
    const maxXP = isPastDeadline ? Math.floor(rawXP / 2) : rawXP;

    const totalQuestions = Number(
      mapping?.total_question_count ??
      item.total_questions ??
      item.total_question_count ??
      item.question_count ??
      0
    );

    const attemptedCount = Number(
      mapping?.solved_question_count ??
      mapping?.attempted_count ??
      mapping?.attempted_question_count ??
      0
    );

    unsubmittedList.push({
      hash: item.hash,
      title: item.title || 'Quiz Assessment',
      courseHash: effectiveCourseHash,
      courseTitle: subjectInfo.subjectLabel,
      subjectKey: subjectInfo.subjectKey,
      subjectLabel: subjectInfo.subjectLabel,
      component: subjectInfo.component,
      isPractical: subjectInfo.isPractical,
      rawXP,
      earnablePoints: rawXP,
      maxXP,
      isPastDeadline,
      deadline: deadlineTs,
      isXPEnabled: Boolean(earnableXpObj.is_xp_enabled),
      totalQuestions,
      attemptedCount,
      rawItem: item,
      hasAnswersInDb: false,
      solutionData: null
    });
  }

  // 6. Cross-reference unsubmitted quizzes with Supabase
  const hashes = unsubmittedList.map(q => q.hash);
  const solutionMap = await batchCheckSolutionsInSupabase(hashes);

  unsubmittedList.forEach(quiz => {
    const sol = solutionMap[quiz.hash];
    const hasAnswers = Boolean(
      sol?.exists &&
      sol?.hasAnswers &&
      Array.isArray(sol?.data?.questions) &&
      sol.data.questions.length > 0
    );

    quiz.hasAnswersInDb = hasAnswers;
    quiz.solutionData = hasAnswers ? sol.data : null;

    if (quiz.totalQuestions === 0 && sol?.data?.totalQuestions) {
      quiz.totalQuestions = sol.data.totalQuestions;
    }
  });

  // Requirement 7: Filter out placeholder quizzes with 0 questions
  const validQuizzes = unsubmittedList.filter(q => q.totalQuestions > 0);

  // 7. Group unsubmitted quizzes by subject and separate lectures vs labs (Requirement 4)
  const groupedBySubject = {};

  for (const quiz of validQuizzes) {
    const groupKey = quiz.subjectLabel;
    if (!groupedBySubject[groupKey]) {
      groupedBySubject[groupKey] = {
        subjectKey: quiz.subjectKey,
        subjectLabel: quiz.subjectLabel,
        lectures: [],
        labs: [],
        quizzes: []
      };
    }
    groupedBySubject[groupKey].quizzes.push(quiz);
    if (quiz.isPractical) {
      groupedBySubject[groupKey].labs.push(quiz);
    } else {
      groupedBySubject[groupKey].lectures.push(quiz);
    }
  }

  // Sort each subject: quizzes with answers in DB first, then by title
  const sortFn = (a, b) => {
    if (a.hasAnswersInDb !== b.hasAnswersInDb) {
      return a.hasAnswersInDb ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  };

  Object.values(groupedBySubject).forEach(group => {
    group.quizzes.sort(sortFn);
    group.lectures.sort(sortFn);
    group.labs.sort(sortFn);
  });

  // Backward compatibility alias for groupedByCourse
  const groupedByCourse = {};
  for (const [k, v] of Object.entries(groupedBySubject)) {
    groupedByCourse[k] = v.quizzes;
  }

  const solvableCount = validQuizzes.filter(q => q.hasAnswersInDb).length;

  return {
    quizzes: validQuizzes,
    groupedBySubject,
    groupedByCourse,
    totalCount: validQuizzes.length,
    solvableCount
  };
}

/**
 * Automates quiz answering and final submission to Newton LMS using verified solutions from Supabase
 *
 * @param {object} options
 * @param {string} options.token - Student Bearer auth token
 * @param {string} options.courseHash - Course hash
 * @param {string} options.assessmentHash - Assessment hash
 * @param {object} [options.solutions] - Optional pre-fetched Supabase solution object
 * @param {string} [options.origin] - LMS base URL (default: https://my.newtonschool.co)
 * @param {Function} [options.onProgress] - Optional progress callback
 * @returns {Promise<{success: boolean, marks?: number, completed: boolean, details?: object}>}
 */
export async function submitQuizWithSupabaseSolutions({
  token,
  courseHash,
  assessmentHash,
  solutions = null,
  origin = 'https://my.newtonschool.co',
  onProgress = null,
  delayOptions = null
} = {}) {
  const cleanToken = extractCleanAuthToken(token);
  if (!cleanToken) {
    throw new Error('NO_TOKEN');
  }

  const cleanAssessment = String(assessmentHash || '').replace(/^h\//i, '').replace(/^\/+|\/+$/g, '').trim();
  const cleanCourse = String(courseHash || '').replace(/^h\//i, '').replace(/^\/+|\/+$/g, '').trim();

  if (!cleanAssessment || !cleanCourse) {
    throw new Error('MISSING_IDENTIFIERS');
  }

  // 1. Resolve solutions if not already provided
  let solDoc = solutions;
  if (!solDoc || !Array.isArray(solDoc.questions) || solDoc.questions.length === 0) {
    if (onProgress) onProgress({ stage: 'fetching_solutions', message: 'Fetching solutions from Supabase...' });
    const checkRes = await checkSolutionsInSupabase(cleanAssessment);
    if (!checkRes.exists || !checkRes.hasAnswers || !checkRes.data) {
      throw new Error('No verified answers found in database for this assessment.');
    }
    solDoc = checkRes.data;
  }

  const dbQuestions = Array.isArray(solDoc.questions) ? solDoc.questions : [];
  if (dbQuestions.length === 0) {
    throw new Error('Solution dataset in database contains zero questions.');
  }

  // 2. Pre-check: Acknowledge honor code if required
  try {
    const instrUrl = `${origin}/api/v1/course/h/${cleanCourse}/assessment/h/${cleanAssessment}/instructions/`;
    const instrRes = await fetch(instrUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${cleanToken}`
      }
    });

    if (instrRes.ok) {
      const instr = await instrRes.json();
      if (instr?.honor_code && !instr?.has_acknowledged_honor_code) {
        const hcUrl = `${origin}/api/v1/integrated_assessments/${cleanCourse}/h/${cleanAssessment}/honor_code/`;
        await fetch(hcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          },
          body: JSON.stringify({ acknowledged: true })
        });
      }
    }
  } catch (e) {
    // Instructions check failure is non-fatal (e.g. if attempt already started)
  }

  // 3. Establish active attempt session on Newton LMS
  if (onProgress) onProgress({ stage: 'starting_session', message: 'Opening quiz attempt session on LMS...' });
  let sessionData = null;

  // Attempt 3a: Start new attempt
  try {
    const newAttemptUrl = `${origin}/api/v1/course/h/${cleanCourse}/assessment/h/${cleanAssessment}/questions/?new_attempt=true`;
    const startRes = await fetch(newAttemptUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${cleanToken}`
      }
    });

    if (startRes.ok) {
      sessionData = await startRes.json();
    }
  } catch (e) {}

  // Attempt 3b: If new attempt was already started, resume session
  if (!sessionData || !Array.isArray(sessionData.questions) || sessionData.questions.length === 0) {
    const resumeUrl = `${origin}/api/v1/course/h/${cleanCourse}/assessment/h/${cleanAssessment}/questions/`;
    const resumeRes = await fetch(resumeUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${cleanToken}`
      }
    });

    if (resumeRes.ok) {
      sessionData = await resumeRes.json();
    } else {
      const errText = await resumeRes.text();
      throw new Error(`Failed to access quiz attempt session: HTTP ${resumeRes.status} (${errText})`);
    }
  }

  const liveQuestions = Array.isArray(sessionData.questions) ? sessionData.questions : [];
  if (liveQuestions.length === 0) {
    throw new Error('Newton LMS returned 0 questions for this assessment attempt.');
  }

  // 4. Answer each question sequentially
  const actionUrl = `${origin}/api/v1/course/h/${cleanCourse}/assessment/h/${cleanAssessment}/question/`;
  let answeredCount = 0;

  for (let i = 0; i < liveQuestions.length; i++) {
    if (delayOptions?.isStopped && delayOptions.isStopped()) {
      throw new Error('SUBMISSION_STOPPED');
    }

    const activeQ = liveQuestions[i];

    // Always register "viewed" state on Newton LMS as soon as question is opened/rendered
    if (activeQ?.hash) {
      try {
        await fetch(actionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanToken}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            hash: activeQ.hash
          })
        });
      } catch (viewErr) {
        console.warn(`[QuizClient] Failed to register viewed state for question ${i + 1}:`, viewErr);
      }
    }

    // Lazy Submit delay before answering each question
    if (delayOptions?.enabled && (!delayOptions.shouldSkipDelay || !delayOptions.shouldSkipDelay())) {
      const baseSec = Number(delayOptions.baseDelaySec) || 0;
      const entSec = Number(delayOptions.entropySec) || 0;
      const delaySec = computeQuestionDelay(baseSec, entSec);
      const delayMs = Math.round(delaySec * 1000);

      if (delayMs > 0 && typeof delayOptions.waitWithProgress === 'function') {
        if (onProgress) {
          onProgress({
            stage: 'waiting',
            current: i + 1,
            total: liveQuestions.length,
            delaySec,
            remainingSec: delaySec,
            message: `Q ${i + 1}/${liveQuestions.length} • Waiting ${delaySec.toFixed(1)}s before submit...`
          });
        }

        await delayOptions.waitWithProgress({
          questionIndex: i,
          totalQuestions: liveQuestions.length,
          targetDelayMs: delayMs,
          delaySec,
          onTick: (elapsedMs, remainingMs) => {
            if (onProgress) {
              const remSec = Math.max(0, remainingMs / 1000);
              onProgress({
                stage: 'waiting',
                current: i + 1,
                total: liveQuestions.length,
                delaySec,
                remainingSec: remSec,
                message: `Q ${i + 1}/${liveQuestions.length} • Waiting ${remSec.toFixed(1)}s before submit...`
              });
            }
          }
        });
      }
    }

    if (delayOptions?.isStopped && delayOptions.isStopped()) {
      throw new Error('SUBMISSION_STOPPED');
    }

    if (onProgress) {
      onProgress({
        stage: 'answering',
        current: i + 1,
        total: liveQuestions.length,
        message: `Answering question ${i + 1} of ${liveQuestions.length}...`
      });
    }

    const matchedDbQ = findMatchingDbQuestion(activeQ, dbQuestions, i);
    if (!matchedDbQ) {
      console.warn(`[QuizClient] No database solution match for question index ${i}`);
      continue;
    }

    const answerVal = determineAnswerValue(activeQ, matchedDbQ);
    const payload = {
      hash: activeQ.hash,
      value: answerVal,
      input_answer: answerVal,
      client_marked_at: Date.now()
    };

    try {
      const ansRes = await fetch(actionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (ansRes.ok) {
        answeredCount++;
      } else {
        console.warn(`[QuizClient] Answering question ${activeQ.hash} returned HTTP ${ansRes.status}`);
      }
    } catch (e) {
      console.warn(`[QuizClient] Failed to answer question ${activeQ.hash}:`, e);
    }
  }

  // Check if stopped before finalizing
  if (delayOptions?.isStopped && delayOptions.isStopped()) {
    throw new Error('SUBMISSION_STOPPED');
  }

  // 5. Finalize and submit the assessment
  if (onProgress) onProgress({ stage: 'submitting', message: 'Submitting finalized quiz...' });
  const submitUrl = `${origin}/api/v1/course/h/${cleanCourse}/assessment/h/${cleanAssessment}/questions/?auto_submit=false`;
  const submitRes = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cleanToken}`,
      'Accept': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Newton LMS submission failed: HTTP ${submitRes.status} (${errText})`);
  }

  const resultData = await submitRes.json();
  console.log(`[QuizClient] Quiz ${cleanAssessment} successfully submitted:`, resultData);

  return {
    success: true,
    marks: resultData?.marks ?? resultData?.course_user_assessment_mapping?.marks ?? null,
    completed: resultData?.completed !== false,
    answeredCount,
    totalQuestions: liveQuestions.length,
    details: resultData
  };
}
