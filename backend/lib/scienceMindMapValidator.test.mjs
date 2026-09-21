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
  it('accepts a success paragraph', () => {
    const map = validateMindMap({
      status: 'success',
      title: 'Photosynthesis',
      central_concept: 'Photosynthesis',
      paragraph: 'Green plants make food using sunlight, water and carbon dioxide.',
    });
    assert.equal(map.status, 'success');
    assert.match(map.paragraph, /sunlight/);
    assert.equal(map.branches.length, 0);
  });

  it('keeps insufficient_context without inventing a paragraph', () => {
    const map = validateMindMap({
      status: 'insufficient_context',
      title: 'Science',
      message: 'Not enough textbook content.',
    });
    assert.equal(map.status, 'insufficient_context');
    assert.equal(map.paragraph, '');
  });

  it('rejects a success payload with no paragraph', () => {
    assert.throws(() =>
      validateMindMap({
        status: 'success',
        title: 'Empty',
        central_concept: 'Empty',
      }),
    );
  });
});
