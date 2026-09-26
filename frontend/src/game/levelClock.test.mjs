/**
 * Run: node --test frontend/src/game/levelClock.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEVEL_DURATION_MS,
  levelDurationMsFromFrustration,
  shouldBlockQuestionOpen,
} from './levelClock.js';

describe('shouldBlockQuestionOpen', () => {
  it('allows a question while the level clock and quota are still open', () => {
    assert.equal(
      shouldBlockQuestionOpen({
        elapsedLevelTimeMs: 1000,
        levelTargetCompletionMs: 12 * 60 * 1000,
      }),
      false,
    );
  });

  it('blocks once the level target time has elapsed', () => {
    assert.equal(
      shouldBlockQuestionOpen({
        elapsedLevelTimeMs: 12 * 60 * 1000,
        levelTargetCompletionMs: 12 * 60 * 1000,
      }),
      true,
    );
  });

  it('gives a longer level clock when frustration is high', () => {
    assert.equal(levelDurationMsFromFrustration(80), LEVEL_DURATION_MS.high);
    assert.equal(levelDurationMsFromFrustration(45), LEVEL_DURATION_MS.medium);
    assert.equal(levelDurationMsFromFrustration(12), LEVEL_DURATION_MS.low);
    assert.equal(levelDurationMsFromFrustration(null), LEVEL_DURATION_MS.medium);
  });

  it('blocks while a card is open, after the quota, or when the run is over', () => {
    assert.equal(shouldBlockQuestionOpen({ questionOpen: true }), true);
    assert.equal(shouldBlockQuestionOpen({ quotaReached: true }), true);
    assert.equal(shouldBlockQuestionOpen({ levelCompleted: true }), true);
    assert.equal(shouldBlockQuestionOpen({ runEnded: true }), true);
  });
});
