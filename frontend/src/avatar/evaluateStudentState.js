/**
 * Intelligent intervention rule engine.
 * Auto-opens mentor only with clear multi-metric need — never a single wrong.
 * Four total incorrect attempts (or four on one concept) is a hard open signal.
 */
import {
  AVATAR_THRESHOLDS,
  INTERVENTION_MODES,
  PERCEIVED_STATES,
} from './avatarConstants.js';
import {
  calculateFrustrationScore,
  shouldOpenFrustrationAgent,
} from '../data/frustrationModel.js';

/**
 * Collect support/frustration indicators (each is a distinct evidence bit).
 */
export function collectSupportIndicators(metrics = {}, opts = {}, t = AVATAR_THRESHOLDS) {
  const retries = Number(metrics.level_retries_count) || 0;
  const accuracy = Number(metrics.accuracy_percentage);
  const accuracySafe = Number.isFinite(accuracy) ? accuracy : 100;
  const deltaPts =
    metrics.performance_delta_points != null
      ? Number(metrics.performance_delta_points)
      : parseDelta(metrics.performance_delta);
  const click = String(metrics.click_pattern_density || 'Low/Calm');
  const isRage = /high|rage/i.test(click);
  const avgQ =
    Number(metrics.time_per_question_avg_sec) ||
    Number(metrics.time_per_question_current_sec) ||
    0;
  const incorrect = Number(metrics.incorrect_answers) || 0;
  const correct = Number(metrics.correct_answers) || 0;
  const totalAnswers = correct + incorrect;
  const conceptMisses = Number(metrics.max_concept_misses) || 0;
  const consecutive = Number(metrics.consecutive_fails) || 0;
  const levelElapsed = Number(metrics.level_elapsed_sec) || 0;
  const questionStagnant = Boolean(opts.questionStagnant);
  const levelStagnant = Boolean(opts.levelStagnant);

  const totalWrongThreshold = t.totalIncorrectForSupport || 3;

  const flags = {
    /** Primary gaming path: enough wrong answers overall (topics may differ) */
    total_incorrect_x4: incorrect >= totalWrongThreshold,
    same_concept_x4: conceptMisses >= (t.conceptMissesForMindMap || 2),
    high_level_retries: retries >= (t.levelRetriesSupport || 4),
    consecutive_fails: consecutive >= (t.consecutiveFails || 3),
    low_accuracy:
      totalAnswers >= (t.minAnswersForAccuracy || 4) &&
      accuracySafe < (t.lowAccuracyPct || 50),
    declining_delta:
      deltaPts != null &&
      deltaPts <= -(t.positiveDeltaMin || 10) &&
      totalAnswers >= 3,
    slow_questions:
      avgQ > 0 && avgQ >= (t.slowQuestionSec || 75) && totalAnswers >= 2,
    long_level: levelElapsed >= (t.longLevelSec || 20 * 60),
    rage_clicks: isRage,
    stagnant_while_struggling:
      (questionStagnant || levelStagnant) &&
      (accuracySafe < 70 ||
        retries >= 2 ||
        consecutive >= 2 ||
        incorrect >= 3),
  };

  const active = Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return {
    flags,
    active,
    conceptMisses,
    isRage,
    retries,
    accuracy: accuracySafe,
    totalAnswers,
    incorrect,
  };
}

/**
 * @param {object} metrics
 * @param {object} [opts]
 */
export function evaluateStudentState(metrics = {}, opts = {}) {
  const t = { ...AVATAR_THRESHOLDS, ...(opts.thresholds || {}) };
  const levelStagnant = Boolean(opts.levelStagnant);
  const questionStagnant = Boolean(opts.questionStagnant);
  const forceEval = Boolean(opts.forceEval);

  const incorrect = Number(metrics.incorrect_answers) || 0;
  const correct = Number(metrics.correct_answers) || 0;
  const totalAnswers = correct + incorrect;
  const accuracy = Number(metrics.accuracy_percentage);
  const accuracySafe = Number.isFinite(accuracy) ? accuracy : 100;
  const deltaPts =
    metrics.performance_delta_points != null
      ? Number(metrics.performance_delta_points)
      : parseDelta(metrics.performance_delta);
  const avgQ =
    Number(metrics.time_per_question_avg_sec) ||
    Number(metrics.time_per_question_current_sec) ||
    0;
  const fastRatio = Number(metrics.fast_question_ratio) || 0;
  const firstStreak = Boolean(metrics.first_attempt_correct_streak);
  const milestone = Boolean(metrics.milestone_just_achieved);
  const levelElapsed = Number(metrics.level_elapsed_sec) || 0;
  const completedFast =
    Boolean(metrics.level_completed_recently) &&
    levelElapsed > 0 &&
    levelElapsed <= t.rapidLevelSec;
  const retries = Number(metrics.level_retries_count) || 0;

  const {
    flags,
    active: supportIndicators,
    conceptMisses,
    isRage,
  } = collectSupportIndicators(metrics, opts, t);

  const frustration = calculateFrustrationScore(metrics);
  if (shouldOpenFrustrationAgent(frustration) && (forceEval || totalAnswers >= 2)) {
    return {
      intervention_mode: INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD,
      perceived_state: PERCEIVED_STATES.FRUSTRATED,
      reason: 'frustration_score',
      scenario: 'frustrated',
      confidence: Math.min(1, frustration.score / 100),
      indicators: frustration.signals,
      offerMindMap: incorrect >= 1 || conceptMisses >= 1,
      generate_mind_map: incorrect >= 1 || conceptMisses >= 1,
      frustrationScore: frustration.score,
      hardStruggle: frustration.score >= 81,
    };
  }

  // --- Hard open: 3+ wrong answers total OR 2+ on same concept ---
  if (flags.same_concept_x4 || flags.total_incorrect_x4) {
    const sameConcept = flags.same_concept_x4;
    return {
      intervention_mode: INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD,
      perceived_state: PERCEIVED_STATES.STRUGGLING,
      reason: sameConcept ? 'concept_misconceptions' : 'repeated_incorrect',
      scenario: sameConcept ? 'struggling_concept' : 'struggling',
      scenarioCode: sameConcept
        ? 'SAME_CONCEPT_STRUGGLE'
        : 'REPEATED_WRONG',
      non_wrong_scenario_code: sameConcept
        ? 'SAME_CONCEPT_STRUGGLE'
        : 'REPEATED_WRONG',
      confidence: 0.9,
      indicators: supportIndicators,
      // Mind maps whenever wrong answers exist on this path
      offerMindMap: true,
      generate_mind_map: true,
      hardStruggle: true,
    };
  }

  // Consecutive fails alone is enough for repeated-wrong support + mind map
  if (flags.consecutive_fails) {
    return {
      intervention_mode: INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD,
      perceived_state: PERCEIVED_STATES.STRUGGLING,
      reason: 'repeated_incorrect',
      scenario: 'struggling',
      scenarioCode: 'REPEATED_WRONG',
      non_wrong_scenario_code: 'REPEATED_WRONG',
      confidence: 0.85,
      indicators: supportIndicators,
      offerMindMap: true,
      generate_mind_map: true,
      hardStruggle: true,
    };
  }

  // Multi-indicator support (≥2 signals)
  const supportCount = supportIndicators.length;
  const rageAloneBlocked =
    t.rageNeedsCompanionSignal &&
    isRage &&
    supportCount === 1 &&
    flags.rage_clicks;

  if (
    supportCount >= (t.minSupportIndicators || 2) &&
    !rageAloneBlocked &&
    (forceEval ||
      levelStagnant ||
      questionStagnant ||
      flags.consecutive_fails ||
      flags.high_level_retries ||
      flags.low_accuracy ||
      flags.declining_delta ||
      flags.slow_questions ||
      flags.long_level ||
      flags.stagnant_while_struggling ||
      (isRage && supportCount >= 2))
  ) {
    const frustrated =
      isRage ||
      (flags.consecutive_fails && flags.high_level_retries) ||
      (flags.declining_delta && flags.low_accuracy);

    return {
      intervention_mode: INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD,
      perceived_state: frustrated
        ? PERCEIVED_STATES.FRUSTRATED
        : PERCEIVED_STATES.STRUGGLING,
      reason: frustrated ? 'frustration_pattern' : 'struggling_metrics',
      scenario: frustrated ? 'frustrated' : 'struggling',
      confidence: Math.min(1, supportCount / 5),
      indicators: supportIndicators,
      // Only when incorrect answers exist
      offerMindMap: incorrect >= 1 || conceptMisses >= 1,
      generate_mind_map: incorrect >= 1 || conceptMisses >= 1,
      hardStruggle:
        flags.consecutive_fails ||
        flags.total_incorrect_x4 ||
        flags.same_concept_x4 ||
        incorrect >= (t.totalIncorrectForSupport || 3),
    };
  }

  // Bored / under-challenged — only with idle gate
  if (levelStagnant || questionStagnant) {
    const fastEnough =
      (avgQ > 0 && avgQ <= t.fastQuestionSec) ||
      fastRatio >= 0.65 ||
      correct >= (t.minFastAnswersForBored || 3);

    const bored =
      accuracySafe >= t.highAccuracyPct &&
      retries <= t.lowRetryCeiling &&
      totalAnswers >= (t.minFastAnswersForBored || 3) &&
      fastEnough &&
      incorrect <= 1;

    if (bored) {
      return {
        intervention_mode: INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE,
        perceived_state: PERCEIVED_STATES.BORED_OR_EASY,
        reason: 'bored_under_challenged',
        scenario: 'bored',
        confidence: 0.8,
        indicators: ['high_accuracy', 'fast_pace', 'level_idle'],
        offerMindMap: false,
      };
    }
  }

  const celebrateScore =
    (milestone ? 3 : 0) +
    (firstStreak &&
    accuracySafe >= 90 &&
    totalAnswers >= (t.firstTryStreakForMilestone || 4)
      ? 2
      : 0) +
    (completedFast && accuracySafe >= 85 && incorrect === 0 ? 2 : 0) +
    (deltaPts != null &&
    deltaPts >= t.positiveDeltaMin &&
    accuracySafe >= 85 &&
    forceEval
      ? 1
      : 0);

  if (celebrateScore >= 3) {
    return {
      intervention_mode: INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE,
      perceived_state: PERCEIVED_STATES.HIGH_PERFORMING,
      reason: 'high_performing_milestone',
      scenario: 'milestone',
      confidence: Math.min(1, celebrateScore / 5),
      indicators: ['mastery_milestone'],
      offerMindMap: false,
    };
  }

  if (
    forceEval &&
    !isRage &&
    !flags.same_concept_x4 &&
    !flags.total_incorrect_x4 &&
    accuracySafe >= t.highAccuracyPct &&
    retries <= t.lowRetryCeiling &&
    totalAnswers >= 3 &&
    incorrect <= 1 &&
    (levelStagnant || questionStagnant)
  ) {
    return {
      intervention_mode: INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE,
      perceived_state: PERCEIVED_STATES.BORED_OR_EASY,
      reason: 'bored_under_challenged',
      scenario: 'preference_check',
      confidence: 0.55,
      indicators: ['high_mastery_force_eval'],
      offerMindMap: false,
    };
  }

  return null;
}

function parseDelta(deltaStr) {
  if (deltaStr == null) return null;
  const m = String(deltaStr).match(/([+-]?\d+)/);
  return m ? Number(m[1]) : null;
}
