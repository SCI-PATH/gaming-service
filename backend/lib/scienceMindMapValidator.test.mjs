/**
 * Run: node --test backend/lib/scienceMindMapValidator.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractJsonObject, validateMindMap } from './scienceMindMapValidator.mjs';

describe('extractJsonObject', () => {
  it('parses fenced JSON', () => {
    const parsed = extractJsonObject('```json\n{"title":"Cells"}\n```');
    assert.equal(parsed.title, 'Cells');
  });
});

describe('validateMindMap', () => {
  it('accepts a success map with branches', () => {
    const map = validateMindMap({
      status: 'success',
      title: 'Photosynthesis',
      central_concept: 'Photosynthesis',
      summary: 'Plants make food.',
      branches: [
        {
          id: 'b1',
          title: 'What is needed',
          points: [{ id: 'p1', text: 'Sunlight, water, carbon dioxide' }],
        },
      ],
      key_terms: [{ term: 'chlorophyll', meaning: 'green pigment' }],
      examples: ['A leaf in sunlight'],
      remember_this: ['No sunlight, no food making'],
      one_sentence_summary: 'Green plants make food using sunlight.',
    });
    assert.equal(map.status, 'success');
    assert.equal(map.branches.length, 1);
    assert.equal(map.key_terms[0].term, 'chlorophyll');
  });

  it('keeps insufficient_context without inventing branches', () => {
    const map = validateMindMap({
      status: 'insufficient_context',
      title: 'Science',
      message: 'Not enough textbook content.',
    });
    assert.equal(map.status, 'insufficient_context');
    assert.equal(map.branches.length, 0);
  });

  it('rejects a success map with no branches', () => {
    assert.throws(() =>
      validateMindMap({
        status: 'success',
        title: 'Empty',
        central_concept: 'Empty',
        branches: [],
      }),
    );
  });
});
