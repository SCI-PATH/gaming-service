/**
 * Shop unlock items are decorative ownership only — no per-item quests.
 * Plant / harvest / load / animal / clean science quizzes still gate farm work.
 */
export function buildActiveChallenges(_currentLevelId = 1) {
  return [];
}
export function getNextChallengeStep(challenge) {
  if (!challenge || challenge.done) return null;
  const idx = challenge.stepIndex || 0;
  return challenge.steps?.[idx] || null;
}
