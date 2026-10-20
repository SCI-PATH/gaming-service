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
    levelSource: '',
  };
}

/** Resume cursor for this student. A corrupt save starts at level 1 with no cash. */
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
      levelSource: String(data?.levelSource || ''),
    };
  } catch {
    return emptyProgress();
  }
}

/** Merge a patch into the saved cursor. Omitted cash keeps the previous wallet. */
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
    levelSource:
      patch.levelSource != null ? String(patch.levelSource) : prev.levelSource || '',
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

/** True after any finished level, or once the cursor has left level 1. */
export function hasSavedFarmProgress() {
  const progress = loadFarmProgress();
  return progress.highestCompletedLevel > 0 || progress.currentLevelId > 1;
}

/** Merge a launch/API cursor into local progress without going backwards. */
export function applyRemoteFarmProgress(remote = {}) {
  const local = loadFarmProgress();
  // Engagement snapshot replaces the level cursor. Cash only moves up.
  if (remote.authoritative) {
    return saveFarmProgress({
      currentLevelId: Math.max(1, Number(remote.currentLevel ?? remote.currentLevelId) || 1),
      highestCompletedLevel: Math.max(0, Number(remote.highestCompletedLevel) || 0),
      cash:
        remote.cash != null
          ? Math.max(local.cash, Math.max(0, Number(remote.cash) || 0))
          : local.cash,
      levelSource: 'engagement',
    });
  }
  // A chapter or Neon cursor already won. Do not let an older remote walk it back.
  if (local.levelSource === 'engagement' || local.levelSource === 'lesson') {
    return local;
  }
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

function lessonOrdinal(lessonId) {
  const match = String(lessonId || '')
    .trim()
    .match(/^g\d+_sci_(\d+)$/i);
  return match ? Math.max(1, Number(match[1]) || 1) : null;
}

/**
 * Learning Path launch: never treat the lesson ordinal as the farm level.
 * Keep saved farm progression across chapters (Level 2 after finishing Level 1)
 * unless the cursor was inflated to the lesson number.
 */
export function applyChapterFarmLevel(levelId, cash = null, lessonId = '') {
  const prev = loadFarmProgress();
  const lessonIndex = lessonOrdinal(lessonId);
  const requested = Math.max(1, Number(levelId) || 1);
  const fromLessonOrdinal = Boolean(lessonIndex && requested === lessonIndex);
  const inflated =
    lessonIndex != null &&
    (prev.currentLevelId === lessonIndex ||
      prev.highestCompletedLevel === lessonIndex - 1 ||
      prev.highestCompletedLevel >= lessonIndex);

  let currentLevelId;
  if (inflated) {
    // The saved cursor was a lesson number, not a farm level.
    currentLevelId = 1;
  } else if (fromLessonOrdinal || requested === 1) {
    const saved = Math.max(1, Number(prev.currentLevelId) || 1);
    const highest = Math.max(0, Number(prev.highestCompletedLevel) || 0);
    // If parked on an already-completed level, open the next one.
    currentLevelId =
      highest > 0 && saved <= highest ? highest + 1 : saved;
  } else {
    currentLevelId = requested;
  }

  return saveFarmProgress({
    currentLevelId,
    highestCompletedLevel: inflated
      ? Math.max(0, currentLevelId - 1)
      : Math.max(0, prev.highestCompletedLevel, currentLevelId - 1),
    cash: cash != null ? cash : prev.cash,
    levelSource: 'lesson',
  });
}
