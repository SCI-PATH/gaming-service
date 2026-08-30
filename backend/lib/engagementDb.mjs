/**
 * Persistence for engagement_gaming (Neon).
 * Matches tables created in backend/sql/004_all_extra_tables.sql
 */
import { getFileLeaderboard, upsertLeaderboardEntry } from './db.mjs';
import { isPostgresEnabled, query } from './pg.mjs';

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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
  await query(
    `INSERT INTO engagement_gaming.game_sessions (
       session_id, student_id, started_at, start_level, client_version, device_info
     ) VALUES ($1,$2,NOW(),$3,$4,$5::jsonb)
     ON CONFLICT (session_id) DO UPDATE SET
       start_level = COALESCE(EXCLUDED.start_level, engagement_gaming.game_sessions.start_level)`,
    [
      sessionId,
      studentId,
      body.startLevel ?? body.start_level ?? 1,
      body.clientVersion || body.client_version || 'gaming-service',
      JSON.stringify(body.deviceInfo || body.device_info || {}),
    ],
  );
  return { sessionId, studentId };
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
      item.category || 'other',
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

  await upsertUnlockCatalogItem({
    itemId,
    itemName: body.itemName || itemId,
    category: body.category || 'other',
    basePrice: body.basePrice ?? body.pricePaid ?? 0,
    description: body.description,
    imagePath: body.imagePath,
  });

  const studentUnlockId = String(body.studentUnlockId || id('ul'));
  await query(
    `INSERT INTO engagement_gaming.student_unlocks (
       student_unlock_id, student_id, item_id, session_id,
       purchased_at_level, price_paid, is_equipped, placement
     ) VALUES ($1,$2,$3,$4,$5,COALESCE($6,0),COALESCE($7,false),$8::jsonb)
     ON CONFLICT (student_id, item_id) DO UPDATE SET
       price_paid = EXCLUDED.price_paid,
       purchased_at_level = COALESCE(EXCLUDED.purchased_at_level, engagement_gaming.student_unlocks.purchased_at_level),
       placement = EXCLUDED.placement`,
    [
      studentUnlockId,
      studentId,
      itemId,
      body.sessionId || null,
      body.purchasedAtLevel ?? null,
      body.pricePaid ?? 0,
      Boolean(body.isEquipped),
      JSON.stringify(body.placement || {}),
    ],
  );

  await query(
    `UPDATE engagement_gaming.students SET
       unlocks_owned_count = (
         SELECT COUNT(*)::int FROM engagement_gaming.student_unlocks u WHERE u.student_id = $1
       ),
       updated_at = NOW()
     WHERE student_id = $1`,
    [studentId],
  );

  return { studentUnlockId, itemId };
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

export async function insertFrustrationSnapshot(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const snapshotId = String(body.snapshotId || id('fr'));
  const score = Math.max(0, Math.min(100, Number(body.frustrationScore) || 0));
  const level = String(body.frustrationLevel || 'low');

  await query(
    `INSERT INTO engagement_gaming.frustration_snapshots (
       snapshot_id, student_id, session_id, level_number,
       frustration_score, frustration_level, signals, dominant_indicators, source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::text[],$9)`,
    [
      snapshotId,
      studentId,
      body.sessionId || null,
      body.levelNumber ?? null,
      score,
      level,
      JSON.stringify(body.signals || {}),
      Array.isArray(body.dominantIndicators) ? body.dominantIndicators : [],
      body.source || 'gameplay',
    ],
  );

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
  const currentLevel = Math.max(storedLevel, highestCompletedLevel + 1);

  return {
    found: true,
    studentId: row.student_id,
    displayName: row.display_name || null,
    currentLevel,
    highestCompletedLevel,
    cash: Math.max(0, Number(row.wallet_balance) || 0),
    lessonsCompleted: Number(row.lessons_completed) || 0,
    frustrationScore:
      row.latest_frustration_score != null
        ? Number(row.latest_frustration_score)
        : null,
    frustrationLevel: row.latest_frustration_level || null,
    lastSeenAt: row.last_seen_at || null,
    isReturning: currentLevel > 1 || highestCompletedLevel > 0,
  };
}

export async function insertGameplayEvent(body = {}) {
  const studentId = String(body.studentId || '').trim();
  if (!studentId) throw new Error('studentId required');
  const eventId = String(body.eventId || id('ev'));
  await query(
    `INSERT INTO engagement_gaming.gameplay_events (
       event_id, student_id, session_id, level_number, event_type, payload
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      eventId,
      studentId,
      body.sessionId || null,
      body.levelNumber ?? null,
      String(body.eventType || 'unknown'),
      JSON.stringify(body.payload || {}),
    ],
  );
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
