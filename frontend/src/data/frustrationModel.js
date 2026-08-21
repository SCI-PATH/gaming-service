/**
 * Configurable weighted frustration model (0–100).
 * One mistake is never enough; several signals together raise the score.
 */
export const FRUSTRATION_LEVELS = Object.freeze({
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  VERY_HIGH: 'very_high',
});

export const FRUSTRATION_LEVEL_RANGES = Object.freeze({
  low: [0, 30],
  moderate: [31, 60],
  high: [61, 80],
  very_high: [81, 100],
});

/** Adjust these values in one place — do not scatter weights across the app. */
export const FRUSTRATION_WEIGHTS = Object.freeze({
  incorrectAnswerWeight: 18,
  consecutiveWrongWeight: 16,
  responseTimeWeight: 14,
  retryWeight: 12,
  mouseBehaviorWeight: 8,
  inactivityWeight: 8,
  hintUsageWeight: 6,
  performanceDeclineWeight: 12,
  gameplayFailureWeight: 6,
});

export const FRUSTRATION_CONFIG = Object.freeze({
  weights: FRUSTRATION_WEIGHTS,
  /** Companion-signal rule: at least this many active signals before score can exceed 40 */
  minSignalsForModerate: 2,
  minSignalsForHigh: 3,
  /** A single incorrect answer contributes at most this many points */
  singleMistakeCap: 12,
  consecutiveWrongSoft: 2,
  consecutiveWrongHard: 4,
  retrySoft: 2,
  retryHard: 5,
  hintSoft: 2,
  hintHard: 4,
  timeIncreaseSoft: 1.35,
  timeIncreaseHard: 1.9,
  inactivitySecSoft: 20,
  inactivitySecHard: 45,
  rageClicksSoft: 6,
  enemyHitsSoft: 2,
  enemyHitsHard: 5,
  levelRestartsHard: 2,
});

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function scale(value, soft, hard) {
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  if (v <= soft) return 0.35 * (v / Math.max(1, soft));
  if (v >= hard) return 1;
  return 0.35 + 0.65 * ((v - soft) / Math.max(0.001, hard - soft));
}

export function frustrationLevelFromScore(score) {
  const s = clamp(Math.round(Number(score) || 0), 0, 100);
  if (s <= 30) return FRUSTRATION_LEVELS.LOW;
  if (s <= 60) return FRUSTRATION_LEVELS.MODERATE;
  if (s <= 80) return FRUSTRATION_LEVELS.HIGH;
  return FRUSTRATION_LEVELS.VERY_HIGH;
}

export function frustrationLevelLabel(level) {
  switch (level) {
    case FRUSTRATION_LEVELS.MODERATE:
      return 'Moderate Frustration';
    case FRUSTRATION_LEVELS.HIGH:
      return 'High Frustration';
    case FRUSTRATION_LEVELS.VERY_HIGH:
      return 'Very High Frustration';
    default:
      return 'Low Frustration';
  }
}

/**
 * @param {object} metrics
 * @param {object} [opts]
 * @returns {{ score: number, level: string, signals: string[], parts: object }}
 */
export function calculateFrustrationScore(metrics = {}, opts = {}) {
  const w = { ...FRUSTRATION_WEIGHTS, ...(opts.weights || {}) };
  const cfg = { ...FRUSTRATION_CONFIG, ...(opts.config || {}) };

  const incorrect = Number(metrics.incorrect_answers) || 0;
  const correct = Number(metrics.correct_answers) || 0;
  const total = correct + incorrect;
  const errorRate = total > 0 ? incorrect / total : 0;
  const consecutive = Number(metrics.consecutive_fails) || 0;
  const retries = Number(metrics.retries ?? metrics.level_retries_count) || 0;
  const hints = Number(metrics.hint_count ?? metrics.hints_used_recent) || 0;
  const switches = Number(metrics.answer_switches ?? metrics.selection_switch_count) || 0;
  const avgTime = Number(metrics.time_per_question_avg_sec) || 0;
  const baseline =
    Number(metrics.previous_avg_answer_time_sec) ||
    Number(metrics.baseline_avg_answer_time_sec) ||
    0;
  const timeRatio = baseline > 0 && avgTime > 0 ? avgTime / baseline : 1;
  const deltaPts = Number(metrics.performance_delta_points) || 0;
  const inactivity = Number(metrics.inactivity_sec ?? metrics.mouse_inactivity_sec) || 0;
  const rage = /high|rage/i.test(String(metrics.click_pattern_density || ''));
  const clickBurst = Number(metrics.rapid_click_count) || 0;
  const enemyHits = Number(metrics.enemy_hits ?? metrics.enemy_deaths) || 0;
  const restarts = Number(metrics.level_restarts) || 0;
  const skipped = Number(metrics.questions_skipped) || 0;
  const mouseExcess = Number(metrics.mouse_erratic_score) || 0;

  const parts = {
    errors: errorRate * w.incorrectAnswerWeight,
    consecutive: scale(consecutive, cfg.consecutiveWrongSoft, cfg.consecutiveWrongHard) * w.consecutiveWrongWeight,
    time: (timeRatio > 1 ? scale(timeRatio, cfg.timeIncreaseSoft, cfg.timeIncreaseHard) : 0) * w.responseTimeWeight,
    retries: scale(retries, cfg.retrySoft, cfg.retryHard) * w.retryWeight,
    mouse: ((rage ? 0.7 : 0) + scale(clickBurst, cfg.rageClicksSoft, cfg.rageClicksSoft * 2) * 0.3 + clamp(mouseExcess, 0, 1) * 0.4) * w.mouseBehaviorWeight,
    inactivity: scale(inactivity, cfg.inactivitySecSoft, cfg.inactivitySecHard) * w.inactivityWeight,
    hints: (scale(hints, cfg.hintSoft, cfg.hintHard) * 0.7 + scale(switches, 3, 8) * 0.3) * w.hintUsageWeight,
    decline: (deltaPts < 0 ? clamp(-deltaPts / 25, 0, 1) : 0) * w.performanceDeclineWeight,
    gameplay: (scale(enemyHits, cfg.enemyHitsSoft, cfg.enemyHitsHard) * 0.6 + scale(restarts, 1, cfg.levelRestartsHard) * 0.4 + scale(skipped, 1, 3) * 0.3) * w.gameplayFailureWeight,
  };

  const signals = [];
  if (errorRate >= 0.4 && total >= 2) signals.push('incorrect_rate');
  if (consecutive >= 2) signals.push('consecutive_wrong');
  if (timeRatio >= cfg.timeIncreaseSoft && baseline > 0) signals.push('slower_than_baseline');
  if (retries >= cfg.retrySoft) signals.push('retries');
  if (rage || clickBurst >= cfg.rageClicksSoft) signals.push('rapid_clicks');
  if (inactivity >= cfg.inactivitySecSoft) signals.push('inactivity');
  if (hints >= cfg.hintSoft) signals.push('hints');
  if (deltaPts <= -8) signals.push('performance_decline');
  if (enemyHits >= cfg.enemyHitsSoft || restarts >= 1) signals.push('gameplay_failure');
  if (switches >= 3) signals.push('answer_changes');

  let raw = Object.values(parts).reduce((a, b) => a + b, 0);

  // One isolated mistake must stay small.
  if (total <= 1 && consecutive <= 1 && signals.length <= 1) {
    raw = Math.min(raw, cfg.singleMistakeCap);
  }
  if (signals.length < cfg.minSignalsForModerate) {
    raw = Math.min(raw, 40);
  }
  if (signals.length < cfg.minSignalsForHigh && raw > 60) {
    raw = 60;
  }

  const score = clamp(Math.round(raw), 0, 100);
  return {
    score,
    level: frustrationLevelFromScore(score),
    signals,
    parts,
  };
}

export function shouldOpenFrustrationAgent(result) {
  if (!result) return false;
  return (
    result.score >= 61 &&
    result.signals.length >= FRUSTRATION_CONFIG.minSignalsForHigh
  );
}
