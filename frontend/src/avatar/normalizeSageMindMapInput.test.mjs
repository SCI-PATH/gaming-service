/**
 * Shared SAGE mind-map input: MCQ / True-False stay choice-shaped;
 * Fill-in-the-Blank uses typed text + canonical correct.
 * Run: node --test frontend/src/avatar/normalizeSageMindMapInput.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractFillInStudentAnswer,
  normalizeSageMindMapInput,
  SAGE_QUESTION_TYPES,
} from './normalizeSageMindMapInput.js';
import { teachingLessonFromMiss } from './explainMisconception.js';
import {
  buildMisconceptionMindMap,
  compactTeachingState,
  composeTutorTurn,
} from './sageTutorLoop.js';

describe('MCQ normalization (must stay choice-based)', () => {
  it('keeps selected option text and correct option text', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'MCQ',
      question: 'Which gas is required for photosynthesis?',
      options: ['Oxygen', 'Helium', 'Carbon dioxide', 'Nitrogen'],
      correctIndex: 2,
      selectedText: 'Helium',
      isCorrect: false,
      topic: 'Photosynthesis',
      frustrationScore: 40,
    });
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.MCQ);
    assert.equal(input.studentAnswer, 'Helium');
    assert.equal(input.correctAnswer, 'Carbon dioxide');
    assert.equal(input.isCorrect, false);
    assert.ok(input.options.includes('Helium'));
  });
});

describe('True/False normalization (must stay TRUE/FALSE)', () => {
  it('keeps True/False tokens', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'TrueFalse',
      question: 'Plants use oxygen to make glucose during photosynthesis.',
      options: ['True', 'False'],
      selectedText: 'True',
      correctAnswer: 'False',
      isCorrect: false,
      topic: 'Photosynthesis',
      frustrationScore: 40,
    });
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.TrueFalse);
    assert.equal(input.studentAnswer, 'True');
    assert.equal(input.correctAnswer, 'False');
  });
});

describe('Fill-in-the-Blank normalization', () => {
  const prompt = 'Plants take in ________ during photosynthesis.';

  it('uses the typed student text and canonical correct answer', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'MultiBlank',
      question: prompt,
      studentAnswer: [' Oxygen ', ''],
      selectedText: 'Oxygen | ',
      grade: {
        missed_blanks: { '0': 'carbon dioxide' },
        feedback: 'Incorrect. The blanks are: carbon dioxide.',
        detailed_explanation: 'Expected blanks: carbon dioxide.',
      },
      isCorrect: false,
      topic: 'Photosynthesis',
      concept: 'Gas exchange in photosynthesis',
      frustrationScore: 70,
    });
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK);
    assert.equal(input.studentAnswer, 'oxygen');
    assert.equal(input.correctAnswer, 'carbon dioxide');
    assert.equal(input.canonicalCorrectAnswer, 'carbon dioxide');
    assert.equal(input.isCorrect, false);
    assert.equal(input.options.length, 0);
    assert.ok(input.studentAnswer !== undefined && input.correctAnswer !== undefined);
  });

  it('does not read options or selectedIndex', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'FILL_IN_THE_BLANK',
      question: prompt,
      options: ['Oxygen', 'Carbon dioxide'],
      correctIndex: 0,
      selectedIndex: 0,
      selectedOption: 'Oxygen',
      studentAnswer: 'oxygen',
      correctAnswer: 'carbon dioxide',
      isCorrect: false,
    });
    assert.equal(input.studentAnswer, 'oxygen');
    assert.equal(input.correctAnswer, 'carbon dioxide');
    assert.equal(input.canonicalCorrectAnswer, 'carbon dioxide');
    assert.deepEqual(input.options, []);
  });

  it('normalizes spacing and capitalization without replacing the concept', () => {
    const typed = extractFillInStudentAnswer({ studentAnswer: ' Carbon dioxide ' });
    assert.equal(typed, 'carbon dioxide');
    const wrong = extractFillInStudentAnswer({ studentAnswer: 'oxygen' });
    assert.equal(wrong, 'oxygen');
    assert.notEqual(wrong, 'carbon dioxide');
  });

  it('preserves multiple accepted answers and keeps the student text', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'MultiBlank',
      question: prompt,
      studentAnswer: 'CO2',
      acceptedAnswers: ['carbon dioxide', 'CO2', 'CO₂'],
      isCorrect: true,
    });
    assert.equal(input.studentAnswer, 'co2');
    assert.equal(input.canonicalCorrectAnswer, 'carbon dioxide');
    assert.ok(input.acceptedAnswers.includes('carbon dioxide'));
    assert.ok(input.acceptedAnswers.includes('co2'));
  });

  it('feeds the same SAGE mind-map pipeline as MCQ/T/F', () => {
    const input = normalizeSageMindMapInput({
      questionType: 'MultiBlank',
      question: prompt,
      studentAnswer: ['oxygen', ''],
      selectedText: 'oxygen | ',
      correctAnswer: 'carbon dioxide',
      topic: 'Photosynthesis',
      isCorrect: false,
      frustrationScore: 40,
    });
    assert.equal(input.studentAnswer, 'oxygen');
    assert.equal(input.correctAnswer, 'carbon dioxide');
    assert.equal(input.questionType, SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK);

    const lesson = teachingLessonFromMiss(
      {
        prompt,
        studentAnswer: input.studentAnswer,
        correctAnswer: input.correctAnswer,
        topic: 'Photosynthesis',
      },
      { frustrationLevel: 'moderate' },
    );
    assert.ok(lesson?.sections?.length >= 4);
    assert.match(String(lesson.studentAnswer?.concept || ''), /oxygen/i);
    assert.match(String(lesson.correctAnswer?.concept || ''), /carbon dioxide/i);

    const map = buildMisconceptionMindMap(
      {
        questionText: prompt,
        studentAnswer: input.studentAnswer,
        correctAnswer: input.correctAnswer,
        topic: 'Photosynthesis',
        questionType: 'MultiBlank',
        frustrationScore: 40,
      },
      { mindMapComplexity: 'focused', level: 'moderate' },
    );
    assert.equal(map.enabled, true);
    assert.ok(map.nodes.length >= 2);
  });
});

describe('compactTeachingState fill-in path', () => {
  it('does not rewrite typed answers into blank-N labels before SAGE', () => {
    const state = compactTeachingState({
      current_question: {
        question_text: 'Plants take in ________ during photosynthesis.',
        question_type: 'MultiBlank',
        student_last_wrong_answer: 'oxygen | ',
        correct_answer: 'carbon dioxide',
        topic: 'Photosynthesis',
      },
      frustration_score: 70,
    });
    assert.equal(state.studentAnswer, 'oxygen');
    assert.equal(state.correctAnswer, 'carbon dioxide');
    assert.equal(state.questionType, 'MultiBlank');
  });
});

describe('SAGE tutor still teaches fill-in misses', () => {
  it('builds a mind map for an oxygen vs carbon dioxide miss', () => {
    const turn = composeTutorTurn({
      studentMessage: 'explain the idea',
      context: {
        student_profile: { display_name: 'Maya' },
        frustration_score: 70,
        current_question: {
          question_text: 'Plants take in ________ during photosynthesis.',
          question_type: 'FILL_IN_THE_BLANK',
          student_last_wrong_answer: 'oxygen',
          correct_answer: 'carbon dioxide',
          topic: 'Photosynthesis',
        },
        intervention_focus: {
          concept_topic: 'Photosynthesis',
          conversation_session: { phase: 'support', student_reason_key: 'mixes_ideas' },
        },
      },
      session: {
        phase: 'support',
        student_reason_key: 'mixes_ideas',
        student_name: 'Maya',
        evidence: {
          farm_question: 'Plants take in ________ during photosynthesis.',
          last_wrong: 'oxygen',
          correct_answer: 'carbon dioxide',
        },
      },
    });
    assert.equal(turn.structured.assessment.studentAnswer, 'oxygen');
    assert.equal(turn.structured.assessment.correctAnswer, 'carbon dioxide');
    assert.ok(turn.structured.mindMap.nodes.length >= 2);
    assert.equal(turn.nextAction !== 'INSUFFICIENT_KNOWLEDGE', true);
  });
});
