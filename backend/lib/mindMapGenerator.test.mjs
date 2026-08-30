/**
 * Assessment Engine → textbook → Groq structuring → correct-knowledge mind map.
 * Run: node --test backend/lib/mindMapGenerator.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildLocalMindMap,
  generateMindMapFromMistakes,
  mergeAiOntoAttempts,
  toClientShape,
  identifyCentralConcept,
} from './mindMapGenerator.mjs';
import { retrieveTextbookChunks, setTextbookChunks } from './textbookRetrieve.mjs';
import { extractAuthoritativeCorrectAnswer } from '../../frontend/src/assessmentEngine/engineCorrectAnswer.js';
import { buildFrustrationAdaptation } from '../../frontend/src/data/frustrationModel.js';

function miss(overrides = {}) {
  return {
    questionId: 'q-flower-1',
    questionType: 'MCQ',
    question: 'How do flowering plants reproduce?',
    prompt: 'How do flowering plants reproduce?',
    studentAnswer: 'By stem transport',
    correctAnswer: 'By seeds',
    isCorrect: false,
    topic: 'Plant Biology',
    topic_id: 'G6_S1_ORG_CHARS',
    grade: 6,
    ...overrides,
  };
}

describe('authoritative Assessment Engine key', () => {
  it('keeps the engine MCQ option on the generated map', () => {
    const map = buildLocalMindMap([miss({ questionType: 'MCQ' })]);
    assert.equal(map.branches[0].correct_answer, 'By seeds');
    assert.equal(map.branches[0].student_answer, '');
  });

  it('keeps fill-in blanks from the engine', () => {
    const map = buildLocalMindMap([
      miss({
        questionType: 'FillInTheBlank',
        question: 'Flowering plants produce [____] that grow into [____].',
        correctAnswer: 'seeds | new plants',
        acceptedAnswers: ['seeds', 'new plants'],
        missedBlanks: [
          { blankIndex: 1, correctAnswer: 'seeds', studentAnswer: 'stems' },
          { blankIndex: 2, correctAnswer: 'new plants', studentAnswer: 'water' },
        ],
      }),
    ]);
    assert.match(map.branches[0].correct_answer, /seeds/i);
    assert.match(map.branches[0].correct_answer, /new plants/i);
  });

  it('keeps True/False polarity from the engine', () => {
    const map = buildLocalMindMap([
      miss({
        questionType: 'TrueFalse',
        question: 'Flowering plants produce seeds.',
        studentAnswer: 'False',
        correctAnswer: 'True',
      }),
    ]);
    assert.equal(map.branches[0].correct_answer, 'True');
  });

  it('keeps a short-answer ideal key from the engine', () => {
    const map = buildLocalMindMap([
      miss({
        questionType: 'ShortAnswer',
        correctAnswer: 'They grow into new plants',
        studentAnswer: 'Stems carry water',
      }),
    ]);
    assert.equal(map.branches[0].correct_answer, 'They grow into new plants');
  });
});

describe('Groq cannot replace the engine key', () => {
  it('discards a Groq graph that changes the correct answer', () => {
    const attempts = [miss()];
    const merged = mergeAiOntoAttempts(attempts, {
      branches: [
        {
          miss_index: 1,
          correct_answer: 'By xylem transport',
          concept_graph: {
            concept: 'Wrong',
            nodes: [
              { id: 'a', label: 'Xylem', kind: 'correct', explanation: 'guess' },
              { id: 'b', label: 'Water', kind: 'related', explanation: 'guess' },
              { id: 'c', label: 'Stem', kind: 'related', explanation: 'guess' },
            ],
            relationships: [
              { from: 'a', to: 'b', label: 'carries' },
              { from: 'b', to: 'c', label: 'in' },
            ],
          },
        },
      ],
    });
    assert.equal(merged.branches[0].correct_answer, 'By seeds');
    const labels = (merged.branches[0].concept_graph?.nodes || []).map((n) =>
      String(n.label).toLowerCase(),
    );
    assert.equal(labels.some((l) => l === 'xylem'), false);
  });
});

describe('student wrong answer stays off the mind map', () => {
  it('does not put the student response on nodes or client fields', () => {
    const map = toClientShape(buildLocalMindMap([miss()]));
    assert.equal(map.branches[0].studentAnswer, '');
    assert.equal(map.branches[0].why, '');
    const labels = (map.branches[0].conceptGraph?.nodes || []).map((n) => n.label);
    assert.equal(labels.some((l) => /stem transport/i.test(l)), false);
    assert.equal(
      (map.branches[0].conceptGraph?.nodes || []).some((n) => n.kind === 'mixup'),
      false,
    );
  });
});

describe('missing engine key does not guess', () => {
  it('returns Mind Map unavailable instead of inventing an answer', async () => {
    const result = await generateMindMapFromMistakes({
      attempts: [
        {
          questionId: 'q-missing-9',
          questionType: 'MCQ',
          question: 'How do flowering plants reproduce?',
          studentAnswer: 'Stems',
          isCorrect: false,
        },
      ],
    });
    assert.equal(result.unavailable, true);
    assert.equal(result.error, 'MIND_MAP_UNAVAILABLE');
    assert.deepEqual(result.questionIds, ['q-missing-9']);
    assert.equal(result.mindMap.unavailable, true);
    assert.equal(result.mindMap.branches.length, 0);
    assert.equal(/unavailable/i.test(result.mindMap.title || result.mindMap.root), true);
  });
});

describe('textbook retrieval for explanation', () => {
  it('retrieves official chunks using the engine answer, not the student miss', () => {
    setTextbookChunks([
      {
        id: 'plants',
        text: 'Flowering plants produce seeds. Seeds grow into new plants.',
        grade: 6,
        chapter_id: 'G6_C01',
        topic_id: 'G6_S1_ORG_CHARS',
        chapter_name: 'Wonders of the Living World',
      },
      {
        id: 'stems',
        text: 'The stem transports water and minerals. Xylem is unbranched in some plants.',
        grade: 8,
        chapter_id: 'G8_C03',
        topic_id: 'G8_S3_PLA_PARTS',
        chapter_name: 'Plant Parts',
      },
    ]);
    const hits = retrieveTextbookChunks({
      question: 'How do flowering plants reproduce?',
      correctAnswer: 'By seeds',
      studentAnswer: 'The stem transports water through xylem',
      topic_id: 'G6_S1_ORG_CHARS',
      grade: 6,
    });
    assert.equal(hits[0].id, 'plants');
    setTextbookChunks(null);
  });
});

describe('extract engine grade without catalog fallback', () => {
  it('reads correct_answer from the grade payload for every type', () => {
    assert.equal(
      extractAuthoritativeCorrectAnswer({
        correct_answer: 'B — By seeds',
        is_correct: false,
      }),
      'B — By seeds',
    );
    assert.equal(
      extractAuthoritativeCorrectAnswer({
        correct_answer: 'True',
        is_correct: false,
      }),
      'True',
    );
    assert.equal(
      extractAuthoritativeCorrectAnswer({
        accepted_answers: ['seeds', 'new plants'],
        is_correct: false,
      }),
      'seeds | new plants',
    );
    assert.equal(
      extractAuthoritativeCorrectAnswer({
        ideal_answer: 'They grow into new plants',
        is_correct: false,
      }),
      'They grow into new plants',
    );
  });

  it('does not invent a key from missing grade data', () => {
    assert.equal(
      extractAuthoritativeCorrectAnswer({ is_correct: false, feedback: 'Incorrect.' }),
      '',
    );
  });
});

describe('Sage teaching follows frustration', () => {
  it('uses a shorter explanation at very high frustration than at low', () => {
    const high = buildLocalMindMap([miss()], buildFrustrationAdaptation(92));
    const low = buildLocalMindMap([miss()], buildFrustrationAdaptation(12));
    const highExplain = high.branches[0].key_concept_explain || '';
    const lowExplain = low.branches[0].key_concept_explain || '';
    assert.ok(highExplain.length);
    assert.ok(lowExplain.length);
    assert.ok(highExplain.length <= lowExplain.length + 20);
    assert.equal(high.branches[0].correct_answer, 'By seeds');
  });
});

describe('question-type-aware correct-knowledge maps', () => {
  it('uses the scientific concept as the MCQ root, not the answer sentence', () => {
    const map = buildLocalMindMap([
      miss({
        question: 'What do plants need for photosynthesis?',
        prompt: 'What do plants need for photosynthesis?',
        correctAnswer: 'Sunlight, water and carbon dioxide',
        studentAnswer: 'Only soil',
        topic: 'Science',
      }),
    ]);
    assert.match(map.title, /photosynthesis/i);
    assert.equal(/only soil/i.test(JSON.stringify(map.branches[0].pedagogy)), false);
  });

  it('teaches a false True/False item without quoting the false statement', () => {
    const statement = 'Plants reproduce only by stem cuttings.';
    const map = buildLocalMindMap([
      miss({
        questionType: 'TrueFalse',
        question: statement,
        prompt: statement,
        correctAnswer: 'False',
        studentAnswer: 'True',
        topic: 'Plant Reproduction',
      }),
    ]);
    const blob = JSON.stringify(map.branches[0].pedagogy || []);
    assert.equal(blob.includes(statement), false);
    assert.match(map.branches[0].topic, /plant/i);
  });

  it('keeps fill-in engine terms on the map', () => {
    const map = buildLocalMindMap([
      miss({
        questionType: 'FillInTheBlank',
        question: 'Flowering plants produce [____] that grow into [____].',
        correctAnswer: 'seeds | new plants',
        acceptedAnswers: ['seeds', 'new plants'],
        studentAnswer: 'stems | water',
      }),
    ]);
    const blob = JSON.stringify(map.branches[0]);
    assert.match(blob, /seeds/i);
    assert.match(blob, /new plants/i);
    assert.equal(/stems \| water/i.test(blob), false);
  });

  it('maps matching relationships from the engine key', () => {
    const map = buildLocalMindMap([
      miss({
        questionType: 'Matching',
        topic: 'Animal Adaptations',
        question: 'Match each adaptation to its job.',
        correctAnswer:
          'Camouflage → Helps animals blend with surroundings | Thick fur → Insulation in cold environments',
        studentAnswer: 'Camouflage → Helps swimming',
      }),
    ]);
    const kids = (map.branches[0].pedagogy || []).flatMap((p) => p.children || []);
    assert.equal(kids.some((c) => /camouflage/i.test(c) && /blend/i.test(c)), true);
    assert.equal(kids.some((c) => /helps swimming/i.test(c)), false);
  });

  it('does not copy a short-answer student response', () => {
    const map = buildLocalMindMap([
      miss({
        questionType: 'ShortAnswer',
        correctAnswer: 'They grow into new plants',
        studentAnswer: 'Pizza is a type of soil nutrient',
      }),
    ]);
    const blob = JSON.stringify(toClientShape(map).branches[0]);
    assert.match(blob, /new plants/i);
    assert.equal(/pizza/i.test(blob), false);
  });

  it('stays minimal when textbook retrieval finds nothing', () => {
    setTextbookChunks([]);
    const map = buildLocalMindMap([
      miss({
        topic_id: 'NO_SUCH_TOPIC',
        correctAnswer: 'Heart',
        question: 'Which organ pumps blood around the human body?',
        studentAnswer: 'Lungs',
      }),
    ]);
    assert.equal(map.branches[0].correct_answer, 'Heart');
    const titles = (map.branches[0].pedagogy || []).map((p) => p.title);
    assert.ok(titles.includes('Correct concept') || titles.includes('Correct idea'));
    const blob = JSON.stringify(map.branches[0]);
    assert.equal(/\blungs\b/i.test(blob), false);
    setTextbookChunks(null);
  });
});

describe('central concept identification', () => {
  it('names Heart from a short engine answer', () => {
    assert.equal(
      identifyCentralConcept({
        question: 'Which organ pumps blood around the human body?',
        prompt: 'Which organ pumps blood around the human body?',
        correctAnswer: 'Heart',
        questionType: 'MCQ',
        topic: 'Science',
      }),
      'Heart',
    );
  });
});
