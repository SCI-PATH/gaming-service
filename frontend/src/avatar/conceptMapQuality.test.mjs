/**
 * Run: node --test frontend/src/avatar/conceptMapQuality.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  displayConceptName,
  isIncompleteLabel,
  studentConceptLabel,
  studentPracticeQuestion,
  teachingStep,
} from './conceptMapQuality.js';

describe('studentConceptLabel', () => {
  it('never returns a hanging fragment or curriculum id', () => {
    assert.equal(isIncompleteLabel('A guitar produces sound through'), true);
    assert.equal(isIncompleteLabel('Sound is produced by the'), true);
    assert.equal(isIncompleteLabel('G7_C11_SOU_PRODUCE'), true);
    assert.equal(
      studentConceptLabel('A guitar produces sound through the vibration of its strings'),
      'vibration of its strings',
    );
    assert.equal(studentConceptLabel('G7_C11_SOU_PRODUCE'), 'Production of sound');
    assert.equal(studentConceptLabel('Sound is produced by the'), '');
  });
});

describe('displayConceptName', () => {
  it('resolves skill ids for any chapter', () => {
    assert.equal(
      displayConceptName({ topic: 'G7_C11_SOU_PRODUCE', topic_id: 'G7_C11_SOU_PRODUCE' }),
      'Production of sound',
    );
    assert.equal(
      displayConceptName({ topic: 'G6_C2_MAT_STATES' }),
      'States of matter',
    );
  });
});

describe('teaching and practice copy', () => {
  it('strips discourse leftovers and never asks about an id', () => {
    assert.equal(
      teachingStep('Thus, it is clear that sound propagates through the thread.'),
      'Sound propagates through the thread',
    );
    const q = studentPracticeQuestion(
      {
        topic: 'G7_C11_SOU_PRODUCE',
        correctAnswer: 'vibration of air',
        question: 'Which of the following describes how sound is produced in a flute?',
      },
      'G7_C11_SOU_PRODUCE',
    );
    assert.equal(/G7_C11/i.test(q), false);
    assert.match(q, /sound|flute|vibration/i);
  });
});
