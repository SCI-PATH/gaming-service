/**
 * Per-student pointer into the animal paddock challenges.
 * Science questions stay in DDA — this only remembers which herd is next.
 */
import { studentStorageKey } from './mockStudents.js';
import { ANIMAL_CHALLENGE_COUNT } from './animalChallenges.js';

const BASE_KEY = 'scipath_animal_challenges';

function storageKey() {
  return studentStorageKey(BASE_KEY);
}

function emptyState() {
  return { index: 0 };
}

function readAll() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    const index = Number(data?.index);
    if (!Number.isFinite(index) || index < 0) return emptyState();
    // A stale save still lands on a real herd.
    return { index: Math.floor(index) % ANIMAL_CHALLENGE_COUNT };
  } catch {
    return emptyState();
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

/** Next paddock job for this student. */
export function getAnimalChallengeIndex() {
  return readAll().index;
}

/** Store a wrapped index so a bad value cannot walk off the herd list. */
export function setAnimalChallengeIndex(index) {
  const next =
    ((Number(index) || 0) % ANIMAL_CHALLENGE_COUNT + ANIMAL_CHALLENGE_COUNT) %
    ANIMAL_CHALLENGE_COUNT;
  writeAll({ index: next });
  return next;
}

/** Move to the next herd after this one is finished. */
export function advanceAnimalChallengeIndex() {
  return setAnimalChallengeIndex(getAnimalChallengeIndex() + 1);
}
