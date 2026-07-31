/**
 * Quiz attempt scoring for SCI_PATH (correctness + response time).
 * Cash goals are assigned at level start via masteryModel.js from
 * previous-level / external mastery — not mid-level calibration.
 */

export const DDA_BANDS = {
  STRONG: 'strong',
  DEVELOPING: 'developing',
  EMERGING: 'emerging',
};

export const DDA_CONFIG = {
  /** Must answer this many quizzes before a cash goal is assigned / forest unlock */
  minQuestions: 20,
  /**
   * Cash goals after calibration (3×10 patch ≈ 30 crops).
   * Sized so unlock still needs sustained harvesting, not 1–2 sells.
   */
  minTarget: 800, // emerging — more reachable
  midTarget: 1200, // developing
  maxTarget: 1800, // strong — higher bar
  step: 100,
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
  if (!attemptScores?.length) return DDA_BANDS.DEVELOPING;
  const avg = averageScore(attemptScores);
  if (avg >= DDA_CONFIG.strongScore) return DDA_BANDS.STRONG;
  if (avg <= DDA_CONFIG.emergingScore) return DDA_BANDS.EMERGING;
  return DDA_BANDS.DEVELOPING;
}

export function bandTarget(band) {
  switch (band) {
    case DDA_BANDS.STRONG:
      return DDA_CONFIG.maxTarget;
    case DDA_BANDS.EMERGING:
      return DDA_CONFIG.minTarget;
    default:
      return DDA_CONFIG.midTarget;
  }
}

export function adjustCashTarget(currentTarget, band) {
  const ideal = bandTarget(band);
  const { step, minTarget, maxTarget } = DDA_CONFIG;

  // First real goal after calibration — snap to band ideal
  if (currentTarget == null || currentTarget <= 0) {
    return ideal;
  }

  let next = currentTarget;
  if (ideal > currentTarget) next = Math.min(ideal, currentTarget + step);
  else if (ideal < currentTarget) next = Math.max(ideal, currentTarget - step);
  else next = ideal;

  return Math.max(minTarget, Math.min(maxTarget, next));
}

export function questionsAnswered(correct, incorrect) {
  return (correct || 0) + (incorrect || 0);
}

export function isCalibrated(
  correct,
  incorrect,
  minQuestions = DDA_CONFIG.minQuestions,
) {
  return questionsAnswered(correct, incorrect) >= minQuestions;
}

export function goalTextForCalibration(answered, minQuestions) {
  return `Calibrating: answer science questions (${answered}/${minQuestions}) — cash goal unlocks after that`;
}

export function goalTextForTarget(target, band) {
  const bandLabel =
    band === DDA_BANDS.STRONG
      ? 'Challenge mode (fast & accurate)'
      : band === DDA_BANDS.EMERGING
        ? 'Supported mode (take your time)'
        : 'Standard mode';
  return `${bandLabel}: harvest & sell to reach $${target}`;
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
