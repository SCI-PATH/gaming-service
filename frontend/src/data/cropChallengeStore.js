/**
 * Per-student pointer into the 100 vegetable challenges.
 * Science questions stay in DDA — this only remembers which crop is next.
 */
import { studentStorageKey } from './mockStudents.js';
import { CROP_CHALLENGE_COUNT } from './cropChallenges.js';

const BASE_KEY = 'scipath_crop_challenges';

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
    return { index: Math.floor(index) % CROP_CHALLENGE_COUNT };
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

export function getCropChallengeIndex() {
  return readAll().index;
}

export function setCropChallengeIndex(index) {
  const next =
    ((Number(index) || 0) % CROP_CHALLENGE_COUNT + CROP_CHALLENGE_COUNT) %
    CROP_CHALLENGE_COUNT;
  writeAll({ index: next });
  return next;
}

export function advanceCropChallengeIndex() {
  return setCropChallengeIndex(getCropChallengeIndex() + 1);
}
