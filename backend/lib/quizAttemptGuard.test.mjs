import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeResponseMs, scoreServerFrustration } from './quizAttemptGuard.mjs';

describe('quiz attempt guard', () => {
  it('accepts a long response and rejects negative time', () => {
    assert.equal(normalizeResponseMs(95000).responseMs, 95000);
    assert.equal(normalizeResponseMs(-1).ok, false);
  });

  it('recalculates frustration and ignores a client-supplied score', () => {
    const scored = scoreServerFrustration(
      {
        isCorrect: false,
        frustrationScore: 99,
        metrics: {
          correct_answers: 0,
          incorrect_answers: 1,
          consecutive_fails: 1,
          time_per_question_avg_sec: 30,
          previous_avg_answer_time_sec: 20,
        },
      },
      30000,
    );
    assert.notEqual(scored.score, 99);
    assert.ok(scored.score <= 40);
    assert.ok(scored.audit === undefined);
    assert.ok(scored.parts);
  });
});
