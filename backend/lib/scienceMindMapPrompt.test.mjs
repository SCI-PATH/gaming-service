/**
 * Run: node --test backend/lib/scienceMindMapPrompt.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatContext,
  presentationBand,
  systemPrompt,
  userPrompt,
} from './scienceMindMapPrompt.mjs';

describe('presentationBand', () => {
  it('maps 0–100 into the five presentation bands without changing stored CSF labels', () => {
    assert.equal(presentationBand(0), 'VERY_LOW');
    assert.equal(presentationBand(20), 'VERY_LOW');
    assert.equal(presentationBand(21), 'LOW');
    assert.equal(presentationBand(50), 'MODERATE');
    assert.equal(presentationBand(80), 'HIGH');
    assert.equal(presentationBand(81), 'VERY_HIGH');
    assert.equal(presentationBand(100), 'VERY_HIGH');
  });
});

describe('prompts', () => {
  it('grounds Grok in retrieved chunks and presentation-only frustration', () => {
    const system = systemPrompt();
    assert.match(system, /ground/i);
    assert.match(system, /presentation/i);
    assert.match(system, /curriculum IDs/i);
    assert.match(system, /semantic relationships/i);
    assert.match(system, /source of truth/i);
    const user = userPrompt({
      grade: 7,
      question: 'Why do plants need sunlight?',
      studentAnswer: 'Because they like yellow light',
      frustrationScore: 88,
      frustrationLevel: 'VERY_HIGH',
      retrievalQuery: 'plants sunlight photosynthesis',
      context: '[Source 1]\ntext: Plants make food using sunlight.',
    });
    assert.match(user, /Grade:\n7/);
    assert.match(user, /VERY_HIGH/);
    assert.match(user, /Plants make food using sunlight/);
    assert.match(user, /Student Answer/);
    assert.match(user, /yellow light/);
    assert.match(user, /source of truth/i);
    assert.doesNotMatch(user, /Allowed mind-map keywords/i);
    assert.match(user, /do NOT change facts/i);
  });

  it('formats RAG chunks with citations the model may reuse', () => {
    const text = formatContext([
      {
        chunk_id: 'grade7_plants_012_001',
        textbook: 'Grade 7 Science Part I',
        grade: 7,
        chapter: 'Food from plants',
        page: 12,
        role: 'primary',
        text: 'Green plants make food by photosynthesis.',
      },
    ]);
    assert.match(text, /grade7_plants_012_001/);
    assert.match(text, /photosynthesis/);
  });
});
