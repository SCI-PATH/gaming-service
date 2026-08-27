/**
 * Per-student farm cursor: next playable level + cash.
 * Mastery records still describe completed levels; this store is what the
 * lobby / Phaser scene resume from after a refresh.
 */

import { studentStorageKey } from './mockStudents.js';

const BASE_STORAGE_KEY = 'scipath_farm_progress';

function storageKey() {
  return studentStorageKey(BASE_STORAGE_KEY);
}

function emptyProgress() {
  return {
    currentLevelId: 1,
    highestCompletedLevel: 0,
    cash: 0,
    updatedAt: 0,
  };
}

export function loadFarmProgress() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptyProgress();
    const data = JSON.parse(raw);
    return {
      currentLevelId: Math.max(1, Number(data?.currentLevelId) || 1),
      highestCompletedLevel: Math.max(0, Number(data?.highestCompletedLevel) || 0),
      cash: Math.max(0, Number(data?.cash) || 0),
      updatedAt: Number(data?.updatedAt) || 0,
    };
  } catch {
    return emptyProgress();
  }
}

export function saveFarmProgress(patch = {}) {
  const prev = loadFarmProgress();
  const next = {
    currentLevelId: Math.max(
      1,
      Number(patch.currentLevelId ?? prev.currentLevelId) || 1,
    ),
    highestCompletedLevel: Math.max(
      0,
      Number(patch.highestCompletedLevel ?? prev.highestCompletedLevel) || 0,
    ),
    cash:
      patch.cash != null
        ? Math.max(0, Number(patch.cash) || 0)
        : prev.cash,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
  return next;
}

/** After a level is finished, resume on the next one. */
export function markLevelCompleted(levelId, extras = {}) {
  const completed = Math.max(1, Number(levelId) || 1);
  const prev = loadFarmProgress();
  return saveFarmProgress({
    currentLevelId: Math.max(completed + 1, prev.currentLevelId || 1),
    highestCompletedLevel: Math.max(completed, prev.highestCompletedLevel || 0),
    cash: extras.cash,
  });
}

export function hasSavedFarmProgress() {
  const progress = loadFarmProgress();
  return progress.highestCompletedLevel > 0 || progress.currentLevelId > 1;
}

/** Merge a launch/API cursor into local progress without going backwards. */
export function applyRemoteFarmProgress(remote = {}) {
  const local = loadFarmProgress();
  const currentLevelId = Math.max(
    local.currentLevelId,
    Math.max(1, Number(remote.currentLevel ?? remote.currentLevelId) || 1),
  );
  const highestCompletedLevel = Math.max(
    local.highestCompletedLevel,
    Math.max(0, Number(remote.highestCompletedLevel) || 0),
  );
  const cash = Math.max(
    local.cash,
    Math.max(0, Number(remote.cash) || 0),
  );
  if (
    currentLevelId === local.currentLevelId &&
    highestCompletedLevel === local.highestCompletedLevel &&
    cash === local.cash
  ) {
    return local;
  }
  return saveFarmProgress({ currentLevelId, highestCompletedLevel, cash });
}
