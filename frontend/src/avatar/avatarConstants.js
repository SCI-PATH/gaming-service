/**
 * Avatar Assistant constants — intelligent intervention (do not interrupt free play).
 */

/** Intervention modes (map 1:1 to system-prompt strategies). */
export const INTERVENTION_MODES = {
  SUPPORT_AND_SCAFFOLD: 'SUPPORT_AND_SCAFFOLD',
  ENRICHMENT_AND_CHALLENGE: 'ENRICHMENT_AND_CHALLENGE',
  CONGRATULATE_AND_ADVANCE: 'CONGRATULATE_AND_ADVANCE',
};

/** Perceived learner states for UI + payload. */
export const PERCEIVED_STATES = {
  STRUGGLING: 'STRUGGLING_OR_FRUSTRATED',
  FRUSTRATED: 'FRUSTRATED',
  BORED_OR_EASY: 'BORED_OR_EASY',
  HIGH_PERFORMING: 'HIGH_PERFORMING_MILESTONE',
  STEADY: 'STEADY',
};

/**
 * Auto-popup only when multi-metric signals show real need.
 * Single wrong answers never open the mentor by themselves.
 */
export const AVATAR_THRESHOLDS = {
  /** Back-to-back wrongs (open mentor + mind map path) */
  consecutiveFails: 3,

  /** Total incorrect answers before mentor auto-opens with mind map */
  totalIncorrectForSupport: 3,

  /** Same concept incorrect answers before mind-map pathway */
  conceptMissesForMindMap: 2,

  /** Level-wide failed tries (retries) */
  levelRetriesSupport: 4,

  lowAccuracyPct: 50,
  minAnswersForAccuracy: 4,
  positiveDeltaMin: 10,

  slowQuestionSec: 75,
  longLevelSec: 20 * 60,

  highAccuracyPct: 85,
  lowRetryCeiling: 1,
  fastQuestionSec: 28,
  minFastAnswersForBored: 3,

  levelStagnationMs: 150_000,
  questionStagnationMs: 120_000,

  firstAttemptAccuracyMin: 0.9,
  rapidLevelSec: 180,
  firstTryStreakForMilestone: 4,

  /** Non-wrong-answer patterns (do not require incorrects) */
  nonWrongSlowSec: 45,
  nonWrongConsecutiveSlow: 3,
  nonWrongHintCount: 3,
  nonWrongLongPauseSec: 90,

  rageClickWindowMs: 2500,
  rageClickCount: 10,
  rageNeedsCompanionSignal: true,

  /** Shorter cool-down so testing and recovery feel responsive */
  cooldownMs: 45_000,
  reevalMinIntervalMs: 8_000,

  /** Companion signals required when no hard total/concept threshold hit */
  minSupportIndicators: 2,
};

/** Adaptive conversation probes (motivation + learning design). */
export const ADAPTIVE_PROBES = {
  support: [
    {
      id: 'difficulty',
      label: 'Having difficulty',
      text: "It looks like I'm having difficulty with this topic. I'd like a simplified explanation or a mind map.",
    },
    {
      id: 'confusing-part',
      label: "What's confusing?",
      text: 'You seem to notice I am struggling. Which part of this lesson is confusing—help me name it.',
    },
    {
      id: 'hint',
      label: 'Hint before retry',
      text: 'Would you give me a gentle hint before I try again—without the full answer key for a new item?',
    },
    {
      id: 'mind-map',
      label: 'Mind map please',
      text: 'Please open the mind map built from the questions I already got wrong and guide me step by step.',
    },
    {
      id: 'motivate',
      label: 'I need confidence',
      text: 'I feel discouraged. Please motivate me and help me rebuild one missed science idea.',
    },
  ],
  enrich: [
    {
      id: 'harder',
      label: 'Harder activities?',
      text: 'I seem to be mastering this quickly. Would you recommend more challenging questions or a different activity?',
    },
    {
      id: 'formats',
      label: 'My format preference',
      text: 'Which type of science activity fits strong students like me—puzzles, scenarios, or advanced MCQs?',
    },
    {
      id: 'stretch',
      label: 'Stretch goal',
      text: 'Suggest a tougher farm cash goal or advanced science stretch for me.',
    },
  ],
  celebrate: [
    {
      id: 'advance',
      label: 'What next?',
      text: 'Celebrate my progress and recommend what I should unlock next.',
    },
    {
      id: 'habit',
      label: 'Keep the habit',
      text: 'What learning habit should I keep using based on my first-try success?',
    },
  ],
  formats: [
    {
      id: 'format-ask',
      label: 'Question formats',
      text: 'Which type of science activity do I enjoy most—multiple-choice, puzzles, drag-and-drop, matching, or image-based challenges?',
    },
  ],
};

export const QUICK_PROMPTS = {
  [INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD]: [
    ...ADAPTIVE_PROBES.support,
  ],
  [INTERVENTION_MODES.ENRICHMENT_AND_CHALLENGE]: [
    ...ADAPTIVE_PROBES.enrich,
    ...ADAPTIVE_PROBES.formats,
  ],
  [INTERVENTION_MODES.CONGRATULATE_AND_ADVANCE]: [
    ...ADAPTIVE_PROBES.celebrate,
    ...ADAPTIVE_PROBES.formats,
  ],
};

/** Flat default quick prompts (manual open). */
export const DEFAULT_QUICK_PROMPTS =
  QUICK_PROMPTS[INTERVENTION_MODES.SUPPORT_AND_SCAFFOLD];

export const AVATAR_MOODS = {
  neutral: 'neutral',
  empathetic: 'empathetic',
  encouraging: 'encouraging',
  proud: 'proud',
};

export function clickDensityLabel(clicksInWindow, windowMs, rageThreshold) {
  if (clicksInWindow >= rageThreshold) return 'High/Rage';
  const perSec = clicksInWindow / Math.max(0.5, windowMs / 1000);
  if (perSec >= 2.5) return 'High/Rage';
  if (perSec >= 1.2) return 'Medium';
  return 'Low/Calm';
}

export function formatPerformanceDelta(pctPoints) {
  if (pctPoints == null || Number.isNaN(pctPoints)) return '0%';
  const n = Math.round(pctPoints);
  if (n > 0) return `+${n}%`;
  if (n < 0) return `${n}%`;
  return '0%';
}

export function trendFromDelta(pctPoints, accuracyPct) {
  if (pctPoints >= 5) return 'Improving';
  if (pctPoints <= -5) return 'Declining';
  if (accuracyPct >= 85) return 'Strong / Stable';
  if (accuracyPct < 50) return 'Needs support';
  return 'Stable';
}
