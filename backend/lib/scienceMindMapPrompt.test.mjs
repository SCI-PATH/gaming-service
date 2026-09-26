/**
 * Run: node --test backend/lib/scienceMindMapPrompt.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureExplanationTeachesAnswer,
  formatContext,
  isNonExplanation,
  plainParagraph,
  presentationBand,
  systemPrompt,
  userPrompt,
  validateExplanation,
} from './scienceMindMapPrompt.mjs';

describe('presentationBand', () => {
  it('maps 0–100 into the five presentation bands without changing stored CSF labels', () => {
    assert.equal(presentationBand(0), 'VERY_LOW');
    assert.equal(presentationBand(20), 'VERY_LOW');
    assert.equal(presentationBand(21), 'LOW');
    assert.equal(presentationBand(50), 'MODERATE');
    assert.equal(presentationBand(80), 'HIGH');
    assert.equal(presentationBand(81), 'VERY_HIGH');
    assert.equal(presentationBand(100), 'VERY_HIGH');
  });
});

describe('prompts', () => {
  it('asks for one encouraging paragraph grounded only in the textbook', () => {
    const system = systemPrompt();
    assert.match(system, /encouraging, supportive, and educational/i);
    assert.match(system, /why their answer was incorrect/i);
    assert.match(system, /correct concept/i);
    assert.match(system, /MUST explicitly mention the key terms/i);
    const correctFirst = system.toLowerCase().indexOf('sentence 1 must state the correct answer');
    const wrongSecond = system.toLowerCase().indexOf('why their answer was incorrect');
    assert.ok(correctFirst >= 0 && wrongSecond > correctFirst);
    assert.match(system, /ONLY the provided textbook context/i);
    assert.match(system, /plain text/i);
    assert.match(system, /presentation/i);
    assert.match(system, /paragraph/i);
    assert.match(system, /Do not generate a mind map/i);
    const user = userPrompt({
      grade: 7,
      question: 'Why do plants need sunlight?',
      studentAnswer: 'for decoration',
      correctAnswer: 'to make food',
      frustrationScore: 88,
      frustrationLevel: 'VERY_HIGH',
      retrievalQuery: 'plants sunlight photosynthesis',
      context: '[Source 1]\ntext: Plants make food using sunlight.',
    });
    assert.match(user, /Grade:\n7/);
    assert.match(user, /Original question:\nWhy do plants need sunlight/);
    assert.match(user, /Student's incorrect answer:\nfor decoration/);
    assert.match(user, /Correct answer:\nto make food/);
    assert.match(user, /VERY_HIGH/);
    assert.match(user, /Plants make food using sunlight/);
    assert.match(user, /do NOT remove scientifically important facts/i);
  });

  it('rejects the question stem and the blank answer list as feedback', () => {
    const question =
      'Temperature can be measured using a [_____], which accurately indicates the degree of heat present.';
    const correct = 'thermometer · body temperature · 35 oc - 43 oc · capillary tube · mercury';
    assert.equal(isNonExplanation(question, { question, correctAnswer: correct }), true);
    assert.equal(isNonExplanation(correct, { question, correctAnswer: correct }), true);
    assert.equal(
      isNonExplanation(
        'A clinical thermometer measures body temperature. The bend in the capillary tube holds the mercury reading.',
        { question, correctAnswer: correct },
      ),
      false,
    );
  });

  it('strips markdown and preamble from the feedback paragraph', () => {
    assert.equal(
      plainParagraph('**Sure, here is the idea:** Green plants make food using sunlight.'),
      'Green plants make food using sunlight.',
    );
  });

  it('accepts an explanation that teaches the correct answer and repairs one that does not', () => {
    assert.equal(
      validateExplanation(
        'A magnet has a north pole and a south pole.',
        'north and south',
      ).ok,
      true,
    );
    assert.equal(
      validateExplanation('Magnets are useful on a hike.', 'north and south').ok,
      false,
    );
    const repaired = ensureExplanationTeachesAnswer(
      'Magnets are useful on a hike.',
      'north and south',
      'each end of a magnet is a pole',
    );
    assert.equal(repaired.repaired, true);
    assert.match(repaired.paragraph, /The correct answer is north and south because each end of a magnet is a pole/i);
  });

  it('formats RAG chunks with citations the model may reuse', () => {
    const text = formatContext([
      {
        chunk_id: 'grade7_plants_012_001',
        textbook: 'Grade 7 Science Part I',
        grade: 7,
        chapter: 'Food from plants',
        page: 12,
        role: 'primary',
        text: 'Green plants make food by photosynthesis.',
      },
    ]);
    assert.match(text, /grade7_plants_012_001/);
    assert.match(text, /photosynthesis/);
  });
});
