/**
 * Calf feed challenge — closed fence pen with calves.
 * Correct science answers fill water & food buckets; wrong answers make a calf cry.
 * Difficulty (calf count, fills needed, timer) follows gameplay band.
 */

export const CALF_ASSETS = {
  sheet: '/assets/shop/animals/calf.png',
  fenceKit: '/assets/calves/fence_kit.png',
  fenceGate: '/assets/calves/fence_gate.png',
  fenceCorner: '/assets/calves/fence_corner.png',
  trough: '/assets/calves/trough_empty.png',
  bucket: '/assets/calves/bucket.png',
  foodCrate: '/assets/calves/food_crate_1.png',
  foodCrateAlt: '/assets/calves/food_crate_2.png',
  foodCorn: '/assets/calves/food_corn.png',
  /** Soft pasture look — CSS only (no tiled ground sheet) */
  ground: null,
  /** CSS sprite sheet: 64×64 frames, 6 columns */
  frameSize: 64,
  sheetCols: 6,
  /** How large calves appear in the pen UI */
  displayScale: 2.75,
};

/** Front-facing idle frame indices (row 0) for variety */
export const CALF_FRONT_FRAMES = [0, 1, 2, 3, 4, 5];

export const CALF_FEED_BY_BAND = {
  weak: {
    band: 'weak',
    label: 'Gentle pace',
    calfCount: 6,
    fillsNeeded: 4,
    feedTimerMs: 70000,
    blurb:
      'Answer correctly to fill the water and food buckets. Wrong answers make a calf cry.',
  },
  average: {
    band: 'average',
    label: 'Steady pace',
    calfCount: 7,
    fillsNeeded: 6,
    feedTimerMs: 45000,
    blurb:
      'Fill both buckets by answering science questions. Hungry calves cry if you miss.',
  },
  strong: {
    band: 'strong',
    label: 'Fast pace',
    calfCount: 8,
    fillsNeeded: 8,
    feedTimerMs: 28000,
    blurb:
      'Fast timer! Keep answering correctly so water and food reach the buckets before calves cry.',
  },
};

export const CALF_FEED_QUESTIONS = [
  {
    id: 'calf-feed-1',
    prompt: 'Young calves grow best when they get…',
    options: [
      'Clean water and the right food every day',
      'Only sunlight and no water',
      'Only loud music',
      'Nothing at all',
    ],
    correctIndex: 0,
    hint: 'Food and water are basic animal needs.',
  },
  {
    id: 'calf-feed-2',
    prompt: 'Why keep calves inside a closed fence pen?',
    options: [
      'To keep them safe while they eat and drink',
      'So they never need food',
      'To hide them from the sun forever',
      'So the windmill spins faster',
    ],
    correctIndex: 0,
    hint: 'A pen protects young animals.',
  },
  {
    id: 'calf-feed-3',
    prompt: 'Fresh water in a bucket helps calves…',
    options: [
      'Stay hydrated and healthy',
      'Turn into roosters',
      'Stop needing food forever',
      'Power the farm cart',
    ],
    correctIndex: 0,
  },
  {
    id: 'calf-feed-4',
    prompt: 'If a calf cries from hunger or thirst, you should…',
    options: [
      'Provide food and water carefully and quickly',
      'Ignore it for several days',
      'Remove all fencing',
      'Only decorate the pen',
    ],
    correctIndex: 0,
  },
  {
    id: 'calf-feed-5',
    prompt: 'A clean food bucket is important because…',
    options: [
      'Dirty feed can make animals sick',
      'Clean buckets scare away the sun',
      'Food never spoils',
      'Calves only eat metal',
    ],
    correctIndex: 0,
  },
  {
    id: 'calf-feed-6',
    prompt: 'Which pair do calves need most each day?',
    options: [
      'Water and nutritious feed',
      'Rocks and wind only',
      'Only empty barrels',
      'Only dark rooms',
    ],
    correctIndex: 0,
  },
  {
    id: 'calf-feed-7',
    prompt: 'Answering farm science correctly in this challenge…',
    options: [
      'Fills the water and food buckets for the calves',
      'Removes the fence forever',
      'Turns calves into carts',
      'Stops all plant growth',
    ],
    correctIndex: 0,
  },
  {
    id: 'calf-feed-8',
    prompt: 'Leaving calves without water for a long time can…',
    options: [
      'Make them weak, stressed, and unhealthy',
      'Make them grow into windmills',
      'Improve wool quality instantly',
      'Fill the well automatically',
    ],
    correctIndex: 0,
  },
];

export function getCalfFeedSettings(band = 'average') {
  return CALF_FEED_BY_BAND[band] || CALF_FEED_BY_BAND.average;
}

export function createCalfFeedRound(band = 'average') {
  const settings = getCalfFeedSettings(band);
  const now = Date.now();
  const calves = [];
  for (let i = 0; i < settings.calfCount; i += 1) {
    calves.push({
      id: `calf-${i}`,
      frame: CALF_FRONT_FRAMES[i % CALF_FRONT_FRAMES.length],
      mood: 'idle', // idle | happy | crying
      fed: false,
    });
  }
  return {
    band: settings.band,
    settings,
    calves,
    waterLevel: 0,
    foodLevel: 0,
    correctCount: 0,
    cryCount: 0,
    startedAt: now,
    endsAt: now + settings.feedTimerMs,
    nextFill: 'water', // alternate water → food
  };
}

export function pickCalfFeedQuestion(usedIds = []) {
  const pool = CALF_FEED_QUESTIONS.filter((q) => !usedIds.includes(q.id));
  const list = pool.length ? pool : CALF_FEED_QUESTIONS;
  return list[Math.floor(Math.random() * list.length)];
}

export function isCalfFeedStage(itemId, stageId) {
  if (itemId !== 'calf') return false;
  return (
    stageId === 'feed_calves' ||
    stageId === 'raise_calf' ||
    stageId === 'calf_feed'
  );
}

/** CSS background-position for a 64×64 frame on the calf sheet */
export function calfFrameStyle(frameIndex = 0, displayScale = CALF_ASSETS.displayScale) {
  const size = CALF_ASSETS.frameSize;
  const cols = CALF_ASSETS.sheetCols;
  const scale = Number(displayScale) || 2.75;
  const col = frameIndex % cols;
  const row = Math.floor(frameIndex / cols);
  const sheetW = cols * size;
  const sheetH = 8 * size; // 8 rows on calf.png
  return {
    width: size * scale,
    height: size * scale,
    backgroundImage: `url(${CALF_ASSETS.sheet})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sheetW * scale}px ${sheetH * scale}px`,
    backgroundPosition: `-${col * size * scale}px -${row * size * scale}px`,
    imageRendering: 'pixelated',
  };
}
