/**
 * Unified challenge library: all vegetable, animal, and cleaning jobs.
 * Each farm level is assigned a slice of this library so the 200 jobs
 * play as a multi-level game. Science questions stay in DDA (15 / level).
 */
import { CROP_CHALLENGES, CROP_CHALLENGE_COUNT } from './cropChallenges.js';
import {
  ANIMAL_CHALLENGES,
  ANIMAL_CHALLENGE_COUNT,
} from './animalChallenges.js';
import {
  CLEANING_CHALLENGES,
  CLEANING_CHALLENGE_COUNT,
} from './cleaningChallenges.js';

export const LIBRARY_CROPS_PER_LEVEL = 2;
export const LIBRARY_ANIMALS_PER_LEVEL = 1;
export const LIBRARY_CLEANS_PER_LEVEL = 1;

export const LIBRARY_LEVEL_COUNT = Math.floor(
  CROP_CHALLENGE_COUNT / LIBRARY_CROPS_PER_LEVEL,
);

export const CHALLENGE_LIBRARY = [
  ...CROP_CHALLENGES.map((c) => ({
    kind: 'crop',
    libraryId: `lib_crop_${c.id}`,
    sourceIndex: c.index,
    id: c.id,
    title: c.cropName,
    detail: `Plant ${c.cropName} · pick ${c.harvestCount} · sell`,
  })),
  ...ANIMAL_CHALLENGES.map((c) => ({
    kind: 'animal',
    libraryId: `lib_animal_${c.id}`,
    sourceIndex: c.index,
    id: c.id,
    title: c.animalName,
    detail: `Tend ${c.animalName} · collect ${c.collectCount} ${c.produceName} · sell`,
  })),
  ...CLEANING_CHALLENGES.map((c) => ({
    kind: 'clean',
    libraryId: `lib_clean_${c.id}`,
    sourceIndex: c.index,
    id: c.id,
    title: c.messName,
    detail: `${c.verb} ${c.sweepCount} ${c.messName} · sell ${c.wasteName}`,
  })),
];

export function librarySlotForLevel(levelId = 1) {
  const level = Math.max(1, Number(levelId) || 1);
  return (level - 1) % LIBRARY_LEVEL_COUNT;
}

/**
 * Jobs assigned to one farm level.
 * Level N (1-based, wrapping after 50): 2 vegetables + 1 animal + 1 cleaning job.
 */
export function getLevelChallengePlan(levelId = 1) {
  const level = Math.max(1, Number(levelId) || 1);
  const slot = librarySlotForLevel(level);
  const cropIndexes = [
    slot * LIBRARY_CROPS_PER_LEVEL,
    slot * LIBRARY_CROPS_PER_LEVEL + 1,
  ].filter((i) => i < CROP_CHALLENGE_COUNT);

  const animalIndex = Math.min(slot, ANIMAL_CHALLENGE_COUNT - 1);
  const cleanIndex = Math.min(slot, CLEANING_CHALLENGE_COUNT - 1);

  const crops = cropIndexes.map((i) => CROP_CHALLENGES[i]).filter(Boolean);
  const animal = ANIMAL_CHALLENGES[animalIndex] || ANIMAL_CHALLENGES[0];
  const clean = CLEANING_CHALLENGES[cleanIndex] || CLEANING_CHALLENGES[0];

  return {
    level,
    librarySlot: slot,
    levelCount: LIBRARY_LEVEL_COUNT,
    cropIndexes,
    animalIndex,
    cleanIndex,
    crops,
    animal,
    clean,
    cropNames: crops.map((c) => c.cropName),
    animalName: animal?.animalName || 'animals',
    animalProduceName: animal?.produceName || 'produce',
    cleanMessName: clean?.messName || 'mess',
    cleanWasteName: clean?.wasteName || 'waste',
    summary: [
      ...crops.map((c) => c.cropName),
      animal?.animalName,
      clean?.messName,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

export function libraryLevelForCropIndex(index = 0) {
  return Math.floor(Math.max(0, Number(index) || 0) / LIBRARY_CROPS_PER_LEVEL) + 1;
}

export function libraryLevelForTrackIndex(index = 0) {
  return (Math.max(0, Number(index) || 0) % LIBRARY_LEVEL_COUNT) + 1;
}
