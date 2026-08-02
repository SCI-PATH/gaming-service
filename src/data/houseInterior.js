/**
 * House screen assets + quiz placements.
 * Layout positions match the furnished reference (top-down RPG house).
 *
 * Furniture luxury (beds, tables, pantry, décor) scales with gameplay
 * performance band — separate from question difficulty.
 */

export const HOUSE_TILES = {
  floor: '/assets/house/tiles/floor.png',
  wallStone: '/assets/house/tiles/wall_stone.png',
  wallTrim: '/assets/house/tiles/wall_trim.png',
  wallArch: '/assets/house/tiles/wall_arch.png',
  pillar: '/assets/house/tiles/pillar.png',
  window: '/assets/house/tiles/window.png',
  doorClosed: '/assets/house/tiles/door_closed.png',
  floorDark: '/assets/house/tiles/floor_dark.png',
  reference: '/assets/house/house_reference.png',
};

/**
 * Furniture pieces placed into the house floor plan.
 * `slot` is the layout slot id; `src` is the cropped sprite.
 * Includes poor / average / luxury variants from the tier pack.
 */
export const HOUSE_FURNITURE = {
  rug_blue: {
    src: '/assets/house/furniture/rug_blue.png',
    label: 'Dining rug',
    slot: 'dining_rug',
  },
  rug_red: {
    src: '/assets/house/furniture/rug_red.png',
    label: 'Entry rug',
    slot: 'entry_rug',
  },
  rug_runner: {
    src: '/assets/house/furniture/rug_runner.png',
    label: 'Bedroom rug',
    slot: 'bedroom_rug',
  },
  mat_wood: {
    src: '/assets/house/furniture/mat_wood.png',
    label: 'Simple floor mat',
    slot: 'dining_rug',
  },
  bed: {
    src: '/assets/house/furniture/bed.png',
    label: 'Comfortable bed',
    slot: 'bed',
  },
  bed_frame: {
    src: '/assets/house/furniture/bed_frame.png',
    label: 'Plain bed frame',
    slot: 'bed',
  },
  poor_bed_double_gray: {
    src: '/assets/house/furniture/poor_bed_double_gray.png',
    label: 'Worn double bed',
    slot: 'bed',
  },
  poor_bed_single_gray: {
    src: '/assets/house/furniture/poor_bed_single_gray.png',
    label: 'Stained single bed',
    slot: 'bed',
  },
  avg_bed_wood: {
    src: '/assets/house/furniture/avg_bed_wood.png',
    label: 'Simple wooden bed',
    slot: 'bed',
  },
  nightstand: {
    src: '/assets/house/furniture/nightstand.png',
    label: 'Nightstand',
    slot: 'nightstand',
  },
  avg_nightstand: {
    src: '/assets/house/furniture/avg_nightstand.png',
    label: 'Wooden nightstand',
    slot: 'nightstand',
  },
  bookshelf: {
    src: '/assets/house/furniture/bookshelf.png',
    label: 'Bookshelf',
    slot: 'bookshelf',
  },
  crate: {
    src: '/assets/house/furniture/crate.png',
    label: 'Storage crate',
    slot: 'bookshelf',
  },
  avg_cabinet: {
    src: '/assets/house/furniture/avg_cabinet.png',
    label: 'Small cabinet',
    slot: 'bookshelf',
  },
  sofa: {
    src: '/assets/house/furniture/sofa.png',
    label: 'Armchair',
    slot: 'armchair',
  },
  poor_sofa_green: {
    src: '/assets/house/furniture/poor_sofa_green.png',
    label: 'Worn green sofa',
    slot: 'armchair',
  },
  poor_sofa_tan: {
    src: '/assets/house/furniture/poor_sofa_tan.png',
    label: 'Stained sofa',
    slot: 'armchair',
  },
  poor_chair_green: {
    src: '/assets/house/furniture/poor_chair_green.png',
    label: 'Worn green chair',
    slot: 'armchair',
  },
  avg_chair_back: {
    src: '/assets/house/furniture/avg_chair_back.png',
    label: 'Upholstered chair',
    slot: 'armchair',
  },
  shelf_empty: {
    src: '/assets/house/furniture/shelf_empty.png',
    label: 'Empty shelf',
    slot: 'pantry',
  },
  shelf_stocked: {
    src: '/assets/house/furniture/shelf_stocked.png',
    label: 'Pantry shelf',
    slot: 'pantry',
  },
  table_empty: {
    src: '/assets/house/furniture/table_empty.png',
    label: 'Bare table',
    slot: 'dining_table',
  },
  table_set: {
    src: '/assets/house/furniture/table_set.png',
    label: 'Dining table',
    slot: 'dining_table',
  },
  table_chairs: {
    src: '/assets/house/furniture/table_chairs.png',
    label: 'Luxury dining set',
    slot: 'dining_table',
  },
  avg_table_rect: {
    src: '/assets/house/furniture/avg_table_rect.png',
    label: 'Wooden table',
    slot: 'dining_table',
  },
  avg_table_oval: {
    src: '/assets/house/furniture/avg_table_oval.png',
    label: 'Oval dining table',
    slot: 'dining_table',
  },
  poor_bench_light: {
    src: '/assets/house/furniture/poor_bench_light.png',
    label: 'Rough wooden bench',
    slot: 'dining_table',
  },
  avg_bench_dark: {
    src: '/assets/house/furniture/avg_bench_dark.png',
    label: 'Dark wood table',
    slot: 'dining_table',
  },
  chair: {
    src: '/assets/house/furniture/chair.png',
    label: 'Chair',
    slot: 'dining_chair',
  },
  alchemy: {
    src: '/assets/house/furniture/alchemy.png',
    label: 'Potion table',
    slot: 'alchemy',
  },
  barrel: {
    src: '/assets/house/furniture/barrel.png',
    label: 'Barrel',
    slot: 'barrel',
  },
  weapon_rack: {
    src: '/assets/house/furniture/weapon_rack.png',
    label: 'Weapon rack',
    slot: 'weapons',
  },
  herbs: {
    src: '/assets/house/furniture/herbs.png',
    label: 'Herbs',
    slot: 'herbs',
  },
  sack: {
    src: '/assets/house/furniture/sack.png',
    label: 'Grain sack',
    slot: 'herbs',
  },
  plant: {
    src: '/assets/house/furniture/plant.png',
    label: 'House plant',
    slot: 'plant_decor',
  },
  plant_flower: {
    src: '/assets/house/furniture/plant_flower.png',
    label: 'Flowering plant',
    slot: 'plant_decor',
  },
  avg_plant_leafy: {
    src: '/assets/house/furniture/avg_plant_leafy.png',
    label: 'Leafy plant',
    slot: 'plant_decor',
  },
  avg_plant_spiky: {
    src: '/assets/house/furniture/avg_plant_spiky.png',
    label: 'Spiky plant',
    slot: 'plant_decor',
  },
  lux_plant_spiky: {
    src: '/assets/house/furniture/lux_plant_spiky.png',
    label: 'Lush decorative plant',
    slot: 'plant_decor',
  },
  avg_tv: {
    src: '/assets/house/furniture/avg_tv.png',
    label: 'Television',
    slot: 'weapons',
  },
  avg_wood_tile: {
    src: '/assets/house/furniture/avg_wood_tile.png',
    label: 'Wood panel',
    slot: 'dining_rug',
  },
};

/**
 * Luxury tiers by gameplay performance:
 * weak → poor furniture
 * average → average luxury
 * strong/smart → luxury furniture
 */
export const HOUSE_LUXURY_BY_BAND = {
  weak: {
    band: 'weak',
    label: 'Poor furniture',
    houseLevel: 'Poor furniture',
    blurbExtra:
      'Poor furniture for now — stained beds, worn sofas, rough benches, and empty shelves. Improve to upgrade your rooms.',
    roles: {
      bed: 'poor_bed_double_gray',
      dining_table: 'poor_bench_light',
      pantry: 'shelf_empty',
      dining_rug: 'mat_wood',
      bedroom_rug: 'rug_runner',
      bookshelf: 'crate',
      dining_chair: 'chair',
      herbs: 'sack',
      alchemy: 'alchemy',
      barrel: 'barrel',
      entry_rug: 'rug_red',
      armchair: 'poor_sofa_tan',
      plant_decor: 'avg_plant_spiky',
      nightstand: 'avg_nightstand',
      weapons: 'weapon_rack',
    },
    bonusOnPlace: {
      bed: ['poor_chair_green'],
    },
  },
  average: {
    band: 'average',
    label: 'Average luxury',
    houseLevel: 'Average luxury',
    blurbExtra:
      'Average luxury furnishings — a wooden bed, solid dining table, stocked pantry, and a leafy plant.',
    roles: {
      bed: 'avg_bed_wood',
      dining_table: 'avg_table_oval',
      pantry: 'shelf_stocked',
      dining_rug: 'rug_blue',
      bedroom_rug: 'rug_runner',
      bookshelf: 'avg_cabinet',
      dining_chair: 'chair',
      herbs: 'herbs',
      alchemy: 'alchemy',
      barrel: 'barrel',
      entry_rug: 'rug_red',
      armchair: 'avg_chair_back',
      plant_decor: 'avg_plant_leafy',
      nightstand: 'avg_nightstand',
      weapons: 'avg_tv',
    },
    bonusOnPlace: {
      bed: ['avg_nightstand'],
      dining_table: ['avg_plant_leafy'],
    },
  },
  strong: {
    band: 'strong',
    label: 'Luxury furniture',
    houseLevel: 'Luxury furniture',
    blurbExtra:
      'Luxury furniture — premium bed and dining set, flowering plants, nightstand, armchair, and polished accents.',
    roles: {
      bed: 'bed',
      dining_table: 'table_chairs',
      pantry: 'shelf_stocked',
      dining_rug: 'rug_blue',
      bedroom_rug: 'rug_runner',
      bookshelf: 'bookshelf',
      dining_chair: 'chair',
      herbs: 'herbs',
      alchemy: 'alchemy',
      barrel: 'barrel',
      entry_rug: 'rug_red',
      armchair: 'sofa',
      plant_decor: 'plant_flower',
      nightstand: 'nightstand',
      weapons: 'weapon_rack',
    },
    bonusOnPlace: {
      bed: ['nightstand', 'sofa'],
      dining_table: ['plant_flower', 'lux_plant_spiky'],
      alchemy: ['weapon_rack'],
      pantry: ['plant'],
    },
  },
};

/** Map a catalog furniture key to its logical role (slot-based). */
export function furnitureRoleFromKey(furnitureKey) {
  const furn = HOUSE_FURNITURE[furnitureKey];
  if (!furn) return furnitureKey;
  const slotToRole = {
    bed: 'bed',
    dining_table: 'dining_table',
    pantry: 'pantry',
    dining_rug: 'dining_rug',
    bedroom_rug: 'bedroom_rug',
    bookshelf: 'bookshelf',
    dining_chair: 'dining_chair',
    herbs: 'herbs',
    alchemy: 'alchemy',
    barrel: 'barrel',
    entry_rug: 'entry_rug',
    nightstand: 'nightstand',
    armchair: 'armchair',
    weapons: 'weapons',
    plant_decor: 'plant_decor',
  };
  return slotToRole[furn.slot] || furnitureKey;
}

export function getHouseLuxury(band = 'average') {
  return HOUSE_LUXURY_BY_BAND[band] || HOUSE_LUXURY_BY_BAND.average;
}

/**
 * Resolve the visual furniture key for a placement role + gameplay band.
 */
export function resolveFurnitureKey(roleOrKey, band = 'average') {
  const luxury = getHouseLuxury(band);
  const role = furnitureRoleFromKey(roleOrKey);
  return luxury.roles[role] || roleOrKey;
}

/** Absolute layout slots inside the house floor plan (% of plan box). */
export const HOUSE_LAYOUT_SLOTS = {
  bed: { left: '26%', top: '6%', width: '7%', height: '16%' },
  nightstand: { left: '34%', top: '10%', width: '7%', height: '10%' },
  bedroom_rug: { left: '22%', top: '22%', width: '30%', height: '9%' },
  bookshelf: { left: '48%', top: '5%', width: '6%', height: '16%' },
  armchair: { left: '55%', top: '14%', width: '7%', height: '12%' },
  pantry: { left: '76%', top: '5%', width: '14%', height: '18%' },
  herbs: { left: '72%', top: '4%', width: '5%', height: '10%' },
  dining_rug: { left: '36%', top: '40%', width: '24%', height: '28%' },
  dining_table: { left: '40%', top: '46%', width: '16%', height: '18%' },
  dining_chair: { left: '52%', top: '62%', width: '5%', height: '9%' },
  plant_decor: { left: '58%', top: '42%', width: '5%', height: '10%' },
  weapons: { left: '86%', top: '52%', width: '7%', height: '14%' },
  entry_rug: { left: '74%', top: '78%', width: '12%', height: '10%' },
  alchemy: { left: '6%', top: '70%', width: '8%', height: '12%' },
  barrel: { left: '16%', top: '76%', width: '7%', height: '12%' },
};

/**
 * Each placement = one quiz question that puts furniture into a slot.
 * `furnitureKey` is the canonical/average key; remapped by band in getHouseStage.
 */
export const HOUSE_STAGE_PLACEMENTS = {
  clean_maintain: {
    title: 'Furnish the House',
    blurb:
      'The house is empty. Answer correctly to place each piece of furniture into the rooms.',
    placements: [
      {
        id: 'place_dining_rug',
        furnitureKey: 'rug_blue',
        placeLabel: 'Dining rug placed in the main room',
        prompt: 'Where should the large circular rug go in the house?',
        options: [
          'In the center of the main dining / living floor',
          'On the staircase steps',
          'Covering the windows',
          'Outside the front door only',
        ],
        correctIndex: 0,
        hint: 'The round rug belongs in the open middle room.',
      },
      {
        id: 'place_bed',
        furnitureKey: 'bed',
        placeLabel: 'Bed placed in the bedroom',
        prompt: 'The bed belongs in which part of the house?',
        options: [
          'The bedroom alcove against the back wall',
          'In the middle of the dining rug',
          'Blocking both doorways',
          'On top of the pantry shelf',
        ],
        correctIndex: 0,
      },
      {
        id: 'place_bedroom_rug',
        furnitureKey: 'rug_runner',
        placeLabel: 'Bedroom rug placed',
        prompt: 'A long rug in the bedroom is for…',
        options: [
          'Warmth and a clear walking path beside the bed',
          'Sealing the chimney shut',
          'Replacing the roof tiles',
          'Hiding under the stairs forever',
        ],
        correctIndex: 0,
      },
      {
        id: 'place_bookshelf',
        furnitureKey: 'bookshelf',
        placeLabel: 'Bookshelf placed by the study chair',
        prompt: 'Place the bookshelf…',
        options: [
          'Along the bedroom / study wall near the chair',
          'Inside the water barrel',
          'On the dining table plates',
          'Outside next to the cart',
        ],
        correctIndex: 0,
      },
      {
        id: 'place_table',
        furnitureKey: 'table_set',
        placeLabel: 'Dining table set on the rug',
        prompt: 'The dining table should sit…',
        options: [
          'On the circular rug in the main room with chairs around it',
          'Upside-down on the stairs',
          'In the pantry shelf cubby',
          'Floating above the windows',
        ],
        correctIndex: 0,
      },
    ],
  },
  cooking: {
    title: 'Stock the Kitchen',
    blurb: 'Fill the pantry and finish the dining area for meals.',
    placements: [
      {
        id: 'stock_pantry',
        furnitureKey: 'shelf_stocked',
        placeLabel: 'Pantry shelf stocked',
        prompt: 'Kitchen pantry shelves should hold…',
        options: [
          'Jars, grain sacks, herbs, and produce',
          'Only wet mud',
          'Broken glass on the floor',
          'Nothing useful at all',
        ],
        correctIndex: 0,
      },
      {
        id: 'hang_herbs',
        furnitureKey: 'herbs',
        placeLabel: 'Herbs hung in the pantry',
        prompt: 'Hanging herbs near the pantry helps…',
        options: [
          'Keep cooking ingredients handy and the kitchen fresh',
          'Stop the sun from rising',
          'Replace the wooden stairs',
          'Scare the rooster forever',
        ],
        correctIndex: 0,
      },
      {
        id: 'set_chair',
        furnitureKey: 'chair',
        placeLabel: 'Chair placed at the dining table',
        prompt: 'Dining chairs belong…',
        options: [
          'Around the dining table so people can sit to eat',
          'Stacked on the roof ridge',
          'Inside the treasure chest',
          'Under the bed frame only',
        ],
        correctIndex: 0,
      },
    ],
  },
  fix_heater: {
    title: 'Finish the Side Rooms',
    blurb: 'Set up the alchemy nook, barrel, and entry furnishings.',
    placements: [
      {
        id: 'alchemy_table',
        furnitureKey: 'alchemy',
        placeLabel: 'Potion table placed in the side room',
        prompt: 'The potion / utility table belongs…',
        options: [
          'In the small side room near the arched door',
          'On the bedroom pillow',
          'Blocking the staircase',
          'Outside in the crop field',
        ],
        correctIndex: 0,
      },
      {
        id: 'place_barrel',
        furnitureKey: 'barrel',
        placeLabel: 'Barrel placed for storage',
        prompt: 'A wooden barrel in the house is useful to…',
        options: [
          'Store water or goods safely in a corner',
          'Feed the windmill gears',
          'Replace window glass',
          'Scare animals from the map',
        ],
        correctIndex: 0,
      },
      {
        id: 'entry_rug',
        furnitureKey: 'rug_red',
        placeLabel: 'Entry rug placed by the door',
        prompt: 'A small rug near the entrance helps…',
        options: [
          'Keep the entry clean and mark the doorway area',
          'Seal every chimney forever',
          'Hide the pantry food',
          'Cover the dining plates',
        ],
        correctIndex: 0,
      },
    ],
  },
};

/**
 * Stage data with furniture remapped to the student's gameplay luxury band.
 * @param {string} stageId
 * @param {'weak'|'average'|'strong'} [band]
 */
export function getHouseStage(stageId, band = 'average') {
  const base =
    HOUSE_STAGE_PLACEMENTS[stageId] || HOUSE_STAGE_PLACEMENTS.clean_maintain;
  const luxury = getHouseLuxury(band);

  const placements = base.placements.map((p) => {
    const key = resolveFurnitureKey(p.furnitureKey, band);
    const furn = HOUSE_FURNITURE[key];
    return {
      ...p,
      furnitureKey: key,
      canonicalKey: p.furnitureKey,
      placeLabel: furn ? `${furn.label} placed` : p.placeLabel,
      luxuryLabel: luxury.label,
    };
  });

  return {
    ...base,
    band: luxury.band,
    houseLevel: luxury.houseLevel,
    luxuryLabel: luxury.label,
    blurb: `${base.blurb} ${luxury.blurbExtra}`,
    placements,
    bonusOnPlace: luxury.bonusOnPlace || {},
  };
}

/** Keys to also place when a quiz furniture piece is placed (by band). */
export function getHouseBonusKeys(furnitureKey, band = 'average') {
  const luxury = getHouseLuxury(band);
  const role = furnitureRoleFromKey(furnitureKey);
  const bonuses = luxury.bonusOnPlace?.[role] || [];
  return bonuses.filter((k) => HOUSE_FURNITURE[k]);
}
