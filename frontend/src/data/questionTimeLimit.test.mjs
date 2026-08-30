/**
 * Run: node --test frontend/src/data/questionTimeLimit.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getQuestionTimeLimit,
  QUESTION_TYPE_BASE_MS,
} from './questionTimeLimit.js';

describe('getQuestionTimeLimit', () => {
  it('gives TrueFalse less time than ShortAnswer at the same frustration', () => {
    const tf = getQuestionTimeLimit('TrueFalse', 40, 'medium');
    const typed = getQuestionTimeLimit('ShortAnswer', 40, 'medium');
    const mcq = getQuestionTimeLimit('MCQ', 40, 'medium');
    const blank = getQuestionTimeLimit('MultiBlank', 40, 'medium');
    assert.ok(tf < mcq);
    assert.ok(mcq < blank);
    assert.ok(blank < typed);
  });

  it('lengthens the window when frustration is very high', () => {
    const low = getQuestionTimeLimit('MCQ', 10, 'medium');
    const high = getQuestionTimeLimit('MCQ', 90, 'medium');
    assert.ok(high > low);
  });

  it('does not apply one shared base to every type', () => {
    const types = ['TrueFalse', 'MCQ', 'MultiBlank', 'ShortAnswer'];
    const lows = types.map((t) => getQuestionTimeLimit(t, 20, 'medium'));
    const unique = new Set(lows);
    assert.equal(unique.size, types.length);
    assert.equal(QUESTION_TYPE_BASE_MS.TrueFalse < QUESTION_TYPE_BASE_MS.ShortAnswer, true);
  });

  it('keeps TrueFalse inside its own clamp even at very high frustration', () => {
    const tf = getQuestionTimeLimit('TrueFalse', 100, 'weak');
    assert.ok(tf <= 28000);
    const typed = getQuestionTimeLimit('ShortAnswer', 100, 'weak');
    assert.ok(typed > tf);
  });
});
