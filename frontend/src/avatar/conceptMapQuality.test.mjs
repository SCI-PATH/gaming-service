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
  keywordLabel,
  isNoiseLabel,
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

  it('shortens node labels to keywords', () => {
    assert.equal(keywordLabel('They grow into new plants'), 'grow into new plants');
    assert.equal(keywordLabel('carbon dioxide'), 'carbon dioxide');
    assert.equal(isNoiseLabel('do the body shapes'), true);
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

  it('does not call a rocks question Plant Biology', () => {
    assert.equal(
      displayConceptName({
        topic: 'Plant Biology',
        question:
          'What process causes sedimentary rocks to transform into metamorphic rocks?',
        correctAnswer: 'Extreme pressure and temperature',
      }),
      'Metamorphic rocks',
    );
    assert.equal(
      displayConceptName({
        topic: 'Plant Biology',
        question:
          'Limestone is classified as a [____], which is formed from the remains of dead animals and plants. It is one of the types of [____], which can also include rocks made from molten magma. Additionally, when [____], sedimentary rocks can change into metamorphic rocks under extreme pressure and temperature.',
        correctAnswer: 'sedimentary rock · igneous rocks · extreme pressure and temperature',
      }),
      'Types of rocks',
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
