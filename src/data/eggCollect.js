/**
 * Egg-collect challenge — clean wooden coop layout.
 * Collect eggs into the bowl by answering science questions correctly.
 * Late / wrong → eggs hatch into chicks.
 *
 * Under Hen House stage `collect_eggs` (requires owning chicks).
 */

export const EGG_ASSETS = {
  egg: '/assets/eggs/egg.png',
  bowl: '/assets/eggs/bowl.png',
  coopBg: '/assets/eggs/coop_bg.png',
  woodShelf: '/assets/eggs/wood_shelf.png',
  woodTile: '/assets/eggs/wood_tile.png',
  chick: '/assets/eggs/chick_single.png',
  chickFrames: [
    '/assets/eggs/chick_0.png',
    '/assets/eggs/chick_1.png',
    '/assets/eggs/chick_2.png',
    '/assets/eggs/chick_3.png',
    '/assets/eggs/chick_4.png',
    '/assets/eggs/chick_5.png',
  ],
  rooster: '/assets/eggs/rooster.png',
  roosterFrames: [
    '/assets/eggs/rooster_0.png',
    '/assets/eggs/rooster_1.png',
    '/assets/eggs/rooster_2.png',
    '/assets/eggs/rooster_3.png',
    '/assets/eggs/rooster_4.png',
    '/assets/eggs/rooster_5.png',
    '/assets/eggs/rooster_6.png',
    '/assets/eggs/rooster_7.png',
  ],
};

/** Collect / hatch timings by gameplay performance band. */
export const EGG_COLLECT_BY_BAND = {
  weak: {
    band: 'weak',
    label: 'Gentle pace',
    nestCount: 6,
    eggsNeeded: 4,
    collectTimerMs: 55000,
    protectBonusMs: 18000,
    blurb:
      'Answer science questions correctly to put eggs in the bowl. Wrong or late → eggs hatch into chicks.',
  },
  average: {
    band: 'average',
    label: 'Steady pace',
    nestCount: 6,
    eggsNeeded: 4,
    collectTimerMs: 32000,
    protectBonusMs: 12000,
    blurb:
      'Correct answers collect eggs into the bowl. If the timer runs out, leftover eggs become chicks.',
  },
  strong: {
    band: 'strong',
    label: 'Fast pace',
    nestCount: 8,
    eggsNeeded: 5,
    collectTimerMs: 18000,
    protectBonusMs: 7000,
    blurb:
      'Fast hatch timer! Answer correctly to collect eggs before they hatch into chicks.',
  },
};

export const EGG_PROTECT_QUESTIONS = [
  {
    id: 'egg-protect-1',
    prompt: 'Why collect eggs soon after they are laid?',
    options: [
      'So they stay fresh and do not start developing into chicks',
      'So the windmill can spin faster',
      'So the well fills with water',
      'Eggs never need collecting',
    ],
    correctIndex: 0,
    hint: 'Warm nests can start incubation if eggs sit too long.',
  },
  {
    id: 'egg-protect-2',
    prompt: 'A safe nest for laying birds should be…',
    options: [
      'Clean, dry, quiet, and protected from predators',
      'Wet and windy',
      'In the middle of a busy road',
      'Completely dark with no bedding',
    ],
    correctIndex: 0,
    hint: 'Comfort and safety help birds lay and keep eggs intact.',
  },
  {
    id: 'egg-protect-3',
    prompt: 'If eggs stay warm under a bird for many days, they may…',
    options: [
      'Develop and hatch into chicks',
      'Turn into seeds for planting',
      'Power the farm cart',
      'Become stone',
    ],
    correctIndex: 0,
    hint: 'Incubation heat starts chick development.',
  },
  {
    id: 'egg-protect-4',
    prompt: 'Collecting eggs into a clean bowl or basket helps…',
    options: [
      'Keep eggs clean, counted, and ready to use or sell',
      'Scare the rooster away forever',
      'Stop the sun from rising',
      'Replace the need for food and water',
    ],
    correctIndex: 0,
  },
  {
    id: 'egg-protect-5',
    prompt: 'Chicks and roosters need which of these every day?',
    options: [
      'Food, clean water, and a safe sheltered coop',
      'Only loud music',
      'Only muddy puddles',
      'Nothing at all',
    ],
    correctIndex: 0,
  },
  {
    id: 'egg-protect-6',
    prompt: 'Answering correctly before the hatch timer ends…',
    options: [
      'Protects eggs so they do not hatch into chicks yet',
      'Makes the roof disappear',
      'Turns eggs into gold coins instantly',
      'Stops all farm animals forever',
    ],
    correctIndex: 0,
  },
];

export function getEggCollectSettings(band = 'average') {
  return EGG_COLLECT_BY_BAND[band] || EGG_COLLECT_BY_BAND.average;
}

/**
 * Build coop nests: rooster + egg on wooden shelf slots.
 * @param {'weak'|'average'|'strong'} band
 */
export function createEggRound(band = 'average') {
  const settings = getEggCollectSettings(band);
  const now = Date.now();
  const roosterFrames = EGG_ASSETS.roosterFrames;
  const chickFrames = EGG_ASSETS.chickFrames;
  const count = settings.nestCount;
  const nests = [];
  for (let i = 0; i < count; i += 1) {
    nests.push({
      id: `nest-${i}`,
      side: i % 2 === 0 ? 'left' : 'right',
      roosterSrc: roosterFrames[i % roosterFrames.length] || EGG_ASSETS.rooster,
      chickSrc: chickFrames[i % chickFrames.length] || EGG_ASSETS.chick,
      status: 'egg', // egg | collected | hatched
    });
  }
  return {
    band: settings.band,
    settings,
    nests,
    collected: 0,
    hatched: 0,
    startedAt: now,
    endsAt: now + settings.collectTimerMs,
    protectUsed: 0,
  };
}

export function pickProtectQuestion(usedIds = []) {
  const pool = EGG_PROTECT_QUESTIONS.filter((q) => !usedIds.includes(q.id));
  const list = pool.length ? pool : EGG_PROTECT_QUESTIONS;
  return list[Math.floor(Math.random() * list.length)];
}

export function isEggCollectStage(itemId, stageId) {
  if (stageId !== 'collect_eggs' && stageId !== 'chick_to_hen') return false;
  return itemId === 'hen_house' || itemId === 'house' || itemId === 'chick';
}
