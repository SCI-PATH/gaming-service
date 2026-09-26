/**
 * Run: node --test frontend/src/data/unlockPlacement.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chapterOrdinalFromId,
  shouldPlaceOwnedUnlock,
} from './unlockPlacement.js';

describe('shouldPlaceOwnedUnlock', () => {
  it('places a chapter 1 purchase on chapter 2 even though both farms are level 1', () => {
    const meta = {
      source: 'shop',
      purchasedAtLevel: 1,
      purchaseChapterOrdinal: 1,
    };
    assert.equal(
      shouldPlaceOwnedUnlock(meta, { levelId: 1, chapterOrdinal: 1 }),
      false,
    );
    assert.equal(
      shouldPlaceOwnedUnlock(meta, { levelId: 1, chapterOrdinal: 2 }),
      true,
    );
    assert.equal(chapterOrdinalFromId('g7_sci_14'), 14);
  });

  it('places an older level-1 purchase once a later chapter starts', () => {
    const meta = { source: 'shop', purchasedAtLevel: 1 };
    assert.equal(shouldPlaceOwnedUnlock(meta, { levelId: 1, chapterOrdinal: 1 }), false);
    assert.equal(shouldPlaceOwnedUnlock(meta, { levelId: 1, chapterOrdinal: 2 }), true);
  });

  it('keeps a standalone purchase hidden until the farm level number rises', () => {
    const meta = { source: 'shop', purchasedAtLevel: 1 };
    assert.equal(shouldPlaceOwnedUnlock(meta, { levelId: 1, chapterOrdinal: 0 }), false);
    assert.equal(shouldPlaceOwnedUnlock(meta, { levelId: 2, chapterOrdinal: 0 }), true);
  });

  it('shows a learning path reward on the chapter that granted it', () => {
    const meta = {
      source: 'learning_path',
      purchasedAtLevel: 1,
      availableAtLevel: 1,
    };
    assert.equal(shouldPlaceOwnedUnlock(meta, { levelId: 1, chapterOrdinal: 14 }), true);
  });
});
