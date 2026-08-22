/**
 * Fire-and-forget sync from the farm game → Neon via backend APIs.
 * localStorage remains source of offline truth; DB is research mirror.
 */

const SESSION_KEY = 'scipath_engagement_session_id';
const STUDENT_KEY = 'scipath_engagement_student_id';

function newId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function post(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      if (data?.error === 'DATABASE_URL_not_configured' || data?.skipped) {
        return { ok: false, skipped: true, ...data };
      }
      console.warn('[engagementSync]', path, data?.error || res.status);
      return { ok: false, ...data };
    }
    return data;
  } catch (err) {
    console.warn('[engagementSync] network', path, err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
}

export function getEngagementSessionId() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function getEngagementStudentId() {
  try {
    return sessionStorage.getItem(STUDENT_KEY) || null;
  } catch {
    return null;
  }
}

function rememberStudent(studentId) {
  try {
    if (studentId) sessionStorage.setItem(STUDENT_KEY, studentId);
  } catch {
    /* ignore */
  }
}

function rememberSession(sessionId) {
  try {
    if (sessionId) sessionStorage.setItem(SESSION_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

export async function syncStudentLogin(student) {
  if (!student?.id) return null;
  rememberStudent(student.id);
  const sessionId = newId('sess');
  rememberSession(sessionId);

  await post('/api/engagement/student', {
    studentId: student.id,
    studentName: student.displayName || student.username || student.id,
    displayName: student.displayName || student.username || student.id,
    gradeBand: student.grade != null ? String(student.grade) : '6-9',
    currentLevel: 1,
  });

  const started = await post('/api/engagement/session/start', {
    sessionId,
    studentId: student.id,
    studentName: student.displayName || student.id,
    displayName: student.displayName || student.id,
    startLevel: 1,
    clientVersion: 'gaming-service-web',
    deviceInfo: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
  });

  if (started?.sessionId) rememberSession(started.sessionId);
  return started;
}

export async function syncStudentLogout(extra = {}) {
  const sessionId = getEngagementSessionId();
  if (!sessionId) return null;
  const result = await post('/api/engagement/session/end', {
    sessionId,
    ...extra,
  });
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  return result;
}

export async function syncLevelPerformance(levelId, payload = {}, student = null) {
  const studentId = student?.id || getEngagementStudentId();
  if (!studentId) return null;
  const sessionId = getEngagementSessionId();

  const level = await post('/api/engagement/level', {
    studentId,
    studentName: student?.displayName,
    sessionId,
    levelNumber: Number(levelId) || 1,
    status: 'completed',
    completed: true,
    masteryScore: payload.mastery,
    performanceBand: payload.band,
    quizCorrect: payload.quizCorrect,
    quizIncorrect: payload.quizIncorrect,
    avgResponseMs: payload.avgResponseMs,
    metricsSnapshot: {
      timeTargetMs: payload.timeTargetMs,
      beatTimeTarget: payload.beatTimeTarget,
      attempts: payload.attempts || [],
    },
  });

  const attempts = Array.isArray(payload.attempts) ? payload.attempts : [];
  for (const att of attempts) {
    // eslint-disable-next-line no-await-in-loop
    await post('/api/engagement/quiz', {
      studentId,
      sessionId,
      levelNumber: Number(levelId) || 1,
      questionId: att.questionId || att.id || null,
      conceptTags: att.concepts || att.conceptTags || [],
      farmAction: att.farmAction || att.action || null,
      isCorrect: Boolean(att.wasCorrect ?? att.isCorrect),
      selectedOption: att.selected ?? att.selectedOption ?? null,
      correctOption: att.correct ?? att.correctOption ?? null,
      responseMs: att.responseTimeMs ?? att.responseMs ?? null,
      hintUsed: Boolean(att.hintUsed),
      retryIndex: att.retryIndex ?? 0,
      rawPayload: att,
    });
  }

  return level;
}

export async function syncUnlock(itemId, opts = {}, student = null) {
  const studentId = student?.id || getEngagementStudentId();
  if (!studentId || !itemId) return null;
  return post('/api/engagement/unlock', {
    studentId,
    studentName: student?.displayName,
    sessionId: getEngagementSessionId(),
    itemId,
    itemName: opts.itemName || itemId,
    category: opts.category || 'other',
    pricePaid: opts.pricePaid ?? opts.price ?? 0,
    purchasedAtLevel: opts.purchasedAtLevel ?? 1,
    basePrice: opts.basePrice ?? opts.pricePaid ?? 0,
  });
}

export async function syncFrustration(payload = {}, student = null) {
  const studentId = student?.id || getEngagementStudentId();
  if (!studentId) return null;
  return post('/api/engagement/frustration', {
    studentId,
    sessionId: getEngagementSessionId(),
    levelNumber: payload.levelNumber ?? payload.levelId ?? null,
    frustrationScore: payload.frustrationScore ?? 0,
    frustrationLevel: payload.frustrationLevel || 'low',
    signals: payload.signals || {},
    dominantIndicators: payload.dominantIndicators || [],
    source: payload.source || 'gameplay',
  });
}

export async function syncMentorIntervention(payload = {}, student = null) {
  const studentId =
    student?.id ||
    payload.studentId ||
    getEngagementStudentId() ||
    payload.contextPayload?.student_profile?.id;
  if (!studentId) return null;
  return post('/api/engagement/mentor', {
    studentId,
    sessionId: getEngagementSessionId(),
    levelNumber:
      payload.levelNumber ??
      payload.contextPayload?.farm?.levelId ??
      payload.contextPayload?.level_id ??
      null,
    interventionMode:
      payload.interventionMode ||
      payload.contextPayload?.intervention_mode ||
      'SUPPORT_AND_SCAFFOLD',
    perceivedState:
      payload.perceivedState || payload.contextPayload?.perceived_state,
    triggerReason: payload.triggerReason || null,
    frustrationScore:
      payload.frustrationScore ??
      payload.contextPayload?.frustration_score ??
      null,
    provider: payload.provider || null,
    modelName: payload.model || payload.modelName || null,
    studentMessage: payload.studentMessage || null,
    mentorReply: payload.mentorReply || payload.reply || null,
    focusPayload: payload.focusPayload || payload.contextPayload?.intervention_focus || {},
    telemetrySnapshot: payload.telemetrySnapshot || payload.contextPayload || {},
    closedAt: new Date().toISOString(),
  });
}

export async function syncGameplayEvent(eventType, payload = {}, student = null) {
  const studentId = student?.id || getEngagementStudentId();
  if (!studentId) return null;
  return post('/api/engagement/event', {
    studentId,
    sessionId: getEngagementSessionId(),
    levelNumber: payload.levelNumber ?? null,
    eventType,
    payload,
  });
}
