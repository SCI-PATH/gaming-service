/**
 * Launch from SCI-PATH Next.js (or any parent) via URL query params.
 *
 * Example:
 *   http://localhost:5173/?studentId=abc&username=alex&displayName=Alex&sessionId=sess_xyz&topicId=plant_biology&grade=7&source=sci-path
 */
import { loginStudentFromPlatform } from './mockStudents.js';
import { applyRemoteFarmProgress, applyChapterFarmLevel } from './farmProgress.js';
import {
  applyChapterLaunch,
  grantLearningPathReward,
} from './chapterPath.js';

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
 *   startLevel: number | null,
 *   cash: number | null,
 *   lessonId: string | null,
 *   chapterTitle: string | null,
 *   nextLessonId: string | null,
 *   nextChapterTitle: string | null,
 *   rewardItem: string | null,
 *   returnUrl: string | null,
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

  const levelRaw =
    search.get('startLevel') || search.get('level') || search.get('currentLevel');
  const startLevel =
    levelRaw != null && levelRaw !== '' && Number.isFinite(Number(levelRaw))
      ? Math.max(1, Number(levelRaw))
      : null;

  const cashRaw = search.get('cash') || search.get('wallet');
  const cash =
    cashRaw != null && cashRaw !== '' && Number.isFinite(Number(cashRaw))
      ? Math.max(0, Number(cashRaw))
      : null;

  const lessonId = String(search.get('lessonId') || search.get('chapterId') || '').trim();
  const chapterTitle = String(search.get('chapterTitle') || '').trim();
  const nextLessonId = String(search.get('nextLessonId') || '').trim();
  const nextChapterTitle = String(
    search.get('nextTitle') || search.get('nextChapterTitle') || '',
  ).trim();
  const rewardItem = String(search.get('rewardItem') || search.get('unlockItem') || '').trim();
  const returnUrl = String(search.get('returnUrl') || '').trim();

  return {
    studentId,
    username,
    displayName,
    sessionId: sessionId || null,
    topicId: topicId || null,
    grade,
    startLevel,
    cash,
    lessonId: lessonId || null,
    chapterTitle: chapterTitle || null,
    nextLessonId: nextLessonId || null,
    nextChapterTitle: nextChapterTitle || null,
    rewardItem: rewardItem || null,
    returnUrl: returnUrl || null,
    source: search.get('source') || null,
  };
}

/**
 * If URL contains platform launch params, log the student in locally and return context.
 * Safe to call once on app boot.
 */
export function resolvePlatformLaunch() {
  const search = readSearchParams();
  const launch = parsePlatformLaunchFromUrl(search);
  if (!launch) {
    return { student: null, sessionId: null, fromPlatform: false };
  }

  const chapter = applyChapterLaunch(search);

  const student = loginStudentFromPlatform({
    id: launch.studentId,
    username: launch.username,
    displayName: launch.displayName,
    grade: launch.grade,
    topicId: launch.topicId,
    sessionId: launch.sessionId,
  });
  if (student && chapter.lessonId) {
    student.lessonId = chapter.lessonId;
    student.chapterTitle = chapter.chapterTitle;
  }

  const startLevel =
    chapter.startLevel != null
      ? chapter.startLevel
      : launch.startLevel;

  if (student && startLevel != null) {
    applyChapterFarmLevel(startLevel, launch.cash);
    if (chapter.rewardItem || chapter.lessonId) {
      grantLearningPathReward(startLevel, chapter.rewardItem);
    }
  } else if (student && (launch.startLevel != null || launch.cash != null)) {
    applyRemoteFarmProgress({
      currentLevel: launch.startLevel,
      highestCompletedLevel:
        launch.startLevel != null ? Math.max(0, launch.startLevel - 1) : 0,
      cash: launch.cash,
    });
  }

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
        'startLevel',
        'level',
        'currentLevel',
        'cash',
        'wallet',
        'source',
        'lessonId',
        'chapterId',
        'chapterTitle',
        'nextLessonId',
        'nextTitle',
        'nextChapterTitle',
        'rewardItem',
        'unlockItem',
        'returnUrl',
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
    startLevel,
    cash: launch.cash,
    lessonId: chapter.lessonId || launch.lessonId,
    chapterTitle: chapter.chapterTitle || launch.chapterTitle,
    nextLessonId: chapter.nextLessonId || launch.nextLessonId,
    nextChapterTitle: chapter.nextChapterTitle || launch.nextChapterTitle,
    fromPlatform: Boolean(student),
    fromLearningPath: Boolean(chapter.fromLearningPath && chapter.lessonId),
    source: launch.source,
  };
}
