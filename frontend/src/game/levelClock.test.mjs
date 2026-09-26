/**
 * Run: node --test frontend/src/game/levelClock.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldBlockQuestionOpen } from './levelClock.js';

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

  it('blocks while a card is open, after the quota, or when the run is over', () => {
    assert.equal(shouldBlockQuestionOpen({ questionOpen: true }), true);
    assert.equal(shouldBlockQuestionOpen({ quotaReached: true }), true);
    assert.equal(shouldBlockQuestionOpen({ levelCompleted: true }), true);
    assert.equal(shouldBlockQuestionOpen({ runEnded: true }), true);
  });
});
