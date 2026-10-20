/**
 * Controlled demonstration scenarios for academic panel recordings.
 *
 * These fixtures set *inputs* (correctness + response times) that flow through
 * the real frustration / performance classifiers. They do not hardcode final
 * DDA outputs or shop prices.
 *
 * Enable with URL params, for example:
 *   ?demoProfile=smart&demoGrade=6&researchOverlay=1
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
    /** Scripted answers: mostly correct and comfortably paced. */
    attempts: Object.freeze([
      { wasCorrect: true, responseTimeMs: 4500 },
      { wasCorrect: true, responseTimeMs: 5200 },
      { wasCorrect: true, responseTimeMs: 4800 },
      { wasCorrect: true, responseTimeMs: 6100 },
      { wasCorrect: true, responseTimeMs: 5500 },
      { wasCorrect: true, responseTimeMs: 4900 },
      { wasCorrect: true, responseTimeMs: 7000 },
      { wasCorrect: true, responseTimeMs: 5300 },
      { wasCorrect: true, responseTimeMs: 5800 },
      { wasCorrect: true, responseTimeMs: 5000 },
    ]),
  }),
  intermediate: Object.freeze({
    id: 'intermediate',
    label: 'Intermediate / Moderate Frustration',
    performanceCategory: PERFORMANCE_CATEGORIES.MEDIUM,
    targetFrustrationLevel: FRUSTRATION_LEVELS.MODERATE,
    attempts: Object.freeze([
      { wasCorrect: true, responseTimeMs: 9000 },
      { wasCorrect: false, responseTimeMs: 14000 },
      { wasCorrect: true, responseTimeMs: 11000 },
      { wasCorrect: true, responseTimeMs: 16000 },
      { wasCorrect: false, responseTimeMs: 18000 },
      { wasCorrect: true, responseTimeMs: 12000 },
      { wasCorrect: false, responseTimeMs: 15000 },
      { wasCorrect: true, responseTimeMs: 10000 },
      { wasCorrect: true, responseTimeMs: 13000 },
      { wasCorrect: true, responseTimeMs: 11000 },
    ]),
  }),
  weak: Object.freeze({
    id: 'weak',
    label: 'Weak / High Frustration',
    performanceCategory: PERFORMANCE_CATEGORIES.WEAK,
    targetFrustrationLevel: FRUSTRATION_LEVELS.HIGH,
    attempts: Object.freeze([
      { wasCorrect: false, responseTimeMs: 22000 },
      { wasCorrect: false, responseTimeMs: 25000 },
      { wasCorrect: true, responseTimeMs: 19000 },
      { wasCorrect: false, responseTimeMs: 28000 },
      { wasCorrect: false, responseTimeMs: 24000 },
      { wasCorrect: true, responseTimeMs: 21000 },
      { wasCorrect: false, responseTimeMs: 26000 },
      { wasCorrect: true, responseTimeMs: 20000 },
      { wasCorrect: false, responseTimeMs: 23000 },
      { wasCorrect: true, responseTimeMs: 18000 },
    ]),
  }),
});

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

export function readDemoLaunch(search = '') {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const profile = normalizeDemoProfile(params.get('demoProfile') || params.get('profile'));
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
 * World seed from the real question scorer. Not a hardcoded DDA result.
 * Present only while a demo profile is pinning the recording.
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

export function readDemoAdaptationSeed() {
  return activeSeed;
}

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
  if (!launch.isolated) {
    activeSeed = null;
    if (isDemoStudent()) restoreHeldStudent();
    return { launch, seed: null, student: getCurrentStudent() };
  }
  const student = beginDemoStudent(buildDemoStudent(launch));
  activeSeed = launch.profile ? demoAdaptationSeed(launch.profile) : null;
  return { launch, seed: activeSeed, student };
}

/** Performance object for the real unlock-shop price function. Purchases stay disabled. */
export function demoShopPerformance(seed, live = {}) {
  const pinned = seed?.pinned ? seed : null;
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

  profile.attempts.forEach((attempt, index) => {
    if (attempt.wasCorrect) correct += 1;
    else incorrect += 1;
    const scored = scoreQuestionAttempt({
      wasCorrect: attempt.wasCorrect,
      responseTimeMs: attempt.responseTimeMs,
      metrics: {
        consecutiveIncorrect: attempt.wasCorrect
          ? 0
          : Math.min(3, incorrect),
        retries: attempt.wasCorrect ? 0 : 1,
        errorRate: incorrect / (correct + incorrect),
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
