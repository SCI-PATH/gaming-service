/**
 * Phaser-free catalog of library creatures and farm props.
 * Shared by the frontend and the storyline generator (Node).
 */

const CREATURE_DIR = '/assets/library/creatures';
const PROP_DIR = '/assets/library/farm-iso';

const CREATURE_NAMES = {
  bear: 'Bear',
  buffalo: 'Buffalo',
  chick: 'Chick',
  chicken: 'Chicken',
  cow: 'Cow',
  crocodile: 'Crocodile',
  dog: 'Dog',
  duck: 'Duck',
  elephant: 'Elephant',
  frog: 'Frog',
  giraffe: 'Giraffe',
  goat: 'Goat',
  gorilla: 'Gorilla',
  hippo: 'Hippo',
  horse: 'Horse',
  monkey: 'Monkey',
  moose: 'Moose',
  narwhal: 'Narwhal',
  owl: 'Owl',
  panda: 'Panda',
  parrot: 'Parrot',
  penguin: 'Penguin',
  pig: 'Pig',
  rabbit: 'Rabbit',
  rhino: 'Rhino',
  sloth: 'Sloth',
  snake: 'Snake',
  walrus: 'Walrus',
  whale: 'Whale',
  zebra: 'Zebra',
};

function creatureEntry(id) {
  return {
    id,
    name: CREATURE_NAMES[id] || id,
    textureKey: `lib_creature_${id}`,
    image: `${CREATURE_DIR}/${id}.png`,
    mapTileWidth: 3,
  };
}

export const CREATURES = Object.keys(CREATURE_NAMES).map(creatureEntry);
export const CREATURE_IDS = CREATURES.map((c) => c.id);
const CREATURE_BY_ID = new Map(CREATURES.map((c) => [c.id, c]));

export const ROLE_POOLS = {
  guide: ['owl', 'parrot', 'monkey', 'dog', 'sloth', 'panda'],
  helper: [
    'chicken',
    'chick',
    'cow',
    'pig',
    'duck',
    'goat',
    'horse',
    'rabbit',
    'buffalo',
  ],
  obstacle: ['snake', 'crocodile', 'gorilla', 'rhino', 'hippo'],
  climax: ['bear', 'elephant', 'moose', 'gorilla', 'whale'],
};

export const DEFAULT_VISUALS = {
  guide: 'owl',
  helper: 'chicken',
  obstacle: 'snake',
  climaxCreature: 'bear',
  settingProp: 'hayBales_S',
};

const PROP_DEFS = [
  { id: 'hay_S', name: 'Hay pile', mapTileWidth: 2.4 },
  { id: 'hayBales_S', name: 'Hay bales', mapTileWidth: 2.6 },
  { id: 'hayBalesStacked_S', name: 'Stacked hay', mapTileWidth: 2.8 },
  { id: 'sack_S', name: 'Grain sack', mapTileWidth: 2 },
  { id: 'sacksCrate_S', name: 'Sack crate', mapTileWidth: 2.4 },
  { id: 'fenceLow_S', name: 'Low fence', mapTileWidth: 2.2 },
  { id: 'fenceHigh_S', name: 'High fence', mapTileWidth: 2.2 },
  { id: 'fenceLowBroken_S', name: 'Broken fence', mapTileWidth: 2.2 },
  { id: 'corn_S', name: 'Corn stalks', mapTileWidth: 2.4 },
  { id: 'cornYoung_S', name: 'Young corn', mapTileWidth: 2.2 },
  { id: 'cornDouble_S', name: 'Corn row', mapTileWidth: 2.6 },
  { id: 'cornYoungDouble_S', name: 'Young corn row', mapTileWidth: 2.6 },
  { id: 'chimneyBase_S', name: 'Chimney base', mapTileWidth: 2.2 },
  { id: 'chimneyTop_S', name: 'Chimney', mapTileWidth: 2 },
  { id: 'ladderStand_S', name: 'Ladder', mapTileWidth: 2.2 },
];

export const FARM_PROPS = PROP_DEFS.map((p) => ({
  ...p,
  textureKey: `lib_prop_${p.id}`,
  image: `${PROP_DIR}/${p.id}.png`,
}));
export const PROP_IDS = FARM_PROPS.map((p) => p.id);
const PROP_BY_ID = new Map(FARM_PROPS.map((p) => [p.id, p]));

export const LIBRARY_LOAD_ITEMS = [...CREATURES, ...FARM_PROPS].map((item) => ({
  textureKey: item.textureKey,
  image: item.image,
}));

export const CHALLENGE_TYPES = [
  'investigate',
  'discover',
  'tend',
  'obstacle',
  'climax',
];

const CREATURE_ALIASES = [
  ['killer whale', 'whale'],
  ['hippopotamus', 'hippo'],
  ['rhinoceros', 'rhino'],
  ['chickens', 'chicken'],
  ['crocodiles', 'crocodile'],
  ['elephants', 'elephant'],
  ['giraffes', 'giraffe'],
  ['gorillas', 'gorilla'],
  ['penguins', 'penguin'],
  ['rabbits', 'rabbit'],
  ['buffaloes', 'buffalo'],
  ['narwhals', 'narwhal'],
  ['monkeys', 'monkey'],
  ['parrots', 'parrot'],
  ['snakes', 'snake'],
  ['zebras', 'zebra'],
  ['horses', 'horse'],
  ['cattle', 'cow'],
  ['chicks', 'chick'],
  ['ducks', 'duck'],
  ['goats', 'goat'],
  ['bears', 'bear'],
  ['owls', 'owl'],
  ['pigs', 'pig'],
  ['cows', 'cow'],
  ['dogs', 'dog'],
  ['bunny', 'rabbit'],
  ['macaw', 'parrot'],
  ['orca', 'whale'],
  ['hen', 'chicken'],
  ['calf', 'cow'],
];

const NAME_MATCHES = [
  ...CREATURE_ALIASES,
  ...CREATURE_IDS.map((id) => [id, id]),
].sort((a, b) => b[0].length - a[0].length);

export function getCreature(id) {
  return CREATURE_BY_ID.get(String(id || '')) || null;
}

export function getProp(id) {
  return PROP_BY_ID.get(String(id || '')) || null;
}

export function isCreatureId(id) {
  return CREATURE_BY_ID.has(String(id || ''));
}

export function isPropId(id) {
  return PROP_BY_ID.has(String(id || ''));
}

export function isChallengeType(value) {
  return CHALLENGE_TYPES.includes(String(value || ''));
}

export function visualsForFrustration(frustrationLevel) {
  const lv = String(frustrationLevel || '').toUpperCase();
  if (lv === 'HIGH' || lv === 'VERY_HIGH') {
    return {
      guide: 'owl',
      helper: 'chicken',
      obstacle: 'snake',
      climaxCreature: 'bear',
      settingProp: 'corn_S',
    };
  }
  if (lv === 'LOW' || lv === 'MILD') {
    return {
      guide: 'owl',
      helper: 'pig',
      obstacle: 'snake',
      climaxCreature: 'moose',
      settingProp: 'cornDouble_S',
    };
  }
  return {
    guide: 'owl',
    helper: 'cow',
    obstacle: 'goat',
    climaxCreature: 'bear',
    settingProp: 'hayBales_S',
  };
}

/** Pick a catalog creature mentioned in narrative text, or null. */
export function inferCreatureFromText(text) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack) return null;
  for (const [alias, id] of NAME_MATCHES) {
    if (haystack.includes(alias)) return id;
  }
  return null;
}
