/**
 * Mind-map TTS scripts and Chrome-safe utterance splitting.
 * Run: node --test frontend/src/avatar/createSpeechEngine.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  splitForTts,
  buildMindMapNarration,
  buildMissCardNarration,
} from './createSpeechEngine.js';

describe('splitForTts', () => {
  it('keeps a short line as one chunk', () => {
    assert.deepEqual(splitForTts('Hi, I am Sage.'), ['Hi, I am Sage.']);
  });

  it('splits a long map script on sentence boundaries under the limit', () => {
    const text =
      'Miss 1, about Static electricity. The question was: What stores charge? You picked Resistor. The correct idea is Capacitor. Key idea: A capacitor stores electric charge. Let\'s look. Rubbing transfers electrons so opposite charges attract.';
    const chunks = splitForTts(text, 120);
    assert.ok(chunks.length >= 3);
    assert.equal(chunks.join(' '), text);
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 120, chunk);
    }
  });
});

describe('buildMindMapNarration', () => {
  const map = {
    missCount: 1,
    topic: 'Static electricity',
    root: 'Static electricity',
    bigPicture: 'Start with the correct idea on each card. Focus on Static electricity.',
    branches: [
      {
        id: 'miss-0',
        index: 1,
        topic: 'Static electricity',
        prompt: 'Which device stores electric charge?',
        studentAnswer: 'Resistor',
        correctAnswer: 'Capacitor',
        keyConcept: 'A capacitor stores electric charge.',
        keyExplain:
          'Rubbing two surfaces can move electrons. A capacitor holds that separated charge; a resistor does not store it.',
      },
    ],
  };

  it('reads the question, pick, correct idea, key idea, and let\'s look', () => {
    const parts = buildMindMapNarration(map);
    const branch = parts.find((p) => p.kind === 'branch');
    assert.ok(branch?.text);
    assert.match(branch.text, /Miss 1/);
    assert.match(branch.text, /Which device stores electric charge/);
    assert.match(branch.text, /mix-up was Resistor/);
    assert.match(branch.text, /Remember this:/);
    assert.doesNotMatch(branch.text, /Exam lock/i);
  });

  it('skips placeholder correct-answer lines', () => {
    const parts = buildMindMapNarration({
      ...map,
      branches: [
        {
          ...map.branches[0],
          correctAnswer: 'see the lesson key idea',
          keyConcept: 'A capacitor stores electric charge.',
        },
      ],
    });
    const branch = parts.find((p) => p.kind === 'branch');
    assert.doesNotMatch(branch.text, /see the lesson key idea/i);
    assert.match(branch.text, /Remember this: A capacitor stores electric charge/);
  });
});

describe('buildMissCardNarration', () => {
  it('reads the full card instead of only the why line', () => {
    const seg = buildMissCardNarration({
      id: 'miss-0',
      index: 1,
      topic: 'Photosynthesis',
      prompt: 'What gas do plants take in to make food?',
      studentAnswer: 'Oxygen',
      correctAnswer: 'Carbon dioxide',
      keyConcept: 'Plants take in carbon dioxide.',
      keyExplain: 'Leaves take in carbon dioxide and use sunlight to make food.',
    });
    assert.match(seg.text, /What gas do plants take in/);
    assert.match(seg.text, /You answered Oxygen|mix-up was Oxygen/);
    assert.match(seg.text, /carbon dioxide/i);
  });
});
