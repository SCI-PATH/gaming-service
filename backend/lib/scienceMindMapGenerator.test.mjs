/**
 * Run: node --test backend/lib/scienceMindMapGenerator.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateScienceMindMap, mindMapFromChunks } from './scienceMindMapGenerator.mjs';

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
    paragraph:
      'Green plants make food by photosynthesis using sunlight, water and carbon dioxide.',
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
    assert.match(result.mind_map.paragraph, /photosynthesis/i);
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

  it('does not turn a fill-in worksheet into the explanation', () => {
    const map = mindMapFromChunks({
      question: 'Temperature can be measured using a thermometer.',
      chunks: [
        {
          chunk_id: 'worksheet',
          textbook: 'Grade 6 Science',
          chapter: 'Heat',
          text: 'Temperature can be measured using a [_____], which accurately indicates the degree of heat present. A clinical thermometer is specifically designed to measure [_____].',
        },
        {
          chunk_id: 'theory',
          textbook: 'Grade 6 Science',
          chapter: 'Heat',
          text: 'When a solid is heated to its melting point, it changes into a liquid. A clinical thermometer measures body temperature.',
        },
      ],
    });
    assert.match(map.paragraph, /melting point|body temperature/i);
    assert.equal(/\[_____\]/.test(map.paragraph), false);
  });

  it('extracts clean textbook facts from messy PDF chunks', () => {
    const map = mindMapFromChunks({
      question: 'Plant leaves come in various shapes. Photosynthesis occurs in the leaves.',
      chunks: [
        {
          chunk_id: 'messy',
          textbook: 'Grade 7 Science Part I',
          chapter: 'Plant Diversity',
          text: 'Science | Plant Diversity 13Science | Plant Diversity12 Activity 1.2 Figure 1.3 Parts of a flowering plant. Photosynthesis mainly occurs in a leaf of a plant. Plant leaves get energy from sunlight to do photosynthesis. Flowering plants can be divided into two groups as monocotyledonous (monocot) plants and dicotyledonous (dicot) plants.',
        },
      ],
    });
    const blob = JSON.stringify(map);
    assert.match(blob, /photosynthesis/i);
    assert.equal(/activity 1\.2/i.test(blob), false);
    assert.equal(/science \|/i.test(blob), false);
    assert.match(map.paragraph, /photosynthesis/i);
    assert.equal(map.branches.length, 0);
  });

  it('builds a textbook map from Chroma chunks when Grok fails', async () => {
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
          frustrationScore: 40,
          frustrationLevel: 'LOW',
          missing: true,
        }),
        grokJson: async () => {
          throw Object.assign(new Error('Mind map generation is temporarily unavailable'), {
            retryable: true,
          });
        },
      },
    );
    assert.equal(result.status, 'success');
    assert.equal(result.provider, 'chroma-extractive');
    assert.match(result.mind_map.central_concept, /photosynthesis/i);
    assert.match(result.mind_map.paragraph, /sunlight/);
    assert.equal(result.sources[0].chunk_id, CHUNK.chunk_id);
  });

  it('passes the question chapter_id and topic_id into the Chroma filter', async () => {
    let payload = null;
    await generateScienceMindMap(
      {
        grade: 6,
        question: 'What are the poles of a magnet?',
        studentAnswer: 'east and west',
        correctAnswer: 'north and south',
        topic_id: 'G6_S7_MAG_POLES',
      },
      {
        queryChunks: async (body) => {
          payload = body;
          return {
            original_question: 'What are the poles of a magnet?',
            retrieval_query: 'poles magnet',
            chunks: [],
            enough: false,
            confidence: 0,
            collection_count: 4,
          };
        },
        readExistingFrustration: async () => ({
          frustrationScore: 40,
          frustrationLevel: 'LOW',
          missing: true,
        }),
        grokJson: async () => {
          throw new Error('Grok should not run without textbook chunks');
        },
      },
    );
    assert.equal(payload.grade, 6);
    assert.match(payload.question, /poles of a magnet/i);
    assert.equal(payload.chapter_id, 'G6_C07');
    assert.equal(payload.topic_id, 'G6_S7_MAG_POLES');
  });

  it('omits chapter filters when the question has no chapter or topic id', async () => {
    const seen = [];
    const questions = [
      { grade: 6, question: 'What is a magnet used for?' },
      { grade: 7, question: 'How are acids different from bases?' },
      { grade: 8, question: 'What is a closed electric circuit?' },
      { grade: 9, question: 'What is density?' },
    ];
    for (const body of questions) {
      await generateScienceMindMap(body, {
        queryChunks: async (payload) => {
          seen.push(payload);
          return {
            original_question: body.question,
            retrieval_query: body.question,
            chunks: [],
            enough: false,
            confidence: 0,
            collection_count: 0,
          };
        },
        readExistingFrustration: async () => ({
          frustrationScore: 40,
          frustrationLevel: 'LOW',
          missing: true,
        }),
        grokJson: async () => {
          throw new Error('Grok should not run without textbook chunks');
        },
      });
    }
    assert.equal(seen.length, questions.length);
    for (const [i, payload] of seen.entries()) {
      assert.equal(payload.grade, questions[i].grade);
      assert.equal(payload.question, questions[i].question);
      assert.equal('chapter' in payload, false);
      assert.equal('chapter_id' in payload, false);
      assert.equal('topic_id' in payload, false);
    }
  });
});
