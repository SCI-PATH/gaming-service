/**
 * Map markers from the level challenge plan — the same crops, animals, and
 * cleaning jobs the farm actually runs.
 */

import { getLevelChallengePlan } from './challengeLibrary.js';
import { PLANT_PLOTS, FARM_SHOP_ZONE } from './plantPlots.js';
import { ANIMAL_PADDOCK } from './animalChallenges.js';
import { CLEANING_YARD } from './cleaningChallenges.js';
import { assembleMapMarkers } from './levelMapLabels.js';

export {
  animalMarkerLabel,
  bedLabelForCrop,
  cleaningMarkerLabel,
} from './levelMapLabels.js';

/**
 * @param {number} levelId
 * @param {{ activeCropIndex?: number, activeCropId?: string, activeCropName?: string }} [progress]
 */
export function buildLevelMapMarkers(levelId = 1, progress = {}) {
  const plan = getLevelChallengePlan(levelId);
  return assembleMapMarkers(
    plan,
    {
      plots: PLANT_PLOTS,
      animal: ANIMAL_PADDOCK,
      clean: CLEANING_YARD,
      shop: FARM_SHOP_ZONE,
    },
    progress,
  );
}
