/**
 * Grade check for Assessment Engine items.
 * A question that names another grade is rejected. Items that do not echo a
 * grade are allowed only because post-lesson already requested this grade.
 */

import { chapterIdFromTopicId } from '../data/curriculumTopics.js';
import { normalizeStudentGrade } from '../data/gradeChallengeLibraries.js';

export function assessQuestionGradeScope(question, student) {
  const expected = normalizeStudentGrade(student?.grade ?? student?.gradeLevel);
  if (expected == null) {
    return { ok: true, expected: null, actual: null, scope: 'ungraded_session' };
  }

  const chapter = String(
    question?.chapterId ||
      question?.chapter_id ||
      chapterIdFromTopicId(question?.topicId || question?.topic_id || '') ||
      '',
  );
  const fromChapter = chapter.match(/^G([6-9])/i);
  const echoed = fromChapter ? Number(fromChapter[1]) : null;
  const explicit = normalizeStudentGrade(question?.studentGrade ?? question?.gradeNumber);
  const actual = explicit ?? echoed;

  if (actual != null && actual !== expected) {
    return {
      ok: false,
      reason: 'grade_mismatch',
      expected,
      actual,
      scope: 'echoed',
    };
  }

  return {
    ok: true,
    expected,
    actual,
    scope: actual == null ? 'requested_only' : 'echoed',
  };
}
