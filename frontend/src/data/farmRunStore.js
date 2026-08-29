import { studentStorageKey } from './mockStudents.js';
import { DDA_CONFIG } from './dda.js';

const BASE_KEY = 'scipath_farm_run';
const VERSION = 1;

function storageKey() {
  return studentStorageKey(BASE_KEY);
}

export function loadFarmRun() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (Number(data.version) !== VERSION) return null;
    const levelId = Math.max(1, Number(data.levelId) || 0);
    if (!levelId) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasFarmRun() {
  return Boolean(loadFarmRun());
}

export function saveFarmRun(snapshot) {
  if (!snapshot || !Number(snapshot.levelId)) return null;
  const record = {
    ...snapshot,
    version: VERSION,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(record));
  } catch {
    /* quota */
  }
  return record;
}

export function clearFarmRun() {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    /* ignore */
  }
}

export function answeredFromRun(snapshot) {
  if (!snapshot) return 0;
  const explicit = Number(snapshot.questionsAnswered);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(0, explicit);
  return Math.max(
    0,
    (Number(snapshot.quizCorrect) || 0) + (Number(snapshot.quizIncorrect) || 0),
  );
}

export function mergeFarmRun(patch = {}) {
  const prev = loadFarmRun() || {};
  const levelId = Math.max(1, Number(patch.levelId ?? prev.levelId) || 0);
  if (!levelId) return null;
  return saveFarmRun({ ...prev, ...patch, levelId });
}

export function farmRunSummary(snapshot = loadFarmRun()) {
  if (!snapshot) return null;
  const levelId = Math.max(1, Number(snapshot.levelId) || 1);
  const carried = Number(snapshot.carriedCount) || 0;
  const harvested = Number(snapshot.cropsHarvestedTotal) || 0;
  const answered = answeredFromRun(snapshot);
  const quota = Math.max(
    1,
    Number(snapshot.maxQuestions) || DDA_CONFIG.maxQuestions || 15,
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
