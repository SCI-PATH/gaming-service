/**
 * Run: node --test backend/lib/ragKeywords.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractRagKeywords,
  mindMapFromKeywords,
  snapMindMapToKeywords,
} from './ragKeywords.mjs';

describe('extractRagKeywords', () => {
  it('keeps RAG pipeline tokens and matching textbook phrases', () => {
    const keywords = extractRagKeywords({
      keywords: ['plants', 'sunlight', 'photosynthesis'],
      retrievalQuery: 'plants sunlight photosynthesis',
      question: 'Why do plants need sunlight?',
      chunks: [
        {
          text: 'Green plants make food by photosynthesis using sunlight, water and carbon dioxide. The process is called photosynthesis.',
          hybrid_score: 0.8,
        },
      ],
    });
    const blob = keywords.join(' ').toLowerCase();
    assert.match(blob, /photosynthesis/);
    assert.match(blob, /sunlight/);
    assert.equal(/activity/i.test(blob), false);
    assert.ok(keywords.every((k) => k.split(/\s+/).length <= 4));
  });

  it('drops PDF leftovers from keyword nodes', () => {
    const map = mindMapFromKeywords({
      question: 'Plant leaves come in various shapes. Photosynthesis occurs in the leaves.',
      retrievalQuery: 'leaves photosynthesis',
      chunks: [
        {
          chunk_id: 'messy',
          textbook: 'Grade 7 Science Part I',
          chapter: 'Plant Diversity',
          text: 'Science | Plant Diversity 13Science | Plant Diversity12 Activity 1.2 Figure 1.3 Parts of a flowering plant. Photosynthesis mainly occurs in a leaf of a plant. Plant leaves get energy from sunlight to do photosynthesis.',
        },
      ],
    });
    const blob = JSON.stringify(map);
    assert.match(blob, /photosynthesis/i);
    assert.equal(/activity 1\.2/i.test(blob), false);
    assert.equal(/science \|/i.test(blob), false);
    assert.ok(map.branches.length >= 1);
  });
});

describe('snapMindMapToKeywords', () => {
  it('rewrites sentence nodes onto allowed RAG keywords', () => {
    const snapped = snapMindMapToKeywords(
      {
        status: 'success',
        title: 'Green plants make food using sunlight in leaves',
        central_concept: 'Green plants make food using sunlight in leaves',
        branches: [
          {
            title: 'What plants need',
            points: [{ text: 'Plants use sunlight, water and carbon dioxide for photosynthesis.' }],
          },
        ],
      },
      ['Photosynthesis', 'Sunlight', 'Carbon Dioxide', 'Water'],
    );
    assert.equal(snapped.central_concept.toLowerCase().includes('photosynthesis') || snapped.central_concept.split(/\s+/).length <= 4, true);
    assert.ok(snapped.branches[0].points[0].text.split(/\s+/).length <= 4);
    assert.match(JSON.stringify(snapped.branches[0].points), /sunlight|photosynthesis|water|carbon/i);
  });
});
