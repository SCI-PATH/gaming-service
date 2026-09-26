/**
 * Shared guard for every science-question opener.
 * The per-question countdown is separate: this is the level target clock.
 */
export function shouldBlockQuestionOpen({
  elapsedLevelTimeMs = 0,
  levelTargetCompletionMs = 0,
  questionOpen = false,
  levelCompleted = false,
  runEnded = false,
  quotaReached = false,
} = {}) {
  if (runEnded || levelCompleted || questionOpen || quotaReached) return true;
  const target = Number(levelTargetCompletionMs) || 0;
  const elapsed = Number(elapsedLevelTimeMs) || 0;
  if (target > 0 && elapsed >= target) return true;
  return false;
}
