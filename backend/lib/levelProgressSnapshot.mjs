/**
 * JSON stored on engagement_gaming.level_progress.metrics_snapshot.
 * Relative level stays 1 for the lesson. Farm layout lives in farm_snapshot.
 */

export function initialLevelMetrics({ lessonId = '', chapterTitle = '' } = {}) {
  const lesson = String(lessonId || '').trim();
  const title = String(chapterTitle || '').trim();
  const snapshotData = {
    lessonId: lesson,
    chapterTitle: title,
    levelNumber: 1,
    currentQuestionIndex: 0,
  };
  return {
    lesson_id: lesson,
    chapter_title: title,
    relative_level: 1,
    current_question_index: 0,
    last_completed_question_index: 0,
    progress_score: 0,
    snapshot_data: snapshotData,
    farm_snapshot: null,
    mindmap: null,
  };
}

export function mergeLevelMetrics(prev = {}, body = {}) {
  const lessonId = String(body.lessonId || body.lesson_id || prev.lesson_id || '').trim();
  const chapterTitle = String(
    body.chapterTitle || body.chapter_title || prev.chapter_title || '',
  ).trim();
  const lessonOrdinal = Number(lessonId.match(/_(\d+)$/)?.[1]) || 0;
  let levelNumber = Math.max(
    1,
    Number(body.levelNumber ?? body.level_number ?? prev.relative_level) || 1,
  );
  if (lessonOrdinal && levelNumber === lessonOrdinal) levelNumber = 1;

  const incomingIndex = Number(body.lastCompletedQuestionIndex ?? body.questionIndex);
  const prevLast = Number(prev.last_completed_question_index) || 0;
  const answered = Boolean(body.questionId);
  const lastCompleted = answered
    ? Math.max(
        prevLast,
        Number.isFinite(incomingIndex) && incomingIndex > 0 ? incomingIndex : prevLast,
      )
    : prevLast;
  const prevCurrent = Number(prev.current_question_index);
  const currentQuestionIndex = answered
    ? lastCompleted + 1
    : Number.isFinite(prevCurrent)
      ? prevCurrent
      : 0;

  const farmSnapshot =
    body.farmSnapshot || body.farm_snapshot || prev.farm_snapshot || null;
  const mindmap = body.mindmap || body.mindMap || prev.mindmap || null;
  const progressScore =
    body.progressScore != null
      ? Number(body.progressScore) || 0
      : Number(prev.progress_score) || 0;

  return {
    lesson_id: lessonId,
    chapter_title: chapterTitle,
    relative_level: levelNumber,
    last_completed_question_index: lastCompleted,
    current_question_index: currentQuestionIndex,
    progress_score: progressScore,
    snapshot_data: {
      lessonId,
      chapterTitle,
      levelNumber,
      currentQuestionIndex,
    },
    farm_snapshot: farmSnapshot,
    mindmap,
    progression_outcome: prev.progression_outcome || null,
    level_end_reason: prev.level_end_reason || null,
    level_target_completion_ms:
      Number(body.levelTargetCompletionMs ?? body.level_target_completion_ms) ||
      Number(prev.level_target_completion_ms) ||
      null,
    frustration_score_at_start: prev.frustration_score_at_start ?? null,
  };
}

export function resumeView(row, lessonId = '') {
  if (!row) return null;
  const metrics = row.metrics_snapshot || {};
  const last = Number(metrics.last_completed_question_index);
  const current = Number(metrics.current_question_index);
  const levelNumber = Math.max(1, Number(row.level_number) || 1);
  const lastCompletedQuestionIndex = Number.isFinite(last) ? last : 0;
  const currentQuestionIndex = Number.isFinite(current)
    ? current
    : lastCompletedQuestionIndex > 0
      ? lastCompletedQuestionIndex + 1
      : 0;
  const pointsEarned = Number(row.points_earned) || 0;
  const farmSnapshot = metrics.farm_snapshot || null;
  return {
    lessonId: metrics.lesson_id || lessonId || null,
    chapterTitle: metrics.chapter_title || metrics.snapshot_data?.chapterTitle || '',
    levelNumber,
    currentLevelNumber: levelNumber,
    lastCompletedQuestionIndex,
    currentQuestionIndex,
    resumeQuestionIndex: currentQuestionIndex > 0 ? currentQuestionIndex : 1,
    pointsEarned,
    progressScore: Number(metrics.progress_score ?? pointsEarned) || 0,
    quizCorrect: Number(row.quiz_correct) || 0,
    quizIncorrect: Number(row.quiz_incorrect) || 0,
    mindmap: metrics.mindmap || null,
    farmSnapshot,
    snapshotData: metrics.snapshot_data || null,
    status: row.status || 'in_progress',
    levelTargetCompletionMs: Number(metrics.level_target_completion_ms) || null,
    frustrationScoreAtStart: metrics.frustration_score_at_start ?? null,
  };
}
