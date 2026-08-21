/**
 * Sequential animal challenges on one fenced paddock.
 * Same loop as plant beds: tend quiz → collect N produce → sell at the shop.
 * Science questions stay in the existing DDA layer.
 */
import { DDA_BANDS } from './dda.js';
import { bandFromMastery } from './masteryModel.js';

/** One paddock, south of spawn, clear of gold beds and the load dock. */
export const ANIMAL_PADDOCK = {
  id: 'animal_pen',
  label: 'Animal Pen',
  x: 39,
  y: 43,
  w: 16,
  h: 9,
};

const ANIMAL_TYPES = [
  {
    id: 'cow',
    name: 'cows',
    action: 'feed',
    produceName: 'milk',
    animalKeys: ['kf_cow', 'lib_creature_cow', 'hm_cow'],
    produceKey: 'kf_milk',
    count: 7,
  },
  {
    id: 'chicken',
    name: 'chickens',
    action: 'feed',
    produceName: 'eggs',
    animalKeys: ['kf_chicken', 'lib_creature_chicken', 'hm_chicken'],
    produceKey: 'kf_egg',
    count: 8,
  },
  {
    id: 'sheep',
    name: 'sheep',
    action: 'shear',
    produceName: 'wool',
    animalKeys: ['kf_sheep', 'unlock_sheep', 'lib_creature_goat'],
    produceKey: 'kf_sack',
    count: 6,
  },
  {
    id: 'goat',
    name: 'goats',
    action: 'feed',
    produceName: 'goat milk',
    animalKeys: ['lib_creature_goat', 'kf_sheep', 'unlock_sheep'],
    produceKey: 'kf_milk',
    count: 6,
  },
  {
    id: 'pig',
    name: 'pigs',
    action: 'feed',
    produceName: 'grain',
    animalKeys: ['lib_creature_pig', 'unlock_piglet', 'kf_cow'],
    produceKey: 'kf_feed',
    count: 6,
  },
  {
    id: 'duck',
    name: 'ducks',
    action: 'feed',
    produceName: 'eggs',
    animalKeys: ['lib_creature_duck', 'kf_chicken', 'hm_chicken2'],
    produceKey: 'kf_egg',
    count: 7,
  },
  {
    id: 'horse',
    name: 'horses',
    action: 'feed',
    produceName: 'hay',
    animalKeys: ['lib_creature_horse', 'kf_cow', 'hm_cow'],
    produceKey: 'kf_hay',
    count: 5,
  },
  {
    id: 'chick',
    name: 'chicks',
    action: 'feed',
    produceName: 'eggs',
    animalKeys: ['lib_creature_chick', 'kf_chicken', 'hm_chicken'],
    produceKey: 'kf_egg',
    count: 9,
  },
  {
    id: 'calf',
    name: 'calves',
    action: 'feed',
    produceName: 'milk',
    animalKeys: ['lib_creature_cow', 'kf_cow', 'hm_cow'],
    produceKey: 'kf_milk',
    count: 5,
  },
  {
    id: 'rabbit',
    name: 'rabbits',
    action: 'feed',
    produceName: 'wool',
    animalKeys: ['lib_creature_rabbit', 'kf_sheep', 'kf_chicken'],
    produceKey: 'kf_pouch',
    count: 8,
  },
];

const ROUND_COUNTS = [4, 5, 6, 7, 8];

export const ANIMAL_CHALLENGES = ROUND_COUNTS.flatMap((collectCount, round) =>
  ANIMAL_TYPES.map((kind, i) => {
    const n = round * ANIMAL_TYPES.length + i + 1;
    return {
      id: `anm_${String(n).padStart(3, '0')}`,
      index: n - 1,
      animalId: kind.id,
      animalName: kind.name,
      action: kind.action,
      produceName: kind.produceName,
      animalKeys: kind.animalKeys,
      produceKey: kind.produceKey,
      herdSize: kind.count,
      collectCount,
    };
  }),
);

export const ANIMAL_CHALLENGE_COUNT = ANIMAL_CHALLENGES.length;

export function getAnimalChallenge(index = 0) {
  const i =
    ((Number(index) || 0) % ANIMAL_CHALLENGE_COUNT + ANIMAL_CHALLENGE_COUNT) %
    ANIMAL_CHALLENGE_COUNT;
  return ANIMAL_CHALLENGES[i];
}

export function animalCollectTarget(challenge, mastery) {
  const base = Math.max(3, Number(challenge?.collectCount) || 4);
  const band = bandFromMastery(mastery);
  if (band === DDA_BANDS.STRONG) return base + 2;
  if (band === DDA_BANDS.EMERGING) return base;
  return base + 1;
}

export function animalGoalText(challenge, collectTarget) {
  const animals = challenge?.animalName || 'animals';
  const produce = challenge?.produceName || 'produce';
  const n = Math.max(1, Number(collectTarget) || challenge?.collectCount || 4);
  const verb = challenge?.action === 'shear' ? 'Shear' : 'Feed';
  return `${verb} the ${animals} · collect ${n} ${produce} · sell at the shop`;
}

export function isInsideAnimalPaddock(gridX, gridY, pad = ANIMAL_PADDOCK) {
  return (
    gridX >= pad.x &&
    gridX < pad.x + pad.w &&
    gridY >= pad.y &&
    gridY < pad.y + pad.h
  );
}
