import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimAttemptKey,
  releaseAttemptKey,
  resetAttemptClaims,
  scoreQuestionAttempt,
  smoothFrustration,
  validateResponseMs,
} from './questionFrustration.js';
import {
  averageLevelFrustration,
  priceFromAverageFrustration,
} from './shopPricePolicy.js';

describe('question frustration', () => {
  it('records a slow correct answer without treating it as a failed deadline', () => {
    const scored = scoreQuestionAttempt({
      wasCorrect: true,
      responseTimeMs: 90_000,
      metrics: {
        correct_answers: 3,
        incorrect_answers: 0,
        consecutive_fails: 0,
        previous_avg_answer_time_sec: 20,
        time_per_question_avg_sec: 90,
      },
      previousSmoothed: 20,
    });
    assert.equal(scored.ok, true);
    assert.equal(scored.responseTimeMs, 90_000);
    assert.equal(typeof scored.score, 'number');
    assert.ok(scored.score <= 40);
    assert.ok(scored.audit.parts);
  });

  it('rejects negative timing and duplicate attempt keys', () => {
    assert.equal(validateResponseMs(-5), null);
    assert.equal(scoreQuestionAttempt({ wasCorrect: false, responseTimeMs: -1 }).ok, false);
    resetAttemptClaims();
    assert.equal(claimAttemptKey('s:q:0'), true);
    assert.equal(claimAttemptKey('s:q:0'), false);
    releaseAttemptKey('s:q:0');
    assert.equal(claimAttemptKey('s:q:0'), true);
  });

  it('smooths one noisy score instead of jumping the full distance', () => {
    const next = smoothFrustration(20, 90, 0.35);
    assert.ok(next > 20);
    assert.ok(next < 90);
  });
});

describe('shop prices from average frustration', () => {
  it('averages only valid scores and discounts when frustration is high', () => {
    assert.equal(averageLevelFrustration([10, null, -4, 80, 200]), 45);
    assert.equal(averageLevelFrustration([]), null);
    const easy = priceFromAverageFrustration(200, 90);
    const steady = priceFromAverageFrustration(200, 10);
    assert.ok(easy < steady);
    assert.ok(easy >= 10);
  });

  it('uses the same price for the same average', () => {
    assert.equal(
      priceFromAverageFrustration(160, 72),
      priceFromAverageFrustration(160, 72),
    );
  });
});
