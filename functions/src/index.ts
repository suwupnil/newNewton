import {onRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// Target Delhi NCR region (asia-south2) for minimum network latency
setGlobalOptions({
  region: "asia-south2",
  maxInstances: 10,
});

interface ArchiveQuizRequest {
  courseHash: string;
  assessmentHash: string;
  authToken?: string;
  title?: string;
  quizTitle?: string;
  questions?: NormalizedQuestion[] | any[];
  hasAnswersRevealed?: boolean;
}

interface QuizDocumentPayload {
  assessmentHash: string;
  courseHash: string;
  title?: string | null;
  quizTitle?: string | null;
  totalQuestions?: number;
  hasAnswersRevealed?: boolean;
  questions: NormalizedQuestion[] | any[];
}

interface InitialSyncRequest {
  uid?: string;
  authToken?: string;
  courseHash?: string;
  quizzes?: QuizDocumentPayload[];
}

interface NormalizedOption {
  id: string; // "A", "B", "C", "D", "E"
  text: string;
  image: string | null;
}

interface NormalizedQuestion {
  questionHash: string;
  mcqHash?: string;
  questionText: string;
  questionType: number;
  marks: number;
  options: NormalizedOption[];
  correctChoice: number | null; // 1-based index (1 = A, 2 = B, ...)
  correctChoiceLetter: string | null;
  correctExplanation: string | null;
  correctPuzzleAnswer?: string | null;
}

const CHOICE_LETTERS = ["A", "B", "C", "D", "E"];

function extractCleanAuthToken(raw: string): string {
  if (!raw) return "";
  let parsed: any = raw;
  let attempts = 0;
  while (typeof parsed === "string" && attempts < 3) {
    try {
      const temp = JSON.parse(parsed);
      if (typeof temp === "object" || typeof temp === "string") {
        parsed = temp;
      } else {
        break;
      }
    } catch {
      break;
    }
    attempts++;
  }

  let tokenStr = "";
  if (typeof parsed === "string") {
    const tokenMatch = parsed.match(/['"]?(?:access_)?token['"]?\s*:\s*['"]?([^'"}\s]+)['"]?/i);
    if (tokenMatch) {
      tokenStr = tokenMatch[1];
    } else {
      tokenStr = parsed;
    }
  } else if (typeof parsed === "object" && parsed !== null) {
    tokenStr = parsed.token || parsed.access_token || "";
  }

  if (typeof tokenStr === "string") {
    return tokenStr.replace(/^Bearer\s+/i, "").trim();
  }
  return "";
}

/**
 * Normalizes raw Newton LMS questions array into clean, structured questions
 */
function normalizeNewtonQuestions(rawQuestions: any[]): NormalizedQuestion[] {
  if (!Array.isArray(rawQuestions)) return [];

  return rawQuestions.map((q) => {
    const mcq = q.multiple_choice_question || {};
    const questionType = mcq.question_type || q.question_type || 1;

    const options: NormalizedOption[] = [];
    CHOICE_LETTERS.forEach((letter) => {
      const textKey = `choice_${letter}_text`;
      const imgKey = `choice_${letter}_image`;
      const text = mcq[textKey];
      const image = mcq[imgKey] || null;

      if (text !== undefined && text !== null && text !== "") {
        options.push({
          id: letter,
          text: String(text).trim(),
          image: image,
        });
      }
    });

    const correctChoice = typeof mcq.correct_choice === "number" ? mcq.correct_choice : null;
    const correctLetter = correctChoice && correctChoice >= 1 && correctChoice <= 5 ?
      CHOICE_LETTERS[correctChoice - 1] :
      null;

    return {
      questionHash: q.hash || "",
      mcqHash: mcq.hash || undefined,
      questionText: mcq.question_text || "",
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
 * Helper to fetch questions from Newton LMS API and archive them in Firestore
 */
async function fetchAndArchiveQuiz(
  courseHash: string,
  assessmentHash: string,
  cleanToken: string,
  quizTitle?: string
): Promise<{status: "ALREADY_EXISTS" | "ARCHIVED" | "FAILED" | "NO_ANSWERS"; error?: string}> {
  const docRef = db.collection("quizzes").doc(assessmentHash);

  // 1. Check if Firestore already has questions for this assessment
  const existingDoc = await docRef.get();
  if (existingDoc.exists) {
    const existingData = existingDoc.data() || {};
    if (Array.isArray(existingData.questions) && existingData.questions.length > 0) {
      return {status: "ALREADY_EXISTS"};
    }
  }

  // 2. Query Newton LMS API for questions & answers
  const lmsUrl = `https://my.newtonschool.co/api/v1/course/h/${courseHash}/assessment/h/${assessmentHash}/questions/`;
  const lmsResponse = await fetch(lmsUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${cleanToken}`,
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
  });

  if (!lmsResponse.ok) {
    const errText = await lmsResponse.text();
    return {status: "FAILED", error: `HTTP ${lmsResponse.status}: ${errText}`};
  }

  const rawData = await lmsResponse.json();
  const rawQuestions = Array.isArray(rawData) ? rawData : (rawData.questions || []);
  if (!rawQuestions || rawQuestions.length === 0) {
    return {status: "FAILED", error: "Empty questions list returned from LMS"};
  }

  // 3. Normalize questions
  const normalizedQuestions = normalizeNewtonQuestions(rawQuestions);
  const hasSolutions = normalizedQuestions.some(
    (q) => q.correctChoice !== null || q.correctExplanation !== null
  );

  const docPayload = {
    assessmentHash: assessmentHash,
    courseHash: courseHash,
    title: quizTitle || (existingDoc.exists ? existingDoc.data()?.title : null) || null,
    totalQuestions: normalizedQuestions.length,
    hasAnswersRevealed: hasSolutions,
    questions: normalizedQuestions,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: existingDoc.exists ?
      (existingDoc.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()) :
      admin.firestore.FieldValue.serverTimestamp(),
  };

  // 4. Save to Firestore
  await docRef.set(docPayload, {merge: true});
  return {status: "ARCHIVED"};
}

/**
 * Cloud Function: archiveQuizSolution
 *
 * Receives { courseHash, assessmentHash, authToken }
 * Called immediately upon a quiz submission event.
 * Supports direct questions payload from client, or fetching via authToken.
 */
export const archiveQuizSolution = onRequest({cors: true}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({error: "Method Not Allowed. Use POST."});
    return;
  }

  const body = req.body as Partial<ArchiveQuizRequest>;
  const {courseHash, assessmentHash, authToken} = body;

  if (!courseHash || !assessmentHash) {
    res.status(400).json({
      error: "Missing required fields: courseHash and assessmentHash are required.",
    });
    return;
  }

  try {
    // 1. Direct client ingestion: If client provided questions, save directly to Firestore
    if (Array.isArray(body.questions) && body.questions.length > 0) {
      const docRef = db.collection("quizzes").doc(assessmentHash);
      const existingDoc = await docRef.get();

      const normalized = (body.questions[0]?.multiple_choice_question || body.questions[0]?.choice_A_text) ?
        normalizeNewtonQuestions(body.questions) :
        body.questions;

      const hasSolutions = body.hasAnswersRevealed ?? normalized.some(
        (q: any) => q.correctChoice !== null || q.correctExplanation !== null
      );

      const docPayload = {
        assessmentHash,
        courseHash,
        title: body.title || body.quizTitle || (existingDoc.exists ? existingDoc.data()?.title : null) || null,
        totalQuestions: normalized.length,
        hasAnswersRevealed: hasSolutions,
        questions: normalized,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: existingDoc.exists ?
          (existingDoc.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()) :
          admin.firestore.FieldValue.serverTimestamp(),
      };

      await docRef.set(docPayload, {merge: true});
      logger.info(`[archiveQuizSolution] Directly saved solutions for ${assessmentHash} (Course: ${courseHash})`);
      res.status(200).json({
        status: "SAVED",
        message: "Quiz solutions archived successfully.",
        assessmentHash,
      });
      return;
    }

    // 2. Fallback: Fetch from LMS if authToken is provided
    if (!authToken) {
      res.status(400).json({
        error: "Missing required fields: questions array or authToken is required.",
      });
      return;
    }

    const cleanToken = extractCleanAuthToken(authToken);
    const result = await fetchAndArchiveQuiz(courseHash, assessmentHash, cleanToken);

    if (result.status === "ALREADY_EXISTS") {
      res.status(200).json({
        status: "ALREADY_EXISTS",
        message: "Quiz solutions already exist in Firestore.",
      });
      return;
    }

    if (result.status === "FAILED") {
      res.status(502).json({
        error: "Failed to fetch solutions from LMS API",
        details: result.error,
      });
      return;
    }

    res.status(200).json({
      status: "SAVED",
      message: "Quiz solutions archived successfully.",
      assessmentHash,
    });
  } catch (error: any) {
    logger.error("[archiveQuizSolution] Unexpected error:", error);
    res.status(500).json({
      error: "Internal server error occurred while archiving quiz solutions.",
      details: error.message,
    });
  }
});

/**
 * Cloud Function: batchSaveQuizzes
 *
 * Ingestion API for client-extracted quiz batches.
 * Accepts { quizzes: QuizDocumentPayload[], uid?: string }
 */
export const batchSaveQuizzes = onRequest({cors: true, timeoutSeconds: 120}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({error: "Method Not Allowed. Use POST."});
    return;
  }

  const {quizzes, uid} = req.body;
  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    res.status(400).json({error: "quizzes array is required and must not be empty."});
    return;
  }

  try {
    let savedCount = 0;
    const CHUNK_SIZE = 400;

    for (let i = 0; i < quizzes.length; i += CHUNK_SIZE) {
      const chunk = quizzes.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();

      for (const item of chunk) {
        if (!item.assessmentHash || !item.courseHash || !Array.isArray(item.questions)) {
          continue;
        }

        const normalized = (item.questions[0]?.multiple_choice_question || item.questions[0]?.choice_A_text) ?
          normalizeNewtonQuestions(item.questions) :
          item.questions;

        const hasSolutions = item.hasAnswersRevealed ?? normalized.some(
          (q: any) => q.correctChoice !== null || q.correctExplanation !== null
        );

        const docRef = db.collection("quizzes").doc(item.assessmentHash);
        const payload = {
          assessmentHash: item.assessmentHash,
          courseHash: item.courseHash,
          title: item.title || item.quizTitle || null,
          totalQuestions: normalized.length,
          hasAnswersRevealed: hasSolutions,
          questions: normalized,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        batch.set(docRef, payload, {merge: true});
        savedCount++;
      }

      await batch.commit();
    }

    if (uid) {
      await db.collection("sync_history").doc(uid).set({
        uid,
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalArchived: savedCount,
      }, {merge: true});
    }

    logger.info(`[batchSaveQuizzes] Successfully archived ${savedCount} quizzes (UID: ${uid || "anonymous"}).`);
    res.status(200).json({
      status: "SUCCESS",
      savedCount,
      message: `Successfully archived ${savedCount} quizzes in Firestore.`,
    });
  } catch (error: any) {
    logger.error("[batchSaveQuizzes] Batch write error:", error);
    res.status(500).json({error: "Failed to batch save quizzes", details: error.message});
  }
});

/**
 * Cloud Function: initialSyncSubmittedQuizzes
 *
 * Triggered on initial sync of past assessments:
 * 1. If quizzes array provided by extension: saves directly via batch!
 * 2. If authToken provided: attempts fallback discovery (may be blocked by LMS datacenter IP filtering).
 */
export const initialSyncSubmittedQuizzes = onRequest({cors: true, timeoutSeconds: 300}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({error: "Method Not Allowed. Use POST."});
    return;
  }

  const body = req.body as Partial<InitialSyncRequest>;
  const {uid, authToken, quizzes} = body;
  let preferredCourseHash = body.courseHash;

  // 1. Direct batch ingestion if client has already fetched quizzes
  if (Array.isArray(quizzes) && quizzes.length > 0) {
    try {
      let savedCount = 0;
      const CHUNK_SIZE = 400;

      for (let i = 0; i < quizzes.length; i += CHUNK_SIZE) {
        const chunk = quizzes.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();

        for (const item of chunk) {
          if (!item.assessmentHash || !item.courseHash || !Array.isArray(item.questions)) {
            continue;
          }

          const normalized = (item.questions[0]?.multiple_choice_question || item.questions[0]?.choice_A_text) ?
            normalizeNewtonQuestions(item.questions) :
            item.questions;

          const hasSolutions = item.hasAnswersRevealed ?? normalized.some(
            (q: any) => q.correctChoice !== null || q.correctExplanation !== null
          );

          const docRef = db.collection("quizzes").doc(item.assessmentHash);
          batch.set(docRef, {
            assessmentHash: item.assessmentHash,
            courseHash: item.courseHash,
            title: item.title || item.quizTitle || null,
            totalQuestions: normalized.length,
            hasAnswersRevealed: hasSolutions,
            questions: normalized,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          }, {merge: true});
          savedCount++;
        }

        await batch.commit();
      }

      if (uid) {
        await db.collection("sync_history").doc(uid).set({
          uid,
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
          summary: {totalFound: quizzes.length, newlyArchived: savedCount, alreadyExisted: 0, failed: 0},
        }, {merge: true});
      }

      logger.info(`[initialSyncSubmittedQuizzes] Batch saved ${savedCount} quizzes from client.`);
      res.status(200).json({
        status: "SUCCESS",
        message: `Successfully archived ${savedCount} quizzes in Firestore.`,
        summary: {totalFound: quizzes.length, newlyArchived: savedCount, alreadyExisted: 0, failed: 0},
      });
      return;
    } catch (err: any) {
      logger.error("[initialSyncSubmittedQuizzes] Batch saving error:", err);
      res.status(500).json({error: "Failed to batch save quizzes", details: err.message});
      return;
    }
  }

  // 2. Fallback: Server-side discovery
  if (!authToken) {
    res.status(400).json({error: "Either quizzes array or authToken is required for initial sync."});
    return;
  }

  const cleanToken = extractCleanAuthToken(authToken);
  logger.info(`[initialSyncSubmittedQuizzes] Starting initial sync for UID: ${uid || "anonymous"}...`);

  try {
    // 1. Resolve Admin Course Hash if not provided
    if (!preferredCourseHash) {
      logger.info("[initialSyncSubmittedQuizzes] No courseHash provided in request. Discovering via applied courses API...");
      const appliedResp = await fetch("https://my.newtonschool.co/api/v2/course/all/applied/?pagination=false&completed=false", {
        headers: {
          "Authorization": `Bearer ${cleanToken}`,
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        },
      });

      if (!appliedResp.ok) {
        const errBody = await appliedResp.text();
        logger.error(`[initialSyncSubmittedQuizzes] Applied courses API failed HTTP ${appliedResp.status}: ${errBody}`);
        res.status(appliedResp.status).json({
          error: `Newton LMS applied courses API failed HTTP ${appliedResp.status}`,
          details: errBody,
        });
        return;
      }

      const programs = await appliedResp.json();
      logger.info(`[initialSyncSubmittedQuizzes] Applied courses response count: ${Array.isArray(programs) ? programs.length : 0}`);

      if (Array.isArray(programs)) {
        for (const prog of programs) {
          const adminCourses = prog?.children_courses?.admin_unit_courses || [];
          const active = adminCourses.find((c: any) => c.is_active_admin_unit_course) || adminCourses[0];
          if (active?.hash) {
            preferredCourseHash = active.hash;
            logger.info(`[initialSyncSubmittedQuizzes] Selected active semester: ${active.title || "Untitled"} (${preferredCourseHash})`);
            break;
          }
          // If no admin_unit_courses, check direct program hash
          if (prog?.hash) {
            preferredCourseHash = prog.hash;
            logger.info(`[initialSyncSubmittedQuizzes] Fallback to program hash: ${prog.title || "Program"} (${preferredCourseHash})`);
            break;
          }
        }
      }
    }

    if (!preferredCourseHash) {
      logger.error("[initialSyncSubmittedQuizzes] Unable to detect active semester course hash from LMS.");
      res.status(404).json({error: "Unable to detect active semester course hash."});
      return;
    }

    logger.info(`[initialSyncSubmittedQuizzes] Querying assessments for course: ${preferredCourseHash}...`);

    // 2. Fetch completed assessments (attempt_statuses=3 = Completed)
    // Section 2.1 & 2.2 of NEWTON_QUIZ_API_SPECIFICATION.md
    const allAssessmentsUrl = `https://my.newtonschool.co/api/v2/course/h/${preferredCourseHash}/assessment/all/?attempt_statuses=3&limit=100&offset=0`;
    const listResp = await fetch(allAssessmentsUrl, {
      headers: {
        "Authorization": `Bearer ${cleanToken}`,
        "Accept": "application/json",
      },
    });

    if (!listResp.ok) {
      const errText = await listResp.text();
      res.status(listResp.status).json({
        error: `Failed to fetch completed assessments list: ${listResp.status}`,
        details: errText,
      });
      return;
    }

    const listData = await listResp.json();
    const assessments = Array.isArray(listData.results) ? listData.results : [];
    logger.info(`[initialSyncSubmittedQuizzes] Found ${assessments.length} submitted quizzes for semester ${preferredCourseHash}.`);

    const summary = {
      totalFound: assessments.length,
      alreadyExisted: 0,
      newlyArchived: 0,
      failed: 0,
    };

    // 3. Process each assessment sequentially to avoid hammering LMS
    for (const item of assessments) {
      const assessmentHash = item.hash;
      const childCourseHash = item.course?.hash || preferredCourseHash;
      const quizTitle = item.title || "";

      if (!assessmentHash) continue;

      try {
        const syncResult = await fetchAndArchiveQuiz(
          childCourseHash,
          assessmentHash,
          cleanToken,
          quizTitle
        );

        if (syncResult.status === "ALREADY_EXISTS") {
          summary.alreadyExisted += 1;
        } else if (syncResult.status === "ARCHIVED") {
          summary.newlyArchived += 1;
          logger.info(`[initialSyncSubmittedQuizzes] Archived solutions for "${quizTitle}" (${assessmentHash})`);
        } else {
          logger.warn(`[initialSyncSubmittedQuizzes] Failed to archive ${assessmentHash}: ${syncResult.error}`);
          summary.failed += 1;
        }
      } catch (itemErr) {
        logger.warn(`[initialSyncSubmittedQuizzes] Error archiving ${assessmentHash}:`, itemErr);
        summary.failed += 1;
      }
    }

    // Optional: Record sync status in a metadata collection for observability
    if (uid) {
      await db.collection("sync_history").doc(uid).set({
        uid,
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        summary,
      }, {merge: true});
    }

    res.status(200).json({
      status: "SUCCESS",
      message: "Initial submitted quizzes sync completed.",
      summary,
    });
  } catch (error: any) {
    logger.error("[initialSyncSubmittedQuizzes] Fatal sync error:", error);
    res.status(500).json({
      error: "Internal server error during initial quiz sync.",
      details: error.message,
    });
  }
});
