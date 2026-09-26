/**
 * Persistence for engagement_gaming (Neon).
 * Matches tables created in backend/sql/004_all_extra_tables.sql
 */
import { getFileLeaderboard, upsertLeaderboardEntry } from './db.mjs';
import { isPostgresEnabled } from './pg.mjs';
import { eq as query } from './engagementSchema.mjs';
import {
  initialLevelMetrics,
  mergeLevelMetrics,
  resumeView,
} from './levelProgressSnapshot.mjs';
import {
  chapterRewardItemId,
  decideLevelOutcome,
  frustrationScoreFromSnapshots,
  levelDurationMsFromFrustration,
  mentorReplyForOutcome,
} from './levelOutcome.mjs';

const OPEN_LEVEL_STATUSES = `('in_progress', 'needs_repeat', 'remediation_required')`;

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** UUID string — valid for both UUID and TEXT id columns. */
function rowUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = (Math.random() * 16) | 0;
    return (c === 'x' ? n : (n & 0x3) | 0x8).toString(16);
  });
}

function isSessionIdError(err) {
  const msg = String(err?.message || '');
  return /uuid|foreign key|session_id|invalid input syntax/i.test(msg);
}

export function engagementAvailable() {
  return isPostgresEnabled();
}

export async function upsertStudent(body = {}) {
  const studentId = String(body.studentId || body.student_id || '').trim();
  const studentName = String(
    body.studentName || body.student_name || body.displayName || studentId,
  ).trim();
  if (!studentId || !studentName) {
    throw new Error('studentId and studentName are required');
  }

  await query(
    `INSERT INTO engagement_gaming.students (
       student_id, student_name, display_name, grade_band, school_code,
       current_level, lessons_completed, total_points_earned, total_points_spent,
       wallet_balance, unlocks_owned_count, latest_frustration_score,
       latest_frustration_level, last_seen_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,
       COALESCE($6,1), COALESCE($7,0), COALESCE($8,0), COALESCE($9,0),
       COALESCE($10,0), COALESCE($11,0), $12,
       $13, NOW(), NOW()
     )
     ON CONFLICT (student_id) DO UPDATE SET
       student_name = EXCLUDED.student_name,
       display_name = COALESCE(EXCLUDED.display_name, engagement_gaming.students.display_name),
       grade_band = COALESCE(EXCLUDED.grade_band, engagement_gaming.students.grade_band),
       current_level = COALESCE($6, engagement_gaming.students.current_level),
       lessons_completed = COALESCE($7, engagement_gaming.students.lessons_completed),
       total_points_earned = COALESCE($8, engagement_gaming.students.total_points_earned),
       total_points_spent = COALESCE($9, engagement_gaming.students.total_points_spent),
       wallet_balance = COALESCE($10, engagement_gaming.students.wallet_balance),
       unlocks_owned_count = COALESCE($11, engagement_gaming.students.unlocks_owned_count),
       latest_frustration_score = COALESCE($12, engagement_gaming.students.latest_frustration_score),
       latest_frustration_level = COALESCE($13, engagement_gaming.students.latest_frustration_level),
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [
      studentId,
      studentName,
      body.displayName || studentName,
      body.gradeBand || body.grade_band || null,
      body.schoolCode || body.school_code || null,
      body.currentLevel ?? body.current_level ?? null,
      body.lessonsCompleted ?? body.lessons_completed ?? null,
      body.totalPointsEarned ?? body.total_points_earned ?? null,
      body.totalPointsSpent ?? body.total_points_spent ?? null,
      body.walletBalance ?? body.wallet_balance ?? null,
      body.unlocksOwnedCount ?? body.unlocks_owned_count ?? null,
      body.frustrationScore ?? body.latest_frustration_score ?? null,
      body.frustrationLevel ?? body.latest_frustration_level ?? null,
    ],
  );

  return { studentId, studentName };
}

export async function startSession(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  await upsertStudent(body);

  const sessionId = String(body.sessionId || id('sess'));
  const lessonId = String(body.lessonId || body.lesson_id || '').trim();
  const lessonOrdinal = Number(lessonId.match(/_(\d+)$/)?.[1]) || 0;
  let startLevel = Math.max(1, Number(body.startLevel ?? body.start_level) || 1);
  if (lessonOrdinal && startLevel === lessonOrdinal) startLevel = 1;
  await query(
    `INSERT INTO engagement_gaming.game_sessions (
       session_id, student_id, started_at, start_level, client_version, device_info
     ) VALUES ($1,$2,NOW(),$3,$4,$5::jsonb)
     ON CONFLICT (session_id) DO UPDATE SET
       start_level = COALESCE(EXCLUDED.start_level, engagement_gaming.game_sessions.start_level)`,
    [
      sessionId,
      studentId,
      startLevel,
      body.clientVersion || body.client_version || 'gaming-service',
      JSON.stringify(body.deviceInfo || body.device_info || {}),
    ],
  );
  const levelProgress = await ensureInProgressLevel({
    ...body,
    sessionId,
    levelNumber: 1,
  });
  const duration = await planLevelDuration(
    studentId,
    levelProgress?.levelNumber || 1,
  );
  return { sessionId, studentId, levelProgress, ...duration };
}

/** Latest frustration snapshot sets this session's level clock and stores it on the row. */
export async function planLevelDuration(studentId, levelNumber) {
  let frustrationScore = null;
  try {
    const latest = await query(
      `SELECT frustration_score
         FROM engagement_gaming.frustration_snapshots
        WHERE student_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [studentId],
    );
    const raw = Number(latest.rows?.[0]?.frustration_score);
    frustrationScore = Number.isFinite(raw) ? raw : null;
  } catch {
    frustrationScore = null;
  }
  const levelTargetCompletionMs = levelDurationMsFromFrustration(frustrationScore);
  const level = Math.max(1, Number(levelNumber) || 1);
  try {
    await query(
      `UPDATE engagement_gaming.level_progress
          SET metrics_snapshot = COALESCE(metrics_snapshot, '{}'::jsonb) || $3::jsonb,
              updated_at = NOW()
        WHERE student_id = $1 AND level_number = $2`,
      [
        studentId,
        level,
        JSON.stringify({
          level_target_completion_ms: levelTargetCompletionMs,
          frustration_score_at_start: frustrationScore,
        }),
      ],
    );
  } catch {
    /* the client still receives the calculated clock */
  }
  return { levelTargetCompletionMs, frustrationScore };
}

/** Create the relative Level 1 row as soon as a session starts, before any answer. */
export async function ensureInProgressLevel(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const active = await query(
    `SELECT level_progress_id, status, level_number
       FROM engagement_gaming.level_progress
      WHERE student_id = $1
        AND status IN ${OPEN_LEVEL_STATUSES}
      ORDER BY updated_at DESC
      LIMIT 1`,
    [studentId],
  );
  if (active.rows?.[0]) {
    const row = active.rows[0];
    const retryStatus =
      row.status === 'needs_repeat' || row.status === 'remediation_required';
    if (retryStatus) {
      await query(
        `UPDATE engagement_gaming.level_progress
            SET status = 'in_progress', updated_at = NOW()
          WHERE level_progress_id = $1`,
        [row.level_progress_id],
      );
    }
    return {
      created: false,
      levelProgressId: row.level_progress_id,
      levelNumber: Math.max(1, Number(row.level_number) || 1),
      status: retryStatus ? 'in_progress' : row.status,
    };
  }
  const existingLevel = await query(
    `SELECT level_progress_id, status
       FROM engagement_gaming.level_progress
      WHERE student_id = $1 AND level_number = 1
      LIMIT 1`,
    [studentId],
  );
  if (existingLevel.rows?.[0]) {
    return {
      created: false,
      levelProgressId: existingLevel.rows[0].level_progress_id,
      levelNumber: 1,
      status: existingLevel.rows[0].status,
    };
  }
  const metrics = initialLevelMetrics({
    lessonId: body.lessonId || body.lesson_id || '',
    chapterTitle: body.chapterTitle || body.chapter_title || '',
  });
  const saved = await upsertLevelProgress({
    studentId,
    studentName: body.studentName || body.displayName || studentId,
    displayName: body.displayName || body.studentName || studentId,
    sessionId: body.sessionId || null,
    levelNumber: 1,
    currentLevel: 1,
    status: 'in_progress',
    lessonsCompleted: 0,
    pointsEarned: 0,
    quizCorrect: 0,
    quizIncorrect: 0,
    metricsSnapshot: metrics,
  });
  return { created: true, ...saved, levelNumber: 1 };
}

export async function endSession(body = {}) {
  const sessionId = String(body.sessionId || '').trim();
  if (!sessionId) throw new Error('sessionId required');
  await query(
    `UPDATE engagement_gaming.game_sessions SET
       ended_at = NOW(),
       duration_sec = COALESCE($2, EXTRACT(EPOCH FROM (NOW() - started_at))::int),
       end_level = COALESCE($3, end_level),
       points_earned = COALESCE($4, points_earned),
       points_spent = COALESCE($5, points_spent),
       quiz_correct = COALESCE($6, quiz_correct),
       quiz_incorrect = COALESCE($7, quiz_incorrect),
       avg_frustration_score = COALESCE($8, avg_frustration_score),
       peak_frustration_score = COALESCE($9, peak_frustration_score),
       peak_frustration_level = COALESCE($10, peak_frustration_level),
       notes = COALESCE($11, notes)
     WHERE session_id = $1`,
    [
      sessionId,
      body.durationSec ?? null,
      body.endLevel ?? null,
      body.pointsEarned ?? null,
      body.pointsSpent ?? null,
      body.quizCorrect ?? null,
      body.quizIncorrect ?? null,
      body.avgFrustrationScore ?? null,
      body.peakFrustrationScore ?? null,
      body.peakFrustrationLevel ?? null,
      body.notes ?? null,
    ],
  );
  return { sessionId };
}

export async function upsertLevelProgress(body = {}) {
  const studentId = String(body.studentId || '').trim();
  const levelNumber = Number(body.levelNumber ?? body.level_number ?? body.levelId);
  if (!studentId || !(levelNumber >= 1)) {
    throw new Error('studentId and levelNumber required');
  }
  const completed = body.status === 'completed' || body.completed === true;
  await upsertStudent({
    ...body,
    currentLevel: completed ? levelNumber + 1 : (body.currentLevel ?? levelNumber),
  });

  const levelProgressId =
    String(body.levelProgressId || '').trim() ||
    id(`lp_${studentId}_L${levelNumber}`);

  await query(
    `INSERT INTO engagement_gaming.level_progress (
       level_progress_id, student_id, session_id, level_number, status,
       lessons_completed, lessons_total, points_earned, points_spent,
       mastery_score, performance_band, gameplay_band,
       quiz_correct, quiz_incorrect, avg_response_ms, retries_count,
       completed_at, metrics_snapshot, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,
       COALESCE($6,0),$7,COALESCE($8,0),COALESCE($9,0),
       $10,$11,$12,
       COALESCE($13,0),COALESCE($14,0),$15,COALESCE($16,0),
       $17,$18::jsonb,NOW()
     )
     ON CONFLICT (student_id, level_number) DO UPDATE SET
       session_id = COALESCE(EXCLUDED.session_id, engagement_gaming.level_progress.session_id),
       status = EXCLUDED.status,
       lessons_completed = COALESCE(EXCLUDED.lessons_completed, engagement_gaming.level_progress.lessons_completed),
       points_earned = COALESCE(EXCLUDED.points_earned, engagement_gaming.level_progress.points_earned),
       mastery_score = COALESCE(EXCLUDED.mastery_score, engagement_gaming.level_progress.mastery_score),
       performance_band = COALESCE(EXCLUDED.performance_band, engagement_gaming.level_progress.performance_band),
       gameplay_band = COALESCE(EXCLUDED.gameplay_band, engagement_gaming.level_progress.gameplay_band),
       quiz_correct = COALESCE(EXCLUDED.quiz_correct, engagement_gaming.level_progress.quiz_correct),
       quiz_incorrect = COALESCE(EXCLUDED.quiz_incorrect, engagement_gaming.level_progress.quiz_incorrect),
       avg_response_ms = COALESCE(EXCLUDED.avg_response_ms, engagement_gaming.level_progress.avg_response_ms),
       retries_count = COALESCE(EXCLUDED.retries_count, engagement_gaming.level_progress.retries_count),
       completed_at = COALESCE(EXCLUDED.completed_at, engagement_gaming.level_progress.completed_at),
       metrics_snapshot = EXCLUDED.metrics_snapshot,
       updated_at = NOW()`,
    [
      levelProgressId,
      studentId,
      body.sessionId || null,
      levelNumber,
      body.status || 'completed',
      body.lessonsCompleted ?? 0,
      body.lessonsTotal ?? null,
      body.pointsEarned ?? 0,
      body.pointsSpent ?? 0,
      body.masteryScore ?? body.mastery ?? null,
      body.performanceBand ?? body.band ?? null,
      body.gameplayBand ?? null,
      body.quizCorrect ?? 0,
      body.quizIncorrect ?? 0,
      body.avgResponseMs ?? null,
      body.retriesCount ?? 0,
      body.status === 'completed' || body.completed ? new Date().toISOString() : null,
      JSON.stringify(body.metricsSnapshot || body.metrics || {}),
    ],
  );

  return { levelProgressId, studentId, levelNumber };
}

function resumeFromProgressRow(row, lessonId = '') {
  return resumeView(row, lessonId);
}

async function questionHistoryForStudent(studentId) {
  const found = await query(
    `SELECT attempt_id, question_id, is_correct, raw_payload, answered_at
       FROM engagement_gaming.quiz_attempts
      WHERE student_id = $1
      ORDER BY answered_at DESC
      LIMIT 20`,
    [studentId],
  );
  return (found.rows || []).map((row) => {
    const raw = row.raw_payload || {};
    return {
      attemptId: row.attempt_id,
      questionId: row.question_id || null,
      isCorrect: Boolean(row.is_correct),
      answeredAt: row.answered_at || null,
      explanation: raw.explanation || raw.keyExplain || '',
      mindmap: raw.mindmap || raw.structuredMap || null,
      mermaid: raw.mermaid || null,
    };
  });
}

/** Active in-progress farm row for this student. Relative level_number wins over the lesson id. */
export async function getLessonResume(studentId, lessonId = '') {
  const idValue = String(studentId || '').trim();
  if (!idValue) return null;
  const lesson = String(lessonId || '').trim();
  const found = await query(
    `SELECT *
       FROM engagement_gaming.level_progress
      WHERE student_id = $1
        AND status IN ${OPEN_LEVEL_STATUSES}
      ORDER BY updated_at DESC
      LIMIT 1`,
    [idValue],
  );
  const ownedUnlocks = await listStudentUnlocks(idValue).catch(() => []);
  const resume = resumeFromProgressRow(found.rows?.[0], lesson);
  if (!resume) {
    return ownedUnlocks.length ? { ownedUnlocks } : null;
  }
  resume.questionHistory = await questionHistoryForStudent(idValue);
  resume.ownedUnlocks = ownedUnlocks;
  return resume;
}

export async function listStudentUnlocks(studentId) {
  const idValue = String(studentId || '').trim();
  if (!idValue) return [];
  const found = await query(
    `SELECT item_id, purchased_at_level, price_paid, placement, session_id, purchased_at
       FROM engagement_gaming.student_unlocks
      WHERE student_id = $1
      ORDER BY purchased_at ASC`,
    [idValue],
  );
  return (found.rows || []).map((row) => ({
    itemId: row.item_id,
    purchasedAtLevel: Number(row.purchased_at_level) || null,
    pricePaid: Number(row.price_paid) || 0,
    placement: row.placement || {},
    purchaseChapterId: row.placement?.purchaseChapterId || '',
    purchaseChapterOrdinal: Number(row.placement?.purchaseChapterOrdinal) || 0,
    sessionId: row.session_id || null,
    purchasedAt: row.purchased_at || null,
  }));
}

let statusConstraintReady = false;

function quoteIdent(name) {
  const clean = String(name || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!clean) throw new Error('constraint name required');
  return `"${clean}"`;
}

/** Existing databases reject remediation_required until the status check is widened. */
export async function ensureLevelStatusConstraint() {
  if (statusConstraintReady) return;
  const found = await query(
    `SELECT con.conname AS name, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
      WHERE con.conrelid = 'engagement_gaming.level_progress'::regclass
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%status%'`,
  );
  const rows = found.rows || [];
  const already = rows.some((row) => {
    const def = String(row.def || '');
    return def.includes('needs_repeat') && def.includes('remediation_required');
  });
  if (!already) {
    for (const row of rows) {
      await query(
        `ALTER TABLE engagement_gaming.level_progress DROP CONSTRAINT IF EXISTS ${quoteIdent(row.name)}`,
      );
    }
    await query(
      `ALTER TABLE engagement_gaming.level_progress
         ADD CONSTRAINT level_progress_status_check
         CHECK (status IN ('locked', 'in_progress', 'completed', 'abandoned', 'needs_repeat', 'remediation_required'))`,
    );
  }
  statusConstraintReady = true;
}

function relativeLevelNumber(body = {}) {
  const lessonId = String(body.lessonId || body.lesson_id || '').trim();
  const lessonOrdinal = Number(lessonId.match(/_(\d+)$/)?.[1]) || 0;
  let levelNumber = Math.max(1, Number(body.levelNumber ?? body.level_number) || 1);
  if (lessonOrdinal && levelNumber === lessonOrdinal) levelNumber = 1;
  return { lessonId, levelNumber };
}

/**
 * Frustration average + quiz accuracy decide repeat-topic vs unlock-next.
 * Writes level_progress, a level_end frustration snapshot, and a mentor row when repeating.
 */
export async function evaluateLevelOutcome(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const { lessonId, levelNumber } = relativeLevelNumber(body);
  const sessionId = String(body.sessionId || '').trim() || null;
  const studentName = body.studentName || body.displayName || studentId;
  const displayName = body.displayName || body.studentName || studentId;

  try {
    await ensureLevelStatusConstraint();
  } catch {
    /* older databases may deny ALTER; the write below falls back */
  }

  const snaps = await query(
    `SELECT frustration_score
       FROM engagement_gaming.frustration_snapshots
      WHERE student_id = $1
        AND ($2::int IS NULL OR level_number = $2)
        AND ($3::text IS NULL OR session_id::text = $3)
      ORDER BY recorded_at DESC
      LIMIT 20`,
    [studentId, levelNumber, sessionId],
  );
  let snapRows = snaps.rows || [];
  if (snapRows.length < 1) {
    const latest = await query(
      `SELECT frustration_score
         FROM engagement_gaming.frustration_snapshots
        WHERE student_id = $1
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [studentId],
    );
    snapRows = latest.rows || [];
  }
  const frustrationScore = frustrationScoreFromSnapshots(
    snapRows,
    body.frustrationScore ?? body.frustration_score ?? 0,
  );

  const attempts = await query(
    `SELECT
       COUNT(*) FILTER (WHERE is_correct)::int AS correct,
       COUNT(*) FILTER (WHERE NOT is_correct)::int AS incorrect
     FROM engagement_gaming.quiz_attempts
     WHERE student_id = $1
       AND ($2::int IS NULL OR level_number = $2)
       AND ($3::text IS NULL OR session_id::text = $3)`,
    [studentId, levelNumber, sessionId],
  );
  let correct = Number(attempts.rows?.[0]?.correct) || 0;
  let incorrect = Number(attempts.rows?.[0]?.incorrect) || 0;
  if (correct + incorrect < 1) {
    correct = Math.max(0, Number(body.quizCorrect ?? body.quiz_correct) || 0);
    incorrect = Math.max(0, Number(body.quizIncorrect ?? body.quiz_incorrect) || 0);
  }

  const review = await query(
    `SELECT raw_payload
       FROM engagement_gaming.quiz_attempts
      WHERE student_id = $1
        AND raw_payload <> '{}'::jsonb
      ORDER BY answered_at DESC
      LIMIT 1`,
    [studentId],
  );
  const raw = review.rows?.[0]?.raw_payload || {};
  const explanation = String(raw.explanation || raw.keyExplain || '');
  const mindmap = raw.mindmap || raw.structuredMap || null;
  const mermaid = raw.mermaid || null;

  const decision = decideLevelOutcome({ frustrationScore, correct, incorrect });
  const mentorReply = mentorReplyForOutcome(decision);
  const existing = await query(
    `SELECT metrics_snapshot, points_earned
       FROM engagement_gaming.level_progress
      WHERE student_id = $1 AND level_number = $2`,
    [studentId, levelNumber],
  );
  const prevMetrics = existing.rows?.[0]?.metrics_snapshot || {};
  const pointsEarned =
    Number(existing.rows?.[0]?.points_earned) || Number(body.pointsEarned) || 0;
  const questionIndex = decision.retryLesson
    ? 0
    : Number(prevMetrics.current_question_index) || 0;
  const metrics = {
    ...prevMetrics,
    lesson_id: prevMetrics.lesson_id || lessonId,
    chapter_title: prevMetrics.chapter_title || body.chapterTitle || body.chapter_title || '',
    relative_level: levelNumber,
    progression_outcome: decision.outcome,
    level_end_reason: body.levelEndReason || body.level_end_reason || decision.reason,
    mastery_percentage: decision.masteryPercentage,
    frustration_score: decision.frustrationScore,
    current_question_index: questionIndex,
    last_completed_question_index: decision.retryLesson
      ? 0
      : Number(prevMetrics.last_completed_question_index) || 0,
    farm_snapshot: decision.retryLesson ? null : prevMetrics.farm_snapshot || null,
    snapshot_data: {
      ...(prevMetrics.snapshot_data || {}),
      lessonId: prevMetrics.lesson_id || lessonId,
      levelNumber,
      currentQuestionIndex: questionIndex,
      progressionOutcome: decision.outcome,
    },
  };

  const progressBody = {
    studentId,
    studentName,
    displayName,
    sessionId,
    levelNumber,
    currentLevel: decision.retryLesson ? levelNumber : levelNumber + 1,
    status: decision.status,
    lessonsCompleted: decision.retryLesson ? 0 : correct,
    pointsEarned,
    quizCorrect: correct,
    quizIncorrect: incorrect,
    masteryScore: decision.masteryPercentage,
    metricsSnapshot: metrics,
  };
  try {
    await upsertLevelProgress(progressBody);
  } catch (err) {
    const msg = String(err?.message || '');
    if (!decision.retryLesson || !/check constraint|needs_repeat|remediation_required/i.test(msg)) throw err;
    metrics.progression_status = 'remediation_required';
    await upsertLevelProgress({
      ...progressBody,
      status: 'in_progress',
      currentLevel: levelNumber,
      metricsSnapshot: metrics,
    });
    decision.persistedStatus = 'in_progress';
  }

  await insertFrustrationSnapshot({
    studentId,
    studentName,
    displayName,
    sessionId,
    levelNumber,
    frustrationScore: decision.frustrationScore,
    frustrationLevel: decision.frustrationLevel,
    source: 'level_end',
    signals: {
      outcome: decision.outcome,
      masteryPercentage: decision.masteryPercentage,
      reason: decision.reason,
    },
    dominantIndicators: [decision.reason],
  }).catch(() => {});

  let interventionId = null;
  if (decision.retryLesson) {
    const mentorBody = {
      studentId,
      sessionId,
      levelNumber,
      interventionMode: 'SUPPORT_AND_SCAFFOLD',
      perceivedState: decision.frustrationLevel,
      triggerReason: decision.reason,
      frustrationScore: decision.frustrationScore,
      provider: 'gaming-service',
      mentorReply,
      focusPayload: {
        outcome: decision.outcome,
        explanation,
        mindmap,
        mermaid,
        masteryPercentage: decision.masteryPercentage,
        frustrationScore: decision.frustrationScore,
      },
      telemetrySnapshot: {
        quizCorrect: correct,
        quizIncorrect: incorrect,
        levelEndReason: body.levelEndReason || body.level_end_reason || null,
      },
    };
    try {
      const saved = await insertMentorIntervention(mentorBody);
      interventionId = saved?.interventionId || null;
    } catch (err) {
      if (!isSessionIdError(err)) throw err;
      const saved = await insertMentorIntervention({ ...mentorBody, sessionId: null });
      interventionId = saved?.interventionId || null;
    }
  } else {
    const nextLevel = levelNumber + 1;
    const nextRow = await query(
      `SELECT level_progress_id, status
         FROM engagement_gaming.level_progress
        WHERE student_id = $1 AND level_number = $2`,
      [studentId, nextLevel],
    );
    if (!nextRow.rows?.[0]) {
      const chapterTitle = body.chapterTitle || body.chapter_title || prevMetrics.chapter_title || '';
      const nextMetrics = initialLevelMetrics({ lessonId, chapterTitle });
      nextMetrics.relative_level = nextLevel;
      nextMetrics.snapshot_data = {
        ...nextMetrics.snapshot_data,
        levelNumber: nextLevel,
      };
      await upsertLevelProgress({
        studentId,
        studentName,
        displayName,
        sessionId,
        levelNumber: nextLevel,
        currentLevel: nextLevel,
        status: 'in_progress',
        lessonsCompleted: 0,
        pointsEarned: 0,
        quizCorrect: 0,
        quizIncorrect: 0,
        metricsSnapshot: nextMetrics,
      });
    } else if (nextRow.rows[0].status === 'locked') {
      await query(
        `UPDATE engagement_gaming.level_progress
            SET status = 'in_progress', updated_at = NOW()
          WHERE level_progress_id = $1`,
        [nextRow.rows[0].level_progress_id],
      );
    }
    const lessonOrdinal = Number(lessonId.match(/_(\d+)$/)?.[1]) || levelNumber;
    const rewardItemId = chapterRewardItemId(lessonOrdinal + 1);
    try {
      await insertStudentUnlock({
        studentId,
        studentName,
        displayName,
        sessionId,
        itemId: rewardItemId,
        itemName: rewardItemId,
        category: 'other',
        purchasedAtLevel: 1,
        pricePaid: 0,
        source: 'shop',
        purchaseChapterId: lessonId,
        purchaseChapterOrdinal: lessonOrdinal,
        description: `Opened with the next chapter after ${lessonId || `level ${levelNumber}`}`,
      });
      decision.unlockedItemId = rewardItemId;
    } catch {
      decision.unlockedItemId = null;
    }
  }

  return {
    ...decision,
    levelNumber,
    nextLevelNumber: decision.retryLesson ? levelNumber : levelNumber + 1,
    nextLevelUnlocked: !decision.retryLesson,
    mentorReply,
    explanation,
    mindmap,
    mermaid,
    interventionId,
  };
}

/** Write question progress, points, and the mind map without treating the lesson id as the level. */
export async function saveLessonCheckpoint(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const lessonId = String(body.lessonId || body.lesson_id || '').trim();
  const lessonOrdinal = Number(String(lessonId).match(/_(\d+)$/)?.[1]) || 0;
  let levelNumber = Math.max(1, Number(body.levelNumber ?? body.level_number) || 1);
  if (lessonOrdinal && levelNumber === lessonOrdinal) levelNumber = 1;
  const existing = await query(
    `SELECT quiz_correct, quiz_incorrect, points_earned, metrics_snapshot
       FROM engagement_gaming.level_progress
      WHERE student_id = $1 AND level_number = $2`,
    [studentId, levelNumber],
  );
  const prev = existing.rows?.[0] || {};
  const prevMetrics = prev.metrics_snapshot || {};
  const answered = Boolean(body.questionId);
  const quizCorrect =
    (Number(prev.quiz_correct) || 0) + (answered && body.isCorrect ? 1 : 0);
  const quizIncorrect =
    (Number(prev.quiz_incorrect) || 0) + (answered && !body.isCorrect ? 1 : 0);
  const pointsEarned =
    (Number(prev.points_earned) || 0) + (Number(body.pointsDelta ?? body.amount) || 0);
  const metrics = mergeLevelMetrics(prevMetrics, {
    ...body,
    lessonId,
    levelNumber,
    progressScore: pointsEarned,
  });
  const lastCompleted = metrics.last_completed_question_index;
  await upsertLevelProgress({
    ...body,
    studentId,
    levelNumber,
    currentLevel: levelNumber,
    status: body.status || 'in_progress',
    lessonsCompleted: lastCompleted,
    quizCorrect,
    quizIncorrect,
    pointsEarned,
    metricsSnapshot: metrics,
  });
  if (body.questionId) {
    await insertQuizAttempt({
      ...body,
      studentId,
      levelNumber,
      lessonKey: lessonId || null,
      isCorrect: Boolean(body.isCorrect),
      rawPayload: {
        explanation: body.explanation || '',
        mindmap: body.mindmap || body.mindMap || null,
        mermaid: body.mermaid || null,
      },
    });
  }
  const amount = Number(body.pointsDelta ?? body.amount) || 0;
  if (amount) {
    await insertPointsLedger({
      studentId,
      sessionId: body.sessionId || null,
      levelNumber,
      amount,
      reason: body.reason || 'quiz',
    });
  }
  if (answered) {
    await insertGameplayEvent({
      studentId,
      sessionId: body.sessionId || null,
      levelNumber,
      eventType: body.eventType || (body.isCorrect ? 'answer_correct' : 'answer_incorrect'),
      payload: { lessonId, lastCompletedQuestionIndex: lastCompleted },
    });
  }
  return {
    studentId,
    lessonId,
    levelNumber,
    lastCompletedQuestionIndex: lastCompleted,
    currentQuestionIndex: metrics.current_question_index,
    farmSnapshot: metrics.farm_snapshot,
  };
}

/** Attach a generated explanation and mind map to the latest quiz attempt. */
export async function saveQuizExplanation(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const questionId = String(body.questionId || '').trim();
  const payload = {
    explanation: String(body.explanation || body.keyExplain || '').trim(),
    mindmap: body.mindmap || body.structuredMap || null,
    mermaid: body.mermaid || null,
  };
  const updated = await query(
    `UPDATE engagement_gaming.quiz_attempts
        SET raw_payload = COALESCE(raw_payload, '{}'::jsonb) || $3::jsonb
      WHERE attempt_id = (
        SELECT attempt_id
          FROM engagement_gaming.quiz_attempts
         WHERE student_id = $1
           AND ($2 = '' OR question_id = $2)
         ORDER BY answered_at DESC
         LIMIT 1
      )
      RETURNING attempt_id`,
    [studentId, questionId, JSON.stringify(payload)],
  );
  const attemptId = updated.rows?.[0]?.attempt_id;
  if (attemptId) return { attemptId, updated: true };
  const inserted = await insertQuizAttempt({
    studentId,
    sessionId: body.sessionId || null,
    levelNumber: 1,
    lessonKey: body.lessonId || body.lesson_id || null,
    questionId: questionId || null,
    isCorrect: false,
    rawPayload: payload,
  });
  return { ...inserted, updated: false };
}

export async function insertLessonCompletion(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const lessonCompletionId = String(body.lessonCompletionId || id('lc'));
  await query(
    `INSERT INTO engagement_gaming.lesson_completions (
       lesson_completion_id, student_id, level_progress_id, session_id,
       level_number, lesson_key, lesson_type, lesson_title, status,
       points_awarded, attempts, detail
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,0),COALESCE($11,1),$12::jsonb)`,
    [
      lessonCompletionId,
      studentId,
      body.levelProgressId || null,
      body.sessionId || null,
      Number(body.levelNumber) || 1,
      String(body.lessonKey || body.lesson_key || 'unknown'),
      body.lessonType || 'other',
      body.lessonTitle || null,
      body.status || 'completed',
      body.pointsAwarded ?? 0,
      body.attempts ?? 1,
      JSON.stringify(body.detail || {}),
    ],
  );
  return { lessonCompletionId };
}

export async function insertQuizAttempt(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const attemptId = String(body.attemptId || id('qa'));
  await query(
    `INSERT INTO engagement_gaming.quiz_attempts (
       attempt_id, student_id, session_id, level_number, lesson_key,
       question_id, question_bank, concept_tags, farm_action,
       is_correct, selected_option, correct_option, response_ms,
       hint_used, retry_index, points_delta, raw_payload
     ) VALUES (
       $1,$2,$3,$4,$5,
       $6,$7,$8::text[],$9,
       $10,$11,$12,$13,
       COALESCE($14,false),COALESCE($15,0),COALESCE($16,0),$17::jsonb
     )`,
    [
      attemptId,
      studentId,
      body.sessionId || null,
      body.levelNumber ?? null,
      body.lessonKey || null,
      body.questionId || null,
      body.questionBank || 'question_engine',
      Array.isArray(body.conceptTags) ? body.conceptTags : [],
      body.farmAction || null,
      Boolean(body.isCorrect),
      body.selectedOption ?? null,
      body.correctOption ?? null,
      body.responseMs ?? null,
      Boolean(body.hintUsed),
      body.retryIndex ?? 0,
      body.pointsDelta ?? 0,
      JSON.stringify(body.rawPayload || body),
    ],
  );
  return { attemptId };
}

function catalogCategory(raw) {
  const c = String(raw || 'other').toLowerCase().trim();
  if (c === 'animal' || c === 'prop' || c === 'decoration' || c === 'other') {
    return c;
  }
  if (c === 'decor') return 'decoration';
  if (c === 'building') return 'prop';
  return 'other';
}

export async function upsertUnlockCatalogItem(item = {}) {
  const itemId = String(item.itemId || item.id || '').trim();
  if (!itemId) return null;
  await query(
    `INSERT INTO engagement_gaming.unlock_catalog (
       item_id, item_name, category, base_price, description, image_path, meta
     ) VALUES ($1,$2,$3,COALESCE($4,0),$5,$6,$7::jsonb)
     ON CONFLICT (item_id) DO UPDATE SET
       item_name = EXCLUDED.item_name,
       category = EXCLUDED.category,
       base_price = EXCLUDED.base_price,
       description = COALESCE(EXCLUDED.description, engagement_gaming.unlock_catalog.description)`,
    [
      itemId,
      item.itemName || item.name || itemId,
      catalogCategory(item.category),
      item.basePrice ?? item.base_price ?? 0,
      item.description || null,
      item.imagePath || item.image || null,
      JSON.stringify(item.meta || {}),
    ],
  );
  return itemId;
}

export async function insertStudentUnlock(body = {}) {
  const studentId = String(body.studentId || '').trim();
  const itemId = String(body.itemId || '').trim();
  if (!studentId || !itemId) throw new Error('studentId and itemId required');

  await upsertStudent({
    studentId,
    studentName: body.studentName || body.displayName || studentId,
    displayName: body.displayName || body.studentName || studentId,
  });

  await upsertUnlockCatalogItem({
    itemId,
    itemName: body.itemName || itemId,
    category: body.category || 'other',
    basePrice: body.basePrice ?? body.pricePaid ?? 0,
    description: body.description,
    imagePath: body.imagePath,
  });

  const existing = await query(
    `SELECT student_unlock_id
       FROM engagement_gaming.student_unlocks
      WHERE student_id = $1 AND item_id = $2
      LIMIT 1`,
    [studentId, itemId],
  );
  const isNew = !existing.rows?.[0];
  const chapterOrdinal = Number(
    body.purchaseChapterOrdinal ?? body.placement?.purchaseChapterOrdinal,
  );
  const placement = {
    ...(body.placement && typeof body.placement === 'object' ? body.placement : {}),
    purchaseChapterId: String(
      body.purchaseChapterId || body.lessonId || body.placement?.purchaseChapterId || '',
    ).trim(),
    purchaseChapterOrdinal: Number.isFinite(chapterOrdinal) && chapterOrdinal > 0
      ? chapterOrdinal
      : 0,
    placementStatus:
      body.placementStatus || body.placement?.placementStatus || 'owned_pending_placement',
    source: body.source || body.placement?.source || 'shop',
  };
  if (Number(body.availableAtLevel) > 0) {
    placement.availableAtLevel = Number(body.availableAtLevel);
  }

  const studentUnlockId = String(body.studentUnlockId || rowUuid());
  const pricePaid = Math.max(0, Number(body.pricePaid) || 0);
  const insertSql = `INSERT INTO engagement_gaming.student_unlocks (
       student_unlock_id, student_id, item_id, session_id,
       purchased_at_level, price_paid, is_equipped, placement
     ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,0),COALESCE($7,false),$8::jsonb)
     ON CONFLICT (student_id, item_id) DO UPDATE SET
       price_paid = EXCLUDED.price_paid,
       purchased_at_level = COALESCE(EXCLUDED.purchased_at_level, engagement_gaming.student_unlocks.purchased_at_level),
       placement = EXCLUDED.placement`;
  const row = [
    studentUnlockId,
    studentId,
    itemId,
    body.sessionId || null,
    body.purchasedAtLevel ?? null,
    pricePaid,
    Boolean(body.isEquipped),
    JSON.stringify(placement),
  ];
  try {
    await query(insertSql, row);
  } catch (err) {
    if (row[3] && isSessionIdError(err)) {
      row[3] = null;
      await query(insertSql, row);
    } else {
      throw err;
    }
  }

  await query(
    `UPDATE engagement_gaming.students SET
       unlocks_owned_count = (
         SELECT COUNT(*)::int FROM engagement_gaming.student_unlocks u WHERE u.student_id = $1
       ),
       updated_at = NOW()
     WHERE student_id = $1`,
    [studentId],
  );

  if (isNew && pricePaid > 0) {
    const balance = await applyReportedFarmCash(studentId, body.walletBalance ?? body.currentMoney);
    await insertPointsLedger({
      studentId,
      studentName: body.studentName || body.displayName || studentId,
      sessionId: body.sessionId || null,
      levelNumber: body.purchasedAtLevel ?? null,
      entryType: 'spend',
      amount: -pricePaid,
      balanceAfter: balance,
      reason: 'unlock_shop',
      referenceId: itemId,
      meta: {
        itemId,
        purchaseChapterId: placement.purchaseChapterId,
      },
    }).catch(() => {});
  }

  return { studentUnlockId, itemId, placement };
}

/** Store the cash the farm already deducted, without subtracting the price a second time. */
async function applyReportedFarmCash(studentId, reported) {
  const nextCash = Number(reported);
  if (!studentId || !Number.isFinite(nextCash)) return null;
  const found = await query(
    `SELECT level_progress_id, metrics_snapshot
       FROM engagement_gaming.level_progress
      WHERE student_id = $1
        AND status IN ${OPEN_LEVEL_STATUSES}
      ORDER BY updated_at DESC
      LIMIT 1`,
    [studentId],
  );
  const row = found.rows?.[0];
  const metrics = row?.metrics_snapshot || {};
  const farm = metrics.farm_snapshot;
  if (!row || !farm || typeof farm !== 'object') return null;
  const cash = Math.max(0, nextCash);
  const nextFarm = { ...farm, currentMoney: cash, earnings: cash };
  await query(
    `UPDATE engagement_gaming.level_progress
        SET metrics_snapshot = jsonb_set(
              COALESCE(metrics_snapshot, '{}'::jsonb),
              '{farm_snapshot}',
              $2::jsonb,
              true
            ),
            updated_at = NOW()
      WHERE level_progress_id = $1`,
    [row.level_progress_id, JSON.stringify(nextFarm)],
  );
  return nextCash;
}

export async function insertPointsLedger(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const ledgerId = String(body.ledgerId || id('pts'));
  const amount = Number(body.amount) || 0;
  await query(
    `INSERT INTO engagement_gaming.points_ledger (
       ledger_id, student_id, session_id, level_number,
       entry_type, amount, balance_after, reason, reference_id, meta
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      ledgerId,
      studentId,
      body.sessionId || null,
      body.levelNumber ?? null,
      body.entryType || (amount >= 0 ? 'earn' : 'spend'),
      amount,
      body.balanceAfter ?? null,
      body.reason || 'gameplay',
      body.referenceId || null,
      JSON.stringify(body.meta || {}),
    ],
  );
  return { ledgerId };
}

const FRUSTRATION_SOURCES = new Set([
  'gameplay',
  'quiz',
  'mentor',
  'level_end',
  'manual',
]);

export async function insertFrustrationSnapshot(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const snapshotId = String(body.snapshotId || id('fr'));
  const score = Math.max(0, Math.min(100, Number(body.frustrationScore) || 0));
  const levelRaw = String(body.frustrationLevel || 'low').toLowerCase();
  const level = ['low', 'moderate', 'high', 'very_high'].includes(levelRaw)
    ? levelRaw
    : 'low';
  const source = FRUSTRATION_SOURCES.has(String(body.source || ''))
    ? String(body.source)
    : 'gameplay';

  await upsertStudent({
    studentId,
    studentName: body.studentName || body.displayName || studentId,
    displayName: body.displayName || body.studentName || studentId,
    frustrationScore: score,
    frustrationLevel: level,
  });

  const insertSql = `INSERT INTO engagement_gaming.frustration_snapshots (
       snapshot_id, student_id, session_id, level_number,
       frustration_score, frustration_level, signals, dominant_indicators, source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::text[],$9)`;
  const row = [
    snapshotId,
    studentId,
    body.sessionId || null,
    body.levelNumber ?? null,
    score,
    level,
    JSON.stringify(body.signals || {}),
    Array.isArray(body.dominantIndicators) ? body.dominantIndicators : [],
    source,
  ];
  try {
    await query(insertSql, row);
  } catch (err) {
    const msg = String(err?.message || '');
    if (row[2] && /uuid|foreign key|session_id/i.test(msg)) {
      row[2] = null;
      await query(insertSql, row);
    } else {
      throw err;
    }
  }

  await query(
    `UPDATE engagement_gaming.students SET
       latest_frustration_score = $2,
       latest_frustration_level = $3,
       last_seen_at = NOW(),
       updated_at = NOW()
     WHERE student_id = $1`,
    [studentId, score, level],
  );

  return { snapshotId, frustrationScore: score, frustrationLevel: level };
}

function normalizeFrustrationRow(row) {
  if (!row) return null;
  const recorded = row.recorded_at;
  return {
    snapshotId: row.snapshot_id || null,
    frustrationScore:
      row.frustration_score != null ? Number(row.frustration_score) : null,
    frustrationLevel: row.frustration_level || null,
    sessionId: row.session_id || null,
    levelNumber: row.level_number != null ? Number(row.level_number) : null,
    source: row.source || null,
    recordedAt: recorded ? new Date(recorded).toISOString() : null,
    signals: row.signals && typeof row.signals === 'object' ? row.signals : {},
    dominantIndicators: Array.isArray(row.dominant_indicators)
      ? row.dominant_indicators
      : [],
  };
}

/**
 * Latest frustration for a student (and optional recent history).
 * Other services poll this after the farm POSTs snapshots.
 * Score is 0–100; Socrates divides by 100 for Component 4's 0–1 cue.
 * @param {{ studentId: string, sessionId?: string, limit?: number }} opts
 */
export async function getFrustration(opts = {}) {
  const studentId = String(opts.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');

  const sessionId = String(opts.sessionId || '').trim() || null;
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 1));

  const historyResult = await query(
    `SELECT
       snapshot_id,
       session_id,
       level_number,
       frustration_score,
       frustration_level,
       signals,
       dominant_indicators,
       source,
       recorded_at
     FROM engagement_gaming.frustration_snapshots
     WHERE student_id = $1
       AND ($2::text IS NULL OR session_id::text = $2)
     ORDER BY recorded_at DESC
     LIMIT $3`,
    [studentId, sessionId, limit],
  );

  const history = (historyResult.rows || [])
    .map(normalizeFrustrationRow)
    .filter(Boolean);
  const latest = history[0] || null;

  // Prefer denormalized student columns when not filtering by session
  let frustrationScore = latest?.frustrationScore ?? null;
  let frustrationLevel = latest?.frustrationLevel ?? null;
  let recordedAt = latest?.recordedAt ?? null;

  if (!sessionId) {
    const studentResult = await query(
      `SELECT latest_frustration_score, latest_frustration_level, last_seen_at
       FROM engagement_gaming.students
       WHERE student_id = $1`,
      [studentId],
    );
    const student = studentResult.rows?.[0];
    if (student) {
      if (student.latest_frustration_score != null) {
        frustrationScore = Number(student.latest_frustration_score);
      }
      if (student.latest_frustration_level) {
        frustrationLevel = student.latest_frustration_level;
      }
      if (!recordedAt && student.last_seen_at) {
        recordedAt = new Date(student.last_seen_at).toISOString();
      }
    }
  }

  return {
    studentId,
    frustrationScore,
    frustrationLevel,
    recordedAt,
    sessionId: latest?.sessionId ?? sessionId,
    levelNumber: latest?.levelNumber ?? null,
    source: latest?.source ?? null,
    signals: latest?.signals ?? {},
    dominantIndicators: latest?.dominantIndicators ?? [],
    history,
  };
}

/** Alias used by the Socrates handoff on main. */
export async function getFrustrationForStudent(opts = {}) {
  return getFrustration(opts);
}

export async function insertMentorIntervention(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const interventionId = String(body.interventionId || id('mi'));

  await query(
    `INSERT INTO engagement_gaming.mentor_interventions (
       intervention_id, student_id, session_id, level_number,
       intervention_mode, perceived_state, trigger_reason, frustration_score,
       provider, model_name, opened_at, closed_at,
       student_message, mentor_reply, focus_payload, telemetry_snapshot
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6,$7,$8,
       $9,$10,COALESCE($11::timestamptz, NOW()),$12::timestamptz,
       $13,$14,$15::jsonb,$16::jsonb
     )`,
    [
      interventionId,
      studentId,
      body.sessionId || null,
      body.levelNumber ?? null,
      body.interventionMode || body.intervention_mode || 'SUPPORT_AND_SCAFFOLD',
      body.perceivedState || body.perceived_state || null,
      body.triggerReason || body.trigger_reason || null,
      body.frustrationScore ?? null,
      body.provider || null,
      body.modelName || body.model || null,
      body.openedAt || null,
      body.closedAt || null,
      body.studentMessage || null,
      body.mentorReply || null,
      JSON.stringify(body.focusPayload || body.intervention_focus || {}),
      JSON.stringify(body.telemetrySnapshot || body.telemetry || {}),
    ],
  );
  return { interventionId };
}

/**
 * Live farm cursor for launch / resume (frontend-app Game Arena card).
 */
export async function getStudentProgress(studentId) {
  const id = String(studentId || '').trim();
  if (!id) throw new Error('studentId required');

  const result = await query(
    `SELECT
       s.student_id,
       COALESCE(NULLIF(TRIM(s.display_name), ''), s.student_name) AS display_name,
       COALESCE(s.current_level, 1) AS current_level,
       COALESCE(s.wallet_balance, 0) AS wallet_balance,
       COALESCE(s.lessons_completed, 0) AS lessons_completed,
       s.latest_frustration_score,
       s.latest_frustration_level,
       s.last_seen_at,
       COALESCE(lp.highest_completed, 0)::int AS highest_completed_level
     FROM engagement_gaming.students s
     LEFT JOIN (
       SELECT student_id, MAX(level_number)::int AS highest_completed
       FROM engagement_gaming.level_progress
       WHERE status = 'completed'
       GROUP BY student_id
     ) lp ON lp.student_id = s.student_id
     WHERE s.student_id = $1`,
    [id],
  );

  const row = result.rows?.[0];
  if (!row) {
    return {
      found: false,
      studentId: id,
      currentLevel: 1,
      highestCompletedLevel: 0,
      cash: 0,
      isReturning: false,
    };
  }

  const highestCompletedLevel = Math.max(
    0,
    Number(row.highest_completed_level) || 0,
  );
  const storedLevel = Math.max(1, Number(row.current_level) || 1);
  const active = await query(
    `SELECT *
       FROM engagement_gaming.level_progress
      WHERE student_id = $1
        AND status IN ${OPEN_LEVEL_STATUSES}
      ORDER BY updated_at DESC
      LIMIT 1`,
    [id],
  );
  const activeResume = resumeFromProgressRow(active.rows?.[0]);
  const currentLevel = activeResume
    ? activeResume.levelNumber
    : Math.max(storedLevel, highestCompletedLevel + 1);

  return {
    found: true,
    studentId: row.student_id,
    displayName: row.display_name || null,
    currentLevel,
    highestCompletedLevel: activeResume
      ? Math.max(0, activeResume.levelNumber - 1)
      : highestCompletedLevel,
    authoritative: Boolean(activeResume),
    currentQuestionIndex: activeResume?.currentQuestionIndex ?? null,
    progressScore: activeResume?.progressScore ?? null,
    cash: Math.max(0, Number(row.wallet_balance) || 0),
    lessonsCompleted: Number(row.lessons_completed) || 0,
    frustrationScore:
      row.latest_frustration_score != null
        ? Number(row.latest_frustration_score)
        : null,
    frustrationLevel: row.latest_frustration_level || null,
    lastSeenAt: row.last_seen_at || null,
    isReturning:
      Boolean(activeResume) || currentLevel > 1 || highestCompletedLevel > 0,
  };
}

export async function insertGameplayEvent(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');

  await upsertStudent({
    studentId,
    studentName: body.studentName || body.displayName || studentId,
    displayName: body.displayName || body.studentName || studentId,
  });

  const eventId = String(body.eventId || rowUuid()).trim();
  const insertSql = `INSERT INTO engagement_gaming.gameplay_events (
       event_id, student_id, session_id, level_number, event_type, payload
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`;
  const row = [
    eventId,
    studentId,
    body.sessionId || null,
    body.levelNumber ?? null,
    String(body.eventType || 'unknown'),
    JSON.stringify(body.payload || {}),
  ];
  try {
    await query(insertSql, row);
  } catch (err) {
    if (row[2] && isSessionIdError(err)) {
      row[2] = null;
      await query(insertSql, row);
    } else {
      throw err;
    }
  }
  return { eventId };
}

function normalizeLeaderboardRow(row, rank) {
  return {
    rank,
    studentId: row.student_id,
    displayName: row.display_name || row.student_name || 'Player',
    currentLevel: Number(row.current_level) || 1,
    score: Number(row.score) || 0,
    quizCorrect: Number(row.quiz_correct) || 0,
  };
}

function neonLeaderboardUnusable(err) {
  const message = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'NO_DATABASE' ||
    message.includes('incorrect scheme') ||
    message.includes('database_url') ||
    message.includes('host is missing')
  );
}

/**
 * Global top-N leaderboard (all students in engagement DB).
 * Falls back to the file store when Neon is off or the connection string is invalid.
 * @param {{ period?: 'today'|'all', limit?: number, studentId?: string }} opts
 */
export async function getLeaderboard(opts = {}) {
  const period = opts.period === 'today' ? 'today' : 'all';
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 10));
  const studentId = String(opts.studentId || '').trim();

  if (!isPostgresEnabled()) {
    return getFileLeaderboard({ period, limit, studentId });
  }

  try {
    return await getNeonLeaderboard({ period, limit, studentId });
  } catch {
    return getFileLeaderboard({ period, limit, studentId });
  }
}

async function getNeonLeaderboard({ period, limit, studentId }) {
  let rows = [];
  if (period === 'today') {
    const result = await query(
      `SELECT
         s.student_id,
         COALESCE(NULLIF(TRIM(s.display_name), ''), s.student_name) AS display_name,
         COALESCE(MAX(s.current_level), 1) AS current_level,
         (
           COALESCE(SUM(GREATEST(qa.points_delta, 0)), 0)
           + COUNT(*) FILTER (WHERE qa.is_correct) * 10
         )::int AS score,
         COUNT(*) FILTER (WHERE qa.is_correct)::int AS quiz_correct
       FROM engagement_gaming.quiz_attempts qa
       JOIN engagement_gaming.students s ON s.student_id = qa.student_id
       WHERE qa.answered_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
       GROUP BY s.student_id, s.display_name, s.student_name
       HAVING COUNT(*) > 0
       ORDER BY score DESC, quiz_correct DESC, display_name ASC
       LIMIT $1`,
      [limit],
    );
    rows = result.rows || [];
  } else {
    const result = await query(
      `SELECT
         s.student_id,
         COALESCE(NULLIF(TRIM(s.display_name), ''), s.student_name) AS display_name,
         COALESCE(s.current_level, 1) AS current_level,
         GREATEST(
           COALESCE(s.total_points_earned, 0),
           COALESCE(stats.quiz_correct, 0) * 10 + COALESCE(s.current_level, 1) * 50
         )::int AS score,
         COALESCE(stats.quiz_correct, 0)::int AS quiz_correct
       FROM engagement_gaming.students s
       LEFT JOIN (
         SELECT
           student_id,
           SUM(quiz_correct)::int AS quiz_correct,
           SUM(points_earned)::int AS points_earned
         FROM engagement_gaming.level_progress
         GROUP BY student_id
       ) stats ON stats.student_id = s.student_id
       WHERE s.last_seen_at IS NOT NULL
       ORDER BY score DESC, current_level DESC, s.last_seen_at DESC
       LIMIT $1`,
      [limit],
    );
    rows = result.rows || [];
  }

  const entries = rows.map((row, index) => normalizeLeaderboardRow(row, index + 1));

  let you = null;
  if (studentId) {
    const inTop = entries.find((e) => e.studentId === studentId);
    if (inTop) {
      you = inTop;
    } else {
      you = await getStudentLeaderboardRank(studentId, period);
    }
  }

  return { period, limit, entries, you };
}

async function getStudentLeaderboardRank(studentId, period = 'all') {
  if (period === 'today') {
    const result = await query(
      `WITH ranked AS (
         SELECT
           s.student_id,
           COALESCE(NULLIF(TRIM(s.display_name), ''), s.student_name) AS display_name,
           COALESCE(MAX(s.current_level), 1) AS current_level,
           (
             COALESCE(SUM(GREATEST(qa.points_delta, 0)), 0)
             + COUNT(*) FILTER (WHERE qa.is_correct) * 10
           )::int AS score,
           COUNT(*) FILTER (WHERE qa.is_correct)::int AS quiz_correct,
           RANK() OVER (
             ORDER BY
               (
                 COALESCE(SUM(GREATEST(qa.points_delta, 0)), 0)
                 + COUNT(*) FILTER (WHERE qa.is_correct) * 10
               ) DESC,
               COUNT(*) FILTER (WHERE qa.is_correct) DESC
           ) AS rank
         FROM engagement_gaming.quiz_attempts qa
         JOIN engagement_gaming.students s ON s.student_id = qa.student_id
         WHERE qa.answered_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
         GROUP BY s.student_id, s.display_name, s.student_name
       )
       SELECT * FROM ranked WHERE student_id = $1`,
      [studentId],
    );
    const row = result.rows?.[0];
    return row ? normalizeLeaderboardRow(row, Number(row.rank) || 0) : null;
  }

  const result = await query(
    `WITH ranked AS (
       SELECT
         s.student_id,
         COALESCE(NULLIF(TRIM(s.display_name), ''), s.student_name) AS display_name,
         COALESCE(s.current_level, 1) AS current_level,
         GREATEST(
           COALESCE(s.total_points_earned, 0),
           COALESCE(stats.quiz_correct, 0) * 10 + COALESCE(s.current_level, 1) * 50
         )::int AS score,
         COALESCE(stats.quiz_correct, 0)::int AS quiz_correct,
         RANK() OVER (
           ORDER BY
             GREATEST(
               COALESCE(s.total_points_earned, 0),
               COALESCE(stats.quiz_correct, 0) * 10 + COALESCE(s.current_level, 1) * 50
             ) DESC,
             COALESCE(s.current_level, 1) DESC
         ) AS rank
       FROM engagement_gaming.students s
       LEFT JOIN (
         SELECT student_id, SUM(quiz_correct)::int AS quiz_correct
         FROM engagement_gaming.level_progress
         GROUP BY student_id
       ) stats ON stats.student_id = s.student_id
       WHERE s.last_seen_at IS NOT NULL
     )
     SELECT * FROM ranked WHERE student_id = $1`,
    [studentId],
  );
  const row = result.rows?.[0];
  return row ? normalizeLeaderboardRow(row, Number(row.rank) || 0) : null;
}

/** Upsert a student's public leaderboard stats (arena score). */
export async function submitLeaderboardScore(body = {}) {
  const studentId = String(body.studentId || body.student_id || '').trim();
  if (!studentId) throw new Error('studentId required');

  const score = Math.max(0, Math.round(Number(body.score) || 0));
  const quizCorrect = Math.max(0, Number(body.quizCorrect ?? body.quiz_correct) || 0);
  const currentLevel = body.currentLevel ?? body.current_level ?? 1;

  upsertLeaderboardEntry({
    studentId,
    displayName: body.displayName || body.studentName || body.student_name,
    currentLevel,
    score,
    quizCorrect,
  });

  if (isPostgresEnabled()) {
    try {
      await upsertStudent({
        ...body,
        studentId,
        totalPointsEarned: score,
        currentLevel,
        lessonsCompleted: body.lessonsCompleted ?? quizCorrect,
        walletBalance: body.walletBalance ?? body.cash ?? null,
      });
    } catch (err) {
      if (!neonLeaderboardUnusable(err)) throw err;
    }
  }

  return { studentId, score, quizCorrect };
}
