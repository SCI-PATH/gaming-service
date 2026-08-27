/**
 * Lobby progress + time targets from aptitude test (first visit) or prior farm levels.
 *
 * Integration order (first match wins):
 *   1. localStorage aptitude result (written by SCI-PATH Amplitude)
 *   2. AptitudePerformanceProvider (mock storyline profiles)
 *   3. VITE_ASSESSMENT_API_BASE remote lookup
 *   4. Mock fallback (dev default) — disable with VITE_USE_MOCK_APTITUDE_FALLBACK=false
 */
import { DDA_CONFIG, formatResponseTime, bandTimeTarget } from './dda.js';
import {
  getAllMasteryLevelRecords,
  getExternalMasteryRecord,
  getMasteryForLevelStart,
  setExternalMastery,
  bandFromMastery,
} from './masteryModel.js';
import { PERFORMANCE_LABELS } from './performanceCategories.js';
import { getFarmLevel } from './farmLevels.js';
import { getAptitudePerformance } from '../storyline/aptitude/AptitudePerformanceProvider.js';
import { hasSavedFarmProgress, loadFarmProgress, saveFarmProgress } from './farmProgress.js';

const APTITUDE_BASE_KEY = 'scipath_aptitude_result';

/** Until SCI-PATH Amplitude is wired, seed first-time students with mock aptitude. */
export const USE_MOCK_APTITUDE_FALLBACK =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_USE_MOCK_APTITUDE_FALLBACK !== 'false';

const PLACEMENT_MASTERY = Object.freeze({
  BASIC: 0.36,
  INTERMEDIATE: 0.55,
  ADVANCED: 0.76,
});

const PLACEMENT_LABELS = Object.freeze({
  BASIC: 'Building foundations',
  INTERMEDIATE: 'Solid middle path',
  ADVANCED: 'Ready for challenges',
});

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function clampTargetMs(ms) {
  const value = Math.round(Number(ms) || 0);
  return Math.max(
    DDA_CONFIG.minTargetMs,
    Math.min(DDA_CONFIG.maxTargetMs, value || DDA_CONFIG.midTargetMs),
  );
}

function aptitudeStorageKey(studentId) {
  return `${APTITUDE_BASE_KEY}__${studentId}`;
}

export function readStoredAptitudeResult(studentId) {
  if (!studentId) return null;
  try {
    const raw = localStorage.getItem(aptitudeStorageKey(studentId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export function saveStoredAptitudeResult(studentId, payload) {
  if (!studentId || !payload) return null;
  const record = {
    ...payload,
    studentId,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(aptitudeStorageKey(studentId), JSON.stringify(record));
  } catch {
    /* ignore quota */
  }
  return record;
}

/**
 * Placeholder aptitude for brand-new students while Amplitude integration is pending.
 * Persisted per student so targets stay stable across sessions.
 */
export function createDefaultMockAptitudeForStudent(student = {}) {
  return {
    studentId: student.id,
    studentName: student.displayName || student.username || student.id,
    grade: student.grade ?? 7,
    source: 'mock_aptitude_fallback',
    placementCategory: 'INTERMEDIATE',
    performanceLabel: 'Solid middle path',
    aptitudeData: {
      totalQuestions: 20,
      correctAnswers: 12,
      incorrectAnswers: 8,
      consecutiveWrongAnswers: 3,
      averageAnswerTime: 10.5,
      baselineAnswerTime: 6.5,
      answerTimeTrend: 0.12,
      retryCount: 4,
      failedAttempts: 4,
      hintUsage: 3,
      answerChanges: 4,
      rapidClickCount: 6,
      mouseMovementScore: 40,
      mouseInactivitySeconds: 18,
      repeatedUIInteractions: 3,
      questionsSkipped: 1,
      activityRestarts: 1,
      levelRestarts: 1,
      enemyDeaths: 2,
      performanceDecline: 0.18,
    },
  };
}

export function ensureMockAptitudeFallback(student) {
  if (!USE_MOCK_APTITUDE_FALLBACK || !student?.id || hasFarmLevelHistory()) {
    return null;
  }

  const stored = readStoredAptitudeResult(student.id);
  if (stored) {
    if (stored.source !== 'mock_aptitude_fallback') return stored;
    return stored;
  }

  const mock = createDefaultMockAptitudeForStudent(student);
  saveStoredAptitudeResult(student.id, mock);
  return mock;
}

function resolveAptitudeWithFallback(student) {
  if (!student?.id) return null;

  const stored = readStoredAptitudeResult(student.id);
  if (stored) return stored;

  const provider = getAptitudePerformance(student.id);
  if (provider) {
    saveStoredAptitudeResult(student.id, provider);
    return provider;
  }

  return ensureMockAptitudeFallback(student);
}

function ensureAptitudeBaselineApplied(student) {
  if (!student?.id || hasFarmLevelHistory()) return null;

  const aptitude = resolveAptitudeWithFallback(student);
  if (!aptitude) return null;

  const external = getExternalMasteryRecord();
  const incomingSource = aptitude.source || 'aptitude_test';

  if (
    external?.source === 'aptitude_test' &&
    external.meta?.aptitudeSource === incomingSource &&
    incomingSource !== 'amplitude_api'
  ) {
    return aptitude;
  }

  applyAptitudeBaseline(student, aptitude);
  return aptitude;
}

/**
 * Map Amplitude / aptitude metrics → 0–1 mastery for farm DDA.
 */
export function masteryFromAptitudePerformance(performance = {}) {
  const category = String(
    performance.placementCategory || performance.category || '',
  ).toUpperCase();
  if (category && PLACEMENT_MASTERY[category] != null) {
    return PLACEMENT_MASTERY[category];
  }

  const d = performance.aptitudeData || performance;
  const total = Math.max(0, Number(d.totalQuestions) || 0);
  const correct = Math.max(0, Number(d.correctAnswers) || 0);
  if (total > 0) {
    const accuracy = correct / total;
    return clamp01(0.28 + accuracy * 0.58);
  }

  const label = String(performance.performanceLabel || '').toLowerCase();
  if (label.includes('strong')) return 0.78;
  if (label.includes('struggling') || label.includes('weak')) return 0.34;
  return 0.5;
}

/**
 * Initial response-time target from aptitude component metrics.
 */
export function timeTargetFromAptitudePerformance(performance = {}, mastery = null) {
  const d = performance.aptitudeData || performance;
  const avgSec = Number(d.averageAnswerTime);
  if (avgSec > 0) {
    return clampTargetMs(avgSec * 1000);
  }

  const resolvedMastery =
    mastery != null ? clamp01(mastery) : masteryFromAptitudePerformance(performance);
  return bandTimeTarget(bandFromMastery(resolvedMastery));
}

export function hasFarmLevelHistory() {
  return getAllMasteryLevelRecords().length > 0 || hasSavedFarmProgress();
}

export function resolveCurrentLevelId() {
  const records = getAllMasteryLevelRecords();
  const fromMastery = records.length
    ? Math.max(...records.map((r) => Number(r.levelId) || 1)) + 1
    : 1;
  const saved = loadFarmProgress();
  const fromSaved = Math.max(1, Number(saved?.currentLevelId) || 1);
  return Math.max(1, fromMastery, fromSaved);
}

/** If older sessions only have mastery records, write the farm cursor now. */
function backfillFarmProgressCursor() {
  const records = getAllMasteryLevelRecords();
  if (!records.length) return;
  const highest = Math.max(...records.map((r) => Number(r.levelId) || 1));
  const saved = loadFarmProgress();
  if (
    saved.highestCompletedLevel >= highest &&
    saved.currentLevelId >= highest + 1
  ) {
    return;
  }
  saveFarmProgress({
    currentLevelId: Math.max(saved.currentLevelId || 1, highest + 1),
    highestCompletedLevel: Math.max(saved.highestCompletedLevel || 0, highest),
    cash: saved.cash,
  });
}

function resolveAptitudePerformance(student) {
  return resolveAptitudeWithFallback(student);
}

/**
 * Persist aptitude baseline into mastery model when no farm history exists yet.
 */
export function applyAptitudeBaseline(student, performance) {
  if (!student?.id || !performance || hasFarmLevelHistory()) return null;

  const mastery = masteryFromAptitudePerformance(performance);
  const timeTargetMs = timeTargetFromAptitudePerformance(performance, mastery);

  setExternalMastery({
    mastery,
    source: 'aptitude_test',
    meta: {
      placementCategory:
        performance.placementCategory || performance.category || null,
      performanceLabel: performance.performanceLabel || null,
      aptitudeSource: performance.source || 'aptitude_test',
      timeTargetMs,
      averageAnswerTime:
        performance.aptitudeData?.averageAnswerTime ??
        performance.averageAnswerTime ??
        null,
    },
  });

  return { mastery, timeTargetMs };
}

/**
 * Optional remote lookup (SCI-PATH assessment API) when env is configured.
 */
export async function fetchRemoteAptitudeStatus(studentId) {
  const base =
    (typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_ASSESSMENT_API_BASE?.trim()) ||
    '';
  if (!base || !studentId) return null;

  const url = `${base.replace(/\/+$/, '')}/students/${encodeURIComponent(studentId)}/initial-category`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const category = String(
      data.initial_category || data.placement_category || data.category || '',
    ).toUpperCase();
    if (!category || PLACEMENT_MASTERY[category] == null) return null;

    return {
      studentId,
      source: 'amplitude_api',
      placementCategory: category,
      performanceLabel: PLACEMENT_LABELS[category] || category,
      aptitudeData: {
        totalQuestions: 10,
        correctAnswers: Math.round(PLACEMENT_MASTERY[category] * 10),
        averageAnswerTime:
          category === 'ADVANCED' ? 6.5 : category === 'BASIC' ? 14.5 : 10.5,
        baselineAnswerTime: 6.5,
      },
    };
  } catch {
    return null;
  }
}

function bandLabelFromPrior(prior) {
  const pct = Math.round((prior?.mastery || 0) * 100);
  switch (prior?.band) {
    case 'smart':
    case 'strong':
      return `Smart (${pct}%)`;
    case 'weak':
    case 'emerging':
      return `Weak (${pct}%)`;
    default:
      return `Medium (${pct}%)`;
  }
}

function buildSteps(phase) {
  if (phase === 'returning') return [];
  return [{ id: 'farm', label: 'Farm adventure', status: 'current' }];
}

/**
 * Resolve lobby card copy + underlying mastery/time target source.
 */
export function resolveLobbyProgress(student, farm = {}) {
  if (student?.id && !hasFarmLevelHistory()) {
    ensureAptitudeBaselineApplied(student);
  }

  const levelRecords = getAllMasteryLevelRecords();
  const hasHistory = hasFarmLevelHistory();
  const levelId = hasHistory
    ? resolveCurrentLevelId()
    : Math.max(1, Number(farm.levelId) || 1);
  const prior = getMasteryForLevelStart(levelId);
  const hasBaseline =
    prior.source === 'aptitude_test' ||
    prior.source === 'external' ||
    Boolean(resolveAptitudePerformance(student));

  let phase = 'needs_aptitude';
  if (hasHistory) {
    phase = 'returning';
  } else if (hasBaseline) {
    phase = 'aptitude_ready';
  }

  const targetMs = prior.timeTargetMs ?? DDA_CONFIG.midTargetMs;
  const targetLabel = formatResponseTime(targetMs);

  if (phase === 'needs_aptitude') {
    return {
      phase,
      steps: buildSteps('aptitude_ready'),
      progressPct: 0,
      progressCountLabel: 'Level 1 · Getting ready',
      masteryLabel: bandLabelFromPrior(prior),
      targetLabel,
      targetSource: 'initial',
      targetMs,
      bandLabel: bandLabelFromPrior(prior),
      gameplayLabel: PERFORMANCE_LABELS[prior.band] || PERFORMANCE_LABELS.medium,
      prior,
      levelId,
    };
  }

  if (phase === 'aptitude_ready') {
    return {
      phase,
      steps: buildSteps(phase),
      progressPct: 0,
      progressCountLabel: 'Level 1 · New run',
      masteryLabel: bandLabelFromPrior(prior),
      targetLabel,
      targetSource: 'initial',
      targetMs,
      bandLabel: bandLabelFromPrior(prior),
      gameplayLabel: PERFORMANCE_LABELS[prior.band] || PERFORMANCE_LABELS.medium,
      prior,
      levelId,
    };
  }

  const answered = Number(farm.questionsAnswered) || 0;
  const maxQuestions = farm.maxQuestions ?? DDA_CONFIG.maxQuestions;
  const progressPct = maxQuestions
    ? Math.min(100, Math.round((answered / maxQuestions) * 100))
    : 0;

  const highestCompleted = Math.max(
    levelRecords.length > 0
      ? Math.max(...levelRecords.map((r) => Number(r.levelId) || 1))
      : 0,
    Number(loadFarmProgress().highestCompletedLevel) || 0,
  );

  return {
    phase,
    steps: buildSteps(phase),
    progressPct,
    progressCountLabel: highestCompleted
      ? `Level ${highestCompleted} complete · continue Level ${levelId}`
      : `${answered} / ${maxQuestions} questions`,
    masteryLabel: bandLabelFromPrior(prior),
    targetLabel,
    targetSource: prior.fromLevelId ? 'previous_level' : 'initial',
    targetMs,
    bandLabel: bandLabelFromPrior(prior),
    gameplayLabel: PERFORMANCE_LABELS[prior.band] || PERFORMANCE_LABELS.medium,
    prior,
    levelId,
    highestCompletedLevel: highestCompleted,
  };
}

export function farmBaselinesFromPrior(prior, levelId = 1) {
  const level = getFarmLevel(levelId);
  const mastery = prior?.mastery ?? 0.5;
  const timeTargetMs = prior?.timeTargetMs ?? DDA_CONFIG.midTargetMs;
  const saved = loadFarmProgress();
  const cash = Math.max(0, Number(saved?.cash) || 0);

  return {
    levelId,
    earnings: cash,
    currentMoney: cash,
    mastery,
    masteryPercent: Math.round(mastery * 100),
    performanceBand: prior?.band || 'medium',
    timeTargetMs,
    timeTargetLabel: formatResponseTime(timeTargetMs),
    target: timeTargetMs,
    cropName: level.cropName,
    cropId: level.cropId,
    cropValue: level.cropValue,
    maxQuestions: DDA_CONFIG.maxQuestions,
    goalText: `Target avg ${formatResponseTime(timeTargetMs)} · ${DDA_CONFIG.maxQuestions} questions`,
  };
}

/**
 * Synchronous bootstrap — mock fallback + lobby/farm baseline (no network).
 */
export function syncBootstrapStudentProgress(student) {
  if (!student?.id) {
    return { lobby: resolveLobbyProgress(null), farmPatch: null, prior: null };
  }

  if (!hasFarmLevelHistory()) {
    ensureAptitudeBaselineApplied(student);
  }

  backfillFarmProgressCursor();
  const levelId = resolveCurrentLevelId();
  const prior = getMasteryForLevelStart(levelId);
  const lobby = resolveLobbyProgress(student, { levelId });

  return {
    lobby,
    farmPatch: farmBaselinesFromPrior(prior, levelId),
    prior,
  };
}

/**
 * Bootstrap student session: sync mock/local → remote aptitude override → farm baseline.
 */
export async function bootstrapStudentProgress(student) {
  if (!student?.id) {
    return { lobby: resolveLobbyProgress(null), farmPatch: null, prior: null };
  }

  if (!hasFarmLevelHistory()) {
    ensureAptitudeBaselineApplied(student);

    const remote = await fetchRemoteAptitudeStatus(student.id);
    if (remote) {
      saveStoredAptitudeResult(student.id, remote);
      applyAptitudeBaseline(student, remote);
    }
  }

  backfillFarmProgressCursor();
  const levelId = resolveCurrentLevelId();
  const prior = getMasteryForLevelStart(levelId);
  const lobby = resolveLobbyProgress(student, { levelId });

  return {
    lobby,
    farmPatch: farmBaselinesFromPrior(prior, levelId),
    prior,
  };
}
