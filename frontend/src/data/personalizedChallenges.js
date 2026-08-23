/**
 * Frustration-personalized farm challenges / activities.
 *
 * Science question bank stays fixed. What changes is the *activity shape*:
 * how many to gather, goal wording, optional support or stretch micro-tasks.
 *
 * CSF score → activity plan (deterministic, no LLM required).
 */
import {
  buildFrustrationAdaptation,
  frustrationLevelFromScore,
} from './frustrationModel.js';
import { pickCountForChallenge, vegetableGoalText } from './cropChallenges.js';
import {
  animalCollectTarget,
  animalGoalText,
} from './animalChallenges.js';
import {
  cleaningSweepTarget,
  cleaningGoalText,
} from './cleaningChallenges.js';

const ACTIVITY_KINDS = Object.freeze({
  CROP: 'crop',
  ANIMAL: 'animal',
  CLEAN: 'clean',
  SUPPORT: 'support_micro',
  STRETCH: 'stretch_micro',
});

/**
 * Target-size modifiers by frustration band (applied after mastery baseline).
 * High frustration → shorter, kinder farm jobs.
 */
const TARGET_MOD = Object.freeze({
  low: { crop: 2, animal: 1, clean: 1, min: 3 },
  moderate: { crop: 0, animal: 0, clean: 0, min: 3 },
  high: { crop: -1, animal: -1, clean: -1, min: 2 },
  very_high: { crop: -2, animal: -2, clean: -2, min: 2 },
});

function resolveLevel(score, level) {
  if (level) return String(level).toLowerCase();
  if (Number.isFinite(Number(score))) {
    return frustrationLevelFromScore(Number(score));
  }
  return 'moderate';
}

function clampTarget(n, min, max = 12) {
  return Math.max(min, Math.min(max, Math.round(Number(n) || min)));
}

/**
 * Soft goal wording — never says frustrated / weak / struggling.
 */
function toneGoal(baseText, level) {
  const text = String(baseText || '').trim();
  if (level === 'very_high') {
    return `${text} · take it one small step at a time`;
  }
  if (level === 'high') {
    return `${text} · steady pace is perfect`;
  }
  if (level === 'low') {
    return `${text} · ready for a lively farm run?`;
  }
  return text;
}

/**
 * Optional micro-activities generated from frustration band.
 * These are short, kid-friendly side goals — not extra quizzes.
 */
export function generateMicroActivities({
  frustrationScore = 0,
  frustrationLevel = null,
  cropName = 'crops',
  animalName = 'animals',
  topic = 'farm science',
} = {}) {
  const level = resolveLevel(frustrationScore, frustrationLevel);
  const adapt = buildFrustrationAdaptation(frustrationScore || level);
  const name = cropName || 'crops';

  if (level === 'very_high' || level === 'high') {
    return [
      {
        id: 'support-breathe',
        kind: ACTIVITY_KINDS.SUPPORT,
        title: 'Farm breath',
        description: 'Walk slowly past one healthy bed, then continue your job.',
        rewardHint: 'Calm focus',
        optional: true,
      },
      {
        id: 'support-one-pick',
        kind: ACTIVITY_KINDS.SUPPORT,
        title: 'One careful pick',
        description: `Harvest just 1 ${name} first, then keep going if you want.`,
        rewardHint: 'Small win',
        optional: true,
      },
      {
        id: 'support-ask-sage',
        kind: ACTIVITY_KINDS.SUPPORT,
        title: 'Ask Sage',
        description: `If ${topic} feels fuzzy, open Sage for a tiny tip.`,
        rewardHint: 'Gentle help',
        optional: true,
      },
    ].slice(0, level === 'very_high' ? 2 : 3);
  }

  if (level === 'low') {
    return [
      {
        id: 'stretch-double',
        kind: ACTIVITY_KINDS.STRETCH,
        title: 'Bonus basket',
        description: `After you finish, try picking 2 extra ${name} for bonus coins.`,
        rewardHint: 'Stretch goal',
        optional: true,
      },
      {
        id: 'stretch-speed',
        kind: ACTIVITY_KINDS.STRETCH,
        title: 'Swift cart',
        description: 'Load and sell without stopping for a small cash bonus.',
        rewardHint: 'Challenge spark',
        optional: true,
      },
      {
        id: 'stretch-teach',
        kind: ACTIVITY_KINDS.STRETCH,
        title: 'Explain to Sage',
        description: `Tell Sage one fact about ${topic} in your own words.`,
        rewardHint: 'Explorer badge',
        optional: true,
      },
    ];
  }

  // moderate
  return [
    {
      id: 'practice-check',
      kind: ACTIVITY_KINDS.SUPPORT,
      title: 'Quick check',
      description: `Finish your ${name} job, then glance at one mind-map card if Sage opens.`,
      rewardHint: 'Practice',
      optional: true,
      tone: adapt.gameplay?.label || 'Gentle farm support',
    },
  ];
}

/**
 * Personalize a crop harvest target + goal from mastery + frustration.
 */
export function personalizeCropChallenge(
  challenge,
  {
    mastery = 0.5,
    frustrationScore = 0,
    frustrationLevel = null,
  } = {},
) {
  const level = resolveLevel(frustrationScore, frustrationLevel);
  const mod = TARGET_MOD[level] || TARGET_MOD.moderate;
  const base = pickCountForChallenge(challenge, mastery);
  const harvestTarget = clampTarget(base + mod.crop, mod.min);
  const goalText = toneGoal(
    vegetableGoalText(challenge, harvestTarget),
    level,
  );
  const microActivities = generateMicroActivities({
    frustrationScore,
    frustrationLevel: level,
    cropName: challenge?.cropName || 'crops',
    topic: challenge?.cropName || 'plants',
  });

  return {
    type: ACTIVITY_KINDS.CROP,
    challenge,
    harvestTarget,
    goalText,
    frustrationLevel: level,
    frustrationScore: Number(frustrationScore) || 0,
    microActivities,
    label:
      level === 'low'
        ? 'Lively crop challenge'
        : level === 'very_high' || level === 'high'
          ? 'Gentle crop challenge'
          : 'Balanced crop challenge',
  };
}

export function personalizeAnimalChallenge(
  challenge,
  {
    mastery = 0.5,
    frustrationScore = 0,
    frustrationLevel = null,
  } = {},
) {
  const level = resolveLevel(frustrationScore, frustrationLevel);
  const mod = TARGET_MOD[level] || TARGET_MOD.moderate;
  const base = animalCollectTarget(challenge, mastery);
  const collectTarget = clampTarget(base + mod.animal, mod.min);
  const goalText = toneGoal(animalGoalText(challenge, collectTarget), level);
  const microActivities = generateMicroActivities({
    frustrationScore,
    frustrationLevel: level,
    animalName: challenge?.animalName || 'animals',
    cropName: challenge?.produceName || 'produce',
    topic: challenge?.animalName || 'animals',
  });

  return {
    type: ACTIVITY_KINDS.ANIMAL,
    challenge,
    collectTarget,
    goalText,
    frustrationLevel: level,
    frustrationScore: Number(frustrationScore) || 0,
    microActivities,
    label:
      level === 'low'
        ? 'Lively animal challenge'
        : level === 'very_high' || level === 'high'
          ? 'Gentle animal challenge'
          : 'Balanced animal challenge',
  };
}

export function personalizeCleaningChallenge(
  challenge,
  {
    mastery = 0.5,
    frustrationScore = 0,
    frustrationLevel = null,
  } = {},
) {
  const level = resolveLevel(frustrationScore, frustrationLevel);
  const mod = TARGET_MOD[level] || TARGET_MOD.moderate;
  const base = cleaningSweepTarget(challenge, mastery);
  const sweepTarget = clampTarget(base + mod.clean, mod.min);
  const goalText = toneGoal(cleaningGoalText(challenge, sweepTarget), level);
  const microActivities = generateMicroActivities({
    frustrationScore,
    frustrationLevel: level,
    cropName: challenge?.messName || 'mess',
    topic: 'keeping the farm tidy',
  });

  return {
    type: ACTIVITY_KINDS.CLEAN,
    challenge,
    sweepTarget,
    goalText,
    frustrationLevel: level,
    frustrationScore: Number(frustrationScore) || 0,
    microActivities,
    label:
      level === 'low'
        ? 'Lively cleaning challenge'
        : level === 'very_high' || level === 'high'
          ? 'Gentle cleaning challenge'
          : 'Balanced cleaning challenge',
  };
}

/**
 * Build the student's current personalized activity board for UI / research.
 */
export function buildPersonalizedActivityBoard({
  cropChallenge = null,
  animalChallenge = null,
  cleaningChallenge = null,
  mastery = 0.5,
  frustrationScore = 0,
  frustrationLevel = null,
} = {}) {
  const level = resolveLevel(frustrationScore, frustrationLevel);
  const activities = [];

  if (cropChallenge) {
    activities.push(
      personalizeCropChallenge(cropChallenge, {
        mastery,
        frustrationScore,
        frustrationLevel: level,
      }),
    );
  }
  if (animalChallenge) {
    activities.push(
      personalizeAnimalChallenge(animalChallenge, {
        mastery,
        frustrationScore,
        frustrationLevel: level,
      }),
    );
  }
  if (cleaningChallenge) {
    activities.push(
      personalizeCleaningChallenge(cleaningChallenge, {
        mastery,
        frustrationScore,
        frustrationLevel: level,
      }),
    );
  }

  const micros = generateMicroActivities({
    frustrationScore,
    frustrationLevel: level,
    cropName: cropChallenge?.cropName,
    animalName: animalChallenge?.animalName,
  });

  return {
    frustrationLevel: level,
    frustrationScore: Number(frustrationScore) || 0,
    summary:
      level === 'low'
        ? 'Today’s farm is lively — optional stretch goals unlocked.'
        : level === 'high' || level === 'very_high'
          ? 'Today’s farm is gentle — shorter jobs and calm side activities.'
          : 'Today’s farm is balanced — steady jobs with one practice tip.',
    primary: activities,
    microActivities: micros,
    generatedAt: Date.now(),
  };
}

export { ACTIVITY_KINDS };
