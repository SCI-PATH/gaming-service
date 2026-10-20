/**
 * Ask gaming-service whether this level repeats or unlocks the next one.
 * If the database is offline, the same thresholds decide the screen locally.
 */

import { getChapterLaunch } from './chapterPath.js';
import { getEngagementSessionId } from './engagementSync.js';
import { decideFarmLessonProgression } from './farmLessonProgression.js';

/**
 * Local pass or retry when the engagement database is down.
 * Uses the same farm-lesson thresholds: high frustration or a weak quiz repeats the lesson.
 */
function localLevelOutcome(payload = {}) {
  const local = decideFarmLessonProgression({
    frustrationScore: payload.frustrationScore,
    frustrationLevel: payload.frustrationLevel,
    correctAnswers: payload.quizCorrect,
    incorrectAnswers: payload.quizIncorrect,
    mastery: payload.mastery,
  });
  const retryLesson = local.retryLesson === true;
  const levelNumber = Math.max(1, Number(payload.levelNumber) || 1);
  return {
    ok: true,
    persisted: false,
    offline: true,
    outcome: retryLesson ? 'REMEDIATION_REQUIRED' : 'LEVEL_PASSED',
    retryLesson,
    reason: local.reason,
    status: retryLesson ? 'remediation_required' : 'completed',
    mentorReply: retryLesson
      ? 'Let’s practice this topic again before the next level opens. Review the explanation, then try the farm once more.'
      : 'This topic looks ready. The next level can open.',
    frustrationScore: Number(payload.frustrationScore) || 0,
    frustrationLevel: payload.frustrationLevel || 'low',
    masteryPercentage: null,
    levelNumber,
    nextLevelNumber: retryLesson ? levelNumber : levelNumber + 1,
    nextLevelUnlocked: !retryLesson,
    explanation: '',
    mindmap: null,
  };
}

/**
 * Ask the server whether this lesson repeats or the next farm level opens.
 * Falls back to the local thresholds when the database is skipped or unreachable.
 */
export async function submitLevelOutcome(body = {}) {
  const launch = getChapterLaunch();
  const payload = {
    ...body,
    sessionId: body.sessionId || getEngagementSessionId() || null,
    lessonId: body.lessonId || launch.lessonId || '',
    chapterTitle: body.chapterTitle || launch.chapterTitle || '',
  };
  try {
    const res = await fetch('/api/engagement/level-outcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok !== false && data?.outcome) {
      return { ...data, persisted: true };
    }
    if (data?.skipped || data?.error === 'DATABASE_URL_not_configured') {
      return {
        ...localLevelOutcome(payload),
        skipped: true,
        error: data.error || 'DATABASE_URL_not_configured',
      };
    }
  } catch {
    /* fall through to local thresholds so the shop can still open */
  }
  return localLevelOutcome(payload);
}
