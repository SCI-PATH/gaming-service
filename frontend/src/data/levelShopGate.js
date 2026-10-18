/**
 * When the unlock shop may open after a level ends.
 * Question quota alone is not enough if farm crop objectives remain.
 */

export function farmObjectivesReadyForShop({
  levelCrops = [],
  cropSoldMap = {},
  harvestTarget = 0,
  levelCropComplete = false,
} = {}) {
  if (levelCropComplete) return true;
  const crops = Array.isArray(levelCrops) ? levelCrops : [];
  if (crops.length === 0) return true;
  return crops.every((c) => {
    const target = Math.max(
      1,
      Number(harvestTarget) || Number(c?.harvestCount) || 4,
    );
    const sold = Number(cropSoldMap?.[c.cropId] || cropSoldMap?.[c.id] || 0);
    return sold >= target;
  });
}

/**
 * @param {'question_quota'|'time_expired'|'wrong_answers'|string} reason
 */
export function shouldFinishLevelForShop(reason, farmReady) {
  const why = String(reason || '');
  if (why === 'wrong_answers' || why === 'time_expired') return true;
  if (why === 'question_quota') return Boolean(farmReady);
  return Boolean(farmReady);
}
