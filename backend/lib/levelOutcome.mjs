/**
 * End-of-level branch: high frustration or low mastery repeats the topic.
 * A healthy score unlocks the next level.
 */

export const FRUSTRATION_THRESHOLD = 61;
export const MASTERY_THRESHOLD = 0.65;

/** Level clock from the latest frustration score. Unknown score uses the middle band. */
export const LEVEL_DURATION_MS = Object.freeze({
  high: 22 * 60 * 1000,
  medium: 13 * 60 * 1000,
  low: 9 * 60 * 1000,
});

const CHAPTER_REWARD_ITEMS = Object.freeze([
  'sheep',
  'well',
  'tree_large',
  'tent',
  'cart',
  'windmill',
  'lamb',
  'bushes_large',
  'campfire',
  'chest',
  'rooster',
  'tree_medium',
  'barrel',
  'supplies',
  'piglet',
  'turkey',
  'bull',
]);

export function levelDurationMsFromFrustration(score) {
  if (score == null || score === '') return LEVEL_DURATION_MS.medium;
  const raw = Number(score);
  if (!Number.isFinite(raw)) return LEVEL_DURATION_MS.medium;
  const s = Math.max(0, Math.min(100, raw));
  if (s >= FRUSTRATION_THRESHOLD) return LEVEL_DURATION_MS.high;
  if (s > 30) return LEVEL_DURATION_MS.medium;
  return LEVEL_DURATION_MS.low;
}

/** Catalog item granted when the next chapter opens. */
export function chapterRewardItemId(chapterOrdinal) {
  const i = Math.max(0, Math.floor(Number(chapterOrdinal) || 1) - 1);
  return CHAPTER_REWARD_ITEMS[i % CHAPTER_REWARD_ITEMS.length];
}

export const LEVEL_OUTCOME = Object.freeze({
  REMEDIATION_REQUIRED: 'REMEDIATION_REQUIRED',
  LEVEL_PASSED: 'LEVEL_PASSED',
});

export function masteryPercentage(correct, incorrect) {
  const right = Math.max(0, Number(correct) || 0);
  const wrong = Math.max(0, Number(incorrect) || 0);
  const total = right + wrong;
  if (total <= 0) return 0;
  return right / total;
}

export function frustrationLevelFromScore(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  if (s <= 30) return 'low';
  if (s <= 60) return 'moderate';
  if (s <= 80) return 'high';
  return 'very_high';
}

/**
 * Average of this attempt when present, otherwise the latest snapshot.
 */
export function frustrationScoreFromSnapshots(rows = [], fallback = 0) {
  const scores = (rows || [])
    .map((row) => Number(row?.frustration_score ?? row?.frustrationScore))
    .filter((n) => Number.isFinite(n));
  if (scores.length > 0) {
    const avg = scores.reduce((sum, n) => sum + n, 0) / scores.length;
    return Math.max(0, Math.min(100, avg));
  }
  const fallbackScore = Number(fallback);
  return Number.isFinite(fallbackScore)
    ? Math.max(0, Math.min(100, fallbackScore))
    : 0;
}

export function decideLevelOutcome({
  frustrationScore = 0,
  correct = 0,
  incorrect = 0,
} = {}) {
  const score = Math.max(0, Math.min(100, Number(frustrationScore) || 0));
  const mastery = masteryPercentage(correct, incorrect);
  const highFrustration = score >= FRUSTRATION_THRESHOLD;
  const lowMastery = mastery < MASTERY_THRESHOLD;
  const remediate = highFrustration || lowMastery;
  let reason = 'ready_for_next_level';
  if (highFrustration && lowMastery) reason = 'high_frustration_and_low_mastery';
  else if (highFrustration) reason = 'high_frustration';
  else if (lowMastery) reason = 'low_mastery';
  return {
    outcome: remediate
      ? LEVEL_OUTCOME.REMEDIATION_REQUIRED
      : LEVEL_OUTCOME.LEVEL_PASSED,
    retryLesson: remediate,
    status: remediate ? 'remediation_required' : 'completed',
    reason,
    frustrationScore: Math.round(score * 100) / 100,
    frustrationLevel: frustrationLevelFromScore(score),
    masteryPercentage: Math.round(mastery * 1000) / 1000,
    frustrationThreshold: FRUSTRATION_THRESHOLD,
    masteryThreshold: MASTERY_THRESHOLD,
    quizCorrect: Math.max(0, Number(correct) || 0),
    quizIncorrect: Math.max(0, Number(incorrect) || 0),
  };
}

export function mentorReplyForOutcome(decision) {
  if (!decision?.retryLesson) {
    return 'You handled this topic with a steady pace. The next level is open.';
  }
  if (decision.reason === 'low_mastery') {
    return "Let's master this topic before moving on! A few ideas still need practice, so the next chapter stays locked. Review the explanation and mind map, then try this chapter again.";
  }
  return "Let's master this topic before moving on! This chapter still looks heavy, so the next one stays locked. Review the explanation and mind map, then try once more.";
}
