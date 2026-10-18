/**
 * Run: node --test frontend/src/data/levelOutcome.test.mjs
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { submitLevelOutcome } from './levelOutcome.js';
import { canOpenShopAfterOutcome } from './levelCompletionFlow.js';

describe('submitLevelOutcome', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = async () => {
      throw new Error('network down');
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('falls back to a local pass so the shop can still open when the API fails', async () => {
    const decision = await submitLevelOutcome({
      levelNumber: 2,
      frustrationScore: 20,
      frustrationLevel: 'low',
      quizCorrect: 9,
      quizIncorrect: 1,
      mastery: 0.9,
    });
    assert.equal(decision.offline, true);
    assert.equal(decision.retryLesson, false);
    assert.equal(decision.outcome, 'LEVEL_PASSED');
    assert.equal(canOpenShopAfterOutcome(decision), true);
  });

  it('falls back to retry when local mastery is too low', async () => {
    const decision = await submitLevelOutcome({
      levelNumber: 1,
      frustrationScore: 10,
      frustrationLevel: 'low',
      quizCorrect: 3,
      quizIncorrect: 7,
    });
    assert.equal(decision.offline, true);
    assert.equal(decision.retryLesson, true);
    assert.equal(canOpenShopAfterOutcome(decision), true);
  });

  it('opens the shop when the database is not configured', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        ok: false,
        skipped: true,
        error: 'DATABASE_URL_not_configured',
      }),
    });
    const decision = await submitLevelOutcome({
      levelNumber: 1,
      frustrationScore: 15,
      quizCorrect: 8,
      quizIncorrect: 2,
      mastery: 0.8,
    });
    assert.equal(decision.skipped, true);
    assert.equal(canOpenShopAfterOutcome(decision), true);
  });
});
