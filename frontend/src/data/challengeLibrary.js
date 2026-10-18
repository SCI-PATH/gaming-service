/**
 * Unified challenge library: all vegetable, animal, and cleaning jobs.
 * Each farm level is assigned a slice of this library so the 200 jobs
 * play as a multi-level game. Science questions stay in DDA (10 / level).
 *
 * When a student grade (6–9) is known, jobs come from the grade-specific
 * libraries in gradeChallengeLibraries.js so grades do not share content.
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
import { PLANT_PLOTS } from './plantPlots.js';
import {
  GRADE_LIBRARY_DEFS,
  getGradeChallengeLibrary,
  normalizeStudentGrade,
} from './gradeChallengeLibraries.js';

/**
 * One unique vegetable per gold plant bed (no repeated crops across beds).
 */
export const LIBRARY_CROPS_PER_LEVEL = Math.max(4, PLANT_PLOTS.length);
export const LIBRARY_ANIMALS_PER_LEVEL = 1;
export const LIBRARY_CLEANS_PER_LEVEL = 1;

export const LIBRARY_LEVEL_COUNT = Math.max(
  1,
  Math.floor(CROP_CHALLENGE_COUNT / LIBRARY_CROPS_PER_LEVEL),
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

function pickDistinctCrops(startIndex, count) {
  const picked = [];
  const seen = new Set();
  let i = Math.max(0, Number(startIndex) || 0);
  let guard = 0;
  while (picked.length < count && guard < CROP_CHALLENGE_COUNT * 2) {
    const crop = CROP_CHALLENGES[i % CROP_CHALLENGE_COUNT];
    i += 1;
    guard += 1;
    if (!crop) continue;
    if (seen.has(crop.cropId)) {
      const hasUnused = CROP_CHALLENGES.some((c) => !seen.has(c.cropId));
      if (hasUnused) continue;
      break;
    }
    seen.add(crop.cropId);
    picked.push(crop);
  }
  return picked;
}

function firstCropOfType(cropId) {
  return CROP_CHALLENGES.find((c) => c.cropId === cropId) || null;
}

function firstAnimalOfType(animalId) {
  return ANIMAL_CHALLENGES.find((a) => a.animalId === animalId) || null;
}

function firstCleanOfType(cleanId) {
  return CLEANING_CHALLENGES.find((c) => c.cleanId === cleanId) || null;
}

/**
 * Grade-scoped jobs for one farm level (exclusive crop/animal/clean sets).
 */
export function getGradeLevelChallengePlan(levelId = 1, grade = 6) {
  const g = normalizeStudentGrade(grade) ?? 6;
  const def = GRADE_LIBRARY_DEFS[g];
  const lib = getGradeChallengeLibrary(g);
  const level = Math.max(1, Number(levelId) || 1);
  const cropPool = def.cropIds.map((id) => firstCropOfType(id)).filter(Boolean);
  const animalPool = def.animalIds
    .map((id) => firstAnimalOfType(id))
    .filter(Boolean);
  const cleanPool = def.cleanIds.map((id) => firstCleanOfType(id)).filter(Boolean);

  const cropStart =
    ((level - 1) * LIBRARY_CROPS_PER_LEVEL) % Math.max(1, cropPool.length);
  const crops = [];
  for (let i = 0; i < LIBRARY_CROPS_PER_LEVEL; i += 1) {
    crops.push(cropPool[(cropStart + i) % cropPool.length]);
  }
  const animal = animalPool[(level - 1) % Math.max(1, animalPool.length)];
  const clean = cleanPool[(level - 1) % Math.max(1, cleanPool.length)];
  const science =
    lib.scienceChallenges[(level - 1) % Math.max(1, lib.scienceChallenges.length)];

  return {
    level,
    grade: g,
    libraryLabel: lib.label,
    band: lib.band,
    languageNote: lib.languageNote,
    levelCount: Math.max(
      8,
      Math.ceil(cropPool.length / LIBRARY_CROPS_PER_LEVEL) *
        Math.max(1, animalPool.length),
    ),
    cropIndexes: crops.map((c) => c.index),
    animalIndex: animal?.index ?? 0,
    cleanIndex: clean?.index ?? 0,
    crops,
    animal,
    clean,
    cropNames: crops.map((c) => c.cropName),
    animalName: animal?.animalName || 'animals',
    animalProduceName: animal?.produceName || 'produce',
    cleanMessName: clean?.messName || 'mess',
    cleanWasteName: clean?.wasteName || 'waste',
    primaryScienceChallenge: science || null,
    topicId: science?.topicId || null,
    learningObjective: science?.learningObjective || null,
    summary: [
      ...crops.map((c) => c.cropName),
      animal?.animalName,
      clean?.messName,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

/**
 * Jobs assigned to one farm level.
 * One distinct vegetable per plant bed + 1 animal + 1 cleaning job.
 * Pass grade (6–9) to use the exclusive grade challenge library.
 */
export function getLevelChallengePlan(levelId = 1, grade = null) {
  const normalizedGrade = normalizeStudentGrade(grade);
  if (normalizedGrade != null) {
    return getGradeLevelChallengePlan(levelId, normalizedGrade);
  }

  const level = Math.max(1, Number(levelId) || 1);
  const slot = librarySlotForLevel(level);
  const start = slot * LIBRARY_CROPS_PER_LEVEL;

  const crops = pickDistinctCrops(start, LIBRARY_CROPS_PER_LEVEL);
  const cropIndexes = crops.map((c) => c.index);

  const animalIndex = Math.min(slot, ANIMAL_CHALLENGE_COUNT - 1);
  const cleanIndex = Math.min(slot, CLEANING_CHALLENGE_COUNT - 1);

  const animal = ANIMAL_CHALLENGES[animalIndex] || ANIMAL_CHALLENGES[0];
  const clean = CLEANING_CHALLENGES[cleanIndex] || CLEANING_CHALLENGES[0];

  return {
    level,
    grade: null,
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
  return (
    Math.floor(Math.max(0, Number(index) || 0) / LIBRARY_CROPS_PER_LEVEL) + 1
  );
}

export function libraryLevelForTrackIndex(index = 0) {
  return (Math.max(0, Number(index) || 0) % LIBRARY_LEVEL_COUNT) + 1;
}
