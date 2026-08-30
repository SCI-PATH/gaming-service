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
        },
      ],
      [
        {
          at: 20,
          question: 'Live second question about roots',
          is_correct: false,
          score: 30,
        },
      ],
    );
    const rows = buildQuizRoundRows(merged, []);
    assert.equal(rows.length, 2);
    assert.match(rows[1].prompt, /roots/);
    assert.equal(rows[1].correct, false);
  });
});
