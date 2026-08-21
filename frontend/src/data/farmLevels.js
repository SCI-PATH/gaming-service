/**
 * Grade 6–9 farming levels:
 * plant quiz → grow → harvest (carry on back) → load quiz at dock → sell.
 */
export const FARM_LEVELS = [
  {
    id: 1,
    cropId: 'flowers',
    cropName: 'Flowers',
    cropValue: 10,
    targetEarnings: null,
    timeTargetMs: 12000,
    growMs: 2000,
    plantPatchCols: 4,
    plantPatchRows: 3,
    goalText:
      'Plant quiz on beds · harvest onto your back · load quiz at the dock',
    tint: 0xff66aa,
    questions: [
      {
        id: 'l1-q1',
        grade: '6–7',
        topic: 'Plant Biology',
        rp: 25,
        prompt:
          'Flowers help plants reproduce. Which part of the flower produces pollen?',
        options: ['Petal', 'Anther (stamen)', 'Root hair', 'Leaf vein'],
        correctIndex: 1,
        hint: 'Pollen is made by the male part of the flower.',
      },
      {
        id: 'l1-q2',
        grade: '6–7',
        topic: 'Photosynthesis',
        rp: 25,
        prompt:
          'Plants make food using sunlight. What gas do they take in during photosynthesis?',
        options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'],
        correctIndex: 2,
        hint: 'Humans breathe this gas out; plants take it in.',
      },
      {
        id: 'l1-q3',
        grade: '7–8',
        topic: 'Pollination',
        rp: 30,
        prompt:
          'Bees moving pollen from one flower to another is an example of…',
        options: ['Evaporation', 'Pollination', 'Erosion', 'Condensation'],
        correctIndex: 1,
        hint: 'This process helps plants make seeds.',
      },
    ],
    loadQuestions: [
      {
        id: 'l1-load-1',
        grade: '6–7',
        topic: 'Transport',
        rp: 20,
        prompt:
          'You carry harvested flowers to the cart. What do plants mainly need water for?',
        options: [
          'Photosynthesis and moving nutrients',
          'Making metal',
          'Stopping growth',
          'Turning into rocks',
        ],
        correctIndex: 0,
        hint: 'Water helps make food and move minerals through the plant.',
      },
      {
        id: 'l1-load-2',
        grade: '6–7',
        topic: 'Storage',
        rp: 20,
        prompt: 'Why do farmers load harvested crops into a cart or barn?',
        options: [
          'To store and move the harvest safely',
          'To make the soil disappear',
          'To stop photosynthesis forever',
          'To create thunder',
        ],
        correctIndex: 0,
        hint: 'Harvests are moved and stored so they can be sold or used later.',
      },
      {
        id: 'l1-load-3',
        grade: '7–8',
        topic: 'Plant Parts',
        rp: 25,
        prompt: 'Which plant part usually grows underground and takes in water?',
        options: ['Flower petal', 'Root', 'Anther', 'Leaf tip only'],
        correctIndex: 1,
        hint: 'Roots pull water and minerals from the soil.',
      },
    ],
  },
  {
    id: 2,
    cropId: 'corn',
    cropName: 'Corn',
    cropValue: 12,
    targetEarnings: null,
    timeTargetMs: 12000,
    growMs: 2000,
    plantPatchCols: 4,
    plantPatchRows: 3,
    goalText:
      'Plant quiz on beds · harvest onto your back · load quiz at the dock',
    tint: 0xffcc33,
    questions: [
      {
        id: 'l2-q1',
        grade: '7–8',
        topic: 'Nutrition',
        rp: 25,
        prompt: 'Corn stores energy mainly as which nutrient?',
        options: ['Protein only', 'Carbohydrates (starch)', 'Vitamins only', 'Salt'],
        correctIndex: 1,
        hint: 'Starchy foods are rich in this energy nutrient.',
      },
      {
        id: 'l2-q2',
        grade: '8–9',
        topic: 'Soil Science',
        rp: 30,
        prompt:
          'Healthy corn growth needs soil nutrients. Nitrogen in fertilizer mainly helps plants…',
        options: [
          'Make more chlorophyll / leafy growth',
          'Become magnetic',
          'Stop photosynthesis',
          'Turn into animals',
        ],
        correctIndex: 0,
        hint: 'Think about why leaves look greener with fertilizer.',
      },
      {
        id: 'l2-q3',
        grade: '8–9',
        topic: 'Water Cycle',
        rp: 30,
        prompt: 'Water moving from plant leaves into the air is called…',
        options: ['Transpiration', 'Precipitation', 'Freezing', 'Combustion'],
        correctIndex: 0,
        hint: 'It is similar to sweating, but for plants.',
      },
    ],
    loadQuestions: [
      {
        id: 'l2-load-1',
        grade: '7–8',
        topic: 'Harvest Transport',
        rp: 22,
        prompt: 'Before corn can be sold, farmers usually…',
        options: [
          'Harvest it and load it for transport/storage',
          'Burn the field first',
          'Freeze the soil solid',
          'Remove all sunlight',
        ],
        correctIndex: 0,
        hint: 'Harvest first, then move the crop to storage or market.',
      },
      {
        id: 'l2-load-2',
        grade: '8–9',
        topic: 'Food Energy',
        rp: 25,
        prompt: 'The starch stored in corn kernels is mainly used by people as…',
        options: [
          'A source of energy (food)',
          'A type of metal',
          'A gas for breathing only',
          'A magnet',
        ],
        correctIndex: 0,
        hint: 'Carbohydrates give energy when we eat them.',
      },
      {
        id: 'l2-load-3',
        grade: '8–9',
        topic: 'Plant Structure',
        rp: 25,
        prompt: 'Which part of a corn plant captures most sunlight for food-making?',
        options: ['Roots only', 'Leaves', 'Cart wheels', 'Soil stones'],
        correctIndex: 1,
        hint: 'Leaves hold chlorophyll for photosynthesis.',
      },
    ],
  },
];

export function getFarmLevel(levelId = 1) {
  const id = Math.max(1, Number(levelId) || 1);
  const found = FARM_LEVELS.find((l) => l.id === id);
  if (found) return { ...found };

  // Higher levels recycle crop content with a fresh level id
  const base = FARM_LEVELS[(id - 1) % FARM_LEVELS.length];
  return {
    ...base,
    id,
    goalText: `Level ${id}: plant · harvest · load · care for unlocked items`,
  };
}

/**
 * @param {object} level
 * @param {string} [avoidId]
 * @param {'plant'|'load'} [mode='plant']
 */
export function pickScienceQuestion(level, avoidId, mode = 'plant') {
  const loadLike = mode === 'load' || mode === 'unload' || mode === 'sell';
  const source =
    loadLike && level.loadQuestions?.length
      ? level.loadQuestions
      : level.questions;
  const pool = source.filter((q) => q.id !== avoidId);
  const list = pool.length ? pool : source;
  return list[Math.floor(Math.random() * list.length)];
}

/** @deprecated Use pickScienceQuestion */
export const pickHarvestQuestion = pickScienceQuestion;
