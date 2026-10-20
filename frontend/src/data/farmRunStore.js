/**
 * In-progress farm snapshot for one student.
 * Stores level, cash, question counts, and frustration so a refresh can resume.
 * A copy is also posted as an in_progress lesson checkpoint.
 */
import { studentStorageKey, getCurrentStudent } from './mockStudents.js';
import { DDA_CONFIG } from './dda.js';
import { getChapterLaunch } from './chapterPath.js';
import { getEngagementSessionId } from './engagementSync.js';
import { saveLessonCheckpoint } from './lessonCheckpoint.js';

const BASE_KEY = 'scipath_farm_run';
const VERSION = 1;

function storageKey() {
  return studentStorageKey(BASE_KEY);
}

/** Saved mid-level run, or null when missing, corrupt, or from an older version. */
export function loadFarmRun() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    // Older snapshot shapes are dropped rather than half-applied.
    if (Number(data.version) !== VERSION) return null;
    const levelId = Math.max(1, Number(data.levelId) || 0);
    if (!levelId) return null;
    return data;
  } catch {
    return null;
  }
}

/** True when a resumable mid-level snapshot is in localStorage. */
export function hasFarmRun() {
  return Boolean(loadFarmRun());
}

/**
 * Database snapshot wins when it is as new as the browser copy.
 * A newer local save is kept until the next successful checkpoint.
 */
export function shouldApplyRemoteSnapshot(local, remote) {
  if (!remote || typeof remote !== 'object') return false;
  if (!local) return true;
  const remoteAt = Number(remote.savedAt) || 0;
  const localAt = Number(local.savedAt) || 0;
  if (!remoteAt && !localAt) return true;
  if (!remoteAt) return false;
  return remoteAt >= localAt;
}

function checkpointBody(record, student, extra = {}) {
  const launch = getChapterLaunch();
  const answered = answeredFromRun(record);
  return {
    studentId: student.id,
    sessionId: student.sessionId || getEngagementSessionId(),
    lessonId: launch.lessonId,
    chapterTitle: launch.chapterTitle,
    status: 'in_progress',
    farmSnapshot: record,
    lastCompletedQuestionIndex: answered,
    eventType: 'farm_snapshot',
    ...extra,
  };
}

function pushFarmSnapshot(record) {
  const student = getCurrentStudent();
  if (!student?.id || typeof fetch === 'undefined') return;
  void saveLessonCheckpoint(checkpointBody(record, student));
}

/** Wait until the active farm, cash, and question index are stored as in_progress. */
export async function flushFarmProgress(snapshot, student = getCurrentStudent()) {
  if (!snapshot || !student?.id) return { ok: false };
  const record = {
    ...snapshot,
    version: VERSION,
    levelId: Math.max(1, Number(snapshot.levelId) || 1),
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(record));
  } catch {
    /* quota */
  }
  return saveLessonCheckpoint(
    checkpointBody(record, student, {
      isFinalSave: true,
      syncQuestionIndex: true,
      eventType: 'logout_snapshot',
    }),
  );
}

/** Write the live run locally and, unless remote is false, push the checkpoint. */
export function saveFarmRun(snapshot, options = {}) {
  if (!snapshot || !Number(snapshot.levelId)) return null;
  const record = {
    ...snapshot,
    version: VERSION,
    sessionId: snapshot.sessionId || getEngagementSessionId() || null,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(record));
  } catch {
    /* quota */
  }
  if (options.remote !== false) pushFarmSnapshot(record);
  return record;
}

/** Drop the local snapshot after the level ends or the student leaves. */
export function clearFarmRun() {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    /* ignore */
  }
}

/** Questions used this run. Falls back to correct + incorrect when the count is missing. */
export function answeredFromRun(snapshot) {
  if (!snapshot) return 0;
  const explicit = Number(snapshot.questionsAnswered);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(0, explicit);
  return Math.max(
    0,
    (Number(snapshot.quizCorrect) || 0) + (Number(snapshot.quizIncorrect) || 0),
  );
}

/** Patch the saved run and keep its level id. Returns null if no level is known. */
export function mergeFarmRun(patch = {}) {
  const prev = loadFarmRun() || {};
  const levelId = Math.max(1, Number(patch.levelId ?? prev.levelId) || 0);
  if (!levelId) return null;
  return saveFarmRun({ ...prev, ...patch, levelId });
}

/** Short resume label: level, questions left, cash, and the live frustration score. */
export function farmRunSummary(snapshot = loadFarmRun()) {
  if (!snapshot) return null;
  const levelId = Math.max(1, Number(snapshot.levelId) || 1);
  const carried = Number(snapshot.carriedCount) || 0;
  const harvested = Number(snapshot.cropsHarvestedTotal) || 0;
  const answered = answeredFromRun(snapshot);
  const quota = Math.max(
    1,
    DDA_CONFIG.maxQuestions || 10,
  );
  const remaining = Math.max(0, quota - answered);
  const frRaw = Number(snapshot.frustrationScore);
  const frustrationScore = Number.isFinite(frRaw) ? Math.round(frRaw) : null;
  const cash = Math.max(0, Number(snapshot.currentMoney) || 0);
  const quizNote =
    answered > 0
      ? `${answered} of ${quota} questions${remaining > 0 ? ` · ${remaining} left` : ''}`
      : `$${cash}`;
  return {
    levelId,
    cash,
    carried,
    harvested,
    questionsAnswered: answered,
    maxQuestions: quota,
    remainingQuestions: remaining,
    frustrationScore,
    savedAt: snapshot.savedAt || null,
    label: `Level ${levelId} · ${quizNote}`,
  };
}
