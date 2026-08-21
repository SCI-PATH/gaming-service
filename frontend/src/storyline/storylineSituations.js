/**
 * Visual situations for storyline beats.
 * Phaser-free: texture keys and quiz copy only (backend + frontend).
 */

export const SITUATION_IDS = [
  'wilted_flower',
  'dry_crop',
  'shaded_plant',
  'broken_fence',
  'blocked_path',
  'hungry_animal',
  'diverted_water',
  'young_sprout',
];

export const SITUATION_LOAD_ITEMS = [
  {
    textureKey: 'story_trough_empty',
    image: '/assets/calves/trough_empty.png',
  },
  {
    textureKey: 'story_food_crate',
    image: '/assets/calves/food_crate_1.png',
  },
  {
    textureKey: 'story_food_corn',
    image: '/assets/calves/food_corn.png',
  },
  {
    textureKey: 'story_bucket',
    image: '/assets/calves/bucket.png',
  },
];

const CROP_FLOWER = {
  textureKey: 'crop_flower',
  mapTileWidth: 2.4,
};
const CROP_SPROUT = {
  textureKey: 'crop_flower_sprout',
  mapTileWidth: 2.1,
};
const CORN_YOUNG = {
  textureKey: 'lib_prop_cornYoung_S',
  mapTileWidth: 2.4,
};
const CORN_READY = {
  textureKey: 'lib_prop_corn_S',
  mapTileWidth: 2.5,
};
const CORN_SPROUT = {
  textureKey: 'crop_corn_sprout',
  mapTileWidth: 2.0,
};
const CORN_CROP = {
  textureKey: 'crop_corn',
  mapTileWidth: 2.4,
};

function spec(base, extra = {}) {
  return { ...base, ...extra };
}

const QUESTIONS = {
  wilted_flower: [
    {
      prompt:
        'This flower is drooping and pale. What does a plant most need from the soil to stay upright and healthy?',
      options: [
        'Water, so nutrients can move through the plant',
        'Rocks, so the stem stays heavy',
        'Shade only, with no moisture',
        'Wind, to dry the leaves faster',
      ],
      correctIndex: 0,
      hint: 'Wilting usually means the plant cannot move water and nutrients.',
    },
    {
      prompt:
        'A wilted flower cannot make enough food. What process uses sunlight to make food in leaves?',
      options: ['Photosynthesis', 'Evaporation', 'Erosion', 'Hibernation'],
      correctIndex: 0,
      hint: '“Photo” means light — plants use light to make food.',
    },
    {
      prompt:
        'After you help a wilted flower, it stands taller. What is the best sign that the plant is recovering?',
      options: [
        'Leaves look firmer and the blossom opens',
        'The soil turns into sand',
        'The stem becomes hollow and dry',
        'Insects stop visiting forever',
      ],
      correctIndex: 0,
      hint: 'A healthy plant can hold water in its cells and keep blooming.',
    },
  ],
  dry_crop: [
    {
      prompt:
        'The soil around this crop is dry. Why do crops need water to grow?',
      options: [
        'Water carries nutrients and helps the plant make food',
        'Water replaces sunlight completely',
        'Water turns leaves into metal',
        'Crops grow only in empty air',
      ],
      correctIndex: 0,
      hint: 'Roots take up water, and that water helps the whole plant live.',
    },
    {
      prompt: 'If a crop bed stays dry for too long, what is most likely?',
      options: [
        'The plants wilt and grow poorly',
        'The plants stop needing sunlight',
        'The soil turns into clouds',
        'Bees no longer need flowers',
      ],
      correctIndex: 0,
      hint: 'Without water, stems and leaves lose their strength.',
    },
  ],
  shaded_plant: [
    {
      prompt:
        'This plant sits in deep shade. Why do green plants need sunlight?',
      options: [
        'Sunlight powers photosynthesis, which makes food',
        'Sunlight is only for warming rocks',
        'Plants eat soil instead of using light',
        'Shade makes food faster than light',
      ],
      correctIndex: 0,
      hint: 'Leaves capture light energy to make sugar.',
    },
    {
      prompt:
        'A flower still looks dull after watering. What else might it be missing?',
      options: [
        'Enough light to make food',
        'A metal fence around every leaf',
        'Less air around the stem',
        'A diet of only stones',
      ],
      correctIndex: 0,
      hint: 'Water and light both matter for a healthy plant.',
    },
  ],
  broken_fence: [
    {
      prompt:
        'A gap in this fence lets animals or weeds push through. Why do farms use fences?',
      options: [
        'To protect living spaces and keep paths clear',
        'To stop the sun from reaching crops',
        'To replace water in the soil',
        'To make photosynthesis happen faster',
      ],
      correctIndex: 0,
      hint: 'A habitat stays healthier when it is protected from extra damage.',
    },
    {
      prompt:
        'If a barrier is broken, pollinators may lose a safe route. What do bees mainly do for flowers?',
      options: [
        'Carry pollen so plants can reproduce',
        'Eat sunlight instead of nectar',
        'Turn soil into glass',
        'Stop plants from needing water',
      ],
      correctIndex: 0,
      hint: 'Pollen has to move from flower to flower.',
    },
  ],
  blocked_path: [
    {
      prompt:
        'Weeds and piles are blocking the path bees used to fly. Why does that matter to the flowers?',
      options: [
        'Bees carry pollen; a blocked path can stop pollination',
        'Bees water the roots by sitting on stones',
        'Bees replace the need for sunlight',
        'Flowers grow better with no insects at all',
      ],
      correctIndex: 0,
      hint: 'Many flowering plants depend on pollinators.',
    },
    {
      prompt: 'What is pollination?',
      options: [
        'Moving pollen so a plant can make seeds',
        'Drying out the soil on purpose',
        'Cutting off all sunlight',
        'Turning leaves into wood overnight',
      ],
      correctIndex: 0,
      hint: 'Pollen has to travel for seeds to form.',
    },
  ],
  hungry_animal: [
    {
      prompt:
        'This animal’s trough is empty. Why do farm animals need food?',
      options: [
        'Food provides energy for growth, movement, and health',
        'Animals make all their energy from sunlight like leaves',
        'Empty troughs keep animals warmer',
        'Animals only need rocks to live',
      ],
      correctIndex: 0,
      hint: 'Animals cannot photosynthesize the way green plants can.',
    },
    {
      prompt: 'A living thing that cannot make its own food is a…',
      options: ['Consumer', 'Producer', 'Rock', 'Cloud'],
      correctIndex: 0,
      hint: 'Green plants produce food; animals consume it.',
    },
  ],
  diverted_water: [
    {
      prompt:
        'Water was diverted away from these roots. What happens to plants when water cannot reach them?',
      options: [
        'They wilt because they cannot transport nutrients well',
        'They grow faster without any moisture',
        'They stop needing sunlight forever',
        'They turn into pollinators',
      ],
      correctIndex: 0,
      hint: 'Roots must reach water for the plant to stay alive.',
    },
    {
      prompt: 'In an ecosystem, a stream mainly helps plants by…',
      options: [
        'Supplying water to roots and nearby habitats',
        'Blocking all sunlight from leaves',
        'Removing the need for soil',
        'Replacing bees as pollinators',
      ],
      correctIndex: 0,
      hint: 'Water connects living things in a habitat.',
    },
  ],
  young_sprout: [
    {
      prompt: 'This sprout is just starting. What do seeds need to grow into healthy plants?',
      options: [
        'Water, light, and nutrients from the soil',
        'Only wind and darkness',
        'Metal and glass',
        'No air at all',
      ],
      correctIndex: 0,
      hint: 'A seedling has the same basic needs as a grown plant.',
    },
    {
      prompt: 'Which part of a plant usually takes in water from the soil?',
      options: ['Roots', 'Flowers only', 'Petals only', 'Pollen only'],
      correctIndex: 0,
      hint: 'Look underground.',
    },
  ],
};

const KEYWORDS = [
  [
    'wilted_flower',
    [
      'wilt',
      'droop',
      'dying flower',
      'dead flower',
      'pale flower',
      'fading flower',
      'thirsty blossom',
      'tired flower',
      'blossom',
      'flower',
    ],
  ],
  [
    'shaded_plant',
    ['shade', 'sunlight', 'canopy', 'understory', 'more light', 'dim'],
  ],
  [
    'diverted_water',
    ['stream', 'jam of', 'divert', 'water path', 'trickle', 'flood'],
  ],
  ['broken_fence', ['fence', 'broken', 'gap in']],
  [
    'blocked_path',
    [
      'block',
      'weeds',
      'flight path',
      'bee path',
      'cannot reach',
      'narrow path',
    ],
  ],
  ['hungry_animal', ['hungry', 'feed', 'trough', 'starv', 'food crate']],
  [
    'dry_crop',
    ['dry soil', 'moisture', 'thirsty', 'watering', 'crop bed', 'corn'],
  ],
  ['young_sprout', ['sprout', 'seedling', 'seed ']],
];

export const SITUATIONS = {
  wilted_flower: {
    id: 'wilted_flower',
    labelBefore: 'Wilted flower',
    labelAfter: 'Blooming flower',
    helpVerb: 'help this wilted flower',
    before: spec(CROP_SPROUT, { tint: 0x8a6a32, scaleMul: 0.88, angle: 12 }),
    after: spec(CROP_FLOWER, { tint: 0xffffff, scaleMul: 1.12, angle: 0 }),
    extras: [
      { tileDX: 1.15, tileDY: 0.35, scaleMul: 0.82 },
      { tileDX: -0.95, tileDY: 0.7, scaleMul: 0.74 },
    ],
  },
  dry_crop: {
    id: 'dry_crop',
    labelBefore: 'Thirsty crop',
    labelAfter: 'Healthy crop',
    helpVerb: 'restore this thirsty crop',
    before: spec(CORN_YOUNG, { tint: 0xc4a060, scaleMul: 0.92, angle: 6 }),
    after: spec(CORN_READY, { tint: 0xffffff, scaleMul: 1.08, angle: 0 }),
    extras: [{ tileDX: 1.3, tileDY: 0.15, scaleMul: 0.9 }],
  },
  shaded_plant: {
    id: 'shaded_plant',
    labelBefore: 'Shaded plant',
    labelAfter: 'Sunlit plant',
    helpVerb: 'bring light to this shaded plant',
    before: spec(CROP_SPROUT, { tint: 0x4a5a38, scaleMul: 0.86, angle: 10 }),
    after: spec(CROP_FLOWER, { tint: 0xffffff, scaleMul: 1.14, angle: 0 }),
    extras: [{ tileDX: 1.1, tileDY: 0.45, scaleMul: 0.8 }],
  },
  broken_fence: {
    id: 'broken_fence',
    labelBefore: 'Broken fence',
    labelAfter: 'Repaired fence',
    helpVerb: 'repair this broken fence',
    before: {
      textureKey: 'lib_prop_fenceLowBroken_S',
      mapTileWidth: 2.6,
      tint: 0xb08060,
      scaleMul: 1,
      angle: 0,
    },
    after: {
      textureKey: 'lib_prop_fenceLow_S',
      mapTileWidth: 2.6,
      tint: 0xffffff,
      scaleMul: 1,
      angle: 0,
    },
    extras: [],
  },
  blocked_path: {
    id: 'blocked_path',
    labelBefore: 'Blocked path',
    labelAfter: 'Open path',
    helpVerb: 'clear this blocked path',
    before: {
      textureKey: 'lib_prop_hayBalesStacked_S',
      mapTileWidth: 2.8,
      tint: 0xa08050,
      scaleMul: 1,
      angle: 0,
    },
    after: {
      textureKey: 'lib_prop_hay_S',
      mapTileWidth: 2.2,
      tint: 0xffffff,
      scaleMul: 1,
      angle: 0,
    },
    extras: [],
  },
  hungry_animal: {
    id: 'hungry_animal',
    labelBefore: 'Empty trough',
    labelAfter: 'Filled trough',
    helpVerb: 'feed the hungry animal',
    before: {
      textureKey: 'story_trough_empty',
      mapTileWidth: 2.6,
      tint: 0xb0a090,
      scaleMul: 1,
      angle: 0,
    },
    after: {
      textureKey: 'story_food_crate',
      mapTileWidth: 2.4,
      tint: 0xffffff,
      scaleMul: 1.05,
      angle: 0,
    },
    extras: [
      {
        tileDX: 1.2,
        tileDY: 0.2,
        before: {
          textureKey: 'story_bucket',
          mapTileWidth: 1.6,
          tint: 0x908070,
          scaleMul: 1,
        },
        after: {
          textureKey: 'story_food_corn',
          mapTileWidth: 1.8,
          tint: 0xffffff,
          scaleMul: 1,
        },
      },
    ],
  },
  diverted_water: {
    id: 'diverted_water',
    labelBefore: 'Dry roots',
    labelAfter: 'Watered crop',
    helpVerb: 'return water to these roots',
    before: spec(CORN_SPROUT, { tint: 0xa07840, scaleMul: 0.9, angle: 8 }),
    after: spec(CORN_CROP, { tint: 0xffffff, scaleMul: 1.1, angle: 0 }),
    extras: [
      {
        tileDX: -1.1,
        tileDY: 0.35,
        before: {
          textureKey: 'story_bucket',
          mapTileWidth: 1.7,
          tint: 0x8a8070,
          scaleMul: 1,
        },
        after: {
          textureKey: 'story_bucket',
          mapTileWidth: 1.7,
          tint: 0xffffff,
          scaleMul: 1,
        },
      },
    ],
  },
  young_sprout: {
    id: 'young_sprout',
    labelBefore: 'Tiny sprout',
    labelAfter: 'Grown plant',
    helpVerb: 'help this sprout grow',
    before: spec(CROP_SPROUT, { tint: 0xc8d0a0, scaleMul: 0.7, angle: 0 }),
    after: spec(CROP_FLOWER, { tint: 0xffffff, scaleMul: 1.1, angle: 0 }),
    extras: [{ tileDX: 1.05, tileDY: 0.4, scaleMul: 0.78 }],
  },
};

export function isSituationId(id) {
  return SITUATION_IDS.includes(String(id || ''));
}

export function inferSituation(text, challengeType) {
  const hay = String(text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const [id, words] of KEYWORDS) {
    let score = 0;
    for (const word of words) {
      if (hay.includes(word)) score += word.length >= 8 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (best && bestScore > 0) return best;
  const type = String(challengeType || '');
  if (type === 'obstacle') return 'broken_fence';
  if (type === 'discover') return 'dry_crop';
  if (type === 'tend') return 'wilted_flower';
  if (type === 'climax') return 'wilted_flower';
  return 'wilted_flower';
}

export function questionForSituation(situationId, salt = 0, usedIds = null) {
  const list = QUESTIONS[situationId] || QUESTIONS.wilted_flower;
  const start = Math.abs(Number(salt) || 0);
  for (let i = 0; i < list.length; i += 1) {
    const idx = (start + i) % list.length;
    const id = `${situationId}_q${idx}`;
    if (usedIds && usedIds.has(id)) continue;
    if (usedIds) usedIds.add(id);
    return { ...list[idx], id };
  }
  const idx = start % list.length;
  return { ...list[idx], id: `${situationId}_q${idx}_${start}` };
}

function extraSpec(def, extra, which) {
  if (extra[which]) return extra[which];
  const base = def[which];
  return {
    ...base,
    scaleMul: (extra.scaleMul || 1) * (base.scaleMul || 1),
  };
}

/**
 * Attach a visual situation + quiz step to a story beat.
 */
export function resolveSituation({
  stage,
  storyline,
  challengeType,
  index = 0,
  usedQuestionIds = null,
} = {}) {
  const text = [
    stage?.title,
    stage?.narrative,
    stage?.objective,
    stage?.transition,
    stage?.description,
    storyline?.mainProblem,
    storyline?.setting,
  ]
    .filter(Boolean)
    .join(' ');
  const id = isSituationId(stage?.situation)
    ? stage.situation
    : inferSituation(text, challengeType);
  const def = SITUATIONS[id] || SITUATIONS.wilted_flower;
  const question = questionForSituation(def.id, index, usedQuestionIds);
  return {
    id: def.id,
    labelBefore: def.labelBefore,
    labelAfter: def.labelAfter,
    helpVerb: def.helpVerb,
    before: def.before,
    after: def.after,
    extras: (def.extras || []).map((extra) => ({
      tileDX: extra.tileDX || 0,
      tileDY: extra.tileDY || 0,
      before: extraSpec(def, extra, 'before'),
      after: extraSpec(def, extra, 'after'),
    })),
    question,
  };
}
