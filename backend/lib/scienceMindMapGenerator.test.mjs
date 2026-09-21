/**
 * Run: node --test backend/lib/scienceMindMapGenerator.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateScienceMindMap } from './scienceMindMapGenerator.mjs';

const CHUNK = {
  chunk_id: 'grade6_plants_010_001',
  text: 'Green plants make food by photosynthesis using sunlight, water and carbon dioxide.',
  hybrid_score: 0.81,
  grade: 6,
  textbook: 'Grade 6 Science',
  chapter: 'Food and photosynthesis',
  page: 10,
  role: 'primary',
};

function grokPayload(overrides = {}) {
  return JSON.stringify({
    status: 'success',
    title: 'Photosynthesis',
    central_concept: 'Photosynthesis',
    summary: 'Plants make food using sunlight.',
    branches: [
      {
        title: 'What plants need',
        points: [{ text: 'Sunlight, water and carbon dioxide' }],
      },
      { title: 'What they make', points: [{ text: 'Food and oxygen' }] },
    ],
    key_terms: [{ term: 'photosynthesis', meaning: 'making food with sunlight' }],
    examples: ['A green leaf in sunlight'],
    remember_this: ['No sunlight means no food making'],
    one_sentence_summary: 'Green plants make food using sunlight.',
    ...overrides,
  });
}

describe('generateScienceMindMap', () => {
  it('returns insufficient_context when Chroma has no matching chunks', async () => {
    const result = await generateScienceMindMap(
      { grade: 6, question: 'What is photosynthesis?', studentId: 'maya' },
      {
        queryChunks: async () => ({
          original_question: 'What is photosynthesis?',
          retrieval_query: 'photosynthesis',
          chunks: [],
          enough: false,
          confidence: 0,
          used_cross_grade: false,
          collection_count: 0,
        }),
        readExistingFrustration: async () => ({
          frustrationScore: 50,
          frustrationLevel: 'MODERATE',
          missing: true,
        }),
        grokJson: async () => {
          throw new Error('Grok should not run without textbook chunks');
        },
      },
    );
    assert.equal(result.status, 'insufficient_context');
    assert.equal(result.mind_map, null);
  });

  it('sends retrieved chunks and existing frustration to Grok', async () => {
    let seenUser = '';
    const result = await generateScienceMindMap(
      { grade: 6, question: 'Why do plants need sunlight?', studentId: 'maya' },
      {
        queryChunks: async () => ({
          original_question: 'Why do plants need sunlight?',
          retrieval_query: 'plants sunlight photosynthesis',
          chunks: [CHUNK],
          enough: true,
          confidence: 0.81,
          used_cross_grade: false,
          collection_count: 12,
        }),
        readExistingFrustration: async () => ({
          frustrationScore: 88,
          frustrationLevel: 'VERY_HIGH',
          storedLevel: 'high',
          missing: false,
        }),
        grokJson: async ({ user }) => {
          seenUser = user;
          return { content: grokPayload(), provider: 'xai', model: 'grok-test' };
        },
      },
    );
    assert.equal(result.status, 'success');
    assert.equal(result.mind_map.central_concept, 'Photosynthesis');
    assert.equal(result.frustration.frustrationScore, 88);
    assert.equal(result.frustration.frustrationLevel, 'VERY_HIGH');
    assert.match(seenUser, /photosynthesis using sunlight/);
    assert.match(seenUser, /88/);
    assert.equal(result.sources[0].chunk_id, CHUNK.chunk_id);
  });

  it('rejects grades outside 6–9', async () => {
    await assert.rejects(
      () => generateScienceMindMap({ grade: 5, question: 'cells' }),
      /Grade 6, 7, 8, or 9/,
    );
  });
});
