/**
 * Per-student pointer into the cleaning-yard challenges.
 * Science questions stay in DDA — this only remembers which mess is next.
 */
import { studentStorageKey } from './mockStudents.js';
import { CLEANING_CHALLENGE_COUNT } from './cleaningChallenges.js';

const BASE_KEY = 'scipath_cleaning_challenges';

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
    return { index: Math.floor(index) % CLEANING_CHALLENGE_COUNT };
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

export function getCleaningChallengeIndex() {
  return readAll().index;
}

export function setCleaningChallengeIndex(index) {
  const next =
    ((Number(index) || 0) % CLEANING_CHALLENGE_COUNT +
      CLEANING_CHALLENGE_COUNT) %
    CLEANING_CHALLENGE_COUNT;
  writeAll({ index: next });
  return next;
}

export function advanceCleaningChallengeIndex() {
  return setCleaningChallengeIndex(getCleaningChallengeIndex() + 1);
}
