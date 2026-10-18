/**
 * Run: node --test frontend/src/data/farmProgress.chapter.test.mjs
 * Uses an in-memory localStorage shim for Node.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => {
    mem.delete(k);
  },
};

const {
  applyChapterFarmLevel,
  loadFarmProgress,
  saveFarmProgress,
} = await import('./farmProgress.js');
const { parkFarmProgressAtCompletedLevel } = await import('./chapterPath.js');

describe('farm progression across lessons', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('advances to level 2 after a passed level parks for the learning path', () => {
    parkFarmProgressAtCompletedLevel(1, 40, { retryLesson: false });
    const parked = loadFarmProgress();
    assert.equal(parked.currentLevelId, 2);
    assert.equal(parked.highestCompletedLevel, 1);

    const next = applyChapterFarmLevel(1, null, 'g7_sci_15');
    assert.equal(next.currentLevelId, 2);
  });

  it('stays on level 1 when frustration requires a lesson retry', () => {
    parkFarmProgressAtCompletedLevel(1, 20, { retryLesson: true });
    const parked = loadFarmProgress();
    assert.equal(parked.currentLevelId, 1);
    assert.equal(parked.highestCompletedLevel, 0);

    const next = applyChapterFarmLevel(1, null, 'g7_sci_14');
    assert.equal(next.currentLevelId, 1);
  });

  it('still collapses an inflated lesson-ordinal cursor to level 1', () => {
    saveFarmProgress({
      currentLevelId: 14,
      highestCompletedLevel: 13,
      cash: 0,
    });
    const next = applyChapterFarmLevel(14, null, 'g7_sci_14');
    assert.equal(next.currentLevelId, 1);
  });
});
