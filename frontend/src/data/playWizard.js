import { FARM_SHOP_ZONE, PLANT_PLOTS } from './plantPlots.js';
import { sageLineForStep } from './sageGuide.js';
import { ANIMAL_PADDOCK } from './animalChallenges.js';
import { CLEANING_YARD } from './cleaningChallenges.js';

function pin(zone) {
  if (!zone) return null;
  return {
    tileX: zone.x + zone.w / 2,
    tileY: zone.y + zone.h / 2,
    label: zone.label,
  };
}

const SHOP_PIN = pin(FARM_SHOP_ZONE);
const BED_PIN = pin(PLANT_PLOTS[0]);
const PEN_PIN = pin(ANIMAL_PADDOCK);
const YARD_PIN = pin(CLEANING_YARD);

function named(value, fallback) {
  const text = String(value || '').trim().toLowerCase();
  return text || fallback;
}

function incompleteCrops(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return list.filter(
    (crop) =>
      crop &&
      crop.status !== 'COMPLETED' &&
      !crop.sellDone,
  );
}

function pickActiveCrop(list) {
  const open = incompleteCrops(list);
  if (open.length === 0) return null;
  return (
    open.find(
      (crop) =>
        crop.plantDone ||
        Number(crop.cropsHarvestedTotal) > 0 ||
        Number(crop.cropsSoldThisChallenge) > 0,
    ) || open[0]
  );
}

function cropStep(crop, carriedCount) {
  const name = named(crop.cropName, 'crops');
  const target = Math.max(1, Number(crop.harvestTarget) || 1);
  const harvested = Number(crop.cropsHarvestedTotal) || 0;
  const sold = Number(crop.cropsSoldThisChallenge) || 0;

  if (!crop.plantDone) {
    return {
      id: `plant-${crop.cropId || crop.id || name}`,
      title: `Plant ${name}`,
      how: `Walk to a gold plant bed labelled ${name}. Press E and answer the science question.`,
      key: 'E',
      pin: BED_PIN,
    };
  }

  if (harvested < target) {
    return {
      id: `harvest-${crop.cropId || name}`,
      title: `Pick ${name} (${harvested}/${target})`,
      how: 'Press E on a ready plant for the harvest quiz, then run over the crops to pick them up. They stack on your back.',
      key: 'E',
      pin: BED_PIN,
    };
  }

  if (carriedCount > 0 || sold < target) {
    return {
      id: `sell-${crop.cropId || name}`,
      title: `Sell ${name} at the shop (${sold}/${target})`,
      how:
        carriedCount > 0
          ? 'Walk to the Farm Shop (centre of the map) and press E to unload what you are carrying. Customers buy from the stall.'
          : `You still need to sell ${target - sold} ${name}. Harvest any left, then unload at the Farm Shop with E.`,
      key: 'E',
      pin: SHOP_PIN,
    };
  }

  return null;
}

function animalStep(farm) {
  const target = Math.max(0, Number(farm.animalCollectTarget) || 0);
  if (target <= 0 || !farm.animalName || farm.levelAnimalComplete) return null;
  const sold = Number(farm.animalSoldThisChallenge) || 0;
  if (sold >= target) return null;

  const animals = named(farm.animalName, 'animals');
  const produce = named(farm.animalProduceName, 'produce');
  const verb = farm.animalAction === 'shear' ? 'Shear' : 'Feed';
  const collected = Number(farm.animalCollectedTotal) || 0;

  if (!farm.animalTended) {
    return {
      id: 'animal-tend',
      title: `${verb} the ${animals}`,
      how: `Walk into the fenced animal pen and press E. Answer the science question to ${verb.toLowerCase()} them.`,
      key: 'E',
      pin: PEN_PIN,
    };
  }

  if (collected < target) {
    return {
      id: 'animal-collect',
      title: `Collect ${produce} (${collected}/${target})`,
      how: `Run over the ${produce} in the pen to pick them up, then carry them to the Farm Shop.`,
      key: 'WASD',
      pin: PEN_PIN,
    };
  }

  return {
    id: 'animal-sell',
    title: `Unload ${produce} at the shop`,
    how: 'Walk to the Farm Shop and press E so customers can buy what you collected.',
    key: 'E',
    pin: SHOP_PIN,
  };
}

function cleanStep(farm) {
  const target = Math.max(0, Number(farm.cleanSweepTarget) || 0);
  if (target <= 0 || farm.levelCleanComplete) return null;
  const sold = Number(farm.cleanSoldThisChallenge) || 0;
  if (sold >= target) return null;

  const mess = named(farm.cleanMessName, 'mess');
  const waste = named(farm.cleanWasteName, 'waste');
  const verb = farm.cleanVerb || 'Clean';
  const swept = Number(farm.cleanSweptTotal) || 0;

  if (!farm.cleanStarted) {
    return {
      id: 'clean-start',
      title: `${verb} the ${mess}`,
      how: `Walk into the dirty yard and press E. Answer the science question to start cleaning.`,
      key: 'E',
      pin: YARD_PIN,
    };
  }

  if (swept < target) {
    return {
      id: 'clean-sweep',
      title: `Sweep ${mess} (${swept}/${target})`,
      how: `Run over the ${mess} in the yard to sweep it up.`,
      key: 'WASD',
      pin: YARD_PIN,
    };
  }

  return {
    id: 'clean-sell',
    title: `Sell ${waste} at the shop`,
    how: 'Walk to the Farm Shop and press E to unload the waste. Customers buy it as compost.',
    key: 'E',
    pin: SHOP_PIN,
  };
}

function challengeStep(challenges) {
  if (!Array.isArray(challenges)) return null;
  const open = challenges.find((c) => {
    if (!c || c.done) return false;
    const id = String(c.itemId || '');
    if (c.source === 'agent' || id.startsWith('agent_station_')) return false;
    if (c.source === 'world') return false;
    return true;
  });
  if (!open) return null;

  const isStory =
    open.source === 'house' ||
    open.source === 'storyline' ||
    String(open.itemId || '').startsWith('house_') ||
    String(open.itemId || '').startsWith('storyline_');

  if (isStory) {
    return {
      id: `story-${open.itemId}`,
      title: 'Check the old house',
      how: 'Walk up to the house and press E when something looks worn or needs a fix.',
      key: 'E',
      pin: Number.isFinite(open.tileX)
        ? { tileX: open.tileX, tileY: open.tileY, label: 'House' }
        : null,
    };
  }

  const stepInfo = open.steps?.[open.stepIndex];
  return {
    id: `unlock-${open.itemId}-${open.stageId || open.stepIndex}`,
    title: open.itemLabel || open.title || 'Unlock challenge',
    how: stepInfo
      ? `${stepInfo.label}. Walk to that unlock on the farm and press E.`
      : 'Walk to the unlock on the farm and press E.',
    key: 'E',
    pin: Number.isFinite(open.tileX)
      ? { tileX: open.tileX, tileY: open.tileY, label: open.itemLabel }
      : null,
  };
}

function quizStep(quiz) {
  if (!quiz) return null;
  const mode = String(quiz.mode || quiz.challenge || 'plant');
  const name = named(quiz.cropName, '');
  const titles = {
    plant: name ? `Plant quiz — ${name}` : 'Plant quiz',
    harvest: name ? `Harvest quiz — ${name}` : 'Harvest quiz',
    load: 'Shop quiz',
    unload: 'Shop quiz',
    sell: 'Shop quiz',
    animal_tend: 'Animal quiz',
    animal_collect: 'Collect quiz',
    clean_start: 'Cleaning quiz',
    clean_sweep: 'Sweep quiz',
    item_challenge: 'Item challenge',
    storyline: 'Story question',
    world_challenge: 'World challenge',
  };
  return {
    id: `quiz-${mode}`,
    title: titles[mode] || 'Science question',
    how: 'Pick or type your answer. A correct answer unlocks the next farm action.',
    key: null,
    pin: null,
    quiet: true,
  };
}

/**
 * Always-on coach: one next action from live farm state.
 */
export function resolvePlayWizard({
  farm = {},
  quiz = null,
  shopOpen = false,
  challenges = [],
  carriedCount = 0,
  frustrationLevel = null,
} = {}) {
  const quizGuide = quizStep(quiz);
  if (quizGuide) return withSageVoice(quizGuide, frustrationLevel);

  if (shopOpen) {
    return withSageVoice({
      id: 'unlock-shop',
      title: 'Unlock shop is open',
      how: 'Buy a farm unlock with your cash, or close the shop to keep playing.',
      key: null,
      pin: null,
      quiet: true,
    }, frustrationLevel);
  }

  if (carriedCount > 0) {
    return withSageVoice({
      id: 'carry-shop',
      title: `Unload ${carriedCount} item${carriedCount === 1 ? '' : 's'}`,
      how: 'You are carrying harvest on your back. Walk to the Farm Shop in the centre of the map and press E.',
      key: 'E',
      pin: SHOP_PIN,
    }, frustrationLevel);
  }

  const crop = pickActiveCrop(farm.cropChallengeList);
  if (crop) {
    const next = cropStep(crop, carriedCount);
    if (next) return withSageVoice(next, frustrationLevel);
  } else if (
    Number(farm.harvestTarget) > 0 &&
    !farm.levelCropComplete &&
    !(farm.cropChallengeList?.length > 0)
  ) {
    const fallback = {
      cropName: farm.cropName,
      cropId: farm.cropId,
      harvestTarget: farm.harvestTarget,
      cropsHarvestedTotal: farm.cropsHarvestedTotal,
      cropsSoldThisChallenge: farm.cropsSoldThisChallenge,
      plantDone: Number(farm.plantedCount) > 0,
      sellDone: false,
    };
    const next = cropStep(fallback, carriedCount);
    if (next) return withSageVoice(next, frustrationLevel);
  }

  const animal = animalStep(farm);
  if (animal) return withSageVoice(animal, frustrationLevel);

  const clean = cleanStep(farm);
  if (clean) return withSageVoice(clean, frustrationLevel);

  const extra = challengeStep(challenges);
  if (extra) return withSageVoice(extra, frustrationLevel);

  if (farm.forestUnlocked) {
    return withSageVoice({
      id: 'forest',
      title: 'Level complete',
      how: 'The forest path is open. Follow the entrance, or keep exploring the farm.',
      key: 'WASD',
      pin: null,
    }, frustrationLevel);
  }

  return withSageVoice({
    id: 'explore',
    title: 'Keep farming',
    how: 'Use the quest scroll if you want the full list. Move with WASD, press E on gold beds, the shop, the animal pen, or the yard.',
    key: 'WASD · E',
    pin: null,
  }, frustrationLevel);
}

function withSageVoice(step, frustrationLevel) {
  if (!step) return null;
  return {
    ...step,
    say: sageLineForStep(step, { frustrationLevel }),
  };
}
