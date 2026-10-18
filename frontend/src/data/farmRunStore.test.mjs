/**
 * Mid-level leave: remaining questions + saved frustration.
 * Run: node --test frontend/src/data/farmRunStore.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { answeredFromRun, farmRunSummary, shouldApplyRemoteSnapshot } from './farmRunStore.js';

describe('answeredFromRun', () => {
  it('counts quiz correct + incorrect when questionsAnswered is missing', () => {
    assert.equal(
      answeredFromRun({ quizCorrect: 4, quizIncorrect: 2 }),
      6,
    );
  });
});

describe('shouldApplyRemoteSnapshot', () => {
  it('uses the database when it is newer or the browser has no run', () => {
    assert.equal(shouldApplyRemoteSnapshot(null, { savedAt: 10, levelId: 2 }), true);
    assert.equal(
      shouldApplyRemoteSnapshot({ savedAt: 10, levelId: 1 }, { savedAt: 20, levelId: 2 }),
      true,
    );
    assert.equal(
      shouldApplyRemoteSnapshot({ savedAt: 20, levelId: 3 }, { savedAt: 10, levelId: 1 }),
      false,
    );
  });
});

describe('farmRunSummary', () => {
  it('shows remaining questions after a halfway leave', () => {
    const summary = farmRunSummary({
      version: 1,
      levelId: 2,
      currentMoney: 40,
      quizCorrect: 4,
      quizIncorrect: 2,
      questionsAnswered: 6,
      maxQuestions: 10,
      frustrationScore: 67,
    });
    assert.equal(summary.questionsAnswered, 6);
    assert.equal(summary.remainingQuestions, 4);
    assert.equal(summary.frustrationScore, 67);
    assert.match(summary.label, /6 of 10/);
    assert.match(summary.label, /4 left/);
  });
});
