/**
 * Mastery model for SCI_PATH farm levels.
 *
 * Another module (or this local scorer) computes the student's mastery
 * from the *previous* level. This farm module reads that mastery at
 * level start and assigns the **target average response time** immediately.
 * Cash goals are not used for level completion.
 *
 * External integration:
 *   setExternalMastery({ mastery: 0.82, source: 'bayesian-kt' })
 *   — or persist via saveLevelPerformance() after each level.
 */

import {
  DDA_BANDS,
  DDA_CONFIG,
  adjustTimeTarget,
  bandTimeTarget,
  scoreAttempt,
  averageScore,
  formatResponseTime,
} from './dda';
import { studentStorageKey } from './mockStudents.js';

const BASE_STORAGE_KEY = 'scipath_student_mastery';

function storageKey() {
  return studentStorageKey(BASE_STORAGE_KEY);
}

export const MASTERY_THRESHOLDS = {
  strong: 0.72,
  developing: 0.4,
};

/**
 * Convert a 0–1 mastery score into a performance band.
 * @param {number} mastery
 */
export function bandFromMastery(mastery) {
  const m = clamp01(mastery);
  if (m >= MASTERY_THRESHOLDS.strong) return DDA_BANDS.STRONG;
  if (m < MASTERY_THRESHOLDS.developing) return DDA_BANDS.EMERGING;
  return DDA_BANDS.DEVELOPING;
}

/**
 * Avg response-time target (ms) from mastery band (no prior level timing).
 * @param {number} mastery 0–1
 */
export function timeTargetFromMastery(mastery) {
  return bandTimeTarget(bandFromMastery(mastery));
}

/**
 * Next-level time target from previous level avg response + mastery band.
 * @param {number} previousAvgMs
 * @param {number} mastery
 */
export function timeTargetFromPrevious(previousAvgMs, mastery) {
  const band = bandFromMastery(mastery);
  if (previousAvgMs > 0) return adjustTimeTarget(previousAvgMs, band);
  return timeTargetFromMastery(mastery);
}

export function cropValueFromMastery(baseValue, mastery) {
  const band = bandFromMastery(mastery);
  if (band === DDA_BANDS.STRONG) return baseValue + 2;
  if (band === DDA_BANDS.EMERGING) return Math.max(5, baseValue - 2);
  return baseValue;
}

export function goalTextFromMastery(timeTargetMs, mastery) {
  const band = bandFromMastery(mastery);
  const pct = Math.round(clamp01(mastery) * 100);
  const label =
    band === DDA_BANDS.STRONG
      ? 'High mastery'
      : band === DDA_BANDS.EMERGING
        ? 'Building mastery'
        : 'Developing mastery';
  const targetLabel = formatResponseTime(timeTargetMs);
  return `${label} (${pct}%): finish ${DDA_CONFIG.maxQuestions} questions · target avg ${targetLabel}`;
}

/**
 * Local mastery estimator from quiz attempts (correctness + response time).
 * Another model can replace this by calling setExternalMastery().
 *
 * @param {Array<{ wasCorrect: boolean, responseTimeMs: number }>} attempts
 * @returns {number} mastery 0–1
 */
export function computeMasteryFromAttempts(attempts = []) {
  if (!attempts.length) return 0.5; // neutral default for level 1 / no history

  const scores = attempts.map((a) => scoreAttempt(a));
  const avg = averageScore(scores); // 0–100
  const correct = attempts.filter((a) => a.wasCorrect).length;
  const accuracy = correct / attempts.length;
  const blended = avg * 0.65 + accuracy * 100 * 0.35;
  return clamp01(blended / 100);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function readStore() {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) : { levels: {}, external: null };
  } catch {
    return { levels: {}, external: null };
  }
}

function writeStore(data) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Plug-in point for an external mastery model.
 * @param {{ mastery: number, source?: string, meta?: object }} payload
 */
export function setExternalMastery(payload) {
  const store = readStore();
  store.external = {
    mastery: clamp01(payload.mastery),
    source: payload.source || 'external',
    meta: payload.meta || {},
    updatedAt: Date.now(),
  };
  writeStore(store);
  return store.external;
}

export function clearExternalMastery() {
  const store = readStore();
  store.external = null;
  writeStore(store);
}

/**
 * Persist this level's quiz performance for the *next* level's time target.
 */
export function saveLevelPerformance(levelId, payload) {
  const attempts = payload.attempts || [];
  const mastery =
    payload.mastery != null
      ? clamp01(payload.mastery)
      : computeMasteryFromAttempts(attempts);

  const avgResponseMs =
    payload.avgResponseMs ??
    (attempts.length
      ? Math.round(
          attempts.reduce((a, att) => a + (Number(att.responseTimeMs) || 0), 0) /
            attempts.length,
        )
      : null);

  const store = readStore();
  store.levels[String(levelId)] = {
    levelId,
    mastery,
    band: bandFromMastery(mastery),
    attempts,
    quizCorrect: payload.quizCorrect ?? attempts.filter((a) => a.wasCorrect).length,
    quizIncorrect:
      payload.quizIncorrect ?? attempts.filter((a) => !a.wasCorrect).length,
    avgResponseMs,
    timeTargetMs: payload.timeTargetMs ?? null,
    beatTimeTarget:
      avgResponseMs != null && payload.timeTargetMs != null
        ? avgResponseMs <= payload.timeTargetMs
        : null,
    savedAt: Date.now(),
  };
  writeStore(store);
  return store.levels[String(levelId)];
}

/**
 * Resolve mastery + time target for starting a farm level.
 * Priority: external model → previous level record → neutral default.
 * Starting level uses default time target; unlocks come only from purchases.
 *
 * @param {number} levelId
 */
export function getMasteryForLevelStart(levelId = 1) {
  const store = readStore();
  const prevId = Number(levelId) - 1;

  // 1) External mastery model wins when present
  if (store.external && typeof store.external.mastery === 'number') {
    const mastery = clamp01(store.external.mastery);
    const prevAvg =
      prevId >= 1 && store.levels[String(prevId)]
        ? store.levels[String(prevId)].avgResponseMs
        : null;
    const timeTargetMs = timeTargetFromPrevious(prevAvg, mastery);
    return {
      mastery,
      band: bandFromMastery(mastery),
      timeTargetMs,
      source: store.external.source || 'external',
      fromLevelId: prevAvg != null ? prevId : null,
    };
  }

  // 2) Previous level performance → next level time target
  if (prevId >= 1 && store.levels[String(prevId)]) {
    const prev = store.levels[String(prevId)];
    const mastery = clamp01(prev.mastery);
    const timeTargetMs = timeTargetFromPrevious(prev.avgResponseMs, mastery);
    return {
      mastery,
      band: bandFromMastery(mastery),
      timeTargetMs,
      source: 'previous_level',
      fromLevelId: prevId,
      previousAvgMs: prev.avgResponseMs ?? null,
    };
  }

  // 3) Level 1 / no history — neutral developing time target
  const mastery = 0.5;
  return {
    mastery,
    band: DDA_BANDS.DEVELOPING,
    timeTargetMs: timeTargetFromMastery(mastery),
    source: 'default',
    fromLevelId: null,
    previousAvgMs: null,
  };
}
