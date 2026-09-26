/** Same bands as the backend level clock. Unknown score uses the middle band. */
export const LEVEL_DURATION_MS = Object.freeze({
  high: 22 * 60 * 1000,
  medium: 13 * 60 * 1000,
  low: 9 * 60 * 1000,
});

const DURATION_KEY = 'scipath_level_target_ms';

export function levelDurationMsFromFrustration(score) {
  if (score == null || score === '') return LEVEL_DURATION_MS.medium;
  const raw = Number(score);
  if (!Number.isFinite(raw)) return LEVEL_DURATION_MS.medium;
  const s = Math.max(0, Math.min(100, raw));
  if (s >= 61) return LEVEL_DURATION_MS.high;
  if (s > 30) return LEVEL_DURATION_MS.medium;
  return LEVEL_DURATION_MS.low;
}

export function rememberLevelDuration(ms) {
  const n = Number(ms);
  if (!(n > 0)) return 0;
  try {
    sessionStorage.setItem(DURATION_KEY, String(Math.round(n)));
  } catch {
    /* private mode or non-browser */
  }
  return Math.round(n);
}

export function readLevelDuration() {
  try {
    const n = Number(sessionStorage.getItem(DURATION_KEY));
    return n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

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
