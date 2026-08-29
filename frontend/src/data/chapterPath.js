/**
 * Learning Path Engine ↔ farm level bridge.
 * Chapter N maps to farm level N. After a chapter game the student returns
 * to SCI-PATH `/learning-path` instead of auto-starting the next farm level.
 */

import { markUnlocked, getOwnedUnlockIds, getUnlockItem, getUnlockMeta } from './unlockShop.js';
import { saveFarmProgress } from './farmProgress.js';

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

export function getScipathAppUrl() {
  return envUrl('VITE_SCIPATH_APP_URL', DEFAULT_SCIPATH_APP);
}

export function farmLevelFromLessonId(lessonId) {
  const match = String(lessonId || '')
    .trim()
    .match(/^g\d+_sci_(\d+)$/i);
  if (match) return Math.max(1, Number(match[1]) || 1);
  return null;
}

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
    const raw = sessionStorage.getItem(LAUNCH_STORAGE_KEY);
    if (!raw) return emptyLaunch();
    const data = JSON.parse(raw);
    return { ...emptyLaunch(), ...(data && typeof data === 'object' ? data : {}) };
  } catch {
    return emptyLaunch();
  }
}

export function persistChapterLaunch(patch = {}) {
  const next = { ...readStoredLaunch(), ...patch };
  try {
    sessionStorage.setItem(LAUNCH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function getChapterLaunch() {
  return readStoredLaunch();
}

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
  const startRaw = search.get('startLevel') || search.get('level');
  const startLevel =
    startRaw != null && startRaw !== '' && Number.isFinite(Number(startRaw))
      ? Math.max(1, Number(startRaw))
      : farmLevelFromLessonId(lessonId);
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

export function applyChapterLaunch(search) {
  const parsed = readChapterLaunchFromSearch(search);
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

export function ownedUnlockLabels() {
  return getOwnedUnlockIds()
    .map((id) => getUnlockItem(id)?.name || id)
    .filter(Boolean);
}

export function newlyUnlockedLabels(levelId) {
  const level = Math.max(1, Number(levelId) || 1);
  return getOwnedUnlockIds()
    .filter((id) => Number(getUnlockMeta(id)?.purchasedAtLevel) === level)
    .map((id) => getUnlockItem(id)?.name || id)
    .filter(Boolean);
}

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
  const labels = Array.isArray(unlockedLabels) ? unlockedLabels : newlyUnlockedLabels(levelId);
  if (labels.length) url.searchParams.set('unlocked', labels.join(','));
  return url.toString();
}

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

export function returnToLearningPath(opts = {}) {
  const href = buildLearningPathReturnUrl(opts);
  if (typeof window !== 'undefined') {
    window.location.assign(href);
  }
  return href;
}

/** Keep the farm cursor on the completed chapter level until LPE launches the next. */
export function parkFarmProgressAtCompletedLevel(levelId, cash) {
  const completed = Math.max(1, Number(levelId) || 1);
  return saveFarmProgress({
    currentLevelId: completed,
    highestCompletedLevel: completed,
    cash,
  });
}

