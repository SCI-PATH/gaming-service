/**
 * Concept-graph mind maps: keywords + relationships, not answer keys.
 * Run: node --test frontend/src/avatar/conceptGraph.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildConceptGraph,
  diagnoseMisconception,
  MISCONCEPTION_TYPES,
  validateConceptGraph,
} from './conceptGraph.js';

describe('misconception diagnosis', () => {
  it('sees stem vs roots as related-concept confusion', () => {
    const d = diagnoseMisconception({
      question: 'Which part of a plant absorbs water from the soil?',
      studentAnswer: 'Stem',
      correctAnswer: 'Roots',
    });
    assert.equal(d.type, MISCONCEPTION_TYPES.RELATED);
  });

  it('sees oxygen vs CO2 as related', () => {
    const d = diagnoseMisconception({
      question: 'What gas do plants use during photosynthesis?',
      studentAnswer: 'Oxygen',
      correctAnswer: 'Carbon dioxide',
    });
    assert.equal(d.type, MISCONCEPTION_TYPES.RELATED);
  });
});

describe('concept graphs teach relationships', () => {
  it('builds a plant water tree for stem vs roots', () => {
    const g = buildConceptGraph({
      question: 'Which part of a plant absorbs water from the soil?',
      studentAnswer: 'Stem',
      correctAnswer: 'Roots',
      topic: 'Plant Biology',
    });
    const labels = g.nodes.map((n) => n.label.toLowerCase());
    assert.ok(labels.some((l) => l.includes('root')));
    assert.ok(labels.some((l) => l.includes('stem')));
    assert.ok(labels.some((l) => l.includes('absorb')));
    assert.ok(g.relationships.some((r) => /absorb|do|take/i.test(r.label)));
    assert.equal(g.nodes.find((n) => /stem/i.test(n.label))?.kind, 'mixup');
    assert.equal(g.nodes.find((n) => /root/i.test(n.label))?.kind, 'correct');
    assert.ok(g.practice?.question);
    assert.equal(/which part of a plant absorbs/i.test(g.practice.question), false);
    assert.equal(validateConceptGraph(g, { correctAnswer: 'Roots' }).ok, true);
  });

  it('does not treat a mix-up as the correct node', () => {
    const g = buildConceptGraph({
      question: 'What gas do plants take in for photosynthesis?',
      studentAnswer: 'Oxygen',
      correctAnswer: 'Carbon dioxide',
    });
    assert.ok(g.nodes.some((n) => n.kind === 'correct' && /co₂|co2|carbon/i.test(n.label)));
    assert.ok(g.nodes.some((n) => n.kind === 'mixup'));
  });

  it('still builds a graph for True/False', () => {
    const g = buildConceptGraph({
      question: 'Dicotyledonous plants are named for having two seed lobes.',
      studentAnswer: 'False',
      correctAnswer: 'True',
      questionType: 'TrueFalse',
    });
    assert.ok(g.nodes.length >= 3);
    assert.ok(g.relationships.length);
  });

  it('builds a graph for fill-in flowers vs roots', () => {
    const g = buildConceptGraph({
      question: 'Plants absorb water through ______.',
      studentAnswer: 'flowers',
      correctAnswer: 'roots',
      questionType: 'FillInTheBlank',
    });
    assert.ok(g.nodes.some((n) => /root/i.test(n.label)));
    assert.equal(validateConceptGraph(g, { correctAnswer: 'roots' }).ok, true);
  });

  it('marks partial typed answers as partial', () => {
    const d = diagnoseMisconception({
      question: 'What is photosynthesis?',
      studentAnswer: 'Plants use sunlight to make food.',
      correctAnswer: 'Plants use light to make glucose from carbon dioxide and water.',
      completeness: 'partial',
      missingKeywords: ['carbon dioxide', 'water'],
    });
    assert.equal(d.type, MISCONCEPTION_TYPES.PARTIAL);
  });
});

describe('plant maps are curriculum keywords, not placeholders', () => {
  it('teaches seed function without Function / Correct idea boxes', () => {
    const g = buildConceptGraph({
      question: 'What is the role of seeds in flowering plants?',
      studentAnswer: '',
      correctAnswer: 'They grow into new plants',
      questionType: 'TypedAnswer',
      topic: 'Plant Biology',
    });
    const labels = g.nodes.map((n) => n.label.toLowerCase());
    assert.ok(labels.some((l) => l.includes('seed')));
    assert.ok(labels.some((l) => /new plant|dispersal|flower/.test(l)));
    assert.equal(labels.some((l) => /^(function|correct idea|plant biology)$/.test(l)), false);
    assert.equal(g.relationships.some((r) => r.label === 'asks'), false);
    assert.equal(validateConceptGraph(g, { correctAnswer: 'They grow into new plants' }).ok, true);
  });

  it('maps flowering vs non-flowering as a real contrast, not placeholders', () => {
    const g = buildConceptGraph({
      question: 'What is the difference between flowering plants and non-flowering plants?',
      studentAnswer: 'Flowering plants are bigger',
      correctAnswer:
        'Flowering plants produce flowers and often fruits with seeds. Non-flowering plants do not make flowers; many reproduce with spores or cones.',
      questionType: 'TypedAnswer',
      topic: 'Plant Biology',
    });
    const labels = g.nodes.map((n) => n.label.toLowerCase());
    assert.ok(labels.some((l) => l.includes('flowering')));
    assert.ok(labels.some((l) => l.includes('non-flowering') || l.includes('spore')));
    assert.ok(labels.some((l) => l.includes('flower')));
    assert.equal(
      labels.some((l) => /^(key idea|idea|is the difference|difference)$/.test(l)),
      false,
    );
    assert.equal(
      validateConceptGraph(g, {
        correctAnswer: 'Flowering plants produce flowers and fruits with seeds',
      }).ok,
      true,
    );
  });

  it('contrasts leaf photosynthesis with stem transport', () => {
    const g = buildConceptGraph({
      question: 'What is the primary function of a plant leaf?',
      studentAnswer: 'Transporting nutrients',
      correctAnswer: 'Photosynthesis',
      questionType: 'MCQ',
      topic: 'Plant Biology',
    });
    const labels = g.nodes.map((n) => n.label.toLowerCase());
    assert.ok(labels.some((l) => /leaves?/.test(l)));
    assert.ok(labels.some((l) => l.includes('photosynthesis')));
    assert.ok(labels.some((l) => l.includes('stem') || l.includes('transport')));
    assert.equal(g.nodes.find((n) => /stem/i.test(n.label))?.kind, 'mixup');
    assert.ok(g.nodes.some((n) => n.kind === 'correct' && /leaves|photosynth/i.test(n.label)));
    assert.equal(g.relationships.some((r) => r.label === 'asks'), false);
    assert.ok(g.relationships.every((r) => r.from && r.to));
    assert.equal(validateConceptGraph(g, { correctAnswer: 'Photosynthesis' }).ok, true);
  });
});

describe('personalized map carries concept graphs', () => {
  it('attaches graph data that the UI can render', () => {
    const g = buildConceptGraph({
      prompt: 'Which part of a plant absorbs water from the soil?',
      studentAnswer: 'Stem',
      correctAnswer: 'Roots',
      questionType: 'MCQ',
      topic: 'Plant Biology',
    });
    assert.ok(g.nodes.length >= 4);
    assert.ok(g.relationships.length);
  });
});
