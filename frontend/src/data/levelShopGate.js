/**
 * When the unlock shop may open after a level ends.
 * Question quota finished → shop opens even if farm challenges remain.
 * Next lesson vs retry is decided later from student performance.
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
 * Unlock shop opens as soon as the level run ends (quota / clock / misses).
 * Farm challenge completion is no longer required.
 * @param {'question_quota'|'time_expired'|'wrong_answers'|string} [_reason]
 * @param {boolean} [_farmReady] kept for callers; ignored
 */
export function shouldFinishLevelForShop(_reason, _farmReady) {
  return true;
}
