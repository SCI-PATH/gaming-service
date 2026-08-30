/**
 * Sage spoken voice: Grade 6 wording paced by frustration.
 * Run: node --test frontend/src/avatar/sageSpokenVoice.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSageMissScript,
  capSpokenSentences,
  resolveSageVoice,
  sageGreeting,
} from './sageSpokenVoice.js';
import { buildMindMapNarration } from './createSpeechEngine.js';

describe('resolveSageVoice', () => {
  it('slows and shortens speech at high frustration', () => {
    const high = resolveSageVoice({ frustrationScore: 72 });
    const low = resolveSageVoice({ frustrationScore: 12 });
    assert.equal(high.level, 'high');
    assert.equal(high.sentenceMax, 2);
    assert.ok(high.rate < low.rate);
    assert.equal(low.level, 'low');
  });
});

describe('buildSageMissScript', () => {
  const branch = {
    topic: 'Plant Biology',
    prompt: 'What is the difference between flowering plants and non-flowering plants?',
    studentAnswer: 'Flowering plants are bigger',
    keyConcept: 'Flowering plants make flowers.',
    conceptGraph: {
      nodes: [
        { id: 'plants', label: 'Plants', kind: 'root' },
        { id: 'flowering', label: 'Flowering', kind: 'correct' },
        { id: 'flowers', label: 'Flowers', kind: 'correct' },
      ],
      relationships: [
        { from: 'plants', to: 'flowering', label: 'include' },
        { from: 'flowering', to: 'flowers', label: 'make' },
      ],
    },
  };

  it('does not say Miss N, learning path, or chapter dumps', () => {
    const text = buildSageMissScript(branch, resolveSageVoice({ frustrationScore: 40 }));
    assert.doesNotMatch(text, /Miss \d/i);
    assert.doesNotMatch(text, /learning path/i);
    assert.doesNotMatch(text, /Plant Biology/i);
    assert.match(text, /Flowering/i);
  });

  it('uses fewer sentences when frustration is very high', () => {
    const high = buildSageMissScript(
      branch,
      resolveSageVoice({ frustrationScore: 90 }),
    );
    const low = buildSageMissScript(
      branch,
      resolveSageVoice({ frustrationScore: 10 }),
    );
    const count = (s) => (s.match(/[.!?]/g) || []).length;
    assert.ok(count(high) <= 2);
    assert.ok(count(low) >= count(high));
  });
});

describe('buildMindMapNarration', () => {
  const map = {
    missCount: 1,
    topic: 'Static electricity',
    root: 'Static electricity',
    frustrationScore: 45,
    branches: [
      {
        id: 'miss-0',
        index: 1,
        topic: 'Static electricity',
        prompt: 'Which device stores electric charge?',
        studentAnswer: 'Resistor',
        correctAnswer: 'Capacitor',
        keyConcept: 'A capacitor stores electric charge.',
      },
    ],
  };

  it('greets without counting incorrect answers', () => {
    const parts = buildMindMapNarration(map, { frustrationScore: 45 });
    const intro = parts.find((p) => p.kind === 'intro');
    assert.match(intro.text, /Sage|Hi /);
    assert.doesNotMatch(intro.text, /incorrect/i);
    const branch = parts.find((p) => p.kind === 'branch');
    assert.match(branch.text, /Resistor|capacitor/i);
    assert.doesNotMatch(branch.text, /Miss 1/);
  });
});

describe('capSpokenSentences', () => {
  it('keeps only the first N sentences', () => {
    assert.equal(
      capSpokenSentences('One. Two. Three.', 2),
      'One. Two.',
    );
  });
});

describe('sageGreeting', () => {
  it('reassures at very high frustration', () => {
    const line = sageGreeting(resolveSageVoice({ frustrationScore: 88 }), 'Maya');
    assert.match(line, /Maya/);
    assert.match(line, /tiny step|doing fine/i);
  });
});
