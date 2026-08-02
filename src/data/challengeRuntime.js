/**
 * Build the list of active unlock challenges for the current farm level.
 */
import {
  getAvailableStagesForItem,
  getChallengeDef,
  levelsOwnedAt,
} from './unlockChallenges.js';
import {
  ensureUnlockMeta,
  getAllUnlockMeta,
  getChallengeProgress,
  getOwnedUnlockIds,
} from './unlockShop.js';

/**
 * @param {number} currentLevelId
 */
export function buildActiveChallenges(currentLevelId = 1) {
  const levelId = Math.max(1, Number(currentLevelId) || 1);
  // Older saves may lack purchasedAtLevel — treat as bought after level 1
  ensureUnlockMeta(Math.max(1, levelId - 1));

  const owned = getOwnedUnlockIds();
  const meta = getAllUnlockMeta();
  const active = [];

  for (const itemId of owned) {
    const itemMeta = meta[itemId] || {};
    // Bought after completing level P → challenges start on level P+1
    let purchasedAt = Number(itemMeta.purchasedAtLevel) || 0;
    if (purchasedAt < 1) purchasedAt = Math.max(1, levelId - 1);

    // Still on the purchase level (shop just closed not yet advanced) → no challenges yet
    if (levelId <= purchasedAt) continue;

    const stages = getAvailableStagesForItem(itemId, purchasedAt, levelId);
    const def = getChallengeDef(itemId);
    if (!def || !stages.length) continue;

    for (const stage of stages) {
      // Hen house egg challenge only if chicks were bought
      if (
        itemId === 'hen_house' &&
        stage.id === 'collect_eggs' &&
        !owned.includes('chick')
      ) {
        continue;
      }
      const progress = getChallengeProgress(itemId, stage.id);
      active.push({
        itemId,
        itemLabel: def.label,
        category: def.category,
        stageId: stage.id,
        title: stage.title,
        description: stage.description,
        steps: stage.steps,
        stepIndex: progress.done
          ? stage.steps.length
          : Math.min(progress.stepIndex || 0, stage.steps.length),
        done: Boolean(progress.done),
        rewardRp: stage.rewardRp || 0,
        rewardCash: stage.rewardCash || 0,
        mode: stage.mode || null,
        ownedLevels: levelsOwnedAt(purchasedAt, levelId),
        purchasedAtLevel: purchasedAt,
      });
    }
  }

  return active.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.itemLabel.localeCompare(b.itemLabel);
  });
}

export function getNextChallengeStep(challenge) {
  if (!challenge || challenge.done) return null;
  const idx = challenge.stepIndex || 0;
  return challenge.steps?.[idx] || null;
}
