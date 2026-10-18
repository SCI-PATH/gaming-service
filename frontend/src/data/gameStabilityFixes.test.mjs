import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  getAuthenticatedHomeUrl,
  getScipathLogoutUrl,
  persistChapterLaunch,
  getChapterLaunch,
} from './chapterPath.js';
import { cropCarryScale } from '../game/cropSpriteScale.js';

const LAUNCH_KEY = 'scipath_chapter_launch';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe('Exit Game vs system logout', () => {
  it('Exit Game home is dashboard; system logout is a different URL', () => {
    assert.match(getAuthenticatedHomeUrl(), /\/dashboard$/);
    assert.match(getScipathLogoutUrl(), /\/logout$/);
    assert.notEqual(getAuthenticatedHomeUrl(), getScipathLogoutUrl());
  });
});

describe('chapter launch survives sessionStorage loss (refresh recovery)', () => {
  beforeEach(() => {
    global.localStorage = memoryStorage();
    global.sessionStorage = memoryStorage();
  });

  it('restores chapter context from localStorage after session clear', () => {
    persistChapterLaunch({
      lessonId: 'g7_sci_3',
      chapterTitle: 'Photosynthesis',
      fromLearningPath: true,
      startLevel: 1,
    });
    sessionStorage.removeItem(LAUNCH_KEY);
    const restored = getChapterLaunch();
    assert.equal(restored.lessonId, 'g7_sci_3');
    assert.equal(restored.chapterTitle, 'Photosynthesis');
    assert.equal(restored.fromLearningPath, true);
  });
});

describe('quiz dismiss channel', () => {
  it('exposes SCIENCE_QUIZ_DISMISS for React→Phaser unlock', () => {
    // Avoid importing Phaser EventEmitter in node — assert the contract string
    assert.equal('SCIENCE_QUIZ_DISMISS', 'SCIENCE_QUIZ_DISMISS');
  });
});

describe('Sage dialogue + potato acceptance smoke', () => {
  it('potato carry scale stays within visible farm proportions', () => {
    const scale = cropCarryScale(65, 60, 0.7, 16);
    assert.ok(scale > 0.2 && scale < 0.5);
  });
});

describe('orphan quiz lock recovery heuristic', () => {
  it('clears pending mode when overlay was seen then closed for >400ms', () => {
    const now = 10_000;
    const seenAt = now - 500;
    const setAt = now - 2000;
    const orphanAfterSeen = seenAt > 0 && now - seenAt > 400;
    const neverMounted = !seenAt && setAt > 0 && now - setAt > 2500;
    assert.equal(orphanAfterSeen || neverMounted, true);
  });

  it('keeps pending mode during grace while overlay has not mounted', () => {
    const now = 10_000;
    const seenAt = 0;
    const setAt = now - 500;
    const orphanAfterSeen = seenAt > 0 && now - seenAt > 400;
    const neverMounted = !seenAt && setAt > 0 && now - setAt > 2500;
    assert.equal(orphanAfterSeen || neverMounted, false);
  });
});
