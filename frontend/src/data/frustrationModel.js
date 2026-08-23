/**
 * CSF — Companion-Signal Frustration scoring (0–100).
 * Rule-based, deterministic, no ML training.
 *
 * Design:
 * - Multi-signal fusion (cognitive + temporal + motor + gameplay)
 * - Soft/hard scaling so small noise stays quiet
 * - Companion-signal caps so one mistake cannot spike the score
 * - Recent recovery dampening when the student starts succeeding again
 * - Adaptation profile for Sage tone + mind-map personalization
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

/**
 * Weight budget sums to 100 — each unit ≈ one score point at full signal.
 * Tuned so consecutive fails + decline + error rate dominate motor noise.
 */
export const FRUSTRATION_WEIGHTS = Object.freeze({
  incorrectAnswerWeight: 18,
  consecutiveWrongWeight: 20,
  responseTimeWeight: 12,
  retryWeight: 11,
  mouseBehaviorWeight: 6,
  inactivityWeight: 6,
  hintUsageWeight: 6,
  performanceDeclineWeight: 13,
  gameplayFailureWeight: 5,
  conceptStruggleWeight: 3,
});

export const FRUSTRATION_CONFIG = Object.freeze({
  weights: FRUSTRATION_WEIGHTS,
  /** Companion-signal rule: at least this many active signals before score can exceed 40 */
  minSignalsForModerate: 2,
  /** Need this many signals before score can exceed 60 / open Sage */
  minSignalsForHigh: 3,
  /** A single incorrect answer contributes at most this many points */
  singleMistakeCap: 10,
  agentOpenScore: 61,
  consecutiveWrongSoft: 2,
  consecutiveWrongHard: 3,
  retrySoft: 2,
  retryHard: 4,
  hintSoft: 2,
  hintHard: 4,
  timeIncreaseSoft: 1.25,
  timeIncreaseHard: 1.7,
  inactivitySecSoft: 18,
  inactivitySecHard: 40,
  rageClicksSoft: 5,
  enemyHitsSoft: 2,
  enemyHitsHard: 5,
  levelRestartsHard: 2,
  conceptMissSoft: 2,
  conceptMissHard: 4,
  /** Recent correct streak that dampens raw score */
  recoveryCorrectSoft: 2,
  recoveryDampMax: 0.22,
});

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Piecewise scale: below soft → gentle ramp; soft→hard → linear; ≥ hard → 1.
 */
export function scale(value, soft, hard) {
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
  switch (String(level || '').toLowerCase()) {
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
 * How Sage should speak + how the mind map should personalize.
 * Never expose "frustrated" language to the student — these are coach instructions.
 */
export function buildFrustrationAdaptation(scoreOrLevel, signals = []) {
  const score =
    typeof scoreOrLevel === 'number'
      ? clamp(Math.round(scoreOrLevel), 0, 100)
      : null;
  const level =
    score != null
      ? frustrationLevelFromScore(score)
      : String(scoreOrLevel || 'low').toLowerCase();

  const base = {
    level,
    score: score ?? null,
    signals: Array.isArray(signals) ? signals.slice(0, 8) : [],
    sage: {
      warmth: 'warm',
      pace: 'steady',
      sentenceMax: 3,
      scaffoldDepth: 1,
      useChoices: true,
      celebrateSmallWins: true,
      microSteps: false,
      voiceHint:
        'Warm and curious. Short sentences. One gentle next step.',
    },
    mindMap: {
      maxBranches: 5,
      extraLinks: false,
      explainDepth: 'medium',
      tone: 'practice',
      studySteps: 3,
      simplifyLanguage: false,
      label: 'Practice map',
    },
    shop: {
      priceMult: 1,
      label: 'Standard unlock prices',
    },
    combat: {
      speedMult: 1,
      countMult: 1,
      distanceBoost: 0,
      hurtInvulnMult: 1,
      damageChance: 1,
      label: 'Standard farm pressure',
    },
    /** Live farm / quiz personalization (timers, hints, retries, cash, farm mood) */
    gameplay: {
      timerMult: 1,
      retryBonus: 0,
      hintLevel: null, // null = keep band default
      cashMult: 1,
      playerSpeedMult: 1,
      farmMood: 'steady',
      label: 'Balanced farm support',
    },
  };

  if (level === FRUSTRATION_LEVELS.LOW) {
    return {
      ...base,
      sage: {
        ...base.sage,
        pace: 'lively',
        scaffoldDepth: 0,
        celebrateSmallWins: true,
        voiceHint:
          'Upbeat farm buddy. Celebrate effort. Offer a light stretch if they want it. Keep science playful.',
      },
      mindMap: {
        maxBranches: 8,
        extraLinks: true,
        explainDepth: 'rich',
        tone: 'challenge',
        studySteps: 5,
        simplifyLanguage: false,
        label: 'Explore connections',
      },
      shop: {
        priceMult: 1.0,
        label: 'Standard unlock prices',
      },
      combat: {
        speedMult: 1.08,
        countMult: 1.1,
        distanceBoost: -1,
        hurtInvulnMult: 0.9,
        damageChance: 1,
        label: 'Full farm pressure',
      },
      gameplay: {
        timerMult: 0.9,
        retryBonus: 0,
        hintLevel: 'minimal',
        cashMult: 1.08,
        playerSpeedMult: 1.05,
        farmMood: 'thriving',
        label: 'Challenge farm pace',
      },
    };
  }

  if (level === FRUSTRATION_LEVELS.MODERATE) {
    return {
      ...base,
      sage: {
        ...base.sage,
        pace: 'steady',
        scaffoldDepth: 1,
        voiceHint:
          'Calm coach. Acknowledge the hang-up without shame. One clear tip + one check question. Prefer A–D choices.',
      },
      mindMap: {
        maxBranches: 5,
        extraLinks: false,
        explainDepth: 'medium',
        tone: 'practice',
        studySteps: 3,
        simplifyLanguage: false,
        label: 'Repair practice',
      },
      shop: {
        priceMult: 0.9,
        label: 'Support prices (small discount)',
      },
      combat: {
        speedMult: 0.92,
        countMult: 0.9,
        distanceBoost: 1,
        hurtInvulnMult: 1.1,
        damageChance: 0.95,
        label: 'Eased farm pressure',
      },
      gameplay: {
        timerMult: 1.15,
        retryBonus: 1,
        hintLevel: 'limited',
        cashMult: 1.05,
        playerSpeedMult: 1,
        farmMood: 'steady',
        label: 'Gentle farm support',
      },
    };
  }

  if (level === FRUSTRATION_LEVELS.HIGH) {
    return {
      ...base,
      sage: {
        warmth: 'extra_warm',
        pace: 'slow',
        sentenceMax: 2,
        scaffoldDepth: 2,
        useChoices: true,
        celebrateSmallWins: true,
        microSteps: true,
        voiceHint:
          'Extra gentle. Very short sentences. Name one small win. Offer the simplest next step. No quizzes that feel like a test.',
      },
      mindMap: {
        maxBranches: 3,
        extraLinks: false,
        explainDepth: 'simple',
        tone: 'support',
        studySteps: 2,
        simplifyLanguage: true,
        label: 'Gentle repair',
      },
      shop: {
        priceMult: 0.75,
        label: 'Helpful unlock discount',
      },
      combat: {
        speedMult: 0.7,
        countMult: 0.55,
        distanceBoost: 4,
        hurtInvulnMult: 1.45,
        damageChance: 0.7,
        label: 'Calmer enemies',
      },
      gameplay: {
        timerMult: 1.45,
        retryBonus: 2,
        hintLevel: 'more',
        cashMult: 1.12,
        playerSpeedMult: 1.08,
        farmMood: 'needs_care',
        label: 'Supportive farm pace',
      },
    };
  }

  // very_high
  return {
    ...base,
    sage: {
      warmth: 'soothing',
      pace: 'very_slow',
      sentenceMax: 2,
      scaffoldDepth: 3,
      useChoices: true,
      celebrateSmallWins: true,
      microSteps: true,
      voiceHint:
        'Softest voice. Tiny micro-steps only. Reassure that trying again is brave. One fact at a time. Offer a pause or farm breath if needed.',
    },
    mindMap: {
      maxBranches: 2,
      extraLinks: false,
      explainDepth: 'micro',
      tone: 'support',
      studySteps: 1,
      simplifyLanguage: true,
      label: 'One step at a time',
    },
    shop: {
      priceMult: 0.58,
      label: 'Strong unlock support pricing',
    },
    combat: {
      speedMult: 0.5,
      countMult: 0.35,
      distanceBoost: 7,
      hurtInvulnMult: 1.8,
      damageChance: 0.45,
      label: 'Softest enemy pressure',
    },
    gameplay: {
      timerMult: 1.75,
      retryBonus: 3,
      hintLevel: 'more',
      cashMult: 1.2,
      playerSpeedMult: 1.12,
      farmMood: 'needs_care',
      label: 'Maximum farm support',
    },
  };
}

/**
 * @param {object} metrics
 * @param {object} [opts]
 * @returns {{ score: number, level: string, signals: string[], parts: object, adaptation: object, recoveryFactor: number }}
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
  const switches =
    Number(metrics.answer_switches ?? metrics.selection_switch_count) || 0;
  const avgTime = Number(metrics.time_per_question_avg_sec) || 0;
  const baseline =
    Number(metrics.previous_avg_answer_time_sec) ||
    Number(metrics.baseline_avg_answer_time_sec) ||
    0;
  const timeRatio = baseline > 0 && avgTime > 0 ? avgTime / baseline : 1;
  const deltaPts = Number(metrics.performance_delta_points) || 0;
  const inactivity =
    Number(metrics.inactivity_sec ?? metrics.mouse_inactivity_sec) || 0;
  const rage = /high|rage/i.test(String(metrics.click_pattern_density || ''));
  const clickBurst = Number(metrics.rapid_click_count) || 0;
  const enemyHits = Number(metrics.enemy_hits ?? metrics.enemy_deaths) || 0;
  const restarts = Number(metrics.level_restarts) || 0;
  const skipped = Number(metrics.questions_skipped) || 0;
  const shopLeft = Number(metrics.shop_customers_left) || 0;
  const mouseExcess = Number(metrics.mouse_erratic_score) || 0;
  const conceptMisses =
    Number(
      metrics.same_concept_misses ??
        metrics.concept_miss_count ??
        metrics.top_concept_misses,
    ) || 0;
  const recentCorrect =
    Number(
      metrics.recent_correct_streak ??
        metrics.consecutive_correct ??
        metrics.first_attempt_correct_streak,
    ) || 0;

  const parts = {
    errors: errorRate * w.incorrectAnswerWeight,
    consecutive:
      scale(consecutive, cfg.consecutiveWrongSoft, cfg.consecutiveWrongHard) *
      w.consecutiveWrongWeight,
    time:
      (timeRatio > 1
        ? scale(timeRatio, cfg.timeIncreaseSoft, cfg.timeIncreaseHard)
        : 0) * w.responseTimeWeight,
    retries: scale(retries, cfg.retrySoft, cfg.retryHard) * w.retryWeight,
    mouse:
      ((rage ? 0.7 : 0) +
        scale(clickBurst, cfg.rageClicksSoft, cfg.rageClicksSoft * 2) * 0.3 +
        clamp(mouseExcess, 0, 1) * 0.4) *
      w.mouseBehaviorWeight,
    inactivity:
      scale(inactivity, cfg.inactivitySecSoft, cfg.inactivitySecHard) *
      w.inactivityWeight,
    hints:
      (scale(hints, cfg.hintSoft, cfg.hintHard) * 0.7 +
        scale(switches, 3, 8) * 0.3) *
      w.hintUsageWeight,
    decline:
      (deltaPts < 0 ? clamp(-deltaPts / 22, 0, 1) : 0) *
      w.performanceDeclineWeight,
    gameplay:
      (scale(enemyHits, cfg.enemyHitsSoft, cfg.enemyHitsHard) * 0.5 +
        scale(restarts, 1, cfg.levelRestartsHard) * 0.3 +
        scale(skipped, 1, 3) * 0.2 +
        scale(shopLeft, 2, 4) * 0.25) *
      w.gameplayFailureWeight,
    concept:
      scale(conceptMisses, cfg.conceptMissSoft, cfg.conceptMissHard) *
      (w.conceptStruggleWeight || 0),
  };

  const signals = [];
  if (errorRate >= 0.35 && total >= 2) signals.push('incorrect_rate');
  if (consecutive >= 2) signals.push('consecutive_wrong');
  if (timeRatio >= cfg.timeIncreaseSoft && baseline > 0) {
    signals.push('slower_than_baseline');
  }
  if (retries >= cfg.retrySoft) signals.push('retries');
  if (rage || clickBurst >= cfg.rageClicksSoft) signals.push('rapid_clicks');
  if (inactivity >= cfg.inactivitySecSoft) signals.push('inactivity');
  if (hints >= cfg.hintSoft) signals.push('hints');
  if (deltaPts <= -8) signals.push('performance_decline');
  if (enemyHits >= cfg.enemyHitsSoft || restarts >= 1) {
    signals.push('gameplay_failure');
  }
  if (shopLeft >= 2) signals.push('shop_customers_left');
  if (switches >= 3) signals.push('answer_changes');
  if (conceptMisses >= cfg.conceptMissSoft) signals.push('concept_struggle');

  let raw = Object.values(parts).reduce((a, b) => a + b, 0);

  // Recent success softens the estimate (recovery dampening).
  let recoveryFactor = 1;
  if (recentCorrect >= cfg.recoveryCorrectSoft && consecutive < 2) {
    const damp = clamp(
      (recentCorrect - (cfg.recoveryCorrectSoft - 1)) * 0.07,
      0,
      cfg.recoveryDampMax,
    );
    recoveryFactor = 1 - damp;
    raw *= recoveryFactor;
  }

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
  const level = frustrationLevelFromScore(score);
  const adaptation = buildFrustrationAdaptation(score, signals);

  // Rank parts for research / dashboard explainability
  const dominant = Object.entries(parts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => ({ key, value: Math.round(value * 10) / 10 }));

  return {
    score,
    level,
    signals,
    parts,
    dominant,
    recoveryFactor: Math.round(recoveryFactor * 100) / 100,
    adaptation,
  };
}

/**
 * Continuous shop price factor from frustration score (0–100).
 * Low frustration → ~1.05 (slightly pricier challenge)
 * Very high → ~0.55 (strong support discount)
 */
export function frustrationShopPriceFactor(score, level = null) {
  const s = clamp(Number(score) || 0, 0, 100);
  const adapt = buildFrustrationAdaptation(level || s);
  // Blend band mult with continuous curve for smoother dynamics
  const continuous = 1.05 - (s / 100) * 0.5; // 1.05 → 0.55
  const band = Number(adapt.shop?.priceMult) || 1;
  return clamp(continuous * 0.55 + band * 0.45, 0.5, 1.15);
}

/**
 * Combat pressure multipliers from frustration (enemies ease when score rises).
 */
export function frustrationCombatFactor(score, level = null) {
  const adapt = buildFrustrationAdaptation(
    level || (Number.isFinite(Number(score)) ? Number(score) : 'moderate'),
  );
  return {
    level: adapt.level,
    ...(adapt.combat || {
      speedMult: 1,
      countMult: 1,
      distanceBoost: 0,
      hurtInvulnMult: 1,
      damageChance: 1,
      label: 'Standard farm pressure',
    }),
  };
}

export function shouldOpenFrustrationAgent(result) {
  if (!result) return false;
  const threshold =
    FRUSTRATION_CONFIG.agentOpenScore ??
    FRUSTRATION_LEVEL_RANGES.high[0];
  return (
    result.score >= threshold &&
    result.signals.length >= FRUSTRATION_CONFIG.minSignalsForHigh
  );
}
