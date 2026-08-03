/**
 * Unlock-item challenge catalog for SCI_PATH.
 *
 * When a student buys an item at the end of level N, that item appears on
 * later levels with staged challenges (minLevelsOwned = how many farm levels
 * have passed since purchase, including the next playable level as 1).
 *
 * Example: buy house after level 1 → on level 2 (minLevelsOwned=1) Clean & Maintain;
 * on level 3 (minLevelsOwned=2) also Cooking + Fix Heater.
 */

/** @typedef {{ id: string, title: string, description: string, minLevelsOwned: number, steps: ChallengeStep[], rewardRp?: number, rewardCash?: number }} ChallengeStage */
/** @typedef {{ id: string, label: string, prompt: string, options: string[], correctIndex: number, hint?: string }} ChallengeStep */

/**
 * @type {Record<string, { itemId: string, label: string, category: string, stages: ChallengeStage[] }>}
 */
export const UNLOCK_CHALLENGES = {
  house: {
    itemId: 'house',
    label: 'Farm House',
    category: 'building',
    stages: [
      {
        id: 'clean_maintain',
        title: 'Clean & Maintain',
        description:
          'Enter the empty house and place rug, bed, bedroom rug, bookshelf, and dining table.',
        minLevelsOwned: 1,
        rewardRp: 40,
        steps: [
          {
            id: 'house-clean-1',
            label: 'Place dining rug',
            prompt: 'Where should the large circular rug go in the house?',
            options: [
              'In the center of the main dining / living floor',
              'On the staircase steps',
              'Covering the windows',
              'Outside the front door only',
            ],
            correctIndex: 0,
          },
          {
            id: 'house-clean-2',
            label: 'Place the bed',
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
            id: 'house-clean-3',
            label: 'Place bedroom rug',
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
            id: 'house-clean-4',
            label: 'Place bookshelf',
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
            id: 'house-clean-5',
            label: 'Place dining table',
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
      {
        id: 'cooking',
        title: 'Prepare Meals',
        description:
          'Enter the house and stock the shelf, set the dining table, and place herbs.',
        minLevelsOwned: 2,
        rewardRp: 45,
        rewardCash: 20,
        steps: [
          {
            id: 'house-cook-1',
            label: 'Stock the shelf',
            prompt: 'Kitchen shelves should hold…',
            options: [
              'Jars, grain sacks, and fresh produce',
              'Only wet mud',
              'Broken glass on the floor',
              'Nothing — leave them empty forever',
            ],
            correctIndex: 0,
          },
          {
            id: 'house-cook-2',
            label: 'Set the table',
            prompt: 'A set dining table for a farm meal should include…',
            options: [
              'Plates, a jug, and simple food',
              'Only nails and hammers',
              'Only wet leaves',
              'Only locked chests',
            ],
            correctIndex: 0,
          },
          {
            id: 'house-cook-3',
            label: 'Place herbs',
            prompt: 'Keeping a plant or herbs near the kitchen helps…',
            options: [
              'Fresh flavor and a healthier room',
              'Stop the sun from rising',
              'Replace the water well',
              'Unlock the forest gate alone',
            ],
            correctIndex: 0,
          },
        ],
      },
      {
        id: 'fix_heater',
        title: 'Fix the Heater',
        description: 'Place the hearth and keep the house warm and safe.',
        minLevelsOwned: 2,
        rewardRp: 40,
        steps: [
          {
            id: 'house-heat-1',
            label: 'Install hearth',
            prompt: 'The hearth / heater should sit…',
            options: [
              'Against a stone wall with space to stay clear of rugs',
              'On top of the wooden bed',
              'Under the dining tablecloth',
              'Outside in the flower bed only',
            ],
            correctIndex: 0,
          },
          {
            id: 'house-heat-2',
            label: 'Clear a safe path',
            prompt: 'Before lighting heat, you should…',
            options: [
              'Keep flammable clutter away and check vents',
              'Pile dry hay on the hearth',
              'Seal every window with mud forever',
              'Cover the chimney with a blanket',
            ],
            correctIndex: 0,
          },
          {
            id: 'house-heat-3',
            label: 'Ready water nearby',
            prompt: 'A water barrel near the hearth is useful to…',
            options: [
              'Help with safety and daily farm chores',
              'Feed the windmill gears',
              'Replace the roof shingles',
              'Scare the rooster away',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  hen_house: {
    itemId: 'hen_house',
    label: 'Hen House',
    category: 'building',
    stages: [
      {
        id: 'collect_eggs',
        title: 'Collect Eggs',
        description:
          'Click the hen house on the farm. Collect eggs into the bowl before they hatch. Answer science questions correctly. Timer follows your gameplay band.',
        minLevelsOwned: 1,
        mode: 'egg_collect',
        rewardRp: 40,
        rewardCash: 10,
        steps: [
          {
            id: 'hen-egg-collect',
            label: 'Collect eggs from the chicks',
            prompt: 'Collect eggs before they hatch',
            options: ['Collect', 'Wait', 'Ignore', 'Plant'],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  well: {
    itemId: 'well',
    label: 'Water Well',
    category: 'prop',
    stages: [
      {
        id: 'fetch_water',
        title: 'Fetch Water',
        description: 'Operate the well and deliver water to crops or animals.',
        minLevelsOwned: 1,
        rewardRp: 25,
        steps: [
          {
            id: 'well-1',
            label: 'Operate the well',
            prompt: 'What does a farm well mainly provide?',
            options: [
              'Fresh water for crops, animals, and people',
              'Electricity only',
              'Metal ore',
              'Wind power',
            ],
            correctIndex: 0,
          },
          {
            id: 'well-2',
            label: 'Deliver water',
            prompt: 'Why deliver well water to crop beds?',
            options: [
              'Plants need water for growth and nutrient transport',
              'Water removes all sunlight',
              'Water turns soil into glass',
              'Crops grow only in dry sand forever',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  windmill: {
    itemId: 'windmill',
    label: 'Windmill',
    category: 'building',
    stages: [
      {
        id: 'repair_operate',
        title: 'Repair & Operate',
        description: 'Fix broken parts and get the windmill running.',
        minLevelsOwned: 1,
        rewardRp: 35,
        steps: [
          {
            id: 'wind-1',
            label: 'Repair blades',
            prompt: 'A windmill turns wind energy mainly into…',
            options: [
              'Mechanical power for grinding or pumping',
              'Soil nutrients',
              'Animal wool',
              'Thunderclouds',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  barrel: {
    itemId: 'barrel',
    label: 'Wooden Barrel',
    category: 'prop',
    stages: [
      {
        id: 'fill_store',
        title: 'Fill & Store',
        description: 'Collect water or grain and fill the barrel carefully.',
        minLevelsOwned: 1,
        rewardRp: 20,
        steps: [
          {
            id: 'barrel-1',
            label: 'Fill without spilling',
            prompt: 'Barrels on a farm are mainly used to…',
            options: [
              'Store water or grain safely',
              'Scare bees',
              'Replace sunlight',
              'Grow roots in the air',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  tent: {
    itemId: 'tent',
    label: 'Camp Tent',
    category: 'prop',
    stages: [
      {
        id: 'set_up_camp',
        title: 'Set Up Camp',
        description: 'Collect poles, rope and fabric; assemble a rest spot.',
        minLevelsOwned: 1,
        rewardRp: 22,
        steps: [
          {
            id: 'tent-1',
            label: 'Assemble tent',
            prompt: 'What do you need to pitch a simple camp tent?',
            options: [
              'Poles, rope/fabric, and a clear flat spot',
              'Only a heater',
              'Only seeds',
              'Only a treasure map',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  campfire: {
    itemId: 'campfire',
    label: 'Campfire',
    category: 'prop',
    stages: [
      {
        id: 'prepare_fire',
        title: 'Prepare a Fire',
        description: 'Collect firewood, arrange it safely, then cook food.',
        minLevelsOwned: 1,
        rewardRp: 25,
        steps: [
          {
            id: 'fire-1',
            label: 'Arrange firewood',
            prompt: 'Safe campfire practice includes…',
            options: [
              'Clear space around wood and never leave fire unattended',
              'Build fire against dry curtains',
              'Pour water on yourself first',
              'Hide fire under a bed',
            ],
            correctIndex: 0,
          },
        ],
      },
      {
        id: 'cook_on_fire',
        title: 'Cook on the Fire',
        description: 'Use the campfire to prepare a simple meal.',
        minLevelsOwned: 2,
        rewardRp: 30,
        steps: [
          {
            id: 'fire-2',
            label: 'Cook food',
            prompt: 'Food cooked on a campfire should be…',
            options: [
              'Heated enough to be safe to eat, then fire put out safely',
              'Left raw forever',
              'Thrown into the well',
              'Stored in the windmill blades',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  supplies: {
    itemId: 'supplies',
    label: 'Farm Supplies',
    category: 'prop',
    stages: [
      {
        id: 'organize_supplies',
        title: 'Organize Supplies',
        description: 'Sort tools, seeds and materials into correct storage.',
        minLevelsOwned: 1,
        rewardRp: 20,
        steps: [
          {
            id: 'sup-1',
            label: 'Sort tools',
            prompt: 'Why keep farm tools and seeds organized?',
            options: [
              'Faster work and less loss/damage',
              'To make animals hungry',
              'To block the well',
              'To stop photosynthesis',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  cart: {
    itemId: 'cart',
    label: 'Wooden Cart',
    category: 'prop',
    stages: [
      {
        id: 'load_transport',
        title: 'Load & Transport',
        description: 'Load harvested crops without overfilling, then haul them.',
        minLevelsOwned: 1,
        rewardRp: 28,
        steps: [
          {
            id: 'cart-1',
            label: 'Load carefully',
            prompt: 'When loading a farm cart you should…',
            options: [
              'Balance the load and not exceed safe capacity',
              'Pile until it tips over',
              'Fill only with rocks forever',
              'Never use wheels',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  chest: {
    itemId: 'chest',
    label: 'Treasure Chest',
    category: 'prop',
    stages: [
      {
        id: 'find_unlock',
        title: 'Find & Unlock',
        description: 'Solve a short code challenge to open the chest.',
        minLevelsOwned: 1,
        rewardRp: 40,
        rewardCash: 50,
        steps: [
          {
            id: 'chest-1',
            label: 'Crack the code',
            prompt: 'A locked farm chest usually opens after you…',
            options: [
              'Find/solve the key or code challenge',
              'Water it like a plant',
              'Feed it grain',
              'Paint it blue',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  bull: {
    itemId: 'bull',
    label: 'Bull',
    category: 'animal',
    stages: [
      {
        id: 'care_bull',
        title: 'Take Care of the Bull',
        description: 'Feed, water, clean area, and keep the bull safe.',
        minLevelsOwned: 1,
        rewardRp: 35,
        steps: [
          {
            id: 'bull-1',
            label: 'Feed & water',
            prompt: 'Healthy bull care includes…',
            options: [
              'Regular feed, clean water, and a clean safe pen',
              'Never giving water',
              'Leaving gates open near danger',
              'Only decorating the pen',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  calf: {
    itemId: 'calf',
    label: 'Calf',
    category: 'animal',
    stages: [
      {
        id: 'feed_calves',
        title: 'Feed the Calves',
        description:
          'Walk to the fenced calf pasture (separate from the house and hen house). Click the pen, answer science questions, and fill the water and food buckets on the farm.',
        minLevelsOwned: 1,
        mode: 'calf_feed',
        rewardRp: 35,
        rewardCash: 12,
        steps: [
          {
            id: 'calf-feed-step',
            label: 'Fill water & food buckets at the pen',
            prompt: 'Feed and water the calves',
            options: ['Feed', 'Ignore', 'Scare', 'Sell'],
            correctIndex: 0,
          },
        ],
      },
      {
        id: 'calf_adult',
        title: 'Calf Grows Up',
        description: 'After enough care, the calf matures into an adult cow.',
        minLevelsOwned: 2,
        rewardRp: 50,
        steps: [
          {
            id: 'calf-2',
            label: 'Growth check',
            prompt: 'Long-term calf care can lead to…',
            options: [
              'A healthy adult cow and stronger farm value',
              'Turning into a windmill',
              'Becoming a cart',
              'Stopping all plant growth',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  sheep: {
    itemId: 'sheep',
    label: 'Sheep',
    category: 'animal',
    stages: [
      {
        id: 'sheep_care',
        title: 'Sheep Care',
        description: 'Feed, water, clean, then collect wool to sell.',
        minLevelsOwned: 1,
        rewardRp: 32,
        rewardCash: 15,
        steps: [
          {
            id: 'sheep-1',
            label: 'Feed & water',
            prompt: 'Sheep produce wool best when they are…',
            options: [
              'Well fed, watered, and kept in a clean area',
              'Never cleaned',
              'Kept without food',
              'Locked away from all water',
            ],
            correctIndex: 0,
          },
          {
            id: 'sheep-2',
            label: 'Collect wool',
            prompt: 'After collecting wool from sheep, farmers often…',
            options: [
              'Load and sell it for farm income',
              'Throw it in the well',
              'Burn the pasture',
              'Feed it to the windmill',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  lamb: {
    itemId: 'lamb',
    label: 'Lamb',
    category: 'animal',
    stages: [
      {
        id: 'lamb_care',
        title: 'Look After the Lamb',
        description: 'More frequent care: feed, water, protect, guide to flock.',
        minLevelsOwned: 1,
        rewardRp: 28,
        steps: [
          {
            id: 'lamb-1',
            label: 'Protect the lamb',
            prompt: 'Young lambs need extra…',
            options: [
              'Careful feeding, water, and protection from danger',
              'No attention',
              'Only cart rides',
              'Only treasure hunts',
            ],
            correctIndex: 0,
          },
        ],
      },
      {
        id: 'lamb_to_sheep',
        title: 'Lamb → Sheep',
        description: 'With enough care the lamb grows into a sheep.',
        minLevelsOwned: 2,
        rewardRp: 45,
        steps: [
          {
            id: 'lamb-2',
            label: 'Growth',
            prompt: 'Successful lamb care over time leads to…',
            options: [
              'A grown sheep that can produce wool',
              'A metal barrel',
              'A heater',
              'A quiz book',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  chick: {
    itemId: 'chick',
    label: 'Chick',
    category: 'animal',
    stages: [
      {
        id: 'raise_chick',
        title: 'Raise the Chick',
        description: 'Feed, water, protect, and maintain a nesting area.',
        minLevelsOwned: 1,
        rewardRp: 22,
        steps: [
          {
            id: 'chick-1',
            label: 'Feed & protect',
            prompt: 'Chicks need…',
            options: [
              'Food, water, warmth/protection, and a safe nest area',
              'Only darkness',
              'Only wind',
              'No care at all',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  rooster: {
    itemId: 'rooster',
    label: 'Rooster',
    category: 'animal',
    stages: [
      {
        id: 'protect_farm',
        title: 'Protect the Farm',
        description: 'Rooster alerts you when danger approaches — respond fast.',
        minLevelsOwned: 1,
        rewardRp: 30,
        steps: [
          {
            id: 'rooster-1',
            label: 'Respond to alert',
            prompt: 'If a rooster warns about danger, you should…',
            options: [
              'Check the farm quickly and protect animals/crops',
              'Ignore every alert',
              'Sell the rooster immediately',
              'Turn off the sun',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  piglet: {
    itemId: 'piglet',
    label: 'Piglet',
    category: 'animal',
    stages: [
      {
        id: 'raise_piglet',
        title: 'Raise & Feed',
        description: 'Feed, water, clean, and protect the piglet.',
        minLevelsOwned: 1,
        rewardRp: 24,
        steps: [
          {
            id: 'pig-1',
            label: 'Daily care',
            prompt: 'Piglet care is similar to other young animals because they need…',
            options: [
              'Feed, water, cleanliness, and protection',
              'Only decoration',
              'No water ever',
              'To live inside the treasure chest',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  turkey: {
    itemId: 'turkey',
    label: 'Turkey',
    category: 'animal',
    stages: [
      {
        id: 'turkey_care',
        title: 'Turkey Care',
        description: 'Feed, water, and keep the turkey’s area clean.',
        minLevelsOwned: 1,
        rewardRp: 22,
        steps: [
          {
            id: 'turkey-1',
            label: 'Care routine',
            prompt: 'Farm turkeys stay healthier when you…',
            options: [
              'Provide feed, water, and a clean space',
              'Never clean their area',
              'Keep them without food',
              'Hide them under the cart',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  tree_medium: {
    itemId: 'tree_medium',
    label: 'Medium Tree',
    category: 'decor',
    stages: [
      {
        id: 'grow_maintain',
        title: 'Grow & Maintain',
        description: 'Water and protect the tree as it grows.',
        minLevelsOwned: 1,
        rewardRp: 20,
        steps: [
          {
            id: 'mtree-1',
            label: 'Water & protect',
            prompt: 'Young trees grow better when you…',
            options: [
              'Water them and protect them from damage',
              'Never water them',
              'Cut them immediately',
              'Cover them with a barrel lid forever',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  tree_large: {
    itemId: 'tree_large',
    label: 'Large Tree',
    category: 'decor',
    stages: [
      {
        id: 'harvest_protect',
        title: 'Harvest & Protect',
        description: 'Collect fruit/branches and maintain the mature tree.',
        minLevelsOwned: 1,
        rewardRp: 28,
        rewardCash: 10,
        steps: [
          {
            id: 'ltree-1',
            label: 'Collect resources',
            prompt: 'A mature farm tree can provide…',
            options: [
              'Fruit, shade, branches, and farm value',
              'Only metal coins from leaves',
              'Only wind electricity',
              'Nothing useful',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },

  bushes_large: {
    itemId: 'bushes_large',
    label: 'Large Bushes',
    category: 'decor',
    stages: [
      {
        id: 'clear_maintain',
        title: 'Clear & Maintain',
        description: 'Identify bushes to clear or keep for the farm edge.',
        minLevelsOwned: 1,
        rewardRp: 15,
        steps: [
          {
            id: 'bush-1',
            label: 'Manage bushes',
            prompt: 'Farmers manage bushes to…',
            options: [
              'Clear unwanted growth or keep useful edge plants',
              'Remove all soil',
              'Stop rain forever',
              'Delete the map',
            ],
            correctIndex: 0,
          },
        ],
      },
    ],
  },
};

/**
 * How many playable levels the item has been owned for at `currentLevelId`
 * (purchase after completing level P → first available on level P+1 ⇒ ownedLevels=1).
 */
export function levelsOwnedAt(purchasedAtLevel, currentLevelId) {
  const p = Number(purchasedAtLevel) || 0;
  const c = Number(currentLevelId) || 1;
  if (p < 1) return Math.max(0, c);
  return Math.max(0, c - p);
}

/**
 * Stages available for an owned item on the current farm level.
 */
export function getAvailableStagesForItem(itemId, purchasedAtLevel, currentLevelId) {
  const def = UNLOCK_CHALLENGES[itemId];
  if (!def) return [];
  const ownedLevels = levelsOwnedAt(purchasedAtLevel, currentLevelId);
  return def.stages.filter((s) => ownedLevels >= s.minLevelsOwned);
}

export function getChallengeDef(itemId) {
  return UNLOCK_CHALLENGES[itemId] ?? null;
}

export function getStage(itemId, stageId) {
  return getChallengeDef(itemId)?.stages.find((s) => s.id === stageId) ?? null;
}
