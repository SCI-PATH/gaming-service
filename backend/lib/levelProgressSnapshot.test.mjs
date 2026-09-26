import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  initialLevelMetrics,
  mergeLevelMetrics,
  resumeView,
} from './levelProgressSnapshot.mjs';

describe('level progress snapshot', () => {
  it('opens a lesson at relative level 1 before any answer', () => {
    const metrics = initialLevelMetrics({
      lessonId: 'g7_sci_14',
      chapterTitle: 'G7: Animal Diversity',
    });
    assert.equal(metrics.relative_level, 1);
    assert.equal(metrics.current_question_index, 0);
    assert.equal(metrics.snapshot_data.lessonId, 'g7_sci_14');
    assert.equal(metrics.farm_snapshot, null);
  });

  it('keeps question 0 when only the farm snapshot is saved', () => {
    const prev = initialLevelMetrics({ lessonId: 'g7_sci_14' });
    const next = mergeLevelMetrics(prev, {
      lessonId: 'g7_sci_14',
      farmSnapshot: { levelId: 1, currentMoney: 40, plantedCrops: [{ id: 'corn' }] },
    });
    assert.equal(next.current_question_index, 0);
    assert.equal(next.farm_snapshot.currentMoney, 40);
    assert.equal(next.relative_level, 1);
  });

  it('advances the question index after an answer and keeps the farm', () => {
    const prev = mergeLevelMetrics(initialLevelMetrics({ lessonId: 'g7_sci_14' }), {
      farmSnapshot: { levelId: 1, currentMoney: 12 },
    });
    const next = mergeLevelMetrics(prev, {
      lessonId: 'g7_sci_14',
      questionId: 'q1',
      lastCompletedQuestionIndex: 1,
    });
    assert.equal(next.last_completed_question_index, 1);
    assert.equal(next.current_question_index, 2);
    assert.equal(next.farm_snapshot.currentMoney, 12);
    assert.equal(next.relative_level, 1);
  });

  it('does not treat the lesson ordinal as the level', () => {
    const next = mergeLevelMetrics(
      {},
      { lessonId: 'g7_sci_14', levelNumber: 14, questionId: 'q2', lastCompletedQuestionIndex: 2 },
    );
    assert.equal(next.relative_level, 1);
    assert.equal(next.current_question_index, 3);
  });

  it('returns the farm snapshot with the relative level', () => {
    const view = resumeView({
      level_number: 1,
      status: 'in_progress',
      points_earned: 5,
      quiz_correct: 1,
      quiz_incorrect: 0,
      metrics_snapshot: initialLevelMetrics({ lessonId: 'g7_sci_14' }),
    });
    view.farmSnapshot = { levelId: 1 };
    const merged = resumeView({
      level_number: 1,
      status: 'in_progress',
      points_earned: 5,
      quiz_correct: 1,
      quiz_incorrect: 0,
      metrics_snapshot: mergeLevelMetrics(initialLevelMetrics({ lessonId: 'g7_sci_14' }), {
        farmSnapshot: { levelId: 1, currentMoney: 8 },
      }),
    });
    assert.equal(merged.currentLevelNumber, 1);
    assert.equal(merged.currentQuestionIndex, 0);
    assert.equal(merged.resumeQuestionIndex, 1);
    assert.equal(merged.farmSnapshot.currentMoney, 8);
    const kept = mergeLevelMetrics(
      { level_target_completion_ms: 22 * 60 * 1000, frustration_score_at_start: 70 },
      { lessonId: 'g7_sci_14', questionId: 'q3' },
    );
    assert.equal(kept.level_target_completion_ms, 22 * 60 * 1000);
    assert.equal(view.levelNumber, 1);
  });
});
