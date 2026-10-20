/**
 * End-of-level → unlock shop decisions.
 * Keep shop opening rules testable and independent of React state.
 */

/**
 * True when the level-outcome response is enough to open the shop
 * (or retry-shop), including offline / skipped database modes.
 */
export function canOpenShopAfterOutcome(decision) {
  if (!decision || typeof decision !== 'object') return false;
  // Offline or skipped database still opens the shop from the local decision.
  if (decision.skipped === true || decision.offline === true) return true;
  if (decision.persisted === true) return true;
  if (decision.outcome) return true;
  if (typeof decision.retryLesson === 'boolean') return true;
  return false;
}

/**
 * Soft warning only — never used alone to skip the shop when a local
 * or offline progression decision is available.
 */
export function levelSaveNeedsWarning(decision, cashSaved) {
  // Hard fail only when the server rejected the save and left no local decision.
  const outcomeHardFail =
    decision?.persisted === false &&
    decision?.skipped !== true &&
    decision?.offline !== true &&
    !decision?.outcome &&
    typeof decision?.retryLesson !== 'boolean';
  const cashHardFail =
    cashSaved &&
    cashSaved.ok === false &&
    cashSaved.skipped !== true;
  return Boolean(outcomeHardFail || cashHardFail);
}

/**
 * Build the performance bag the unlock shop prices from.
 */
export function shopPerformanceFromLevelPayload(payload = {}, fallbacks = {}) {
  const frScore =
    payload.avgFrustrationScore ??
    payload.frustrationScore ??
    fallbacks.frustrationScore ??
    0;
  const frLevel =
    payload.frustrationLevel || fallbacks.frustrationLevel || 'low';
  return {
    attemptScores: payload.attemptScores ?? [],
    avgResponseMs: payload.avgResponseMs ?? 0,
    performanceScore: payload.performanceScore,
    performanceBand: payload.performanceBand,
    questionsAnswered: payload.questionsAnswered,
    questionFrustrationScores: payload.questionFrustrationScores ?? [],
    avgFrustrationScore:
      payload.avgFrustrationScore ??
      (Number.isFinite(Number(frScore)) ? Number(frScore) : null),
    frozenPrices: payload.frozenPrices ?? null,
    levelId: payload.levelId ?? fallbacks.levelId ?? 1,
    sessionId: payload.sessionId ?? null,
    frustrationScore: frScore,
    frustrationLevel: frLevel,
    retryLesson: fallbacks.retryLesson === true,
  };
}
