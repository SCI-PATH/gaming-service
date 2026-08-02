/**
 * Adaptive GAMEPLAY performance (enemies, timers, retries, hints, cash bonuses).
 *
 * Separate from question-difficulty / science DDA (`dda.js`, `masteryModel.js`,
 * `pickScienceQuestion`). Recalculated after every completed level from that
 * level’s metrics + recent history — never a permanent student label.
 */

import { studentStorageKey } from './mockStudents.js';

const BASE_STORAGE_KEY = 'scipath_gameplay_perf';
const HISTORY_WINDOW = 3;

export const GAMEPLAY_BANDS = Object.freeze({
  WEAK: 'weak',
  AVERAGE: 'average',
  STRONG: 'strong',
});

export const GAMEPLAY_BAND_LABELS = Object.freeze({
  weak: 'WEAK / DEVELOPING',
  average: 'AVERAGE',
  strong: 'STRONG / SMART',
});

export const PERFORMANCE_GRADES = Object.freeze({
  EXCELLENT: 'excellent',
  VERY_GOOD: 'very_good',
  GOOD: 'good',
  AVERAGE: 'average',
});

export const PERFORMANCE_GRADE_LABELS = Object.freeze({
  excellent: 'Excellent',
  very_good: 'Very Good',
  good: 'Good',
  average: 'Average',
});

/** Cash % added next level from previous-level performance grade. */
export const PERFORMANCE_BONUS_PCT = Object.freeze({
  excellent: 0.3,
  very_good: 0.2,
  good: 0.1,
  average: 0,
});

export const TREND = Object.freeze({
  IMPROVING: 'improving',
  SAME: 'same',
  WORSE: 'worse',
});

/**
 * Next-level gameplay adaptation by classification.
 * Does not change question content or difficulty selection.
 */
export const GAMEPLAY_SETTINGS_BY_BAND = Object.freeze({
  weak: Object.freeze({
    band: GAMEPLAY_BANDS.WEAK,
    label: GAMEPLAY_BAND_LABELS.weak,
    enemyDistanceTiles: 6,
    enemySpeed: 36,
    enemyCountFactor: 0.45,
    answerTimerMs: 45000,
    maxRetriesPerQuestion: 4,
    hintLevel: 'more',
    levelTargetTimeMs: 20 * 60 * 1000,
    challengePressure: 'low',
    cashRewardMultiplier: 1,
    sellBonusLabel: 'Basic',
  }),
  average: Object.freeze({
    band: GAMEPLAY_BANDS.AVERAGE,
    label: GAMEPLAY_BAND_LABELS.average,
    enemyDistanceTiles: 0,
    enemySpeed: 60,
    enemyCountFactor: 1,
    answerTimerMs: 25000,
    maxRetriesPerQuestion: 2,
    hintLevel: 'limited',
    levelTargetTimeMs: 12 * 60 * 1000,
    challengePressure: 'moderate',
    cashRewardMultiplier: 1.1,
    sellBonusLabel: 'Higher',
  }),
  strong: Object.freeze({
    band: GAMEPLAY_BANDS.STRONG,
    label: GAMEPLAY_BAND_LABELS.strong,
    enemyDistanceTiles: -4,
    enemySpeed: 95,
    enemyCountFactor: 1.4,
    answerTimerMs: 15000,
    maxRetriesPerQuestion: 1,
    hintLevel: 'minimal',
    levelTargetTimeMs: 8 * 60 * 1000,
    challengePressure: 'high',
    cashRewardMultiplier: 1.25,
    sellBonusLabel: 'Highest',
  }),
});

function storageKey() {
  return studentStorageKey(BASE_STORAGE_KEY);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function readStore() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      return {
        levels: {},
        history: [],
        pendingBonus: null,
        lastClassification: null,
      };
    }
    const data = JSON.parse(raw);
    return {
      levels: data.levels || {},
      history: Array.isArray(data.history) ? data.history : [],
      pendingBonus: data.pendingBonus ?? null,
      lastClassification: data.lastClassification ?? null,
    };
  } catch {
    return {
      levels: {},
      history: [],
      pendingBonus: null,
      lastClassification: null,
    };
  }
}

function writeStore(data) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch {
    // ignore quota / private mode
  }
}

export function getGameplaySettings(band) {
  const key = band && GAMEPLAY_SETTINGS_BY_BAND[band] ? band : GAMEPLAY_BANDS.AVERAGE;
  return { ...GAMEPLAY_SETTINGS_BY_BAND[key] };
}

/**
 * Resolve gameplay settings for starting a farm level from prior classification.
 */
export function getGameplayForLevelStart(levelId = 1) {
  const store = readStore();
  const prevId = Number(levelId) - 1;
  const prev =
    prevId >= 1 ? store.levels[String(prevId)] : null;

  const band =
    prev?.classification ||
    store.lastClassification?.band ||
    GAMEPLAY_BANDS.AVERAGE;

  const settings = getGameplaySettings(band);
  const pendingBonus = store.pendingBonus;

  return {
    band,
    label: settings.label,
    settings,
    fromLevelId: prev ? prevId : null,
    previousLevel: prev
      ? {
          levelId: prevId,
          classification: prev.classification,
          classificationLabel: GAMEPLAY_BAND_LABELS[prev.classification],
          grade: prev.grade,
          gradeLabel: PERFORMANCE_GRADE_LABELS[prev.grade] || prev.grade,
          avgAnswerTimeSec: prev.avgAnswerTimeSec,
          retries: prev.retries,
          levelCompletionTimeSec: prev.levelCompletionTimeSec,
          trend: prev.trend,
          compositeScore: prev.compositeScore,
        }
      : null,
    pendingBonus,
  };
}

/**
 * Score 0–100 from one level’s metrics (no history blend).
 */
export function scoreLevelMetrics(metrics = {}) {
  const correct = Math.max(0, Number(metrics.correctAnswers) || 0);
  const incorrect = Math.max(0, Number(metrics.incorrectAnswers) || 0);
  const total = correct + incorrect;
  const accuracy = total > 0 ? correct / total : 0.5;

  const avgAnswerSec = Math.max(0, Number(metrics.avgAnswerTimeSec) || 0);
  const prevAvgSec = Number(metrics.previousAvgAnswerTimeSec);
  const answerTimerSec =
    (Number(metrics.answerTimerMs) || 25000) / 1000;
  // Faster than prior (or vs half the allowed timer) scores higher
  let timeScore = 55;
  if (avgAnswerSec > 0) {
    const ref =
      Number.isFinite(prevAvgSec) && prevAvgSec > 0
        ? prevAvgSec
        : answerTimerSec * 0.55;
    const ratio = avgAnswerSec / Math.max(1, ref);
    if (ratio <= 0.75) timeScore = 95;
    else if (ratio <= 1) timeScore = 78;
    else if (ratio <= 1.25) timeScore = 55;
    else if (ratio <= 1.6) timeScore = 35;
    else timeScore = 18;
  }

  const retries = Math.max(0, Number(metrics.retries) || 0);
  const retryBudget = Math.max(1, Number(metrics.maxRetriesExpected) || 8);
  const retryScore = Math.round(100 * clamp01(1 - retries / (retryBudget * 1.5)));

  const levelSec = Math.max(0, Number(metrics.levelCompletionTimeSec) || 0);
  const targetSec =
    (Number(metrics.levelTargetTimeMs) || 12 * 60 * 1000) / 1000;
  let completeScore = 55;
  if (levelSec > 0 && targetSec > 0) {
    const ratio = levelSec / targetSec;
    if (ratio <= 0.7) completeScore = 95;
    else if (ratio <= 1) completeScore = 75;
    else if (ratio <= 1.3) completeScore = 50;
    else if (ratio <= 1.7) completeScore = 30;
    else completeScore = 15;
  }

  const accuracyScore = Math.round(accuracy * 100);
  const composite = Math.round(
    accuracyScore * 0.35 +
      timeScore * 0.2 +
      retryScore * 0.2 +
      completeScore * 0.15 +
      55 * 0.1,
  );

  return {
    accuracy,
    accuracyScore,
    timeScore,
    retryScore,
    completeScore,
    compositeScore: Math.max(0, Math.min(100, composite)),
  };
}

export function bandFromCompositeScore(score) {
  const s = Number(score) || 0;
  if (s >= 70) return GAMEPLAY_BANDS.STRONG;
  if (s <= 40) return GAMEPLAY_BANDS.WEAK;
  return GAMEPLAY_BANDS.AVERAGE;
}

/**
 * Blend current level score with recent history so labels are not permanent.
 */
export function classifyGameplayPerformance(metrics, history = []) {
  const scored = scoreLevelMetrics(metrics);
  const recent = (history || [])
    .slice(-HISTORY_WINDOW)
    .map((h) => Number(h.compositeScore))
    .filter((n) => Number.isFinite(n));

  let blended = scored.compositeScore;
  if (recent.length) {
    const histAvg =
      recent.reduce((a, b) => a + b, 0) / recent.length;
    blended = Math.round(scored.compositeScore * 0.65 + histAvg * 0.35);
  }

  const previous = history?.length
    ? history[history.length - 1]
    : null;
  const prevScore = previous?.compositeScore;
  let trend = TREND.SAME;
  if (Number.isFinite(prevScore)) {
    const delta = blended - prevScore;
    if (delta >= 8) trend = TREND.IMPROVING;
    else if (delta <= -8) trend = TREND.WORSE;
  }

  const band = bandFromCompositeScore(blended);
  return {
    ...scored,
    blendedScore: blended,
    band,
    label: GAMEPLAY_BAND_LABELS[band],
    trend,
    previousBand: previous?.classification ?? null,
    previousScore: Number.isFinite(prevScore) ? prevScore : null,
  };
}

/**
 * Grade for previous-level cash bonus (Excellent / Very Good / Good / Average).
 */
export function gradeLevelPerformance(metrics, scored) {
  const accuracy = scored?.accuracy ?? scoreLevelMetrics(metrics).accuracy;
  const composite =
    scored?.compositeScore ?? scoreLevelMetrics(metrics).compositeScore;
  const retries = Math.max(0, Number(metrics.retries) || 0);

  if (accuracy >= 0.9 && composite >= 78 && retries <= 3) {
    return PERFORMANCE_GRADES.EXCELLENT;
  }
  if (accuracy >= 0.8 && composite >= 65) {
    return PERFORMANCE_GRADES.VERY_GOOD;
  }
  if (accuracy >= 0.7 && composite >= 52) {
    return PERFORMANCE_GRADES.GOOD;
  }
  return PERFORMANCE_GRADES.AVERAGE;
}

/**
 * Improvement bonus 10–20% when significantly better than previous level.
 * Applies to students who were weak but are improving.
 */
export function computeImprovementBonusPct(classification, previousRecord) {
  if (!previousRecord) return 0;

  const trend = classification.trend;
  const prevBand = previousRecord.classification;
  const band = classification.band;
  const scoreDelta =
    classification.blendedScore - (Number(previousRecord.compositeScore) || 0);

  const bandRank = { weak: 0, average: 1, strong: 2 };
  const bandUp =
    (bandRank[band] ?? 1) > (bandRank[prevBand] ?? 1);

  if (!bandUp && trend !== TREND.IMPROVING && scoreDelta < 10) {
    return 0;
  }

  if (bandUp && scoreDelta >= 18) return 0.2;
  if (bandUp || scoreDelta >= 15) return 0.15;
  if (trend === TREND.IMPROVING || scoreDelta >= 10) return 0.1;
  return 0;
}

/**
 * Build pending next-level cash bonus from a completed level.
 * @param {number} baseReward cash earned this level (or fallback)
 */
export function buildPendingBonus({
  baseReward,
  grade,
  improvementPct,
  levelId,
  classification,
}) {
  const perfPct = PERFORMANCE_BONUS_PCT[grade] ?? 0;
  const base = Math.max(0, Math.round(Number(baseReward) || 0));
  const performanceCash = Math.round(base * perfPct);
  const improvementCash = Math.round(base * (improvementPct || 0));
  return {
    fromLevelId: levelId,
    baseReward: base,
    grade,
    gradeLabel: PERFORMANCE_GRADE_LABELS[grade] || grade,
    performanceBonusPct: perfPct,
    improvementBonusPct: improvementPct || 0,
    performanceCash,
    improvementCash,
    totalBonus: performanceCash + improvementCash,
    classification,
    classificationLabel: GAMEPLAY_BAND_LABELS[classification] || classification,
    createdAt: Date.now(),
  };
}

/**
 * Persist completed-level gameplay metrics, classification, and next-level bonus.
 */
export function saveGameplayLevelPerformance(levelId, payload = {}) {
  const store = readStore();
  const history = store.history || [];
  const previous = history.length ? history[history.length - 1] : null;

  const metrics = {
    correctAnswers: payload.correctAnswers ?? 0,
    incorrectAnswers: payload.incorrectAnswers ?? 0,
    answerResults: payload.answerResults || [],
    avgAnswerTimeSec: payload.avgAnswerTimeSec ?? 0,
    previousAvgAnswerTimeSec:
      payload.previousAvgAnswerTimeSec ?? previous?.avgAnswerTimeSec ?? null,
    retries: payload.retries ?? 0,
    levelCompletionTimeSec: payload.levelCompletionTimeSec ?? 0,
    previousLevelCompletionTimeSec:
      payload.previousLevelCompletionTimeSec ??
      previous?.levelCompletionTimeSec ??
      null,
    answerTimerMs: payload.answerTimerMs,
    levelTargetTimeMs: payload.levelTargetTimeMs,
    maxRetriesExpected: payload.maxRetriesExpected,
  };

  const classification = classifyGameplayPerformance(metrics, history);
  const grade = gradeLevelPerformance(metrics, classification);
  const improvementPct = computeImprovementBonusPct(classification, previous);

  const baseReward =
    payload.baseReward != null
      ? Number(payload.baseReward)
      : Math.max(50, Math.round(Number(payload.cashEarned) || 0));

  const pendingBonus = buildPendingBonus({
    baseReward,
    grade,
    improvementPct,
    levelId,
    classification: classification.band,
  });

  const record = {
    levelId,
    ...metrics,
    classification: classification.band,
    classificationLabel: classification.label,
    compositeScore: classification.blendedScore,
    rawScore: classification.compositeScore,
    trend: classification.trend,
    grade,
    gradeLabel: PERFORMANCE_GRADE_LABELS[grade],
    performanceBonusPct: pendingBonus.performanceBonusPct,
    improvementBonusPct: pendingBonus.improvementBonusPct,
    performanceCash: pendingBonus.performanceCash,
    improvementCash: pendingBonus.improvementCash,
    nextGameplaySettings: getGameplaySettings(classification.band),
    savedAt: Date.now(),
  };

  store.levels[String(levelId)] = record;
  store.history = [...history, record].slice(-12);
  store.lastClassification = {
    band: classification.band,
    label: classification.label,
    levelId,
    at: Date.now(),
  };
  store.pendingBonus = pendingBonus;
  writeStore(store);

  return {
    record,
    classification,
    pendingBonus,
    previous: previous || null,
  };
}

/** Apply and clear pending cash bonus (call once at next level start). */
export function consumePendingGameplayBonus() {
  const store = readStore();
  const pending = store.pendingBonus;
  if (!pending || !pending.totalBonus) {
    store.pendingBonus = null;
    writeStore(store);
    return null;
  }
  store.pendingBonus = null;
  writeStore(store);
  return pending;
}

export function peekPendingGameplayBonus() {
  return readStore().pendingBonus;
}

export function getGameplayHudSnapshot(levelId) {
  const start = getGameplayForLevelStart(levelId);
  const store = readStore();
  const current = store.levels[String(levelId)] || null;
  return {
    ...start,
    currentLevelRecord: current,
    history: store.history.slice(-HISTORY_WINDOW),
  };
}

/** Format seconds for UI (e.g. 1m 24s). */
export function formatDurationSec(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

export function formatGameplaySettingsSummary(settings) {
  if (!settings) return '—';
  return [
    `enemies ×${settings.enemyCountFactor}`,
    `speed ${settings.enemySpeed}`,
    `dist ${settings.enemyDistanceTiles >= 0 ? '+' : ''}${settings.enemyDistanceTiles}`,
    `timer ${Math.round(settings.answerTimerMs / 1000)}s`,
    `retries ${settings.maxRetriesPerQuestion}`,
    `hints ${settings.hintLevel}`,
    `target ${formatDurationSec(settings.levelTargetTimeMs / 1000)}`,
  ].join(' · ');
}

/**
 * Seed a fake prior-level result so test accounts start already classified.
 * Call after login while that student is the active session.
 *
 * @param {'weak'|'average'|'strong'} band
 */
export function seedTestGameplayProfile(band = GAMEPLAY_BANDS.AVERAGE) {
  const key = GAMEPLAY_SETTINGS_BY_BAND[band] ? band : GAMEPLAY_BANDS.AVERAGE;
  const settings = getGameplaySettings(key);

  const presets = {
    weak: {
      correctAnswers: 8,
      incorrectAnswers: 12,
      avgAnswerTimeSec: 22,
      retries: 12,
      levelCompletionTimeSec: 16 * 60,
      compositeScore: 28,
      grade: PERFORMANCE_GRADES.AVERAGE,
      trend: TREND.SAME,
      baseReward: 120,
    },
    average: {
      correctAnswers: 14,
      incorrectAnswers: 6,
      avgAnswerTimeSec: 12,
      retries: 6,
      levelCompletionTimeSec: 11 * 60,
      compositeScore: 58,
      grade: PERFORMANCE_GRADES.GOOD,
      trend: TREND.SAME,
      baseReward: 180,
    },
    strong: {
      correctAnswers: 18,
      incorrectAnswers: 2,
      avgAnswerTimeSec: 7,
      retries: 2,
      levelCompletionTimeSec: 7 * 60,
      compositeScore: 88,
      grade: PERFORMANCE_GRADES.EXCELLENT,
      trend: TREND.IMPROVING,
      baseReward: 220,
    },
  };

  const p = presets[key];
  const pendingBonus = buildPendingBonus({
    baseReward: p.baseReward,
    grade: p.grade,
    improvementPct: key === GAMEPLAY_BANDS.STRONG ? 0.1 : 0,
    levelId: 1,
    classification: key,
  });

  const record = {
    levelId: 1,
    correctAnswers: p.correctAnswers,
    incorrectAnswers: p.incorrectAnswers,
    answerResults: [],
    avgAnswerTimeSec: p.avgAnswerTimeSec,
    previousAvgAnswerTimeSec: null,
    retries: p.retries,
    levelCompletionTimeSec: p.levelCompletionTimeSec,
    previousLevelCompletionTimeSec: null,
    classification: key,
    classificationLabel: GAMEPLAY_BAND_LABELS[key],
    compositeScore: p.compositeScore,
    rawScore: p.compositeScore,
    trend: p.trend,
    grade: p.grade,
    gradeLabel: PERFORMANCE_GRADE_LABELS[p.grade],
    performanceBonusPct: pendingBonus.performanceBonusPct,
    improvementBonusPct: pendingBonus.improvementBonusPct,
    performanceCash: pendingBonus.performanceCash,
    improvementCash: pendingBonus.improvementCash,
    nextGameplaySettings: settings,
    savedAt: Date.now(),
    seeded: true,
  };

  writeStore({
    levels: { '1': record },
    history: [record],
    pendingBonus,
    lastClassification: {
      band: key,
      label: GAMEPLAY_BAND_LABELS[key],
      levelId: 1,
      at: Date.now(),
    },
  });

  return { band: key, record, pendingBonus, settings };
}
