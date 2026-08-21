/**
 * FrustrationEngine — aptitude-test metrics → 0–100 score + profile.
 *
 * Independent of how aptitude data was collected (mock vs real test).
 * Do not import mock student catalogs here.
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function ratio100(value, cap) {
  if (!cap || cap <= 0) return 0;
  return clamp((Number(value) || 0) / cap * 100, 0, 100);
}

/** Caps used only for 0–100 normalization — not the final score. */
export const NORMALIZATION_CAPS = Object.freeze({
  consecutiveWrongAnswers: 5,
  answerTimeOverBaseline: 1, // 100% slower than baseline → 100
  answerTimeTrend: 0.5, // +50% trend → 100
  retryCount: 10,
  failedAttempts: 10,
  hintUsage: 10,
  answerChanges: 12,
  rapidClickCount: 20,
  mouseInactivitySeconds: 60,
  repeatedUIInteractions: 10,
  activityRestarts: 5,
  levelRestarts: 5,
  enemyDeaths: 8,
});

export const FRUSTRATION_WEIGHTS = Object.freeze({
  incorrectAnswerRate: 0.1,
  consecutiveWrongAnswers: 0.08,
  answerTimeDeviation: 0.08,
  increasingAnswerTime: 0.06,
  retryCount: 0.06,
  failedAttempts: 0.06,
  hintUsage: 0.06,
  answerChanges: 0.04,
  rapidClicking: 0.05,
  excessiveMouseMovement: 0.04,
  mouseInactivity: 0.05,
  repeatedUIInteraction: 0.04,
  questionsSkipped: 0.05,
  activityRestarts: 0.04,
  levelRestarts: 0.04,
  enemyDeaths: 0.05,
  performanceDecline: 0.06,
});

export const FRUSTRATION_LEVELS = Object.freeze({
  LOW: 'LOW',
  MILD: 'MILD',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  VERY_HIGH: 'VERY_HIGH',
});

export const METRIC_LABELS = Object.freeze({
  incorrectAnswerRate: 'High incorrect answer rate',
  consecutiveWrongAnswers: 'Several consecutive wrong answers',
  answerTimeDeviation: 'Answer time well above baseline',
  increasingAnswerTime: 'Increasing answer time',
  retryCount: 'High retry count',
  failedAttempts: 'Many failed attempts',
  hintUsage: 'Frequent hint usage',
  answerChanges: 'Many answer changes',
  rapidClicking: 'Rapid / erratic clicking',
  excessiveMouseMovement: 'Excessive mouse movement',
  mouseInactivity: 'Long mouse inactivity',
  repeatedUIInteraction: 'Repeated UI interactions',
  questionsSkipped: 'Questions skipped',
  activityRestarts: 'Activity restarts',
  levelRestarts: 'Level restarts',
  enemyDeaths: 'Enemy deaths',
  performanceDecline: 'Performance decline',
});

const WEIGHT_SUM = Object.values(FRUSTRATION_WEIGHTS).reduce((a, b) => a + b, 0);

/**
 * @param {number} score
 * @returns {typeof FRUSTRATION_LEVELS[keyof typeof FRUSTRATION_LEVELS]}
 */
export function frustrationLevelFromScore(score) {
  const s = clamp(Math.round(score), 0, 100);
  if (s <= 25) return FRUSTRATION_LEVELS.LOW;
  if (s <= 50) return FRUSTRATION_LEVELS.MILD;
  if (s <= 70) return FRUSTRATION_LEVELS.MODERATE;
  if (s <= 85) return FRUSTRATION_LEVELS.HIGH;
  return FRUSTRATION_LEVELS.VERY_HIGH;
}

function declineTo100(raw) {
  const v = Number(raw) || 0;
  if (v <= 1) return clamp(v * 100, 0, 100);
  return clamp(v, 0, 100);
}

/**
 * Normalize raw aptitude metrics to 0–100 per signal.
 * @param {object} aptitudeData
 */
export function normalizeAptitudeMetrics(aptitudeData = {}) {
  const d = aptitudeData || {};
  const total = Math.max(0, Number(d.totalQuestions) || 0);
  const incorrect = Math.max(0, Number(d.incorrectAnswers) || 0);
  const avg = Number(d.averageAnswerTime) || 0;
  const baseline = Number(d.baselineAnswerTime) || 0;
  const overBaseline =
    baseline > 0 && avg > baseline ? (avg - baseline) / baseline : 0;

  return {
    incorrectAnswerRate: total > 0 ? clamp((incorrect / total) * 100, 0, 100) : 0,
    consecutiveWrongAnswers: ratio100(
      d.consecutiveWrongAnswers,
      NORMALIZATION_CAPS.consecutiveWrongAnswers,
    ),
    answerTimeDeviation: clamp(
      overBaseline / NORMALIZATION_CAPS.answerTimeOverBaseline * 100,
      0,
      100,
    ),
    increasingAnswerTime: ratio100(
      Math.max(0, Number(d.answerTimeTrend) || 0),
      NORMALIZATION_CAPS.answerTimeTrend,
    ),
    retryCount: ratio100(d.retryCount, NORMALIZATION_CAPS.retryCount),
    failedAttempts: ratio100(d.failedAttempts, NORMALIZATION_CAPS.failedAttempts),
    hintUsage: ratio100(d.hintUsage, NORMALIZATION_CAPS.hintUsage),
    answerChanges: ratio100(d.answerChanges, NORMALIZATION_CAPS.answerChanges),
    rapidClicking: ratio100(d.rapidClickCount, NORMALIZATION_CAPS.rapidClickCount),
    excessiveMouseMovement: clamp(d.mouseMovementScore, 0, 100),
    mouseInactivity: ratio100(
      d.mouseInactivitySeconds,
      NORMALIZATION_CAPS.mouseInactivitySeconds,
    ),
    repeatedUIInteraction: ratio100(
      d.repeatedUIInteractions,
      NORMALIZATION_CAPS.repeatedUIInteractions,
    ),
    questionsSkipped:
      total > 0
        ? clamp(((Number(d.questionsSkipped) || 0) / total) * 100, 0, 100)
        : 0,
    activityRestarts: ratio100(
      d.activityRestarts,
      NORMALIZATION_CAPS.activityRestarts,
    ),
    levelRestarts: ratio100(d.levelRestarts, NORMALIZATION_CAPS.levelRestarts),
    enemyDeaths: ratio100(d.enemyDeaths, NORMALIZATION_CAPS.enemyDeaths),
    performanceDecline: declineTo100(d.performanceDecline),
  };
}

function pickDominantIndicators(contributions, normalized) {
  const ranked = Object.keys(FRUSTRATION_WEIGHTS)
    .map((key) => ({
      key,
      label: METRIC_LABELS[key],
      contribution: contributions[key],
      normalized: normalized[key],
    }))
    .filter((row) => row.normalized >= 28 || row.contribution >= 2.4)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);

  return ranked.map((row) => row.label);
}

/**
 * @param {{ studentId?: string, studentName?: string, grade?: number, scienceTopic?: string, aptitudeData?: object }} performance
 * @returns {object} FrustrationProfile
 */
export function buildFrustrationProfile(performance = {}) {
  // Spec table sums to 96%; rescale so relative weights still total 100%.
  const weightNorm = WEIGHT_SUM > 0 ? WEIGHT_SUM : 1;

  const aptitudeData = performance.aptitudeData || performance;
  const normalized = normalizeAptitudeMetrics(aptitudeData);
  const contributions = {};
  let score = 0;

  for (const [key, weight] of Object.entries(FRUSTRATION_WEIGHTS)) {
    const part = (normalized[key] || 0) * (weight / weightNorm);
    contributions[key] = part;
    score += part;
  }

  score = clamp(Math.round(score), 0, 100);
  const level = frustrationLevelFromScore(score);
  const dominantIndicators = pickDominantIndicators(contributions, normalized);

  return {
    studentId: performance.studentId || null,
    studentName: performance.studentName || null,
    grade: performance.grade ?? null,
    scienceTopic: performance.scienceTopic || null,
    performanceLabel: performance.performanceLabel || null,
    frustrationScore: score,
    frustrationLevel: level,
    dominantIndicators,
    metrics: normalized,
    contributions,
    aptitudeData,
  };
}

export const FrustrationEngine = {
  normalize: normalizeAptitudeMetrics,
  calculate: buildFrustrationProfile,
  levelFromScore: frustrationLevelFromScore,
};
