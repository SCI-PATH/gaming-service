/**
 * Run: node --test frontend/src/data/farmLessonProgression.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decideFarmLessonProgression,
  FARM_PROGRESSION,
} from './farmLessonProgression.js';

describe('decideFarmLessonProgression', () => {
  it('retries the same lesson when frustration is very high', () => {
    const d = decideFarmLessonProgression({
      frustrationScore: 88,
      frustrationLevel: 'very_high',
      correctAnswers: 12,
      incorrectAnswers: 3,
      mastery: 0.8,
    });
    assert.equal(d.action, FARM_PROGRESSION.RETRY_FRUSTRATION);
    assert.equal(d.retryLesson, true);
  });

  it('retries for practice when frustration is ok but mastery is weak', () => {
    const d = decideFarmLessonProgression({
      frustrationScore: 40,
      frustrationLevel: 'moderate',
      correctAnswers: 4,
      incorrectAnswers: 11,
      mastery: 0.3,
    });
    assert.equal(d.action, FARM_PROGRESSION.RETRY_PRACTICE);
    assert.equal(d.retryLesson, true);
  });

  it('advances when performance and frustration are healthy', () => {
    const d = decideFarmLessonProgression({
      frustrationScore: 22,
      frustrationLevel: 'low',
      correctAnswers: 13,
      incorrectAnswers: 2,
      mastery: 0.78,
    });
    assert.equal(d.action, FARM_PROGRESSION.ADVANCE);
    assert.equal(d.retryLesson, false);
  });
});
