/**
 * Chapter labels for the student dashboard.
 * Run: node --test frontend/src/data/curriculumTopics.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chapterDisplayName,
  chapterIdFromTopicId,
  resolveChapterFromEngine,
} from './curriculumTopics.js';
import { frustrationByTopic } from './frustrationHistoryStore.js';

describe('chapterDisplayName', () => {
  it('uses the assessment-engine chapter title, not the skill card label', () => {
    assert.equal(
      chapterDisplayName('G7_C1_PLA_DIVER'),
      'Ch.1: Plant Diversity',
    );
    assert.equal(
      chapterDisplayName('G7_C1_PLA_CLASSIF'),
      'Ch.1: Plant Diversity',
    );
    assert.doesNotMatch(
      chapterDisplayName('G7_C1_PLA_DIVER'),
      /Morphological features/,
    );
    assert.doesNotMatch(
      chapterDisplayName('G7_C1_PLA_CLASSIF'),
      /Monocotyledonous/,
    );
  });

  it('resolves a canonical chapter id', () => {
    assert.equal(chapterIdFromTopicId('G7_C1_PLA_DIVER'), 'G7_C1');
    assert.equal(chapterDisplayName('G7_C1'), 'Ch.1: Plant Diversity');
  });
});

describe('resolveChapterFromEngine', () => {
  it('prefers IAE chapter_name plus topic_id', () => {
    const hit = resolveChapterFromEngine({
      chapter_name: 'Plant Diversity',
      topic_id: 'G7_C1_PLA_DIVER',
    });
    assert.equal(hit.chapterId, 'G7_C1');
    assert.equal(hit.chapterName, 'Plant Diversity');
    assert.equal(hit.label, 'Ch.1: Plant Diversity');
  });
});

describe('frustrationByTopic', () => {
  it('groups two skills in the same chapter onto one official chapter name', () => {
    const rows = frustrationByTopic([
      {
        topic: 'G7_C1_PLA_DIVER',
        missCount: 1,
        chapter_name: 'Plant Diversity',
        chapter_id: 'G7_C1',
      },
      {
        topic: 'G7_C1_PLA_CLASSIF',
        missCount: 2,
        chapter_name: 'Plant Diversity',
        chapter_id: 'G7_C1',
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].topic, 'Ch.1: Plant Diversity');
    assert.equal(rows[0].misses, 3);
    assert.doesNotMatch(rows[0].topic, /Morphological|Monocotyledonous/);
  });
});
