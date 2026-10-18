/**
 * Run: node --test frontend/src/data/levelCompletionFlow.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canOpenShopAfterOutcome,
  levelSaveNeedsWarning,
  shopPerformanceFromLevelPayload,
} from './levelCompletionFlow.js';

describe('canOpenShopAfterOutcome', () => {
  it('opens the shop when the database persisted a pass', () => {
    assert.equal(
      canOpenShopAfterOutcome({
        persisted: true,
        outcome: 'LEVEL_PASSED',
        retryLesson: false,
      }),
      true,
    );
  });

  it('opens the shop when the database is skipped / offline', () => {
    assert.equal(
      canOpenShopAfterOutcome({ persisted: false, skipped: true }),
      true,
    );
    assert.equal(
      canOpenShopAfterOutcome({
        persisted: false,
        offline: true,
        outcome: 'LEVEL_PASSED',
        retryLesson: false,
      }),
      true,
    );
  });

  it('opens the shop for a local retry decision', () => {
    assert.equal(
      canOpenShopAfterOutcome({
        persisted: false,
        offline: true,
        retryLesson: true,
        outcome: 'REMEDIATION_REQUIRED',
      }),
      true,
    );
  });

  it('does not open the shop for an empty failure object', () => {
    assert.equal(canOpenShopAfterOutcome(null), false);
    assert.equal(
      canOpenShopAfterOutcome({ persisted: false, error: 'save_failed' }),
      false,
    );
  });
});

describe('levelSaveNeedsWarning', () => {
  it('warns when cash flush failed but still allows a shop decision', () => {
    assert.equal(
      levelSaveNeedsWarning(
        { persisted: true, outcome: 'LEVEL_PASSED' },
        { ok: false },
      ),
      true,
    );
  });

  it('does not warn for skipped database mode', () => {
    assert.equal(
      levelSaveNeedsWarning(
        { persisted: false, skipped: true },
        { ok: false, skipped: true },
      ),
      false,
    );
  });
});

describe('shopPerformanceFromLevelPayload', () => {
  it('prefers average question frustration for shop pricing', () => {
    const perf = shopPerformanceFromLevelPayload(
      {
        avgFrustrationScore: 42,
        frustrationScore: 10,
        frozenPrices: { sheep: 12 },
        levelId: 3,
        questionFrustrationScores: [40, 44],
      },
      { frustrationScore: 99, levelId: 1 },
    );
    assert.equal(perf.avgFrustrationScore, 42);
    assert.equal(perf.frustrationScore, 42);
    assert.equal(perf.levelId, 3);
    assert.deepEqual(perf.frozenPrices, { sheep: 12 });
  });
});
