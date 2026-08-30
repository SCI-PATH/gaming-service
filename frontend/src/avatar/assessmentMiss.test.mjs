/**
 * Unified assessment → mind-map pipeline.
 * Run: node --test frontend/src/avatar/assessmentMiss.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answersEquivalent,
  alignFillInMisses,
  expandAssessmentMisses,
  normalizeAssessmentMiss,
  collectAssessmentMisses,
  buildTypeAwareLesson,
  validateMindMapAgainstAssessments,
} from './assessmentMiss.js';
import { resolveFreeTextCorrectAnswer } from './explainMisconception.js';
import { buildLocalMindMap } from '../../../backend/lib/mindMapGenerator.mjs';

describe('assessment key is never rewritten', () => {
  it('keeps flowers vs roots on a fill-in, not a catalog pair', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'FillInTheBlank',
      question: 'Plants absorb water through ______.',
      studentAnswer: 'flowers',
      correctAnswer: 'roots',
    });
    assert.equal(miss.correctAnswer, 'roots');
    assert.equal(miss.studentAnswer, 'flowers');
    assert.equal(resolveFreeTextCorrectAnswer(miss), 'roots');
    const lesson = buildTypeAwareLesson(miss, { frustrationLevel: 'moderate' });
    assert.equal(lesson.correctAnswer.concept.toLowerCase().includes('roots'), true);
    assert.equal(/only grow in water/i.test(lesson.correctAnswer.concept), false);
    assert.match(String(lesson.correctAnswer.concept), /roots/i);
  });

  it('does not replace a typed engine key with monocots and dicots', () => {
    const attempt = {
      prompt:
        'What are the two main groups of flowering plants based on their seed structure?',
      studentAnswer: 'monocods',
      correctAnswer: 'flowers that produce seeds',
      questionType: 'ShortAnswer',
    };
    assert.equal(
      resolveFreeTextCorrectAnswer(attempt),
      'flowers that produce seeds',
    );
    const miss = normalizeAssessmentMiss(attempt);
    assert.equal(miss.correctAnswer, 'flowers that produce seeds');
  });

  it('keeps MCQ habitat vs flowers when that is the engine pair', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'MCQ',
      question: 'What is a characteristic feature of flowering plants?',
      studentAnswer: 'Only grow in water',
      correctAnswer: 'flowers and fruits',
      options: [
        'Only grow in water',
        'flowers and fruits',
        'Have no roots',
        'Do not make seeds',
      ],
    });
    assert.match(miss.correctAnswer, /flowers and fruits/i);
    assert.match(miss.studentAnswer, /only grow in water/i);
  });
});

describe('MCQ', () => {
  it('teaches a wrong option without calling it scientifically false', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'MCQ',
      question: 'Which component stores electrical energy?',
      studentAnswer: 'Resistor',
      correctAnswer: 'Capacitor',
      options: ['Switch', 'Capacitor', 'Resistor', 'Wire'],
      isCorrect: false,
    });
    const lesson = buildTypeAwareLesson(miss, { frustrationLevel: 'moderate' });
    assert.ok(lesson?.sections?.length);
    assert.match(lesson.studentAnswer.concept, /Resistor/i);
    assert.match(lesson.correctAnswer.concept, /Capacitor/i);
  });

  it('does not expand a correct MCQ into a miss', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'MCQ',
      question: 'Which gas do plants take in?',
      studentAnswer: 'Carbon dioxide',
      correctAnswer: 'Carbon dioxide',
      isCorrect: true,
    });
    assert.equal(expandAssessmentMisses(miss).length, 0);
  });
});

describe('True/False', () => {
  it('explains False when the statement is True', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'TrueFalse',
      question: 'Dicotyledonous plants are named for having two seed lobes.',
      studentAnswer: 'False',
      correctAnswer: 'True',
      options: ['True', 'False'],
    });
    const lesson = buildTypeAwareLesson(miss, { frustrationLevel: 'moderate' });
    assert.ok(lesson);
    assert.match(lesson.studentAnswer.concept, /false/i);
    assert.match(lesson.correctAnswer.concept, /true/i);
  });

  it('explains True when the statement is False', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'TrueFalse',
      question: 'Plants take in oxygen as the main gas for making food.',
      studentAnswer: 'True',
      correctAnswer: 'False',
    });
    const lesson = buildTypeAwareLesson(miss, { frustrationLevel: 'moderate' });
    assert.ok(lesson);
    assert.match(lesson.correctAnswer.concept, /false/i);
  });
});

describe('Fill-in blanks', () => {
  it('aligns a single missed blank', () => {
    const rows = alignFillInMisses(
      {},
      { studentAnswer: 'flowers', correctAnswer: 'roots' },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].correctAnswer, 'roots');
    assert.equal(rows[0].studentAnswer, 'flowers');
  });

  it('treats multiple missed blanks independently', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'MultiBlank',
      question: 'Plants have ______, ______ and ______.',
      studentAnswer: 'flowers | stem | seeds',
      correctAnswer: 'roots | stem | leaves',
      missed_blanks: { 0: 'roots', 2: 'leaves' },
    });
    const expanded = expandAssessmentMisses(miss);
    assert.equal(expanded.length, 2);
    assert.equal(expanded[0].correctAnswer, 'roots');
    assert.equal(expanded[0].studentAnswer, 'flowers');
    assert.equal(expanded[1].correctAnswer, 'leaves');
    assert.equal(expanded[1].studentAnswer, 'seeds');
    assert.equal(expanded[0].blankIndex, 1);
    assert.equal(expanded[1].blankIndex, 3);
  });

  it('ignores capitalization and extra whitespace', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'FillInTheBlank',
      question: 'Plants absorb water through ______.',
      studentAnswer: '  Roots  ',
      correctAnswer: 'roots',
      isCorrect: true,
    });
    assert.equal(answersEquivalent(miss.studentAnswer, miss.correctAnswer), true);
  });
});

describe('Short / typed answer', () => {
  it('builds a complete-wrong lesson from the engine key', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'ShortAnswer',
      question: 'What stores electrical energy in a circuit?',
      studentAnswer: 'A resistor stores electrical energy.',
      correctAnswer: 'A capacitor stores electrical energy.',
    });
    const lesson = buildTypeAwareLesson(miss, { frustrationLevel: 'moderate' });
    assert.ok(lesson);
    assert.match(lesson.studentAnswer.concept, /resistor/i);
    assert.match(lesson.correctAnswer.concept, /capacitor/i);
  });

  it('marks partial completeness from missing keywords', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'ShortAnswer',
      question: 'What is photosynthesis?',
      studentAnswer: 'Plants use sunlight to make food.',
      correctAnswer:
        'Photosynthesis is the process by which plants use light energy to make glucose from carbon dioxide and water.',
      missingKeywords: ['carbon dioxide', 'water'],
      accuracyScore: 0.55,
      isCorrect: false,
    });
    assert.equal(miss.completeness, 'partial');
    const lesson = buildTypeAwareLesson(miss, { frustrationLevel: 'moderate' });
    assert.ok(lesson?.sections?.some((s) => s.id === 'what_missing' || s.id === 'correct_answer'));
  });

  it('keeps a long typed sentence intact', () => {
    const sentence =
      'Plants use sunlight as energy, and they also need carbon dioxide from the air.';
    const miss = normalizeAssessmentMiss({
      questionType: 'TypedAnswer',
      question: 'Explain why plants need sunlight.',
      studentAnswer: sentence,
      correctAnswer: 'Plants use sunlight as an energy source during photosynthesis.',
    });
    assert.equal(miss.studentAnswer, sentence);
  });

  it('still teaches an unknown unknown concept', () => {
    const miss = normalizeAssessmentMiss({
      questionType: 'ShortAnswer',
      question: 'Name the fundamental particles in ordinary matter.',
      studentAnswer: 'gluons glue',
      correctAnswer: 'quarks are fundamental particles',
      topic: 'Physics',
    });
    const lesson = buildTypeAwareLesson(miss, { frustrationLevel: 'moderate' });
    assert.ok(lesson);
    assert.match(lesson.correctAnswer.concept, /quark/i);
  });
});

describe('history leak and Groq validation', () => {
  it('does not mix a previous history question into the current miss', () => {
    const misses = collectAssessmentMisses({
      attempts: [
        {
          questionType: 'FillInTheBlank',
          question: 'Plants absorb water through ______.',
          studentAnswer: 'flowers',
          correctAnswer: 'roots',
        },
      ],
    });
    assert.equal(misses.length, 1);
    assert.equal(misses[0].correctAnswer, 'roots');
    assert.equal(/helium|carbon dioxide/i.test(misses[0].correctAnswer), false);
  });

  it('rejects a map that swapped the engine key', () => {
    const assessments = collectAssessmentMisses({
      attempts: [
        {
          questionType: 'FillInTheBlank',
          question: 'Plants absorb water through ______.',
          studentAnswer: 'flowers',
          correctAnswer: 'roots',
        },
      ],
    });
    const bad = {
      branches: [
        {
          prompt: 'Plants absorb water through ______.',
          studentAnswer: 'only grow in water',
          correctAnswer: 'flowers and fruits',
        },
      ],
    };
    const check = validateMindMapAgainstAssessments(bad, assessments);
    assert.equal(check.ok, false);
  });

  it('falls back to a local map that keeps the engine key', () => {
    const attempts = collectAssessmentMisses({
      attempts: [
        {
          questionType: 'FillInTheBlank',
          question: 'Plants absorb water through ______.',
          studentAnswer: 'flowers',
          correctAnswer: 'roots',
        },
      ],
    });
    const map = buildLocalMindMap(attempts);
    assert.match(map.branches[0].correct_answer, /roots/i);
    assert.equal(/flowers and fruits/i.test(map.branches[0].correct_answer), false);
    const check = validateMindMapAgainstAssessments(
      {
        branches: map.branches.map((b) => ({
          prompt: b.question,
          studentAnswer: b.student_answer,
          correctAnswer: b.correct_answer,
        })),
      },
      attempts,
    );
    assert.equal(check.ok, true);
  });
});
