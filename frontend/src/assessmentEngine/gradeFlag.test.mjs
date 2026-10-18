import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readGradeIsCorrect } from './gradeFlag.js';

describe('readGradeIsCorrect', () => {
  it('trusts a boolean correct or incorrect flag from the current grade', () => {
    assert.equal(readGradeIsCorrect({ is_correct: true }), true);
    assert.equal(readGradeIsCorrect({ is_correct: false }), false);
    assert.equal(readGradeIsCorrect({ isCorrect: true }), true);
  });

  it('does not treat the string false as correct', () => {
    assert.equal(readGradeIsCorrect({ is_correct: 'false' }), false);
    assert.equal(readGradeIsCorrect({ is_correct: 'true' }), true);
    assert.equal(readGradeIsCorrect({ feedback: 'Correct.' }), false);
  });
});
