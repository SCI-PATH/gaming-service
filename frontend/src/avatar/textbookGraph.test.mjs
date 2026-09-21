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
import { buildConceptGraph, validateConceptGraph } from './conceptGraph.js';

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

  it('uses a skill name and complete phrases for any missed question', () => {
    const miss = {
      question: 'Which of the following statements correctly describes how sound is produced in various musical instruments?',
      correctAnswer: 'A guitar produces sound through the vibration of its strings',
      studentAnswer: 'A guitar produces sound through air only',
      topic: 'G7_C11_SOU_PRODUCE',
      topic_id: 'G7_C11_SOU_PRODUCE',
      questionType: 'MCQ',
      grade: 7,
    };
    const graph = graphFromTextbookSentences(
      miss,
      [
        'Thus, it is clear that sound propagates through the thread.',
        'Sound is produced by the vibration of air.',
        'A guitar produces sound through the vibration of its strings.',
        'This type of trembling is felt because of the vibration of membranes in the throat which are known as vocal cords.',
      ],
      { chapter_name: 'Sound', chapter_id: 'G7_C11', grade: 7 },
    );
    const labels = (graph.nodes || []).map((n) => n.label);
    assert.equal(labels.some((l) => /G7_C11/i.test(l)), false);
    assert.ok(/production of sound/i.test(graph.concept) || /production of sound/i.test(labels.join(' ')));
    assert.equal(labels.some((l) => /through$/i.test(l) || /\bthe$/i.test(l)), false);
    assert.ok(labels.some((l) => /vibrat|string|guitar|air/i.test(l)));
    assert.equal((graph.learningPath || []).some((s) => /^thus,/i.test(s)), false);
    assert.equal(/G7_C11|textbook idea/i.test(graph.practice?.question || ''), false);
    assert.equal(validateConceptGraph(graph, miss).ok, true);
  });
});

describe('question-relevant rock maps', () => {
  it('maps metamorphism without lichens or limestone leftovers', () => {
    const g = buildConceptGraph({
      question: 'What process causes sedimentary rocks to transform into metamorphic rocks?',
      correctAnswer: 'Extreme pressure and temperature',
      studentAnswer: 'Erosion',
      topic: 'Features and kinds of rocks and minerals',
      questionType: 'MCQ',
    });
    const blob = `${(g.nodes || []).map((n) => n.label).join(' ')} ${(g.learningPath || []).join(' ')}`;
    assert.match(g.concept, /metamorphic/i);
    assert.ok(blob.match(/pressure|temperature|metamorphic/i));
    assert.equal(/lichen/i.test(blob), false);
    assert.equal(/limestone got|conclusion is/i.test(blob), false);
    assert.equal(/plant biology/i.test(blob), false);
    assert.equal(validateConceptGraph(g, { correctAnswer: 'Extreme pressure and temperature' }).ok, true);
  });

  it('splits a limestone fill-in into rock-type ideas, not Plant Biology', () => {
    const g = buildConceptGraph({
      question:
        'Limestone is classified as a [____], which is formed from the remains of dead animals and plants. It is one of the types of [____], which can also include rocks made from molten magma. Additionally, when [____], sedimentary rocks can change into metamorphic rocks under extreme pressure and temperature.',
      correctAnswer: 'sedimentary rock · igneous rocks · extreme pressure and temperature',
      topic: 'Plant Biology',
      questionType: 'FillInTheBlank',
      missedBlanks: [
        { blankIndex: 1, correctAnswer: 'sedimentary rock' },
        { blankIndex: 2, correctAnswer: 'igneous rocks' },
        { blankIndex: 3, correctAnswer: 'extreme pressure and temperature' },
      ],
    });
    const labels = (g.nodes || []).map((n) => n.label.toLowerCase());
    assert.equal(labels.some((l) => /plant biology/.test(l)), false);
    assert.equal(labels.some((l) => /^hold /.test(l)), false);
    assert.ok(labels.some((l) => /sedimentary/.test(l)));
    assert.ok(labels.some((l) => /igneous/.test(l)));
    assert.equal(/plant biology/i.test(g.practice?.question || ''), false);
  });

  it('teaches heating and cooling as weathering, not True', () => {
    const g = buildConceptGraph({
      question: 'Rocks can break into pieces due to heating and cooling processes.',
      correctAnswer: 'True',
      studentAnswer: 'False',
      topic: 'Rock weathering and rock cycle',
      questionType: 'TrueFalse',
    });
    const labels = (g.nodes || []).map((n) => n.label);
    assert.equal(labels.some((l) => /^(true|false)$/i.test(l)), false);
    assert.ok(labels.some((l) => /weather|heat|cool|break/i.test(l)));
    assert.equal(labels.some((l) => /lichen/i.test(l)), false);
  });
});
