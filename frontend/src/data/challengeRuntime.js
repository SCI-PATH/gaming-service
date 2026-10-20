/**
 * Shop unlock items are decorative ownership only — no per-item quests.
 * Plant / harvest / load / animal / clean science quizzes still gate farm work.
 */
/** Shop unlocks are decorations, so no per-item quest is active on any level. */
export function buildActiveChallenges(_currentLevelId = 1) {
  return [];
}
/** Next unfinished step, or null when the challenge is missing or already done. */
export function getNextChallengeStep(challenge) {
  if (!challenge || challenge.done) return null;
  const idx = challenge.stepIndex || 0;
  return challenge.steps?.[idx] || null;
}
