/**
 * Run: node --test backend/lib/ragConceptGraph.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ragMindMapToConceptGraph } from './ragConceptGraph.mjs';

describe('ragMindMapToConceptGraph', () => {
  it('turns RAG JSON into monocot/dicot nodes instead of Key idea', () => {
    const graph = ragMindMapToConceptGraph({
      title: 'Monocots and dicots',
      central_concept: 'Monocots and dicots',
      summary: 'Flowering plants are grouped by seed leaves.',
      branches: [
        { title: 'Monocot', points: [{ text: 'One cotyledon' }] },
        { title: 'Dicot', points: [{ text: 'Two cotyledons' }] },
      ],
      remember_this: ['Count the seed leaves'],
      one_sentence_summary: 'The two groups are monocots and dicots.',
    });
    const labels = graph.nodes.map((n) => n.label.toLowerCase());
    assert.equal(graph.concept, 'Monocots and dicots');
    assert.ok(labels.some((l) => l.includes('monocot')));
    assert.ok(labels.some((l) => l.includes('dicot')));
    assert.equal(labels.some((l) => /^(this idea|key idea|link)$/.test(l)), false);
    assert.ok(graph.relationships.length);
  });
});
