/**
 * Dashboard question list must keep every question the student faced.
 * Run: node --test frontend/src/components/studentDashboardCharts.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildQuizRoundRows,
  mergeQuestionPoints,
} from './studentDashboardQuestions.js';

describe('recent questions list', () => {
  it('keeps more than eight scored questions', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({
      at: 1000 + i,
      score: 20 + i,
      prompt: `Stem question ${i + 1}?`,
      questionType: 'MCQ',
      isCorrect: i % 2 === 0,
    }));
    const rows = buildQuizRoundRows(points, []);
    assert.equal(rows.length, 12);
    assert.equal(rows[0].n, 1);
    assert.equal(rows[11].n, 12);
    assert.match(rows[0].prompt, /question 1/);
    assert.match(rows[11].prompt, /question 12/);
    assert.equal(rows[11].latest, true);
  });

  it('fills in a live session question that is not in stored points yet', () => {
    const merged = mergeQuestionPoints(
      [
        {
          at: 10,
          score: 24,
          prompt: 'Stored first question',
          isCorrect: true,
          studentAnswer: 'Seeds',
        },
      ],
      [
        {
          at: 20,
          question: 'Live second question about roots',
          is_correct: false,
          score: 30,
          student_answer: 'leaves',
          correct_answer: 'roots',
        },
      ],
    );
    const rows = buildQuizRoundRows(merged, []);
    assert.equal(rows.length, 2);
    assert.match(rows[1].prompt, /roots/);
    assert.equal(rows[1].correct, false);
    assert.equal(rows[0].studentAnswer, 'Seeds');
    assert.equal(rows[1].studentAnswer, 'leaves');
    assert.equal(rows[1].correctAnswer, 'roots');
  });

  it('attaches the student answer onto a stored question that is missing it', () => {
    const rows = buildQuizRoundRows(
      [
        {
          at: 50,
          score: 22,
          prompt: 'How do flowering plants primarily reproduce?',
          questionType: 'MCQ',
          isCorrect: false,
        },
      ],
      [],
      [
        {
          at: 51,
          question: 'How do flowering plants primarily reproduce?',
          is_correct: false,
          student_answer: 'By spores',
          correct_answer: 'By seeds and flowers',
        },
      ],
    );
    assert.equal(rows[0].studentAnswer, 'By spores');
    assert.equal(rows[0].correctAnswer, 'By seeds and flowers');
  });
});
