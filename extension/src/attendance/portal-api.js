/**
 * portal-api.js - Newton School LMS Attendance API Service
 *
 * Based on the reverse-engineered endpoints and logic from nst-attendance by yats0x7.
 * Adapts and extends API interaction to work both in content scripts and in popup contexts.
 */

import { groupUnits, componentLabel } from './grouping.js';
import { combine, summarize, DEFAULT_TARGET } from './math.js';

const PORTAL_ORIGIN = 'https://my.newtonschool.co';

const PATHS = {
  appliedCourses: () => `/api/v2/course/all/applied/?pagination=false&completed=false`,
  redirection: (hash) => `/api/v1/course/h/${encodeURIComponent(hash)}/course_redirection_details/`,
  learningCourses: (hash) => `/api/v2/course/h/${encodeURIComponent(hash)}/learning_course/all/?pagination=false`,
  selfPerformance: (hash) => `/api/v2/course/h/${encodeURIComponent(hash)}/self_performance/`,
  lectures: (hash) => `/api/v2/course/h/${encodeURIComponent(hash)}/lecture/all/?pagination=false`,
};

/**
 * Concurrency limiter to prevent flooding the server
 */
const MAX_CONCURRENT = 4;
let inFlight = 0;
const waiting = [];

function acquire() {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else inFlight -= 1;
}

/**
 * Robust fetch helper with bearer token and timeout
 */
async function fetchApi(path, token, origin = PORTAL_ORIGIN) {
  await acquire();
  try {
    const url = path.startsWith('http') ? path : `${origin}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.status === 401 || res.status === 403) {
      throw new Error('AUTH_EXPIRED');
    }
    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }
    return await res.json();
  } finally {
    release();
  }
}

/**
 * Resolves the active semester hash and title for a student.
 */
export async function resolveActiveSemester(token, preferredCourseHash = null, origin = PORTAL_ORIGIN) {
  // If we have a course hash from active page, check redirection details first
  if (preferredCourseHash) {
    try {
      const details = await fetchApi(PATHS.redirection(preferredCourseHash), token, origin);
      if (details?.admin_course?.hash) {
        return {
          semesterHash: details.admin_course.hash,
          semesterTitle: details.admin_course.title || 'Current Semester'
        };
      }
    } catch (e) {
      console.warn('[newNewton] Redirection lookup failed, falling back to applied courses:', e);
    }
  }

  // Fallback: Query all applied courses to find the active semester container
  try {
    const programs = await fetchApi(PATHS.appliedCourses(), token, origin);
    if (Array.isArray(programs)) {
      for (const prog of programs) {
        const adminCourses = prog?.children_courses?.admin_unit_courses || [];
        // Look for the active semester
        const active = adminCourses.find(c => c.is_active_admin_unit_course) || adminCourses[0];
        if (active?.hash) {
          return {
            semesterHash: active.hash,
            semesterTitle: active.title || 'Current Semester'
          };
        }
      }
    }
  } catch (err) {
    console.warn('[newNewton] Applied courses lookup failed:', err);
  }

  if (preferredCourseHash) {
    return { semesterHash: preferredCourseHash, semesterTitle: 'Current Semester' };
  }
  throw new Error('NO_SEMESTER_FOUND');
}

/**
 * Fetches all attendance statistics, lecture histories, groups subjects, and computes verdicts.
 */
export async function fetchFullAttendanceData({ token, preferredCourseHash = null, target = DEFAULT_TARGET, origin = PORTAL_ORIGIN }) {
  if (!token) {
    throw new Error('NO_TOKEN');
  }

  // 1. Resolve Semester
  const { semesterHash, semesterTitle } = await resolveActiveSemester(token, preferredCourseHash, origin);

  // 2. List Learning Courses (Subjects + Labs)
  const coursesList = await fetchApi(PATHS.learningCourses(semesterHash), token, origin);
  if (!Array.isArray(coursesList) || coursesList.length === 0) {
    throw new Error('NO_COURSES_FOUND');
  }

  const rawUnits = coursesList
    .filter(c => c?.hash)
    .map(c => ({
      courseHash: c.hash,
      name: c.short_display_name || c.title || c.hash,
      fullName: c.title || c.short_display_name || c.hash
    }));

  // 3. Concurrently fetch statistics and lectures for each unit
  const unitsWithData = await Promise.all(
    rawUnits.map(async (unit) => {
      try {
        const [perf, lecturesRes] = await Promise.all([
          fetchApi(PATHS.selfPerformance(unit.courseHash), token, origin),
          fetchApi(PATHS.lectures(unit.courseHash), token, origin).catch(() => [])
        ]);

        const held = Number(perf?.total_lectures) || 0;
        const attended = Number(perf?.total_lectures_attended) || 0;

        const lectures = Array.isArray(lecturesRes)
          ? lecturesRes
              .filter(l => l?.hash)
              .map(l => ({
                hash: l.hash,
                title: l.title || 'Lecture',
                start: l.start_timestamp || null,
                attended: l.attended === true,
                waived: l.attendance_waived === true
              }))
              .sort((a, b) => new Date(b.start || 0) - new Date(a.start || 0))
          : [];

        return {
          ...unit,
          held,
          attended,
          lectures
        };
      } catch (err) {
        console.warn(`[newNewton] Failed to fetch stats for unit ${unit.name}:`, err);
        return {
          ...unit,
          held: 0,
          attended: 0,
          lectures: []
        };
      }
    })
  );

  // 4. Group Theory and Lab components using grouping.js
  const groups = groupUnits(unitsWithData);

  // 5. Calculate attendance rollups and verdicts using math.js
  const processedSubjects = groups.map(group => {
    const summary = summarize(group.units, { target });
    const { attended, held } = combine(group.units);

    // Extract missed lectures across all components in this subject
    const missedLectures = group.units.flatMap(u => {
      const compLabel = componentLabel(u);
      const isPractical = Boolean(u.parsed?.isPractical || (compLabel.toLowerCase() !== 'lecture'));
      return (u.lectures || [])
        .filter(l => !l.attended)
        .map(l => ({
          ...l,
          component: compLabel,
          isPractical
        }));
    }).sort((a, b) => new Date(b.start || 0) - new Date(a.start || 0));

    return {
      key: group.key,
      label: group.label,
      units: group.units.map(u => ({
        courseHash: u.courseHash,
        name: u.name,
        held: u.held,
        attended: u.attended,
        component: componentLabel(u),
        isPractical: Boolean(u.parsed?.isPractical || (componentLabel(u).toLowerCase() !== 'lecture'))
      })),
      attended,
      held,
      percentage: summary.percentage,
      percentageFormatted: summary.percentage === null ? '—' : `${(summary.percentage * 100).toFixed(1)}%`,
      meetsTarget: summary.meetsTarget,
      headline: summary.headline,
      skipsAffordable: summary.skipsAffordable,
      classesToRecover: summary.classesToRecover,
      missedLectures
    };
  });

  return {
    semesterHash,
    semesterTitle,
    timestamp: Date.now(),
    target,
    subjects: processedSubjects
  };
}
