/**
 * Crop-challenge progression — parallel free-choice model.
 *
 * All crops assigned to the level are AVAILABLE from the start.
 * The student can plant any bed in any order.  Each crop has its own
 * sold counter, and the whole level completes when every crop is sold.
 *
 * Flow per crop:
 *   AVAILABLE → IN_PROGRESS (quiz open) → ACTIVITY_COMPLETED (planted)
 *     → ITEM_DELIVERED (unloaded) → ITEM_SOLD (part sold)
 *     → COMPLETED (target sold)
 */
import { pickCountForChallenge } from './cropChallenges.js';

export const CROP_CHALLENGE_STATUS = Object.freeze({
  LOCKED: 'LOCKED',          // kept for legacy compat — not used in new flow
  AVAILABLE: 'AVAILABLE',
  IN_PROGRESS: 'IN_PROGRESS',
  ACTIVITY_COMPLETED: 'ACTIVITY_COMPLETED',
  ITEM_DELIVERED: 'ITEM_DELIVERED',
  ITEM_SOLD: 'ITEM_SOLD',
  COMPLETED: 'COMPLETED',
});

export const CROP_ACTIVITY_STEP = Object.freeze({
  PLANT: 'plant',
  HARVEST: 'harvest',
  SELL: 'sell',
});

/** Human-readable badge for the quest scroll. */
export function cropChallengeStatusLabel(status) {
  const labels = {
    [CROP_CHALLENGE_STATUS.LOCKED]: 'LOCKED',
    [CROP_CHALLENGE_STATUS.AVAILABLE]: 'AVAILABLE',
    [CROP_CHALLENGE_STATUS.IN_PROGRESS]: 'IN PROGRESS',
    [CROP_CHALLENGE_STATUS.ACTIVITY_COMPLETED]: 'PLANTED',
    [CROP_CHALLENGE_STATUS.ITEM_DELIVERED]: 'IN SHOP',
    [CROP_CHALLENGE_STATUS.ITEM_SOLD]: 'SELLING',
    [CROP_CHALLENGE_STATUS.COMPLETED]: 'COMPLETED',
  };
  return labels[status] || String(status || '');
}

export function cropChallengeStatusIcon(status) {
  if (status === CROP_CHALLENGE_STATUS.COMPLETED) return '✓';
  return '▶';
}

/**
 * Derive status for one crop slot given its own counters.
 * Every slot starts as AVAILABLE — no sequential locking.
 */
export function deriveCropChallengeStatus(cropId, runtime = {}) {
  const soldMap = runtime.cropSoldMap || {};
  const plantedSet = runtime.cropPlantedSet || new Set();
  const harvestMap = runtime.cropHarvestMap || {};
  const shopStockMap = runtime.shopStockMap || {};

  const harvestTarget = Math.max(1, Number(runtime.harvestTarget) || 1);
  const sold = Math.max(0, Number(soldMap[cropId]) || 0);
  const harvested = Math.max(0, Number(harvestMap[cropId]) || 0);
  const shopQty = Math.max(0, Number(shopStockMap[cropId]) || 0);
  const planted = Boolean(plantedSet.has ? plantedSet.has(cropId) : plantedSet[cropId]);
  const pendingQuizCropId = runtime.pendingQuizCropId || null;

  if (sold >= harvestTarget) return CROP_CHALLENGE_STATUS.COMPLETED;
  if (sold > 0) return CROP_CHALLENGE_STATUS.ITEM_SOLD;
  if (shopQty > 0) return CROP_CHALLENGE_STATUS.ITEM_DELIVERED;
  if (harvested > 0) return CROP_CHALLENGE_STATUS.ACTIVITY_COMPLETED;
  if (planted) return CROP_CHALLENGE_STATUS.ACTIVITY_COMPLETED;
  if (pendingQuizCropId === cropId) return CROP_CHALLENGE_STATUS.IN_PROGRESS;
  return CROP_CHALLENGE_STATUS.AVAILABLE;
}

/**
 * Build the full per-level crop challenge list for UI + gating.
 * All crops are simultaneously available.
 */
export function buildLevelCropChallengeList(
  levelPlan,
  _activeSlot = 0,   // kept for compat, ignored
  runtime = {},
  mastery = 0.5,
) {
  const crops = levelPlan?.crops || [];
  const soldMap = runtime.cropSoldMap || {};
  const plantedSet = runtime.cropPlantedSet || new Set();
  const harvestMap = runtime.cropHarvestMap || {};

  return crops.map((crop, slot) => {
    const harvestTarget = Math.max(
      1,
      Number(runtime.harvestTarget) || pickCountForChallenge(crop, mastery),
    );
    const cropId = crop.cropId;
    const sold = Math.max(0, Number(soldMap[cropId]) || 0);
    const harvested = Math.max(0, Number(harvestMap[cropId]) || 0);
    const planted = Boolean(plantedSet.has ? plantedSet.has(cropId) : plantedSet[cropId]);

    const status = deriveCropChallengeStatus(cropId, { ...runtime, harvestTarget });

    return {
      slot,
      id: crop.id,
      cropId,
      cropName: crop.cropName,
      harvestTarget,
      status,
      statusLabel: cropChallengeStatusLabel(status),
      statusIcon: cropChallengeStatusIcon(status),
      enabled: status !== CROP_CHALLENGE_STATUS.COMPLETED,
      locked: false,    // never locked in free-choice model
      available: true,  // always available
      planted,
      cropsHarvestedTotal: harvested,
      cropsSoldThisChallenge: sold,
      plantDone: planted,
      harvestDone: harvested >= harvestTarget,
      sellDone: sold >= harvestTarget,
    };
  });
}

/** Whether the student may plant a specific crop right now. */
export function canPlantCrop(cropId, runtime = {}) {
  const plantedSet = runtime.cropPlantedSet || new Set();
  return !(plantedSet.has ? plantedSet.has(cropId) : plantedSet[cropId]);
}

/** Whether the student may harvest a specific crop right now. */
export function canHarvestCrop(cropId, runtime = {}) {
  const plantedSet = runtime.cropPlantedSet || new Set();
  return Boolean(plantedSet.has ? plantedSet.has(cropId) : plantedSet[cropId]);
}

/** All level crops that have not yet hit their harvest target sold count. */
export function unsoldLevelCropIds(levelPlan, runtime = {}, mastery = 0.5) {
  const crops = levelPlan?.crops || [];
  const soldMap = runtime.cropSoldMap || {};
  return crops
    .map((c) => c.cropId)
    .filter((cropId) => {
      const crop = crops.find((c) => c.cropId === cropId);
      const target = Math.max(
        1,
        Number(runtime.harvestTarget) || pickCountForChallenge(crop, mastery),
      );
      return (soldMap[cropId] || 0) < target;
    });
}

/** Summarise shop stock for all crops combined. */
export function shopStockForCrop(worldShop, cropId) {
  if (!worldShop?.shopStock || !cropId) return 0;
  return Math.max(0, Number(worldShop.shopStock[cropId]) || 0);
}

// Legacy compat — kept so any remaining call-sites don't break
export function canPerformCropStep(_status, _step, _counters) {
  return true;
}
