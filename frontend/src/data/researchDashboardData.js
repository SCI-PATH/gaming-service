/**
 * Aggregate student progress for the research / instructor dashboard.
 * Reads persisted mastery, gameplay, unlocks + live session telemetry.
 */
import { getCurrentStudent } from './mockStudents.js';
import {
  getAllMasteryLevelRecords,
  getExternalMasteryRecord,
} from './masteryModel.js';
import {
  getAllGameplayLevelRecords,
  getGameplayHistoryRecords,
  GAMEPLAY_BAND_LABELS,
} from './gameplayPerformance.js';
import {
  UNLOCK_ITEMS,
  getOwnedUnlockIds,
  getAllUnlockMeta,
} from './unlockShop.js';
import { PERFORMANCE_LABELS } from './performanceCategories.js';
import {
  FRUSTRATION_LEVEL_RANGES,
  FRUSTRATION_LEVELS,
} from './frustrationModel.js';
import { formatResponseTime } from './dda.js';

function unlockCatalogMap() {
  const map = new Map();
  for (const item of UNLOCK_ITEMS) map.set(item.id, item);
  return map;
}

/**
 * @param {{
 *   farm?: object,
 *   telemetrySession?: object,
 *   behavioralMetrics?: object,
 *   rpEarned?: number,
 *   ddaMisses?: number,
 * }} live
 */
export function buildResearchDashboardSnapshot(live = {}) {
  const student = getCurrentStudent();
  const masteryLevels = getAllMasteryLevelRecords();
  const gameplayLevels = getAllGameplayLevelRecords();
  const gameplayHistory = getGameplayHistoryRecords();
  const ownedIds = getOwnedUnlockIds();
  const unlockMeta = getAllUnlockMeta();
  const catalog = unlockCatalogMap();

  const farm = live.farm || {};
  const session = live.telemetrySession || {};
  const metrics = live.behavioralMetrics || session.metrics || {};

  const totalCorrect = masteryLevels.reduce(
    (s, r) => s + (Number(r.quizCorrect) || 0),
    0,
  );
  const totalIncorrect = masteryLevels.reduce(
    (s, r) => s + (Number(r.quizIncorrect) || 0),
    0,
  );
  const totalAnswered = totalCorrect + totalIncorrect;
  const overallAccuracy =
    totalAnswered > 0 ? totalCorrect / totalAnswered : null;

  const avgMastery =
    masteryLevels.length > 0
      ? masteryLevels.reduce((s, r) => s + (Number(r.mastery) || 0), 0) /
        masteryLevels.length
      : null;

  const frustrationScore = Number(
    session.frustrationScore ?? metrics.frustration_score ?? 0,
  );
  const frustrationLevel =
    session.frustrationLevel ||
    metrics.frustration_level ||
    FRUSTRATION_LEVELS.LOW;

  const lessonProgress = masteryLevels.map((rec) => {
    const gp = gameplayLevels.find(
      (g) => Number(g.levelId) === Number(rec.levelId),
    );
    const answered =
      (Number(rec.quizCorrect) || 0) + (Number(rec.quizIncorrect) || 0);
    return {
      levelId: Number(rec.levelId),
      masteryPct: Math.round((Number(rec.mastery) || 0) * 100),
      band: rec.band,
      bandLabel: PERFORMANCE_LABELS[rec.band] || rec.band,
      quizCorrect: Number(rec.quizCorrect) || 0,
      quizIncorrect: Number(rec.quizIncorrect) || 0,
      questionsAnswered: answered,
      accuracyPct:
        answered > 0
          ? Math.round(((Number(rec.quizCorrect) || 0) / answered) * 100)
          : null,
      avgResponseMs: rec.avgResponseMs ?? null,
      avgResponseLabel: rec.avgResponseMs
        ? formatResponseTime(rec.avgResponseMs)
        : '—',
      timeTargetMs: rec.timeTargetMs ?? null,
      timeTargetLabel: rec.timeTargetMs
        ? formatResponseTime(rec.timeTargetMs)
        : '—',
      beatTimeTarget: rec.beatTimeTarget,
      gameplayBand: gp?.classification || null,
      gameplayLabel:
        GAMEPLAY_BAND_LABELS[gp?.classification] ||
        gp?.classification ||
        null,
      grade: gp?.grade || null,
      retries: gp?.retries ?? null,
      levelCompletionTimeSec: gp?.levelCompletionTimeSec ?? null,
      savedAt: rec.savedAt || null,
      attempts: Array.isArray(rec.attempts) ? rec.attempts : [],
    };
  });

  const unlocks = ownedIds.map((id) => {
    const item = catalog.get(id);
    const meta = unlockMeta[id] || {};
    return {
      id,
      name: item?.name || id,
      category: item?.category || 'item',
      price: item?.price ?? null,
      purchasedAtLevel: Number(meta.purchasedAtLevel) || null,
      textureKey: item?.textureKey || null,
    };
  });

  const currentLevel = Math.max(1, Number(farm.levelId) || 1);
  const highestCompleted =
    lessonProgress.length > 0
      ? Math.max(...lessonProgress.map((r) => r.levelId))
      : 0;

  return {
    exportedAt: new Date().toISOString(),
    student: student
      ? {
          id: student.id,
          username: student.username,
          displayName: student.displayName,
          isMockAptitudeStudent: Boolean(student.isMockAptitudeStudent),
        }
      : null,
    summary: {
      currentLevel,
      highestCompletedLevel: highestCompleted,
      levelsCompleted: lessonProgress.length,
      overallMasteryPct: avgMastery != null ? Math.round(avgMastery * 100) : null,
      overallAccuracyPct:
        overallAccuracy != null ? Math.round(overallAccuracy * 100) : null,
      totalCorrect,
      totalIncorrect,
      totalAnswered,
      unlockCount: unlocks.length,
      cash: Number(farm.earnings ?? farm.currentMoney) || 0,
      rpEarned: Number(live.rpEarned) || 0,
      ddaMisses: Number(live.ddaMisses) || 0,
      liveQuestionsAnswered: Number(farm.questionsAnswered) || 0,
      liveAccuracy: farm.accuracy ?? null,
      liveMasteryBand: farm.performanceBand || null,
      liveMasteryLabel:
        PERFORMANCE_LABELS[farm.performanceBand] ||
        farm.performanceBand ||
        null,
    },
    frustration: {
      score: Math.round(frustrationScore),
      level: frustrationLevel,
      ranges: FRUSTRATION_LEVEL_RANGES,
      consecutiveFails: Number(session.consecutiveFails) || 0,
      triggerCount: Number(session.triggerCount) || 0,
      lastTriggerReason: session.lastTriggerReason || null,
      lastInterventionMode: session.lastInterventionMode || null,
      metrics: {
        correctAnswers: metrics.correct_answers ?? null,
        incorrectAnswers: metrics.incorrect_answers ?? null,
        avgTimeSec: metrics.time_per_question_avg_sec ?? null,
        hintUsage: metrics.hint_usage ?? null,
        retries: metrics.retries ?? null,
      },
    },
    lessonProgress,
    unlocks,
    gameplayHistory: gameplayHistory.map((h) => ({
      levelId: h.levelId,
      classification: h.classification,
      label: GAMEPLAY_BAND_LABELS[h.classification] || h.classification,
      grade: h.grade,
      avgAnswerTimeSec: h.avgAnswerTimeSec,
      retries: h.retries,
      compositeScore: h.compositeScore,
      savedAt: h.savedAt,
    })),
    externalMastery: getExternalMasteryRecord(),
  };
}

export function downloadResearchJson(snapshot, filename) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  });
  triggerDownload(
    blob,
    filename ||
      `scipath-research-${snapshot?.student?.id || 'student'}-${Date.now()}.json`,
  );
}

export function downloadResearchCsv(snapshot, filename) {
  const rows = [
    [
      'levelId',
      'masteryPct',
      'band',
      'quizCorrect',
      'quizIncorrect',
      'accuracyPct',
      'avgResponseMs',
      'timeTargetMs',
      'beatTimeTarget',
      'gameplayBand',
      'grade',
      'retries',
    ],
    ...(snapshot.lessonProgress || []).map((r) => [
      r.levelId,
      r.masteryPct,
      r.band,
      r.quizCorrect,
      r.quizIncorrect,
      r.accuracyPct ?? '',
      r.avgResponseMs ?? '',
      r.timeTargetMs ?? '',
      r.beatTimeTarget == null ? '' : r.beatTimeTarget,
      r.gameplayBand ?? '',
      r.grade ?? '',
      r.retries ?? '',
    ]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(
    blob,
    filename ||
      `scipath-lessons-${snapshot?.student?.id || 'student'}-${Date.now()}.csv`,
  );
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
