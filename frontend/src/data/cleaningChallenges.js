/**
 * Sequential cleaning challenges on a farmyard plot.
 * Same loop as plant beds: start quiz → sweep N mess → sell compost at the shop.
 * Science questions stay in the existing DDA layer.
 */
import { DDA_BANDS } from './dda.js';
import { bandFromMastery } from './masteryModel.js';

/** West of the animal pen, north of the south-west bed, clear of gold beds and the load dock. */
export const CLEANING_YARD = {
  id: 'clean_yard',
  label: 'Cleaning Yard',
  x: 22,
  y: 44,
  w: 14,
  h: 8,
};

const CLEANING_TYPES = [
  {
    id: 'weed',
    name: 'weeds',
    verb: 'Pull',
    wasteName: 'weeds',
    messKeys: ['kf_weed', 'kf_sprout'],
    wasteKey: 'kf_weed',
  },
  {
    id: 'rock',
    name: 'rocks',
    verb: 'Clear',
    wasteName: 'stones',
    messKeys: ['kf_rock'],
    wasteKey: 'kf_rock',
  },
  {
    id: 'hay',
    name: 'loose hay',
    verb: 'Sweep',
    wasteName: 'hay',
    messKeys: ['kf_hay', 'kf_hay_stack'],
    wasteKey: 'kf_hay',
  },
  {
    id: 'trough',
    name: 'dirty troughs',
    verb: 'Scrub',
    wasteName: 'sludge',
    messKeys: ['kf_trough', 'kf_trough_hay'],
    wasteKey: 'kf_bucket',
  },
  {
    id: 'bucket',
    name: 'dirty buckets',
    verb: 'Wash',
    wasteName: 'dirty water',
    messKeys: ['kf_bucket_empty', 'kf_bucket'],
    wasteKey: 'kf_bucket_water',
  },
  {
    id: 'mushroom',
    name: 'mushrooms',
    verb: 'Clear',
    wasteName: 'mushrooms',
    messKeys: ['kf_mushroom'],
    wasteKey: 'kf_mushroom',
  },
  {
    id: 'feed',
    name: 'spilled feed',
    verb: 'Sweep',
    wasteName: 'feed',
    messKeys: ['kf_feed', 'kf_sack'],
    wasteKey: 'kf_feed',
  },
  {
    id: 'bush',
    name: 'overgrown bushes',
    verb: 'Trim',
    wasteName: 'clippings',
    messKeys: ['kf_bush', 'kf_bush_round'],
    wasteKey: 'kf_weed',
  },
  {
    id: 'mud',
    name: 'mud piles',
    verb: 'Scrape',
    wasteName: 'mud',
    messKeys: ['kf_soil', 'kf_rock'],
    wasteKey: 'kf_soil',
  },
  {
    id: 'crate',
    name: 'scattered crates',
    verb: 'Stack',
    wasteName: 'crates',
    messKeys: ['kf_crate', 'kf_barrel'],
    wasteKey: 'kf_crate',
  },
];

const ROUND_COUNTS = [4, 5, 6, 7, 8];

export const CLEANING_CHALLENGES = ROUND_COUNTS.flatMap((sweepCount, round) =>
  CLEANING_TYPES.map((kind, i) => {
    const n = round * CLEANING_TYPES.length + i + 1;
    return {
      id: `cln_${String(n).padStart(3, '0')}`,
      index: n - 1,
      cleanId: kind.id,
      messName: kind.name,
      verb: kind.verb,
      wasteName: kind.wasteName,
      messKeys: kind.messKeys,
      wasteKey: kind.wasteKey,
      sweepCount,
    };
  }),
);

export const CLEANING_CHALLENGE_COUNT = CLEANING_CHALLENGES.length;

export function getCleaningChallenge(index = 0) {
  const i =
    ((Number(index) || 0) % CLEANING_CHALLENGE_COUNT +
      CLEANING_CHALLENGE_COUNT) %
    CLEANING_CHALLENGE_COUNT;
  return CLEANING_CHALLENGES[i];
}

export function cleaningSweepTarget(challenge, mastery) {
  const base = Math.max(3, Number(challenge?.sweepCount) || 4);
  const band = bandFromMastery(mastery);
  if (band === DDA_BANDS.STRONG) return base + 2;
  if (band === DDA_BANDS.EMERGING) return base;
  return base + 1;
}

export function cleaningGoalText(challenge, sweepTarget) {
  const mess = challenge?.messName || 'mess';
  const waste = challenge?.wasteName || 'waste';
  const n = Math.max(1, Number(sweepTarget) || challenge?.sweepCount || 4);
  const verb = challenge?.verb || 'Clean';
  return `${verb} ${n} ${mess} in the yard · sell ${waste} as compost`;
}
