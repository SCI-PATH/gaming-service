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
      'You tried Resistor. Remember: a capacitor stores electric charge. Rubbing transfers electrons so opposite charges attract.';
    const chunks = splitForTts(text, 120);
    assert.ok(chunks.length >= 1);
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

  it('reads the correct idea in plain speech', () => {
    const parts = buildMindMapNarration(map, { frustrationScore: 40 });
    const branch = parts.find((p) => p.kind === 'branch');
    assert.ok(branch?.text);
    assert.doesNotMatch(branch.text, /Miss 1/);
    assert.doesNotMatch(branch.text, /learning path/i);
    assert.match(branch.text, /capacitor/i);
    assert.doesNotMatch(branch.text, /\bResistor\b/);
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
    assert.match(branch.text, /capacitor stores electric charge/i);
  });
});

describe('buildMissCardNarration', () => {
  it('reads the card instead of only the why line', () => {
    const seg = buildMissCardNarration(
      {
        id: 'miss-0',
        index: 1,
        topic: 'Photosynthesis',
        prompt: 'What gas do plants take in to make food?',
        studentAnswer: 'Oxygen',
        correctAnswer: 'Carbon dioxide',
        keyConcept: 'Plants take in carbon dioxide.',
        keyExplain: 'Leaves take in carbon dioxide and use sunlight to make food.',
      },
      { frustrationScore: 40 },
    );
    assert.match(seg.text, /carbon dioxide/i);
    assert.doesNotMatch(seg.text, /\bOxygen\b/);
    assert.doesNotMatch(seg.text, /Miss 1/);
  });
});
