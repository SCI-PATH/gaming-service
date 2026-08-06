/**
 * Lesson concept catalog for Grade 6–9 mind maps.
 * Topics align with farm quiz `topic` fields + common science units.
 */
export const CONCEPT_CATALOG = {
  'Plant Biology': {
    root: 'Plant Biology',
    summary: 'How plant parts work together so crops grow and reproduce.',
    nodes: [
      {
        id: 'flower',
        label: 'Flower',
        role: 'Reproduction structure',
        explanation:
          'Flowers help many plants reproduce; male and female parts work as a team.',
      },
      {
        id: 'anther',
        label: 'Anther (stamen)',
        role: 'Makes pollen',
        explanation:
          'The anther is the male part that produces pollen grains.',
        relatedWrongHints: ['petal', 'root', 'leaf'],
      },
      {
        id: 'pistil',
        label: 'Pistil',
        role: 'Receives pollen',
        explanation:
          'The pistil is the female part that may develop into seeds/fruit after pollination.',
      },
      {
        id: 'leaf',
        label: 'Leaf',
        role: 'Food factory',
        explanation: 'Leaves capture sunlight energy for making plant food.',
      },
      {
        id: 'root',
        label: 'Root',
        role: 'Water + minerals',
        explanation:
          'Roots usually grow underground and take in water and minerals from soil.',
      },
    ],
    links: [
      ['flower', 'anther'],
      ['flower', 'pistil'],
      ['leaf', 'flower'],
      ['root', 'leaf'],
    ],
  },

  Photosynthesis: {
    root: 'Photosynthesis',
    summary: 'How plants make food from light, water, and carbon dioxide.',
    nodes: [
      {
        id: 'sun',
        label: 'Sunlight energy',
        role: 'Energy source',
        explanation: 'Light energy powers the reaction in chloroplasts.',
      },
      {
        id: 'co2',
        label: 'Carbon dioxide',
        role: 'Gas taken in',
        explanation:
          'Plants take in CO₂ (often from air through leaf stomata) during photosynthesis.',
        relatedWrongHints: ['oxygen in', 'nitrogen', 'helium'],
      },
      {
        id: 'water',
        label: 'Water',
        role: 'Raw material',
        explanation: 'Roots supply water that is used when plants make sugar.',
      },
      {
        id: 'sugar',
        label: 'Glucose (food)',
        role: 'Energy store',
        explanation: 'The plant builds sugar it can use or store.',
      },
      {
        id: 'o2',
        label: 'Oxygen released',
        role: 'By-product',
        explanation: 'Oxygen is released as a useful by-product of photosynthesis.',
      },
    ],
    links: [
      ['sun', 'sugar'],
      ['co2', 'sugar'],
      ['water', 'sugar'],
      ['sugar', 'o2'],
    ],
  },

  Pollination: {
    root: 'Pollination',
    summary: 'Moving pollen so seeds (and fruits) can form.',
    nodes: [
      {
        id: 'pollen',
        label: 'Pollen',
        role: 'Male gamete carrier',
        explanation: 'Pollen carries the plant’s male genetic material.',
      },
      {
        id: 'vector',
        label: 'Bee / wind / animal',
        role: 'Pollen mover',
        explanation:
          'Pollinators and wind move pollen from anther toward a pistil.',
      },
      {
        id: 'transfer',
        label: 'Pollen transfer',
        role: 'Key process',
        explanation:
          'Pollination is the transfer of pollen—not evaporation or erosion.',
      },
      {
        id: 'seed',
        label: 'Seed / fruit path',
        role: 'Outcome',
        explanation:
          'After successful pollination and fertilization, seeds (and often fruits) form.',
      },
    ],
    links: [
      ['pollen', 'vector'],
      ['vector', 'transfer'],
      ['transfer', 'seed'],
    ],
  },

  Transport: {
    root: 'Plant Transport',
    summary: 'Moving water and nutrients through the plant body.',
    nodes: [
      {
        id: 'xylem',
        label: 'Xylem (idea)',
        role: 'Water highway',
        explanation:
          'Vascular tissue moves water and minerals upward from roots.',
      },
      {
        id: 'phloem',
        label: 'Phloem (idea)',
        role: 'Food highway',
        explanation: 'Sugars made in leaves can move to growing parts.',
      },
      {
        id: 'water-use',
        label: 'Why water matters',
        role: 'Functions',
        explanation:
          'Water supports photosynthesis and helps move nutrients around the plant.',
      },
    ],
    links: [
      ['water-use', 'xylem'],
      ['xylem', 'phloem'],
    ],
  },

  Storage: {
    root: 'Harvest Storage',
    summary: 'Why crops are collected, protected, and moved safely.',
    nodes: [
      {
        id: 'harvest',
        label: 'Harvest',
        role: 'Collect crop',
        explanation: 'Mature crops are gathered before they spoil in the field.',
      },
      {
        id: 'store',
        label: 'Store / barn / cart',
        role: 'Protect & move',
        explanation:
          'Loading harvests keeps produce safe and ready to sell or use later.',
      },
      {
        id: 'sell',
        label: 'Use or sell',
        role: 'Farm goal',
        explanation: 'Stored crops can feed people or earn farm cash.',
      },
    ],
    links: [
      ['harvest', 'store'],
      ['store', 'sell'],
    ],
  },

  'Plant Parts': {
    root: 'Plant Parts',
    summary: 'Main organs of a plant and what each is for.',
    nodes: [
      {
        id: 'root2',
        label: 'Root',
        role: 'Anchor + absorb',
        explanation:
          'Roots typically grow underground and take in water and minerals.',
      },
      {
        id: 'stem',
        label: 'Stem',
        role: 'Support + transport',
        explanation: 'Stems hold leaves and flowers and help move materials.',
      },
      {
        id: 'leaf2',
        label: 'Leaf',
        role: 'Photosynthesis hub',
        explanation: 'Most photosynthesis happens in leaves.',
      },
      {
        id: 'flower2',
        label: 'Flower / fruit',
        role: 'Reproduction',
        explanation: 'Flowers and fruits support the next generation of plants.',
      },
    ],
    links: [
      ['root2', 'stem'],
      ['stem', 'leaf2'],
      ['stem', 'flower2'],
    ],
  },

  Nutrition: {
    root: 'Nutrition & Energy',
    summary: 'How living things get and use energy from food.',
    nodes: [
      {
        id: 'food',
        label: 'Food / nutrients',
        role: 'Energy + building blocks',
        explanation: 'Nutrients fuel growth, repair, and daily activity.',
      },
      {
        id: 'energy',
        label: 'Energy release',
        role: 'Cellular use',
        explanation:
          'Organisms break down food molecules to release usable energy.',
      },
      {
        id: 'balance',
        label: 'Balanced intake',
        role: 'Health idea',
        explanation:
          'Different nutrients support different jobs in a healthy body or herd.',
      },
    ],
    links: [
      ['food', 'energy'],
      ['food', 'balance'],
    ],
  },

  'Soil Science': {
    root: 'Soil Science',
    summary: 'Soil as a living system that supports farm crops.',
    nodes: [
      {
        id: 'minerals',
        label: 'Minerals',
        role: 'Plant food source',
        explanation: 'Soil minerals supply critical nutrients for plant growth.',
      },
      {
        id: 'organisms',
        label: 'Soil life',
        role: 'Decomposers',
        explanation:
          'Worms and microbes recycle material and improve soil quality.',
      },
      {
        id: 'water-soil',
        label: 'Soil water & air',
        role: 'Root needs',
        explanation:
          'Healthy soil holds water and air so roots can breathe and drink.',
      },
    ],
    links: [
      ['minerals', 'water-soil'],
      ['organisms', 'minerals'],
    ],
  },

  'Water Cycle': {
    root: 'Water Cycle',
    summary: 'How water moves between land, air, plants, and ocean.',
    nodes: [
      {
        id: 'evap',
        label: 'Evaporation',
        role: 'Liquid → vapor',
        explanation: 'Heat turns liquid water into vapor that rises.',
      },
      {
        id: 'cond',
        label: 'Condensation',
        role: 'Cloud forming',
        explanation: 'Cooling vapor forms tiny droplets (clouds/fog).',
      },
      {
        id: 'precip',
        label: 'Precipitation',
        role: 'Rain / snow',
        explanation: 'Water returns to land as rain, snow, or other forms.',
      },
      {
        id: 'runoff',
        label: 'Runoff / groundwater',
        role: 'Return paths',
        explanation: 'Water flows back to rivers, soil, and aquifers.',
      },
    ],
    links: [
      ['evap', 'cond'],
      ['cond', 'precip'],
      ['precip', 'runoff'],
      ['runoff', 'evap'],
    ],
  },

  'Digestive System': {
    root: 'Human Digestive System',
    summary:
      'Organs that break food into usable nutrients (common misconception set).',
    nodes: [
      {
        id: 'mouth',
        label: 'Mouth',
        role: 'Start of digestion',
        explanation: 'Teeth and saliva start mechanical and chemical digestion.',
      },
      {
        id: 'esophagus',
        label: 'Esophagus',
        role: 'Food tube',
        explanation: 'Moves food to the stomach with muscle waves.',
      },
      {
        id: 'stomach',
        label: 'Stomach',
        role: 'Churn + acid',
        explanation: 'Acid and enzymes continue breaking food into chyme.',
      },
      {
        id: 'small',
        label: 'Small intestine',
        role: 'Main absorption',
        explanation:
          'Most nutrient absorption into blood happens here with help from pancreas/liver.',
      },
      {
        id: 'large',
        label: 'Large intestine',
        role: 'Water recovery',
        explanation: 'Absorbs water and forms solid waste.',
      },
    ],
    links: [
      ['mouth', 'esophagus'],
      ['esophagus', 'stomach'],
      ['stomach', 'small'],
      ['small', 'large'],
    ],
  },

  Ecology: {
    root: 'Ecology links',
    summary: 'How living things connect through energy and habitats.',
    nodes: [
      {
        id: 'producer',
        label: 'Producers',
        role: 'Make food',
        explanation: 'Plants and algae capture energy and make food.',
      },
      {
        id: 'consumer',
        label: 'Consumers',
        role: 'Eat others',
        explanation: 'Animals gain energy by eating plants or other animals.',
      },
      {
        id: 'decomp',
        label: 'Decomposers',
        role: 'Recycle',
        explanation: 'Fungi/bacteria return nutrients to the environment.',
      },
    ],
    links: [
      ['producer', 'consumer'],
      ['consumer', 'decomp'],
      ['decomp', 'producer'],
    ],
  },

  'Forces & Motion': {
    root: 'Forces & Motion',
    summary: 'How pushes, pulls, and energy change the motion of objects.',
    nodes: [
      {
        id: 'force',
        label: 'Force',
        role: 'Push or pull',
        explanation: 'A force can speed up, slow down, or change direction of motion.',
      },
      {
        id: 'friction',
        label: 'Friction',
        role: 'Opposing force',
        explanation: 'Friction resists sliding between surfaces.',
      },
      {
        id: 'energy-m',
        label: 'Energy transfer',
        role: 'Work done',
        explanation: 'When forces move objects, energy is transferred.',
      },
    ],
    links: [
      ['force', 'friction'],
      ['force', 'energy-m'],
    ],
  },
};

/** Normalize free-form topic labels to catalog keys. */
export function resolveTopicKey(topic) {
  if (!topic) return null;
  const t = String(topic).trim();
  if (CONCEPT_CATALOG[t]) return t;
  const lower = t.toLowerCase();
  for (const key of Object.keys(CONCEPT_CATALOG)) {
    if (key.toLowerCase() === lower) return key;
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return key;
    }
  }
  if (/digest|stomach|intestin/.test(lower)) return 'Digestive System';
  if (/photo|chloroph|carbon dioxide/.test(lower)) return 'Photosynthesis';
  if (/pollen|bee|pollinat/.test(lower)) return 'Pollination';
  if (/soil/.test(lower)) return 'Soil Science';
  if (/water cycle|evapor|precip/.test(lower)) return 'Water Cycle';
  if (/nutri|food energy/.test(lower)) return 'Nutrition';
  if (/root|stem|leaf|plant part/.test(lower)) return 'Plant Parts';
  if (/plant|flower|anther/.test(lower)) return 'Plant Biology';
  return t;
}

/**
 * Build a generic mini-map when topic is unknown.
 */
export function genericConceptMap(topic, prompt) {
  return {
    root: topic || 'Science idea',
    summary: 'Key ideas linked to the question the student missed.',
    nodes: [
      {
        id: 'idea',
        label: topic || 'Core idea',
        role: 'Focus concept',
        explanation:
          'Re-read the question and name what science process or structure it is really about.',
      },
      {
        id: 'clue',
        label: 'Question clue',
        role: 'Evidence',
        explanation: prompt
          ? `Clue from the farm challenge: “${String(prompt).slice(0, 120)}…”`
          : 'Look for key science words in the prompt.',
      },
      {
        id: 'check',
        label: 'Self-check',
        role: 'Next step',
        explanation:
          'Eliminate one option you know is wrong, then explain why in a farm example.',
      },
    ],
    links: [
      ['idea', 'clue'],
      ['clue', 'check'],
    ],
  };
}
