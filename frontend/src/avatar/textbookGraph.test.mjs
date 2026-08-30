/**
 * Textbook-grounded concept graphs from EduPub chapter sentences.
 * Run: node --test frontend/src/avatar/textbookGraph.test.mjs
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
  setTextbookDigest,
  buildTextbookGraph,
  graphFromTextbookSentences,
} from './textbookGraph.js';
import { validateConceptGraph } from './conceptGraph.js';

after(() => setTextbookDigest(null));

describe('textbook chapter graphs', () => {
  it('builds a map from official chapter sentences and topic_id', () => {
    setTextbookDigest([
      {
        grade: 6,
        chapter_id: 'G6_C01',
        topic_id: 'G6_S1_ORG_CHARS',
        chapter_name: 'Wonders of the Living World',
        sentences: [
          'Most green plants produce food within themselves. Hence, these plants are called autotrophic.',
          'They use carbon dioxide from air, soil water and sun light to produce food.',
          'This process is called photosynthesis.',
          'During the process of photosynthesis, plants absorb carbon dioxide and release oxygen.',
        ],
      },
    ]);
    const miss = {
      question: 'What gas do plants take in during photosynthesis?',
      correctAnswer: 'Carbon dioxide',
      studentAnswer: 'Oxygen',
      topic_id: 'G6_S1_ORG_CHARS',
      grade: 6,
    };
    const graph = buildTextbookGraph(miss);
    assert.ok(graph);
    assert.equal(graph.chapter_id, 'G6_C01');
    assert.ok(graph.learningPath.some((s) => /photosynthesis|carbon dioxide/i.test(s)));
    assert.equal(validateConceptGraph(graph, miss).ok, true);
  });

  it('uses textbook wording on nodes, not placeholder boxes', () => {
    const graph = graphFromTextbookSentences(
      {
        question: 'Water leaving leaves into the air is called?',
        correctAnswer: 'Transpiration',
        studentAnswer: 'Precipitation',
      },
      [
        'Transpiration is the process of evaporation of water from plants.',
        'It mainly takes place through stomata in leaves.',
        'Transpiration helps to transport water to the upper parts of the plant.',
      ],
      { chapter_id: 'G8_C03', chapter_name: 'Diversity and Functions of Plant Parts', grade: 8 },
    );
    assert.ok(graph);
    assert.equal(graph.nodes.some((n) => /^(function|link|process)$/i.test(n.label)), false);
    assert.ok(graph.nodes.some((n) => /transpir/i.test(`${n.label} ${n.explanation}`)));
  });

  it('maps fill-in blanks to assessment answers, not chopped textbook lines', () => {
    const miss = {
      question:
        'Plants are vital for the environment as they produce [____], provide [____], and are a source of [____]. Additionally, they play a crucial role in [____].',
      correctAnswer: 'oxygen · food · medicine · pollination',
      studentAnswer: '4',
      topic: 'Ecology',
      questionType: 'FillInTheBlank',
      missedBlanks: [
        { blankIndex: 1, correctAnswer: 'oxygen', studentAnswer: '' },
        { blankIndex: 2, correctAnswer: 'food', studentAnswer: '' },
        { blankIndex: 3, correctAnswer: 'medicine', studentAnswer: '' },
        { blankIndex: 4, correctAnswer: 'pollination', studentAnswer: '' },
      ],
      frustrationLevel: 'moderate',
    };
    const graph = graphFromTextbookSentences(
      miss,
      [
        'Tabulate the plants you collected from the school garden.',
        'duce flowers and that is how some plants make seeds.',
        'Flowering plants and plants which do not produce flowers are grouped differently.',
        'Green plants produce oxygen during photosynthesis and also provide food.',
        'Many plants are a source of medicine.',
        'Flowers play a crucial role in pollination, which supports ecosystems.',
      ],
      { chapter_name: 'Plant Diversity', grade: 6 },
    );
    const labels = graph.nodes.map((n) => n.label.toLowerCase());
    assert.ok(labels.some((l) => l.includes('oxygen')));
    assert.ok(labels.some((l) => l.includes('food')));
    assert.ok(labels.some((l) => l.includes('medicine')));
    assert.ok(labels.some((l) => l.includes('pollination')));
    assert.equal(labels.some((l) => /^\d+$/.test(l)), false);
    assert.equal(labels.some((l) => /tabulate|duce flowers|and plants$/.test(l)), false);
    assert.equal(validateConceptGraph(graph, miss).ok, true);
  });
});
