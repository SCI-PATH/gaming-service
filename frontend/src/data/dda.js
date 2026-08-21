/**
 * Quiz attempt scoring for SCI_PATH (correctness + response time).
 * Time targets are assigned at level start via masteryModel.js from
 * previous-level / external mastery — not mid-level calibration.
 */

import { PERFORMANCE_CATEGORIES } from './performanceCategories.js';

/** @deprecated Use PERFORMANCE_CATEGORIES. Aliases kept for older saves. */
export const DDA_BANDS = {
  WEAK: PERFORMANCE_CATEGORIES.WEAK,
  MEDIUM: PERFORMANCE_CATEGORIES.MEDIUM,
  SMART: PERFORMANCE_CATEGORIES.SMART,
  STRONG: PERFORMANCE_CATEGORIES.SMART,
  DEVELOPING: PERFORMANCE_CATEGORIES.MEDIUM,
  EMERGING: PERFORMANCE_CATEGORIES.WEAK,
};

export const DDA_CONFIG = {
  /** Science questions per farm level — then the unlock shop opens. */
  maxQuestions: 15,
  /** @deprecated alias — level completes after this many questions */
  minQuestions: 15,

  /**
   * Average response-time targets (ms) by band when no prior level exists.
   * Faster / stronger students get a tighter target next time.
   */
  fastTargetMs: 8000,
  midTargetMs: 12000,
  slowTargetMs: 18000,
  minTargetMs: 5000,
  maxTargetMs: 30000,

  fastMs: 8000,
  moderateMs: 18000,
  slowMs: 30000,
  windowSize: 8,
  strongScore: 72,
  emergingScore: 40,
};

/**
 * Score a single quiz attempt 0–100 from correctness + timing.
 * @param {{ wasCorrect: boolean, responseTimeMs: number }} attempt
 */
export function scoreAttempt({ wasCorrect, responseTimeMs }) {
  const t = Math.max(0, Number(responseTimeMs) || 0);

  if (wasCorrect) {
    if (t <= DDA_CONFIG.fastMs) return 95;
    if (t <= DDA_CONFIG.moderateMs) return 75;
    if (t <= DDA_CONFIG.slowMs) return 58;
    return 48;
  }

  if (t <= 2500) return 22;
  if (t <= DDA_CONFIG.moderateMs) return 30;
  return 18;
}

export function averageScore(scores) {
  if (!scores?.length) return 55;
  const sum = scores.reduce((a, b) => a + b, 0);
  return sum / scores.length;
}

export function classifyPerformance(attemptScores) {
  if (!attemptScores?.length) return DDA_BANDS.MEDIUM;
  const avg = averageScore(attemptScores);
  if (avg >= DDA_CONFIG.strongScore) return DDA_BANDS.SMART;
  if (avg <= DDA_CONFIG.emergingScore) return DDA_BANDS.WEAK;
  return DDA_BANDS.MEDIUM;
}

/** Default avg-response target (ms) for a performance band. */
export function bandTimeTarget(band) {
  switch (band) {
    case DDA_BANDS.SMART:
    case DDA_BANDS.STRONG:
      return DDA_CONFIG.fastTargetMs;
    case DDA_BANDS.WEAK:
    case DDA_BANDS.EMERGING:
      return DDA_CONFIG.slowTargetMs;
    default:
      return DDA_CONFIG.midTargetMs;
  }
}

/**
 * Nudge a previous-level avg time into the next level's target.
 * Strong → slightly tighter; emerging → slightly more time.
 */
export function adjustTimeTarget(previousAvgMs, band) {
  const { minTargetMs, maxTargetMs } = DDA_CONFIG;
  const base =
    previousAvgMs > 0 ? Number(previousAvgMs) : bandTimeTarget(band);

  let next = base;
  if (band === DDA_BANDS.SMART || band === DDA_BANDS.STRONG) next = base * 0.9;
  else if (band === DDA_BANDS.WEAK || band === DDA_BANDS.EMERGING) next = base * 1.1;

  return Math.round(
    Math.max(minTargetMs, Math.min(maxTargetMs, next)),
  );
}

export function questionsAnswered(correct, incorrect) {
  return (correct || 0) + (incorrect || 0);
}

export function isLevelQuestionCapReached(
  correct,
  incorrect,
  maxQuestions = DDA_CONFIG.maxQuestions,
) {
  return questionsAnswered(correct, incorrect) >= maxQuestions;
}

/** @deprecated use isLevelQuestionCapReached */
export function isCalibrated(
  correct,
  incorrect,
  minQuestions = DDA_CONFIG.maxQuestions,
) {
  return isLevelQuestionCapReached(correct, incorrect, minQuestions);
}

export function goalTextForQuestions(answered, maxQuestions, targetMs) {
  const remaining = Math.max(0, maxQuestions - answered);
  const targetSec = (targetMs / 1000).toFixed(1);
  if (remaining <= 0) {
    return `Level complete — target avg was ${targetSec}s per question`;
  }
  return `Answer ${remaining} more question${
    remaining === 1 ? '' : 's'
  } (${answered}/${maxQuestions}) · target avg ${targetSec}s`;
}

export function goalTextForTarget(targetMs, band) {
  const targetSec = (targetMs / 1000).toFixed(1);
  const bandLabel =
    band === DDA_BANDS.STRONG
      ? 'Challenge mode (fast & accurate)'
      : band === DDA_BANDS.EMERGING
        ? 'Supported mode (take your time)'
        : 'Standard mode';
  return `${bandLabel}: finish ${DDA_CONFIG.maxQuestions} questions · target avg ${targetSec}s`;
}

export function cropValueForBand(baseValue, band) {
  if (band === DDA_BANDS.STRONG) return baseValue + 2;
  if (band === DDA_BANDS.EMERGING) return Math.max(5, baseValue - 2);
  return baseValue;
}

export function formatResponseTime(ms) {
  const sec = Math.max(0, ms) / 1000;
  return `${sec.toFixed(1)}s`;
}
