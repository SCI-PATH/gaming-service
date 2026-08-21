/**
 * Map a validated Grok storyline onto farm-world visual challenges.
 */
import {
  DEFAULT_VISUALS,
  ROLE_POOLS,
  getCreature,
  getProp,
  inferCreatureFromText,
  isChallengeType,
  isCreatureId,
} from '../data/assetLibrary.js';
import { resolveSituation } from './storylineSituations.js';

const STAGE_ROLES = ['guide', 'helper', 'helper', 'obstacle', 'helper'];
const STAGE_TYPES = [
  'investigate',
  'discover',
  'tend',
  'obstacle',
  'tend',
];

const STAGE_SPOTS = [
  { tileX: 24, tileY: 18 },
  { tileX: 16, tileY: 20 },
  { tileX: 82, tileY: 20 },
  { tileX: 18, tileY: 50 },
  { tileX: 78, tileY: 50 },
];
const CLIMAX_SPOT = { tileX: 48, tileY: 46 };

function pickFromPool(role, used) {
  const pool = ROLE_POOLS[role] || ROLE_POOLS.helper;
  return pool.find((id) => !used.has(id)) || pool[0];
}

function pickCreature({ stage, storyline, role, used }) {
  if (isCreatureId(stage?.creatureId)) return stage.creatureId;
  const visuals = storyline?.visuals || DEFAULT_VISUALS;
  const fromVisuals =
    role === 'climax' ? visuals.climaxCreature : visuals[role];
  if (isCreatureId(fromVisuals) && !used.has(fromVisuals)) return fromVisuals;
  const inferred = inferCreatureFromText(
    `${stage?.narrative || ''} ${stage?.title || ''} ${storyline?.setting || ''}`,
  );
  if (isCreatureId(inferred) && !used.has(inferred)) return inferred;
  return pickFromPool(role, used);
}

function makeChallenge({
  itemId,
  stageId,
  title,
  description,
  narrative,
  objective,
  creatureId,
  challengeType,
  tileX,
  tileY,
  done,
  situation,
}) {
  const creature = getCreature(creatureId);
  const label = done
    ? situation.labelAfter
    : situation.labelBefore;
  const question = situation.question || {};
  return {
    itemId,
    itemLabel: label,
    category: 'storyline',
    source: 'storyline',
    stageId,
    title: title || label,
    description: description || objective || narrative || '',
    narrative: narrative || '',
    objective: objective || '',
    steps: [
      {
        id: question.id || `${itemId}_help`,
        label: `Answer the question to ${situation.helpVerb}`,
        prompt: question.prompt,
        options: question.options,
        correctIndex: question.correctIndex,
        hint: question.hint,
      },
    ],
    stepIndex: done ? 1 : 0,
    done: Boolean(done),
    locked: false,
    rewardRp: 2,
    rewardCash: 0,
    mode: 'storyline',
    creatureId,
    textureKey: creature?.textureKey || null,
    challengeType,
    situation,
    tileX,
    tileY,
    companionTileX: tileX - 3,
    companionTileY: tileY,
  };
}

export function applyStorylineLockState(challenges = []) {
  let unlocked = false;
  for (const c of challenges) {
    if (c.done) {
      c.locked = false;
      continue;
    }
    if (!unlocked) {
      c.locked = false;
      unlocked = true;
    } else {
      c.locked = true;
    }
  }
  return challenges;
}

/**
 * Build sequential farm challenges (5 stages + climax).
 * Each beat carries a visual situation (problem → resolved) and a quiz step.
 */
export function buildStorylineWorld(storyline, { completedIds = [] } = {}) {
  if (!storyline || typeof storyline !== 'object') {
    return { challenges: [], decor: [], visuals: DEFAULT_VISUALS };
  }

  const visuals = {
    ...DEFAULT_VISUALS,
    ...(storyline.visuals && typeof storyline.visuals === 'object'
      ? storyline.visuals
      : {}),
  };
  const doneSet = new Set(completedIds.map(String));
  const used = new Set();
  const usedQuestionIds = new Set();
  const stages = Array.isArray(storyline.storyProgression)
    ? storyline.storyProgression.slice(0, 5)
    : [];
  const challenges = [];

  stages.forEach((stage, index) => {
    const role = STAGE_ROLES[index] || 'helper';
    const type = isChallengeType(stage?.challengeType)
      ? stage.challengeType
      : STAGE_TYPES[index] || 'investigate';
    const creatureId = pickCreature({ stage, storyline, role, used });
    used.add(creatureId);
    const spot = STAGE_SPOTS[index] || STAGE_SPOTS[0];
    const itemId = `storyline_stage_${index + 1}`;
    const situation = resolveSituation({
      stage,
      storyline,
      challengeType: type,
      index,
      usedQuestionIds,
    });
    challenges.push(
      makeChallenge({
        itemId,
        stageId: `stage_${index + 1}`,
        title: stage?.title || `Stage ${index + 1}`,
        description: stage?.objective || stage?.narrative || '',
        narrative: stage?.narrative || '',
        objective: stage?.objective || '',
        creatureId,
        challengeType: type,
        tileX: spot.tileX,
        tileY: spot.tileY,
        done: doneSet.has(itemId),
        situation,
      }),
    );
  });

  const climax = storyline.climax && typeof storyline.climax === 'object'
    ? storyline.climax
    : {};
  const climaxId = pickCreature({
    stage: { creatureId: visuals.climaxCreature, narrative: climax.description },
    storyline,
    role: 'climax',
    used,
  });
  const climaxItemId = 'storyline_climax';
  const climaxSituation = resolveSituation({
    stage: {
      title: 'Climax',
      narrative: climax.description,
      objective: climax.objective,
      situation: climax.situation,
    },
    storyline,
    challengeType: 'climax',
    index: 5,
    usedQuestionIds,
  });
  challenges.push(
    makeChallenge({
      itemId: climaxItemId,
      stageId: 'climax',
      title: 'Climax',
      description: climax.objective || climax.description || storyline.mainObjective,
      narrative: climax.description || '',
      objective: climax.objective || '',
      creatureId: climaxId,
      challengeType: 'climax',
      tileX: CLIMAX_SPOT.tileX,
      tileY: CLIMAX_SPOT.tileY,
      done: doneSet.has(climaxItemId),
      situation: climaxSituation,
    }),
  );

  applyStorylineLockState(challenges);
  return { challenges, decor: [], visuals };
}

export function getStorylineTexture(challenge) {
  const creature = getCreature(challenge?.creatureId);
  return creature || null;
}

export function getStorylineProp(propId) {
  return getProp(propId);
}
