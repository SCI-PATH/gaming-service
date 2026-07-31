/**
 * Grade 6–9 farming levels: science-gated plant → grow → harvest → sell → forest unlock.
 */
export const FARM_LEVELS = [
  {
    id: 1,
    cropId: 'flowers',
    cropName: 'Flowers',
    cropValue: 20,
    targetEarnings: 100,
    growMs: 2000,
    /** One correct quiz plants this many columns × rows of crops */
    plantPatchCols: 10,
    plantPatchRows: 3,
    goalText: 'Pass quizzes to plant flower patches — harvest & sell to reach $100',
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
  },
  {
    id: 2,
    cropId: 'corn',
    cropName: 'Corn',
    cropValue: 25,
    targetEarnings: 100,
    growMs: 2000,
    plantPatchCols: 10,
    plantPatchRows: 3,
    goalText: 'Pass quizzes to plant corn patches — harvest & sell to reach $100',
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
        prompt:
          'Water moving from plant leaves into the air is called…',
        options: ['Transpiration', 'Precipitation', 'Freezing', 'Combustion'],
        correctIndex: 0,
        hint: 'It is similar to sweating, but for plants.',
      },
    ],
  },
];

export function getFarmLevel(levelId = 1) {
  return FARM_LEVELS.find((l) => l.id === levelId) ?? FARM_LEVELS[0];
}

export function pickScienceQuestion(level, avoidId) {
  const pool = level.questions.filter((q) => q.id !== avoidId);
  const list = pool.length ? pool : level.questions;
  return list[Math.floor(Math.random() * list.length)];
}

/** @deprecated Use pickScienceQuestion — kept for older call sites. */
export const pickHarvestQuestion = pickScienceQuestion;
