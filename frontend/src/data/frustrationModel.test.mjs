/**
 * End-of-farm lesson gate: high frustration → retry the same lesson.
 * Run: node --test frontend/src/data/frustrationModel.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldRetryLessonAfterFarm } from './frustrationModel.js';

describe('shouldRetryLessonAfterFarm', () => {
  it('retries at the Sage high bar (61) and above', () => {
    assert.equal(shouldRetryLessonAfterFarm(61), true);
    assert.equal(shouldRetryLessonAfterFarm(80), true);
    assert.equal(shouldRetryLessonAfterFarm(100), true);
  });

  it('lets the student advance below 61', () => {
    assert.equal(shouldRetryLessonAfterFarm(0), false);
    assert.equal(shouldRetryLessonAfterFarm(30), false);
    assert.equal(shouldRetryLessonAfterFarm(60), false);
  });

  it('retries named high / very_high levels', () => {
    assert.equal(shouldRetryLessonAfterFarm('high'), true);
    assert.equal(shouldRetryLessonAfterFarm('very_high'), true);
    assert.equal(shouldRetryLessonAfterFarm('moderate'), false);
    assert.equal(shouldRetryLessonAfterFarm('low'), false);
  });
});
