import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
  setTextbookChunks,
  retrieveTextbookChunks,
  graphFromTextbookChunks,
  excerptForQuestion,
} from './textbookRetrieve.mjs';

describe('textbook-grounded mind maps', () => {
  it('retrieves the matching chapter chunk by topic_id', () => {
    setTextbookChunks([
      {
        id: 'G6_C10::p162::c1',
        text: 'Green plants produce food by photosynthesis. They take in carbon dioxide and water in the presence of sunlight and make glucose. Oxygen is released.',
        grade: 6,
        chapter_id: 'G6_C10',
        topic_id: 'G6_S10_FOO_INTERAC',
        chapter_name: 'Food-related Interactions',
      },
      {
        id: 'G6_C07::p113::c1',
        text: 'A magnet has two poles called the north pole and the south pole.',
        grade: 6,
        chapter_id: 'G6_C07',
        topic_id: 'G6_S7_MAG_POLES',
        chapter_name: 'Magnets',
      },
    ]);
    const hits = retrieveTextbookChunks({
      question: 'What gas do plants take in during photosynthesis?',
      correctAnswer: 'Carbon dioxide',
      studentAnswer: 'Oxygen',
      topic_id: 'G6_S10_FOO_INTERAC',
      grade: 6,
    });
    assert.equal(hits[0].chapter_id, 'G6_C10');
    const graph = graphFromTextbookChunks(
      {
        question: 'What gas do plants take in during photosynthesis?',
        correctAnswer: 'Carbon dioxide',
        studentAnswer: 'Oxygen',
        topic_id: 'G6_S10_FOO_INTERAC',
      },
      hits,
    );
    assert.ok(graph);
    assert.ok(graph.nodes.some((n) => /carbon dioxide|photosynthesis/i.test(n.label)));
    const excerpt = excerptForQuestion({
      question: 'What gas do plants take in during photosynthesis?',
      topic_id: 'G6_S10_FOO_INTERAC',
    });
    assert.match(excerpt, /carbon dioxide|photosynthesis/i);
  });

  it('grounds transpiration in the official plant-parts chapter', () => {
    setTextbookChunks(null);
    const hits = retrieveTextbookChunks({
      question: 'Water moving from plant leaves into the air is called',
      correctAnswer: 'Transpiration',
      studentAnswer: 'Precipitation',
      topic_id: 'G8_S3_PLA_PARTS',
      grade: 8,
    });
    assert.ok(hits.length, 'expected ingested textbook chunks');
    assert.equal(hits[0].chapter_id, 'G8_C03');
    const graph = graphFromTextbookChunks(
      {
        question: 'Water moving from plant leaves into the air is called',
        correctAnswer: 'Transpiration',
        studentAnswer: 'Precipitation',
        topic_id: 'G8_S3_PLA_PARTS',
        grade: 8,
      },
      hits,
    );
    assert.ok(graph);
    assert.ok(graph.learningPath.some((s) => /transpir/i.test(s)));
  });
});

after(() => setTextbookChunks(null));
