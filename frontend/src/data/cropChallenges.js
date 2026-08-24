/**
 * 100 sequential vegetable challenges on the gold plant beds.
 * Same loop as flowers/corn: plant quiz → pick N → load dock → sell at shop.
 * Science questions stay in the existing DDA layer.
 */
import { DDA_BANDS } from './dda.js';
import { bandFromMastery } from './masteryModel.js';

/**
 * Distinct produce the student is asked to grow.
 * Kenney Tiny Farm only has a handful of crop sprites, so several
 * vegetables share the closest plant/produce tile.
 */
const VEGETABLE_TYPES = [
  { id: 'tomato', name: 'tomatoes', sprout: 'kf_tomato_sprout', ready: 'kf_tomato_plant', produce: 'kf_tomato' },
  { id: 'carrot', name: 'carrots', sprout: 'kf_sprout', ready: 'kf_carrot_plant', produce: 'kf_carrot' },
  { id: 'potato', name: 'potatoes', sprout: 'kf_sprout', ready: 'kf_turnip_plant', produce: 'hm_potato' },
  { id: 'pumpkin', name: 'pumpkins', sprout: 'kf_sprout', ready: 'kf_cabbage_plant', produce: 'kf_cabbage', tint: 0xff8c3a },
  { id: 'onion', name: 'onions', sprout: 'kf_sprout', ready: 'kf_turnip_plant', produce: 'kf_turnip', tint: 0xf0d48a },
  { id: 'cabbage', name: 'cabbages', sprout: 'kf_sprout', ready: 'kf_cabbage_plant', produce: 'kf_cabbage' },
  { id: 'lettuce', name: 'lettuce', sprout: 'kf_sprout', ready: 'kf_cabbage_plant', produce: 'kf_cabbage', tint: 0x9be36a },
  { id: 'corn', name: 'corn', sprout: 'kf_corn_sprout', ready: 'kf_corn_plant', produce: 'kf_corn' },
  { id: 'bean', name: 'beans', sprout: 'kf_sprout_vine', ready: 'kf_wheat_plant', produce: 'kf_wheat' },
  { id: 'chilli', name: 'chillies', sprout: 'kf_tomato_sprout', ready: 'kf_tomato_plant', produce: 'kf_tomato', tint: 0xff5533 },
  { id: 'cucumber', name: 'cucumbers', sprout: 'kf_sprout_vine', ready: 'kf_wheat_plant', produce: 'kf_wheat', tint: 0x7dcc55 },
  { id: 'eggplant', name: 'eggplants', sprout: 'kf_sprout', ready: 'kf_turnip_plant', produce: 'kf_turnip', tint: 0x8a5ad8 },
  { id: 'spinach', name: 'spinach', sprout: 'kf_sprout', ready: 'kf_wheat_plant', produce: 'kf_wheat', tint: 0x3d8c3a },
  { id: 'radish', name: 'radishes', sprout: 'kf_sprout', ready: 'kf_turnip_plant', produce: 'kf_turnip', tint: 0xff7a9a },
  { id: 'beetroot', name: 'beetroots', sprout: 'kf_sprout', ready: 'kf_turnip_plant', produce: 'hm_turnip', tint: 0xc45c7a },
  { id: 'pea', name: 'peas', sprout: 'kf_sprout_vine', ready: 'kf_wheat_plant', produce: 'kf_wheat', tint: 0xb5e06a },
  { id: 'watermelon', name: 'watermelons', sprout: 'kf_sprout', ready: 'kf_cabbage_plant', produce: 'kf_cabbage', tint: 0x4caf6a },
  { id: 'strawberry', name: 'strawberries', sprout: 'kf_tomato_sprout', ready: 'kf_tomato_plant', produce: 'hm_berry', tint: 0xff6b8a },
  { id: 'sunflower', name: 'sunflowers', sprout: 'kf_sprout', ready: 'kf_sunflower', produce: 'kf_sunflower' },
  { id: 'rose', name: 'roses', sprout: 'kf_sprout', ready: 'hm_flower', produce: 'hm_flower', tint: 0xff5a7a },
  { id: 'daisy', name: 'daisies', sprout: 'kf_sprout', ready: 'hm_flower_fancy', produce: 'hm_flower_fancy' },
  { id: 'marigold', name: 'marigolds', sprout: 'kf_sprout', ready: 'kf_sunflower', produce: 'kf_sunflower', tint: 0xffb020 },
  { id: 'flower', name: 'flowers', sprout: 'crop_flower_sprout', ready: 'crop_flower', produce: 'crop_flower' },
  { id: 'wheat', name: 'wheat', sprout: 'kf_sprout', ready: 'kf_wheat_plant', produce: 'kf_wheat' },
  { id: 'turnip', name: 'turnips', sprout: 'kf_sprout', ready: 'kf_turnip_plant', produce: 'kf_turnip' },
];

/** Four rounds of the 25 crops = 100 challenges. Later rounds ask for more. */
const ROUND_COUNTS = [4, 5, 6, 7];

export const CROP_CHALLENGES = ROUND_COUNTS.flatMap((harvestCount, round) =>
  VEGETABLE_TYPES.map((veg, i) => {
    const n = round * VEGETABLE_TYPES.length + i + 1;
    return {
      id: `veg_${String(n).padStart(3, '0')}`,
      index: n - 1,
      cropId: veg.id,
      cropName: veg.name,
      harvestCount,
      sprout: veg.sprout,
      ready: veg.ready,
      produce: veg.produce,
    };
  }),
);

export const CROP_CHALLENGE_COUNT = CROP_CHALLENGES.length;

const TEXTURE_BY_ID = Object.fromEntries(
  VEGETABLE_TYPES.map((veg) => [
    veg.id,
    {
      sprout: veg.sprout,
      ready: veg.ready,
      produce: veg.produce,
      tint: veg.tint || null,
    },
  ]),
);

TEXTURE_BY_ID.flowers = {
  sprout: 'crop_flower_sprout',
  ready: 'crop_flower',
  produce: 'crop_flower',
};

export function getCropChallenge(index = 0) {
  const i = ((Number(index) || 0) % CROP_CHALLENGE_COUNT + CROP_CHALLENGE_COUNT)
    % CROP_CHALLENGE_COUNT;
  return CROP_CHALLENGES[i];
}

export function getCropTextures(cropId) {
  return TEXTURE_BY_ID[cropId] || TEXTURE_BY_ID.tomato;
}

export function vegById(cropId) {
  return VEGETABLE_TYPES.find((veg) => veg.id === cropId) || VEGETABLE_TYPES[0];
}

/** Gold beds that each grow a different vegetable. */
export const BED_PLOT_IDS = [
  'bed_west',
  'bed_east',
  'bed_north_west',
  'bed_north_east',
  'bed_mid_west',
  'bed_mid_east',
  'bed_south_west',
  'bed_south_east',
];

/** Distinct crops shown across the beds (current challenge + the rest). */
export const BED_VARIETY = [
  'tomato',
  'carrot',
  'potato',
  'corn',
  'cabbage',
  'pumpkin',
  'flower',
  'sunflower',
  'wheat',
  'lettuce',
  'turnip',
  'onion',
];

/**
 * Resolve a crop id for a specific plot bed.
 * When a levelPlan with multiple crops is available each bed is
 * assigned a different challenge crop (round-robin by plot index).
 * Passing just a single `challenge` object falls back to that crop.
 *
 * @param {string|number} plotId  – plot id or index
 * @param {object}  challenge     – single active crop challenge (fallback)
 * @param {object}  [levelPlan]   – from getLevelChallengePlan(); preferred
 * @param {number}  [plotIndex]   – numeric index of this bed (0-based)
 */
export function cropIdForPlot(plotId, challenge, levelPlan, plotIndex = 0) {
  const crops = levelPlan?.crops;
  if (crops?.length) {
    return crops[plotIndex % crops.length]?.cropId || 'tomato';
  }
  return challenge?.cropId || 'tomato';
}

export function cropDefForPlot(plotId, challenge, levelPlan, plotIndex = 0) {
  const veg = vegById(cropIdForPlot(plotId, challenge, levelPlan, plotIndex));
  return {
    cropId: veg.id,
    cropName: veg.name,
    sprout: veg.sprout,
    ready: veg.ready,
    produce: veg.produce,
    tint: veg.tint || null,
  };
}

/** How many to pick this challenge. Mastery still nudges the count. */
export function pickCountForChallenge(challenge, mastery) {
  const base = Math.max(3, Number(challenge?.harvestCount) || 4);
  const band = bandFromMastery(mastery);
  if (band === DDA_BANDS.STRONG) return base + 2;
  if (band === DDA_BANDS.EMERGING) return base;
  return base + 1;
}

export function vegetableGoalText(challenge, harvestTarget) {
  const name = challenge?.cropName || 'crops';
  const n = Math.max(1, Number(harvestTarget) || challenge?.harvestCount || 4);
  return `Plant ${name} at any gold bed · pick ${n} · sell at the farm shop`;
}
