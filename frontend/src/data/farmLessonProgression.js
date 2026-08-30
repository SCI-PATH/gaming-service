/**
 * End-of-farm learning decision.
 * Frustration + this-run performance → retry vs follow the learning-path next lesson.
 * Does not invent a new curriculum order: advance still uses launch.nextLessonId.
 */

import { shouldRetryLessonAfterFarm } from './frustrationModel.js';

/** Match Learning Path GAME_PASS_THRESHOLD (chapterGameProgress.ts). */
export const LESSON_MASTERY_PASS = 0.65;
/** Match MASTERY_THRESHOLDS.medium in masteryModel.js */
export const LESSON_MASTERY_FLOOR = 0.4;

export const FARM_PROGRESSION = Object.freeze({
  RETRY_FRUSTRATION: 'retry_frustration',
  RETRY_PRACTICE: 'retry_practice',
  ADVANCE: 'advance',
});

function accuracyFromCounts(correctAnswers, incorrectAnswers) {
  const correct = Math.max(0, Number(correctAnswers) || 0);
  const incorrect = Math.max(0, Number(incorrectAnswers) || 0);
  const total = correct + incorrect;
  if (total <= 0) return null;
  return correct / total;
}

export function conceptMasteredFromRun({
  correctAnswers = 0,
  incorrectAnswers = 0,
  mastery = null,
} = {}) {
  const accuracy = accuracyFromCounts(correctAnswers, incorrectAnswers);
  const m = Number(mastery);
  if (accuracy == null) {
    return Number.isFinite(m) ? m >= LESSON_MASTERY_PASS : false;
  }
  if (accuracy < LESSON_MASTERY_PASS) return false;
  if (Number.isFinite(m) && m < LESSON_MASTERY_FLOOR) return false;
  return true;
}

/**
 * @returns {{
 *   action: string,
 *   retryLesson: boolean,
 *   reason: string,
 * }}
 */
export function decideFarmLessonProgression({
  frustrationScore = 0,
  frustrationLevel = 'low',
  correctAnswers = 0,
  incorrectAnswers = 0,
  mastery = null,
} = {}) {
  if (
    shouldRetryLessonAfterFarm(frustrationScore) ||
    shouldRetryLessonAfterFarm(frustrationLevel)
  ) {
    return {
      action: FARM_PROGRESSION.RETRY_FRUSTRATION,
      retryLesson: true,
      reason: 'very_high_or_high_frustration',
    };
  }
  if (
    !conceptMasteredFromRun({
      correctAnswers,
      incorrectAnswers,
      mastery,
    })
  ) {
    return {
      action: FARM_PROGRESSION.RETRY_PRACTICE,
      retryLesson: true,
      reason: 'concept_not_mastered',
    };
  }
  return {
    action: FARM_PROGRESSION.ADVANCE,
    retryLesson: false,
    reason: 'ready_for_learning_path_next',
  };
}
