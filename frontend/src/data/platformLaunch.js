/**
 * Launch from SCI-PATH Next.js (or any parent) via URL query params.
 *
 * Example:
 *   http://localhost:5173/?studentId=abc&username=alex&displayName=Alex&sessionId=sess_xyz&topicId=plant_biology&grade=7&source=sci-path
 */
import { loginStudentFromPlatform } from './mockStudents.js';

function readSearchParams() {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
}

/**
 * @returns {{
 *   studentId: string,
 *   username: string,
 *   displayName: string,
 *   sessionId: string | null,
 *   topicId: string | null,
 *   grade: number | null,
 *   source: string | null
 * } | null}
 */
export function parsePlatformLaunchFromUrl(search = readSearchParams()) {
  if (!search) return null;
  const studentId = String(search.get('studentId') || '').trim();
  const username = String(search.get('username') || studentId || '').trim();
  const displayName = String(
    search.get('displayName') || search.get('studentName') || username || '',
  ).trim();
  const sessionId = String(search.get('sessionId') || '').trim();
  const topicId = String(search.get('topicId') || search.get('topic') || '').trim();
  if (!studentId || !displayName) return null;

  const gradeRaw = search.get('grade');
  const grade =
    gradeRaw != null && gradeRaw !== '' && Number.isFinite(Number(gradeRaw))
      ? Number(gradeRaw)
      : null;

  return {
    studentId,
    username,
    displayName,
    sessionId: sessionId || null,
    topicId: topicId || null,
    grade,
    source: search.get('source') || null,
  };
}

/**
 * If URL contains platform launch params, log the student in locally and return context.
 * Safe to call once on app boot.
 */
export function resolvePlatformLaunch() {
  const launch = parsePlatformLaunchFromUrl();
  if (!launch) {
    return { student: null, sessionId: null, fromPlatform: false };
  }

  const student = loginStudentFromPlatform({
    id: launch.studentId,
    username: launch.username,
    displayName: launch.displayName,
    grade: launch.grade,
    topicId: launch.topicId,
    sessionId: launch.sessionId,
  });

  // Clean URL so refresh doesn't duplicate telemetry bootstrap noise
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    try {
      const clean = new URL(window.location.href);
      for (const key of [
        'studentId',
        'username',
        'displayName',
        'studentName',
        'sessionId',
        'topicId',
        'topic',
        'grade',
        'source',
      ]) {
        clean.searchParams.delete(key);
      }
      window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);
    } catch {
      /* ignore */
    }
  }

  return {
    student,
    sessionId: launch.sessionId,
    topicId: launch.topicId,
    fromPlatform: Boolean(student),
    source: launch.source,
  };
}
