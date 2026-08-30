/**
 * Downloadable mind map must draw the same concept trees as the UI.
 * Run: node --test frontend/src/avatar/downloadMindMap.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildConceptGraph } from './conceptGraph.js';
import { buildMindMapSvg } from './downloadMindMap.js';

describe('download mind map matches on-screen concept trees', () => {
  it('draws seed keywords instead of Your pick / Correct', () => {
    const graph = buildConceptGraph({
      question: 'What is the role of seeds in flowering plants?',
      studentAnswer: '',
      correctAnswer: 'They grow into new plants',
      questionType: 'TypedAnswer',
      topic: 'Plant Biology',
    });
    const { svg } = buildMindMapSvg(
      { title: 'Science gaps' },
      [
        {
          index: 1,
          topic: 'Plant Biology',
          question: 'What is the role of seeds in flowering plants?',
          conceptGraph: graph,
        },
      ],
    );
    assert.match(svg, /SEEDS|NEW PLANTS|FLOWERING/i);
    assert.doesNotMatch(svg, /Your pick/i);
    assert.doesNotMatch(svg, /CORRECT ANSWER/i);
    assert.doesNotMatch(svg, />Correct</i);
  });

  it('draws leaf vs stem contrast for an MCQ miss', () => {
    const graph = buildConceptGraph({
      question: 'What is the primary function of a plant leaf?',
      studentAnswer: 'Transporting nutrients',
      correctAnswer: 'Photosynthesis',
      questionType: 'MCQ',
      topic: 'Plant Biology',
    });
    const { svg } = buildMindMapSvg(
      { title: 'Science gaps' },
      [
        {
          index: 2,
          topic: 'Plant Biology',
          question: 'What is the primary function of a plant leaf?',
          studentAnswer: 'Transporting nutrients',
          correctAnswer: 'Photosynthesis',
          conceptGraph: graph,
          colorIndex: 1,
        },
      ],
    );
    assert.match(svg, /LEAVES|PHOTOSYNTHESIS/i);
    assert.match(svg, /STEM|TRANSPORT/i);
    assert.doesNotMatch(svg, /Your pick/i);
    assert.doesNotMatch(svg, /  · your pick/i);
  });

  it('keeps whole words in tree boxes and learning path', () => {
    const long =
      'Plants which produce flowers are called flowering plants and plants which do not produce flowers are called non-flowering plants';
    const { svg } = buildMindMapSvg(
      { title: 'Science gaps' },
      [
        {
          index: 1,
          topic: 'Plant Diversity',
          question: 'What is a characteristic feature of flowering plants?',
          conceptGraph: {
            concept: 'Plant Diversity',
            nodes: [
              { id: 'root', label: 'Plant Diversity', kind: 'root' },
              { id: 'a', label: 'Formation of flowers and fruits', kind: 'related' },
              { id: 'b', label: 'Flowering plants produce flowers', kind: 'correct' },
            ],
            relationships: [
              { from: 'root', to: 'a', label: 'includes' },
              { from: 'root', to: 'b', label: 'teaches' },
            ],
            learningPath: [long],
          },
        },
      ],
    );
    assert.match(svg, /FORMATION OF FLOWERS/);
    assert.match(svg, /AND FRUITS/);
    assert.match(svg, /FLOWERING PLANTS/);
    assert.match(svg, /PRODUCE FLOWERS/);
    assert.doesNotMatch(svg, /FORMATION OF FL[.]/);
    assert.match(svg, /do not produce flowers/);
    assert.doesNotMatch(svg, /do not prod</);
  });
});
