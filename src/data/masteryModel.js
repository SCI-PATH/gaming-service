/**
 * Mastery model for SCI_PATH farm levels.
 *
 * Another module (or this local scorer) computes the student's mastery
 * from the *previous* level. This farm module reads that mastery at
 * level start and assigns the cash goal immediately.
 *
 * External integration:
 *   setExternalMastery({ mastery: 0.82, source: 'bayesian-kt' })
 *   — or persist via saveLevelPerformance() after each level.
 */

import { DDA_BANDS, scoreAttempt, averageScore } from './dda';

const STORAGE_KEY = 'scipath_student_mastery';

/** Cash goals mapped from mastery (higher mastery → higher unlock bar). */
export const MASTERY_CASH_GOALS = {
  emerging: 800,
  developing: 1200,
  strong: 1800,
};

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
 * Cash goal at the start of a level from mastery.
 * @param {number} mastery 0–1
 */
export function cashGoalFromMastery(mastery) {
  const band = bandFromMastery(mastery);
  if (band === DDA_BANDS.STRONG) return MASTERY_CASH_GOALS.strong;
  if (band === DDA_BANDS.EMERGING) return MASTERY_CASH_GOALS.emerging;
  return MASTERY_CASH_GOALS.developing;
}

export function cropValueFromMastery(baseValue, mastery) {
  const band = bandFromMastery(mastery);
  if (band === DDA_BANDS.STRONG) return baseValue + 2;
  if (band === DDA_BANDS.EMERGING) return Math.max(5, baseValue - 2);
  return baseValue;
}

export function goalTextFromMastery(cashGoal, mastery) {
  const band = bandFromMastery(mastery);
  const pct = Math.round(clamp01(mastery) * 100);
  const label =
    band === DDA_BANDS.STRONG
      ? 'High mastery'
      : band === DDA_BANDS.EMERGING
        ? 'Building mastery'
        : 'Developing mastery';
  return `${label} (${pct}%): harvest & sell to reach $${cashGoal}`;
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
  // Blend accuracy heavily with speed-aware attempt scores
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
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { levels: {}, external: null };
  } catch {
    return { levels: {}, external: null };
  }
}

function writeStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
 * Persist this level's quiz performance for the *next* level's cash goal.
 */
export function saveLevelPerformance(levelId, payload) {
  const attempts = payload.attempts || [];
  const mastery =
    payload.mastery != null
      ? clamp01(payload.mastery)
      : computeMasteryFromAttempts(attempts);

  const store = readStore();
  store.levels[String(levelId)] = {
    levelId,
    mastery,
    band: bandFromMastery(mastery),
    attempts,
    quizCorrect: payload.quizCorrect ?? attempts.filter((a) => a.wasCorrect).length,
    quizIncorrect:
      payload.quizIncorrect ?? attempts.filter((a) => !a.wasCorrect).length,
    avgResponseMs: payload.avgResponseMs ?? null,
    savedAt: Date.now(),
  };
  writeStore(store);
  return store.levels[String(levelId)];
}

/**
 * Resolve mastery + cash goal for starting a farm level.
 * Priority: external model → previous level record → neutral default.
 *
 * @param {number} levelId
 */
export function getMasteryForLevelStart(levelId = 1) {
  const store = readStore();
  const prevId = Number(levelId) - 1;

  // 1) External mastery model wins when present
  if (store.external && typeof store.external.mastery === 'number') {
    const mastery = clamp01(store.external.mastery);
    return {
      mastery,
      band: bandFromMastery(mastery),
      cashGoal: cashGoalFromMastery(mastery),
      source: store.external.source || 'external',
      fromLevelId: null,
    };
  }

  // 2) Previous level performance
  if (prevId >= 1 && store.levels[String(prevId)]) {
    const prev = store.levels[String(prevId)];
    const mastery = clamp01(prev.mastery);
    return {
      mastery,
      band: bandFromMastery(mastery),
      cashGoal: cashGoalFromMastery(mastery),
      source: 'previous_level',
      fromLevelId: prevId,
    };
  }

  // 3) Level 1 / no history — neutral developing goal
  return {
    mastery: 0.5,
    band: DDA_BANDS.DEVELOPING,
    cashGoal: MASTERY_CASH_GOALS.developing,
    source: 'default',
    fromLevelId: null,
  };
}
