/**
 * Launch from SCI-PATH Next.js (or any parent) via URL query params.
 *
 * Example:
 *   http://localhost:5173/?studentId=abc&displayName=Alex&sessionId=sess_xyz&grade=7&source=sci-path
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
 * @returns {{ studentId: string, displayName: string, sessionId: string, grade: number | null, source: string | null } | null}
 */
export function parsePlatformLaunchFromUrl(search = readSearchParams()) {
  if (!search) return null;
  const studentId = String(search.get('studentId') || '').trim();
  const displayName = String(
    search.get('displayName') || search.get('studentName') || '',
  ).trim();
  const sessionId = String(search.get('sessionId') || '').trim();
  if (!studentId || !displayName) return null;

  const gradeRaw = search.get('grade');
  const grade =
    gradeRaw != null && gradeRaw !== '' && Number.isFinite(Number(gradeRaw))
      ? Number(gradeRaw)
      : null;

  return {
    studentId,
    displayName,
    sessionId: sessionId || null,
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
    displayName: launch.displayName,
    grade: launch.grade,
  });

  // Clean URL so refresh doesn't duplicate telemetry bootstrap noise
  if (typeof window !== 'undefined' && window.history?.replaceState) {
    try {
      const clean = new URL(window.location.href);
      for (const key of [
        'studentId',
        'displayName',
        'studentName',
        'sessionId',
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
    fromPlatform: Boolean(student),
    source: launch.source,
  };
}
