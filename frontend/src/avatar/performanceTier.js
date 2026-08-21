/**
 * Classify performance tier for avatar dialogue personalization.
 * WEAK | AVERAGE | SMART (ADVANCED)
 */

export const PERFORMANCE_TIERS = {
  WEAK: 'WEAK',
  MEDIUM: 'MEDIUM',
  SMART: 'SMART',
  /** @deprecated */
  AVERAGE: 'MEDIUM',
};

/**
 * @param {object} metrics
 * @param {{ band?: string }} [opts]
 * @returns {'WEAK'|'AVERAGE'|'SMART'}
 */
export function classifyPerformanceTier(metrics = {}, opts = {}) {
  const accuracy =
    metrics.accuracy_percentage != null
      ? Number(metrics.accuracy_percentage)
      : 100;
  const retries = Number(metrics.level_retries_count) || 0;
  const delta =
    metrics.performance_delta_points != null
      ? Number(metrics.performance_delta_points)
      : 0;
  const incorrect =
    metrics.incorrect_answers ??
    metrics.answer_accuracy_counts?.incorrect ??
    0;
  const correct =
    metrics.correct_answers ?? metrics.answer_accuracy_counts?.correct ?? 0;
  const total = correct + incorrect;
  const consecutiveFails = Number(metrics.consecutive_fails) || 0;
  const fastRatio = Number(metrics.fast_question_ratio) || 0;

  const explicit = String(
    metrics.evaluated_tier ||
      metrics.performance_tier ||
      opts.band ||
      '',
  ).toUpperCase();

  if (
    explicit === 'WEAK' ||
    explicit === 'STRUGGLING' ||
    explicit === 'BEGINNER'
  ) {
    return PERFORMANCE_TIERS.WEAK;
  }
  if (
    explicit === 'SMART' ||
    explicit === 'ADVANCED' ||
    explicit === 'STRONG' ||
    explicit === 'EXPERT'
  ) {
    return PERFORMANCE_TIERS.SMART;
  }
  if (
    explicit === 'AVERAGE' ||
    explicit === 'MEDIATE' ||
    explicit === 'MEDIAN'
  ) {
    return PERFORMANCE_TIERS.AVERAGE;
  }

  const band = String(opts.band || '').toLowerCase();
  if (band === 'weak' || band === 'struggling') return PERFORMANCE_TIERS.WEAK;
  if (band === 'advanced' || band === 'strong' || band === 'smart') {
    return PERFORMANCE_TIERS.SMART;
  }

  if (total < 3) {
    if (retries >= 3 || consecutiveFails >= 2) return PERFORMANCE_TIERS.WEAK;
    return PERFORMANCE_TIERS.MEDIUM;
  }

  if (
    accuracy <= 50 ||
    (retries >= 3 && accuracy < 65) ||
    consecutiveFails >= 3 ||
    (delta <= -10 && accuracy < 70)
  ) {
    return PERFORMANCE_TIERS.WEAK;
  }

  if (
    accuracy >= 85 &&
    retries <= 1 &&
    delta >= 0 &&
    (fastRatio >= 0.4 || total >= 4)
  ) {
    return PERFORMANCE_TIERS.SMART;
  }

  return PERFORMANCE_TIERS.MEDIUM;
}

/**
 * Whether this intervention should allow mind maps (incorrect only).
 */
export function shouldGenerateMindMap({
  interventionMode = null,
  triggerReason = null,
  scenario = null,
  incorrectCount = 0,
  misconceptionCount = 0,
  offerMindMap = false,
} = {}) {
  const reason = String(triggerReason || '').toLowerCase();
  const scen = String(scenario || '').toLowerCase();
  const mode = String(interventionMode || '');

  // Never for boredom, milestones, or pure enrichment/praise modes alone
  if (
    mode === 'ENRICHMENT_AND_CHALLENGE' ||
    mode === 'CONGRATULATE_AND_ADVANCE'
  ) {
    return false;
  }
  if (
    scen === 'bored' ||
    scen === 'milestone' ||
    scen === 'preference_check' ||
    reason.includes('bored') ||
    reason.includes('milestone') ||
    reason.includes('high_performing')
  ) {
    return false;
  }

  const hasIncorrect =
    Number(incorrectCount) > 0 ||
    Number(misconceptionCount) > 0 ||
    reason.includes('incorrect') ||
    reason.includes('misconception') ||
    reason.includes('struggl') ||
    reason.includes('frustration') ||
    scen.includes('struggl');

  if (!hasIncorrect) return false;
  // Explicit false from evaluator wins
  if (offerMindMap === false && !reason.includes('incorrect') && !reason.includes('misconception')) {
    // Still allow if repeated_incorrect path didn't set flag but misconceptions exist
    return misconceptionCount > 0 || incorrectCount > 0;
  }
  return true;
}
