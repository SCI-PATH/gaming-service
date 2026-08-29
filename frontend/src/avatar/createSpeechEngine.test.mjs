/**
 * SAGE audio must teach the science and the mind-map links, not stop at "You chose…".
 * Run: node --test frontend/src/avatar/createSpeechEngine.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMindMapNarration,
  buildMissCardNarration,
} from './createSpeechEngine.js';
import { composeFiveStepLesson } from './explainMisconception.js';

function capacitorBranch() {
  const lesson = composeFiveStepLesson(
    {
      prompt: 'What device is used to store static electric charges?',
      studentAnswer: 'Resistor',
      correctAnswer: 'Capacitor',
      options: ['Battery', 'Resistor', 'Capacitor', 'Switch'],
      topic: 'Static Electricity',
      questionType: 'MCQ',
    },
    { frustrationLevel: 'moderate' },
  );
  return {
    id: 'miss-0',
    index: 1,
    topic: 'Static Electricity',
    studentAnswer: 'Resistor',
    correctAnswer: 'Capacitor',
    lesson,
    audioGraph: {
      rootConcept: 'Static Electricity',
      nodes: [
        {
          id: 'student',
          label: lesson.studentAnswer.concept,
          description: lesson.studentAnswer.scientificDefinition,
        },
        {
          id: 'correct',
          label: lesson.correctAnswer.concept,
          description: lesson.correctAnswer.scientificDefinition,
        },
      ],
      relationships: [
        {
          from: lesson.studentAnswer.concept,
          to: lesson.correctAnswer.concept,
          relationship: lesson.comparisonFields.keyScientificDifference,
        },
      ],
    },
  };
}

describe('mind-map audio teaches science and relationships', () => {
  it('does not stop after identifying the student pick', () => {
    const branch = capacitorBranch();
    const card = buildMissCardNarration(branch, { frustrationLevel: 'moderate' });
    assert.ok(card?.text);
    const t = card.text.toLowerCase();
    assert.match(t, /resistor/);
    assert.match(t, /capacitor/);
    assert.match(t, /charge|current/);
    assert.match(t, /mind map|connection|map/);
    assert.equal(/^let's look at miss \d+\. you chose .+\.$/i.test(card.text), false);
    assert.ok(card.text.length > 80);
  });

  it('full map narration explains the root and the miss', () => {
    const branch = capacitorBranch();
    const parts = buildMindMapNarration({
      root: 'Static Electricity',
      topic: 'Static Electricity',
      missCount: 1,
      frustrationLevel: 'moderate',
      branches: [branch],
    });
    const spoken = parts.map((p) => p.text).join(' ').toLowerCase();
    assert.match(spoken, /mind map/);
    assert.match(spoken, /static electricity|capacitor|resistor/);
    assert.equal(/exam lock/i.test(spoken), false);
    assert.ok(parts.some((p) => p.kind === 'branch' && p.text.length > 80));
  });

  it('high frustration keeps facts but shortens the map talk', () => {
    const branch = capacitorBranch();
    const calm = buildMissCardNarration(branch, { frustrationLevel: 'low' });
    const high = buildMissCardNarration(branch, { frustrationLevel: 'very_high' });
    assert.match(high.text.toLowerCase(), /resistor|capacitor|charge/);
    assert.ok(high.text.length <= calm.text.length);
  });
});
