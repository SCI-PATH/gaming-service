/**
 * Controlled demonstration scenarios for academic panel recordings.
 *
 * These fixtures set *inputs* (correctness + response times) that flow through
 * the real frustration / performance classifiers. They do not hardcode final
 * DDA outputs or shop prices.
 *
 * Enable with URL params, for example:
 *   ?demoProfile=smart&demoGrade=6&researchOverlay=1
 *   ?demoAct=shop&demoGrade=6
 *     Grade 6 only: after the level, buy unlocks and show them on the next farm.
 */

import { PERFORMANCE_CATEGORIES } from './performanceCategories.js';
import { FRUSTRATION_LEVELS, frustrationLevelFromScore } from './frustrationModel.js';
import {
  featuredChallengesForGrade,
  getGradeChallengeLibrary,
  normalizeStudentGrade,
} from './gradeChallengeLibraries.js';
import { scoreQuestionAttempt } from './questionFrustration.js';
import { averageLevelFrustration } from './shopPricePolicy.js';
import { freezeShopOffer } from './questionFrustration.js';
import { chapterIdFromTopicId } from './curriculumTopics.js';
import {
  beginDemoStudent,
  getCurrentStudent,
  isDemoStudent,
  restoreHeldStudent,
} from './mockStudents.js';

export const DEMO_PROFILES = Object.freeze({
  smart: Object.freeze({
    id: 'smart',
    label: 'Smart / Low Frustration',
    performanceCategory: PERFORMANCE_CATEGORIES.SMART,
    targetFrustrationLevel: FRUSTRATION_LEVELS.LOW,
    /**
     * Scripted answers: mostly correct and comfortably paced.
     * One deliberate miss so Sage still appears, in the upbeat tone.
     */
    attempts: Object.freeze([
      { wasCorrect: true, responseTimeMs: 4500 },
      { wasCorrect: true, responseTimeMs: 5200 },
      { wasCorrect: true, responseTimeMs: 4800 },
      { wasCorrect: false, responseTimeMs: 8000 },
      { wasCorrect: true, responseTimeMs: 5500 },
      { wasCorrect: true, responseTimeMs: 4900 },
      { wasCorrect: true, responseTimeMs: 5300 },
      { wasCorrect: true, responseTimeMs: 5800 },
      { wasCorrect: true, responseTimeMs: 5000 },
      { wasCorrect: true, responseTimeMs: 4700 },
    ]),
  }),
  intermediate: Object.freeze({
    id: 'intermediate',
    label: 'Intermediate / Moderate Frustration',
    performanceCategory: PERFORMANCE_CATEGORIES.MEDIUM,
    targetFrustrationLevel: FRUSTRATION_LEVELS.MODERATE,
    attempts: Object.freeze([
      { wasCorrect: true, responseTimeMs: 8000 },
      { wasCorrect: false, responseTimeMs: 16000 },
      { wasCorrect: false, responseTimeMs: 20000 },
      { wasCorrect: true, responseTimeMs: 14000 },
      { wasCorrect: false, responseTimeMs: 26000 },
      { wasCorrect: false, responseTimeMs: 28000 },
      { wasCorrect: true, responseTimeMs: 15000 },
      { wasCorrect: false, responseTimeMs: 24000 },
      { wasCorrect: false, responseTimeMs: 22000 },
      { wasCorrect: false, responseTimeMs: 20000 },
    ]),
  }),
  weak: Object.freeze({
    id: 'weak',
    label: 'Weak / High Frustration',
    performanceCategory: PERFORMANCE_CATEGORIES.WEAK,
    targetFrustrationLevel: FRUSTRATION_LEVELS.HIGH,
    attempts: Object.freeze([
      { wasCorrect: false, responseTimeMs: 7000 },
      { wasCorrect: false, responseTimeMs: 8000 },
      { wasCorrect: false, responseTimeMs: 18000 },
      { wasCorrect: false, responseTimeMs: 24000 },
      { wasCorrect: false, responseTimeMs: 30000 },
      { wasCorrect: false, responseTimeMs: 36000 },
      { wasCorrect: false, responseTimeMs: 42000 },
      { wasCorrect: false, responseTimeMs: 48000 },
      { wasCorrect: false, responseTimeMs: 52000 },
      { wasCorrect: false, responseTimeMs: 56000 },
    ]),
  }),
});

/** Map URL words (low, medium, high, weak) onto smart, intermediate, or weak. */
export function normalizeDemoProfile(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase();
  if (key === 'smart' || key === 'low') return 'smart';
  if (key === 'intermediate' || key === 'medium' || key === 'moderate') {
    return 'intermediate';
  }
  if (key === 'weak' || key === 'high') return 'weak';
  return null;
}

/**
 * Read demoGrade, demoProfile, and demoAct from the URL.
 * A shop act with no profile records the smart grade-6 unlock path.
 */
export function readDemoLaunch(search = '') {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const actRaw = String(params.get('demoAct') || params.get('demoScript') || '')
    .trim()
    .toLowerCase();
  const act = actRaw === 'shop' || actRaw === 'unlock' || actRaw === 'buy' ? 'shop' : 'play';
  let profile = normalizeDemoProfile(params.get('demoProfile') || params.get('profile'));
  // Grade 6 shop recordings default to the smart profile when none is named.
  if (!profile && act === 'shop') profile = 'smart';
  const hasDemoGrade = params.has('demoGrade');
  const explicitDemoGrade = normalizeStudentGrade(params.get('demoGrade'));
  const isolated = Boolean(profile) || hasDemoGrade;
  const grade = explicitDemoGrade ?? (isolated ? normalizeStudentGrade(params.get('grade')) : null);
  const researchOverlay =
    params.get('researchOverlay') === '1' ||
    params.get('ddaOverlay') === '1' ||
    isolated;
  const demoSessionId = String(params.get('demoSession') || '').trim() || null;
  return {
    enabled: Boolean(profile),
    isolated,
    profile,
    act,
    grade: isolated ? grade ?? 6 : explicitDemoGrade,
    researchOverlay,
    demoSessionId,
    label: profile ? DEMO_PROFILES[profile].label : null,
  };
}

function scienceTopicForGrade(grade) {
  const lib = getGradeChallengeLibrary(grade);
  return lib?.scienceChallenges?.[0] || null;
}

/** Isolated student for a demo URL. Does not reuse a saved student's id or grade. */
export function buildDemoStudent(launch) {
  const grade = normalizeStudentGrade(launch?.grade) ?? 6;
  const profile = normalizeDemoProfile(launch?.profile);
  const topic = scienceTopicForGrade(grade);
  const chapterId = chapterIdFromTopicId(topic?.topicId) || null;
  return {
    id: `demo_g${grade}_${profile || 'live'}`,
    username: `demo_g${grade}_${profile || 'live'}`,
    displayName: profile ? `Demo ${profile} · Grade ${grade}` : `Demo Grade ${grade}`,
    grade,
    topicId: topic?.topicId || null,
    chapterId,
    chapterTitle: topic?.chapterTitle || topic?.subject || null,
    isDemoSession: true,
    demoProfile: profile,
  };
}

/**
 * What this profile's script measures through the real question scorer.
 * Recordings do not pin the world to this seed — live answers move the score.
 */
export function demoAdaptationSeed(profileId) {
  const pipeline = simulateDemoProfilePipeline(profileId);
  if (!pipeline) return null;
  const score = Number(pipeline.finalSmoothedScore);
  const level =
    pipeline.rows?.at?.(-1)?.smoothedLevel ||
    (Number.isFinite(score) ? frustrationLevelFromScore(score) : FRUSTRATION_LEVELS.MODERATE);
  return {
    pinned: true,
    profileId: pipeline.profileId,
    frustrationScore: Number.isFinite(score) ? score : 0,
    frustrationLevel: level,
    performanceCategory: pipeline.targetPerformanceCategory,
    shopOffer: pipeline.shopOffer,
    source: 'demo_pipeline',
    researchEligible: false,
  };
}

let activeLaunch = null;
let activeSeed = null;

/** Measured seed for the active recording, or null outside a demo URL. */
export function readDemoAdaptationSeed() {
  return activeSeed;
}

/** Launch parsed for this page load. */
export function readActiveDemoLaunch() {
  return activeLaunch;
}

/**
 * Apply demoGrade / demoProfile for this page load.
 * A real saved student is held aside and restored when the URL is not a demo.
 */
export function installDemoLaunch(search = '') {
  const launch = readDemoLaunch(search);
  activeLaunch = launch;
  // A normal student URL restores whoever was held aside for a previous demo.
  if (!launch.isolated) {
    activeSeed = null;
    if (isDemoStudent()) restoreHeldStudent();
    return { launch, seed: null, student: getCurrentStudent() };
  }
  const student = beginDemoStudent(buildDemoStudent(launch));
  const seeded = launch.profile ? demoAdaptationSeed(launch.profile) : null;
  activeSeed = seeded ? { ...seeded, pinned: false, autoplay: true } : null;
  return { launch, seed: activeSeed, student };
}

/** True while a demo profile is playing itself for a recording. */
export function isDemoAutoplay() {
  return Boolean(activeLaunch?.profile && activeSeed?.autoplay && !activeSeed?.pinned);
}

/** Grade 6 shop recording: buy unlocks, then show them on the next farm level. */
export function isDemoShopRun() {
  return isDemoAutoplay() && activeLaunch?.act === 'shop';
}

/** Performance object for the real unlock-shop price function. Purchases stay disabled. */
export function demoShopPerformance(seed, live = {}) {
  const pinned = seed?.pinned ? seed : null;
  // A pinned seed freezes the price preview. Live play uses the score from real answers.
  const frustrationScore = pinned
    ? pinned.frustrationScore
    : Number(live.frustrationScore) || 0;
  const frustrationLevel = pinned
    ? pinned.frustrationLevel
    : live.frustrationLevel || frustrationLevelFromScore(frustrationScore);
  const band = pinned
    ? pinned.performanceCategory
    : live.performanceBand || live.band || PERFORMANCE_CATEGORIES.MEDIUM;
  return {
    frustrationScore,
    frustrationLevel,
    band,
    performanceCategory: band,
    performanceBand: band,
    gameplayBand: band,
    preview: true,
    demoOverride: Boolean(pinned),
  };
}

/**
 * Run the profile's scripted attempts through the real question scorer.
 * Returns measured frustration scores + a frozen shop offer — not invented prices.
 */
export function simulateDemoProfilePipeline(profileId, { levelId = 1, sessionId = 'demo' } = {}) {
  const profile = DEMO_PROFILES[normalizeDemoProfile(profileId)];
  if (!profile) return null;

  let smoothed = null;
  const questionScores = [];
  const rows = [];
  let correct = 0;
  let incorrect = 0;
  let consecutive = 0;
  let correctStreak = 0;
  let timeSum = 0;
  let timeCount = 0;

  profile.attempts.forEach((attempt, index) => {
    if (attempt.wasCorrect) {
      correct += 1;
      consecutive = 0;
      correctStreak += 1;
    } else {
      incorrect += 1;
      consecutive += 1;
      correctStreak = 0;
    }
    const sec = Number(attempt.responseTimeMs) / 1000;
    const baseline = timeCount > 0 ? timeSum / timeCount : sec;
    timeSum += sec;
    timeCount += 1;
    const scored = scoreQuestionAttempt({
      wasCorrect: attempt.wasCorrect,
      responseTimeMs: attempt.responseTimeMs,
      metrics: {
        correct_answers: correct,
        incorrect_answers: incorrect,
        consecutive_fails: consecutive,
        recent_correct_streak: correctStreak,
        retries: attempt.wasCorrect ? 0 : Math.min(4, incorrect),
        same_concept_misses: incorrect,
        concept_miss_count: incorrect,
        // Only the weak profile spends hints, and only after a second miss.
        hint_count: profile.id === 'weak' && incorrect >= 2 ? 3 : 0,
        time_per_question_avg_sec: sec,
        previous_avg_answer_time_sec: baseline,
      },
      previousSmoothed: smoothed,
    });
    if (!scored.ok) return;
    smoothed = scored.smoothedScore;
    questionScores.push(scored.score);
    rows.push({
      index: index + 1,
      wasCorrect: attempt.wasCorrect,
      responseTimeMs: attempt.responseTimeMs,
      frustrationScore: scored.score,
      frustrationLevel: scored.level,
      smoothedScore: scored.smoothedScore,
      smoothedLevel: scored.smoothedLevel,
    });
  });

  const avg = averageLevelFrustration(questionScores);
  const offer = freezeShopOffer({
    levelId,
    sessionId: `${sessionId}-${profile.id}`,
    scores: questionScores,
  });

  return {
    profileId: profile.id,
    label: profile.label,
    targetPerformanceCategory: profile.performanceCategory,
    targetFrustrationLevel: profile.targetFrustrationLevel,
    rows,
    questionFrustrationScores: questionScores,
    avgFrustrationScore: avg,
    finalSmoothedScore: smoothed,
    shopOffer: offer,
  };
}

/** One planned recording: grade 6–9, profile, video type, and that grade's featured challenge. */
export function buildDemoRecordingSlot({
  grade,
  profileId,
  videoType,
  slotIndex,
} = {}) {
  const g = normalizeStudentGrade(grade) ?? 6;
  const profile = DEMO_PROFILES[normalizeDemoProfile(profileId)];
  const featured = featuredChallengesForGrade(g);
  const challenge = featured[(slotIndex || 0) % Math.max(1, featured.length)];
  const typeKey = String(videoType || 'gameplay').toLowerCase();
  return {
    videoId: `G${g}-${profile?.id || 'x'}-${typeKey}-${String(slotIndex || 1).padStart(2, '0')}`,
    grade: g,
    profileId: profile?.id || null,
    profileLabel: profile?.label || null,
    videoType: typeKey,
    challengeId: challenge?.challengeId || null,
    challengeTitle: challenge?.title || null,
    learningObjective: challenge?.learningObjective || null,
    topicId: challenge?.topicId || null,
    startingConditions: {
      demoProfile: profile?.id,
      demoGrade: g,
      researchOverlay: 1,
      freshSession: true,
    },
    outputFilename: `grade-${g}/${profile?.id || 'profile'}/${typeKey}.mp4`,
    recordingStatus: 'planned',
  };
}

/** Full 48-slot matrix: 4 grades × 3 profiles × 4 video types. */
export function buildDemoRecordingPlan() {
  const videoTypes = [
    'intro',
    'question_frustration',
    'adaptive_gameplay',
    'level_shop',
  ];
  const profiles = ['smart', 'intermediate', 'weak'];
  const slots = [];
  for (const grade of [6, 7, 8, 9]) {
    for (const profileId of profiles) {
      videoTypes.forEach((videoType, typeIndex) => {
        slots.push(
          buildDemoRecordingSlot({
            grade,
            profileId,
            videoType,
            slotIndex: typeIndex + 1,
          }),
        );
      });
    }
  }
  return slots;
}
