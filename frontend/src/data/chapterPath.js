/**
 * Learning Path Engine ↔ farm level bridge.
 * Chapter N maps to farm level N. After a chapter game the student returns
 * to SCI-PATH `/learning-path` instead of auto-starting the next farm level.
 */

import { markUnlocked, getOwnedUnlockIds, getUnlockItem, getUnlockMeta } from './unlockShop.js';
import { loadFarmProgress, saveFarmProgress } from './farmProgress.js';

const LAUNCH_STORAGE_KEY = 'scipath_chapter_launch';
const DEFAULT_SCIPATH_APP = 'http://127.0.0.1:3000';

export const CHAPTER_REWARD_ITEMS = [
  'sheep',
  'well',
  'tree_large',
  'tent',
  'cart',
  'windmill',
  'lamb',
  'bushes_large',
  'campfire',
  'chest',
  'rooster',
  'tree_medium',
  'barrel',
  'supplies',
  'piglet',
  'turkey',
  'bull',
];

function envUrl(key, fallback) {
  try {
    const raw = String(import.meta.env?.[key] || '').trim();
    if (raw) return raw.replace(/\/+$/, '');
  } catch {
    /* use fallback */
  }
  try {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      // A local farm dev server still returns the student to the local SCI-PATH app.
      if (host === 'localhost' || host === '127.0.0.1') {
        if (fallback.includes(':3000')) {
          return `${window.location.protocol}//${host}:3000`;
        }
      }
    }
  } catch {
    /* use fallback */
  }
  return String(fallback || '').replace(/\/+$/, '');
}

/** SCI-PATH origin. Localhost farm play talks to the app on port 3000. */
export function getScipathAppUrl() {
  return envUrl('VITE_SCIPATH_APP_URL', DEFAULT_SCIPATH_APP);
}

/** Lesson index from ids such as g7_sci_14. Not a farm level. */
export function lessonIndexFromLessonId(lessonId) {
  const match = String(lessonId || '')
    .trim()
    .match(/^g\d+_sci_(\d+)$/i);
  if (match) return Math.max(1, Number(match[1]) || 1);
  return null;
}

/**
 * The farm loop always starts at relative Level 1 for the active lesson.
 * Lesson 14 must not become Level 14.
 */
export function farmLevelFromLessonId(lessonId) {
  return lessonIndexFromLessonId(lessonId) ? 1 : null;
}

/**
 * Relative farm level for display. A value that is just the lesson ordinal
 * (Lesson 14 stored as Level 14) is Level 1 until the database says otherwise.
 */
export function displayFarmLevel(levelNumber, lessonId = '') {
  const level = Math.max(1, Number(levelNumber) || 1);
  const lessonIndex = lessonIndexFromLessonId(lessonId);
  if (lessonIndex && level === lessonIndex) return 1;
  return level;
}

/** Drop a cursor that was saved as "lesson 14 means level 13 complete". */
export function chapterFarmCursor(prev = {}, startLevel = 1, lessonId = '') {
  const currentLevelId = displayFarmLevel(startLevel, lessonId);
  const lessonIndex = lessonIndexFromLessonId(lessonId);
  const prevCurrent = Math.max(1, Number(prev?.currentLevelId) || 1);
  const prevHighest = Math.max(0, Number(prev?.highestCompletedLevel) || 0);
  const inflated =
    lessonIndex != null &&
    (prevCurrent === lessonIndex ||
      prevHighest === lessonIndex - 1 ||
      prevHighest >= lessonIndex);
  return {
    currentLevelId,
    highestCompletedLevel: inflated
      ? Math.max(0, currentLevelId - 1)
      : Math.max(prevHighest, currentLevelId - 1),
  };
}

/** Unlock granted for finishing this farm level. The list repeats after the last item. */
export function chapterRewardItemId(levelId) {
  const i = Math.max(0, Math.floor(Number(levelId) || 1) - 1);
  return CHAPTER_REWARD_ITEMS[i % CHAPTER_REWARD_ITEMS.length];
}

function emptyLaunch() {
  return {
    lessonId: '',
    chapterTitle: '',
    nextLessonId: '',
    nextChapterTitle: '',
    rewardItem: '',
    startLevel: null,
    returnUrl: '',
    fromLearningPath: false,
  };
}

function readStoredLaunch() {
  try {
    const sessionRaw = sessionStorage.getItem(LAUNCH_STORAGE_KEY);
    if (sessionRaw) {
      const data = JSON.parse(sessionRaw);
      return {
        ...emptyLaunch(),
        ...(data && typeof data === 'object' ? data : {}),
      };
    }
    // Survive refresh / new tab: mirror lives in localStorage
    const localRaw = localStorage.getItem(LAUNCH_STORAGE_KEY);
    if (localRaw) {
      const data = JSON.parse(localRaw);
      const launch = {
        ...emptyLaunch(),
        ...(data && typeof data === 'object' ? data : {}),
      };
      try {
        sessionStorage.setItem(LAUNCH_STORAGE_KEY, localRaw);
      } catch {
        /* ignore */
      }
      return launch;
    }
  } catch {
    /* ignore */
  }
  return emptyLaunch();
}

/** Remember the chapter handoff in both session and local storage. */
export function persistChapterLaunch(patch = {}) {
  const next = { ...readStoredLaunch(), ...patch };
  const raw = JSON.stringify(next);
  try {
    sessionStorage.setItem(LAUNCH_STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(LAUNCH_STORAGE_KEY, raw);
  } catch {
    /* ignore */
  }
  return next;
}

/** Chapter, next lesson, and reward from the last SCI-PATH launch. */
export function getChapterLaunch() {
  return readStoredLaunch();
}

/** True when this farm session was opened from a learning-path lesson. */
export function isLearningPathLinked() {
  const launch = readStoredLaunch();
  return Boolean(launch.fromLearningPath && launch.lessonId);
}

/**
 * Extra chapter fields from the SCI-PATH launch URL (called from platformLaunch).
 */
export function readChapterLaunchFromSearch(search) {
  if (!search) return emptyLaunch();
  const lessonId = String(
    search.get('lessonId') || search.get('chapterId') || '',
  ).trim();
  const lessonIndex = lessonIndexFromLessonId(lessonId);
  const startRaw = search.get('startLevel') || search.get('level');
  const requested =
    startRaw != null && startRaw !== '' && Number.isFinite(Number(startRaw))
      ? Math.max(1, Number(startRaw))
      : null;
  // A launch that copies the lesson number into startLevel is still Level 1.
  const startLevel =
    requested != null && !(lessonIndex && requested === lessonIndex)
      ? requested
      : 1;
  const rewardItem = String(
    search.get('rewardItem') || search.get('unlockItem') || '',
  ).trim();
  const source = String(search.get('source') || '').trim().toLowerCase();
  const fromLearningPath =
    Boolean(lessonId) ||
    source === 'frontend-app' ||
    source === 'sci-path' ||
    source === 'learning-path';

  return {
    lessonId,
    chapterTitle: String(search.get('chapterTitle') || '').trim(),
    nextLessonId: String(search.get('nextLessonId') || '').trim(),
    nextChapterTitle: String(
      search.get('nextTitle') || search.get('nextChapterTitle') || '',
    ).trim(),
    rewardItem: rewardItem || (startLevel ? chapterRewardItemId(startLevel) : ''),
    startLevel,
    returnUrl: String(search.get('returnUrl') || '').trim(),
    fromLearningPath,
  };
}

/** Save a learning-path URL. A plain farm open keeps the previous launch. */
export function applyChapterLaunch(search) {
  const parsed = readChapterLaunchFromSearch(search);
  // No lesson on the URL — do not wipe a launch that is already stored.
  if (!parsed.fromLearningPath && !parsed.lessonId) return readStoredLaunch();
  return persistChapterLaunch(parsed);
}

/**
 * Grant the chapter's Learning Path reward so it appears in this farm level.
 */
export function grantLearningPathReward(levelId, itemId) {
  const id = String(itemId || chapterRewardItemId(levelId) || '').trim();
  if (!id) return null;
  const level = Math.max(1, Number(levelId) || 1);
  markUnlocked(id, {
    purchasedAtLevel: level,
    availableAtLevel: level,
    source: 'learning_path',
  });
  return id;
}

/** Names of unlocks this student already owns, for the return-to-path banner. */
export function ownedUnlockLabels() {
  return getOwnedUnlockIds()
    .map((id) => getUnlockItem(id)?.name || id)
    .filter(Boolean);
}

/** Unlocks bought or granted on this farm level. */
export function newlyUnlockedLabels(levelId) {
  const level = Math.max(1, Number(levelId) || 1);
  return getOwnedUnlockIds()
    .filter((id) => Number(getUnlockMeta(id)?.purchasedAtLevel) === level)
    .map((id) => getUnlockItem(id)?.name || id)
    .filter(Boolean);
}

/**
 * URL back to SCI-PATH after the farm level.
 * A retry omits the next lesson. Frustration score and mastery ride along as query params.
 */
export function buildLearningPathReturnUrl({
  lessonId,
  levelId,
  chapterTitle,
  nextLessonId,
  nextChapterTitle,
  unlockedLabels,
  retryLesson = false,
  frustrationScore = null,
  frustrationLevel = '',
  mastery = null,
} = {}) {
  const launch = readStoredLaunch();
  const app = getScipathAppUrl();
  let url;
  try {
    url = new URL(launch.returnUrl || `${app}/learning-path`);
  } catch {
    url = new URL(`${app}/learning-path`);
  }
  url.searchParams.set('fromGame', '1');
  const lid = lessonId || launch.lessonId;
  if (lid) url.searchParams.set('lessonId', lid);
  url.searchParams.set('level', String(Math.max(1, Number(levelId) || 1)));
  const title = chapterTitle || launch.chapterTitle;
  if (title) url.searchParams.set('chapterTitle', title);
  const retry = Boolean(retryLesson);
  // High frustration or low mastery: ask SCI-PATH to repeat this lesson.
  if (retry) {
    url.searchParams.set('retryLesson', '1');
  } else {
    const nextId = nextLessonId || launch.nextLessonId;
    if (nextId) url.searchParams.set('nextLessonId', nextId);
    const nextTitle = nextChapterTitle || launch.nextChapterTitle;
    if (nextTitle) url.searchParams.set('nextTitle', nextTitle);
  }
  if (Number.isFinite(Number(frustrationScore))) {
    url.searchParams.set(
      'frustrationScore',
      String(Math.round(Number(frustrationScore))),
    );
  }
  if (frustrationLevel) {
    url.searchParams.set('frustrationLevel', String(frustrationLevel));
  }
  const masteryValue = Number(mastery);
  if (Number.isFinite(masteryValue)) {
    url.searchParams.set('mastery', String(Math.round(masteryValue * 1000) / 1000));
  }
  const labels = Array.isArray(unlockedLabels) ? unlockedLabels : newlyUnlockedLabels(levelId);
  if (labels.length) url.searchParams.set('unlocked', labels.join(','));
  return url.toString();
}

function scipathOrigin() {
  const app = getScipathAppUrl();
  let origin = app;
  try {
    const launch = readStoredLaunch();
    if (launch.returnUrl) {
      origin = new URL(launch.returnUrl).origin;
    }
  } catch {
    /* keep default */
  }
  return String(origin).replace(/\/+$/, '');
}

/** SCI-PATH logout route. It revokes the login token. */
export function getScipathLogoutUrl() {
  return `${scipathOrigin()}/logout`;
}

/** Signed-in student home. Does not touch the login token. */
export function getAuthenticatedHomeUrl() {
  return `${scipathOrigin()}/dashboard`;
}

/**
 * SCI-PATH /logout revokes the login token, then sends the browser to `/`.
 * The farm save must finish before this navigation.
 */
export function openScipathLogout() {
  const href = getScipathLogoutUrl();
  if (typeof window !== 'undefined') {
    window.location.assign(href);
  }
  return href;
}

/** Leave the farm for the signed-in home. The SCI-PATH login stays active. */
export function openAuthenticatedHome() {
  const href = getAuthenticatedHomeUrl();
  if (typeof window !== 'undefined') {
    window.location.assign(href);
  }
  return href;
}

/** Open the learning-path list, preferring the origin that launched this farm. */
export function openLearningPathHome() {
  const launch = readStoredLaunch();
  const app = getScipathAppUrl();
  let href = `${app}/learning-path`;
  try {
    if (launch.returnUrl) {
      const url = new URL(launch.returnUrl);
      href = `${url.origin}/learning-path`;
    }
  } catch {
    /* keep default */
  }
  if (typeof window !== 'undefined') {
    window.location.assign(href);
  }
  return href;
}

/** Leave the farm for the chapter return URL, including frustration and unlocks. */
export function returnToLearningPath(opts = {}) {
  const href = buildLearningPathReturnUrl(opts);
  if (typeof window !== 'undefined') {
    window.location.assign(href);
  }
  return href;
}

/**
 * Park farm cursor when leaving for the learning path.
 * Pass → advance to the next farm level so the next lesson does not reopen Level 1.
 * Retry (high frustration / low mastery) → stay on this farm level.
 */
export function parkFarmProgressAtCompletedLevel(
  levelId,
  cash,
  { retryLesson = false } = {},
) {
  const completed = Math.max(1, Number(levelId) || 1);
  const prev = loadFarmProgress();
  if (retryLesson) {
    return saveFarmProgress({
      currentLevelId: completed,
      highestCompletedLevel: Math.max(
        0,
        Math.min(Number(prev.highestCompletedLevel) || 0, completed - 1),
      ),
      cash,
      levelSource: 'lesson',
    });
  }
  return saveFarmProgress({
    currentLevelId: completed + 1,
    highestCompletedLevel: Math.max(
      completed,
      Number(prev.highestCompletedLevel) || 0,
    ),
    cash,
    levelSource: 'lesson',
  });
}

