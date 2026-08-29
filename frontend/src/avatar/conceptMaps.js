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

  'Plant Diversity': {
    root: 'Plant Diversity',
    summary:
      'Monocots and dicots are two plant groups with different seeds, leaves, and roots.',
    nodes: [
      {
        id: 'monocot',
        label: 'Monocot',
        role: 'One seed leaf',
        explanation:
          'Monocots (like grasses, rice, maize) have one cotyledon and usually fibrous roots — many thin threads.',
        relatedWrongHints: ['taproot', 'two seed leaves', 'net veins'],
      },
      {
        id: 'dicot',
        label: 'Dicot',
        role: 'Two seed leaves',
        explanation:
          'Dicots (like beans, tomato, mango) have two cotyledons and usually a taproot — one thick main root.',
        relatedWrongHints: ['fibrous roots', 'one seed leaf', 'parallel veins'],
      },
      {
        id: 'fibrous',
        label: 'Fibrous roots',
        role: 'Monocot root system',
        explanation:
          'Fibrous roots are a bunch of similar thin roots. They are typical of monocots.',
      },
      {
        id: 'taproot',
        label: 'Taproot',
        role: 'Dicot root system',
        explanation:
          'A taproot has one main root with smaller side roots. They are typical of dicots.',
      },
    ],
    links: [
      ['monocot', 'fibrous'],
      ['dicot', 'taproot'],
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

  'Static Electricity': {
    root: 'Static electricity and stored charge',
    summary: 'How charge is stored and how circuit parts control current.',
    nodes: [
      {
        id: 'capacitor',
        label: 'Capacitor',
        role: 'Stores electric charge',
        explanation:
          'A capacitor stores static electric charges on conducting plates and can release them later.',
        relatedWrongHints: ['resistor', 'switch', 'bulb'],
      },
      {
        id: 'resistor',
        label: 'Resistor',
        role: 'Opposes current',
        explanation:
          'A resistor opposes or reduces electric current in a circuit. It does not store static charge.',
        relatedWrongHints: ['capacitor'],
      },
      {
        id: 'charge',
        label: 'Electric charge',
        role: 'What is stored',
        explanation:
          'Static electric charge can be stored in a capacitor and later released.',
      },
    ],
    links: [
      ['charge', 'capacitor'],
      ['resistor', 'charge'],
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

const GENERIC_TOPIC_LABELS = new Set([
  'science',
  'general science',
  'farm science',
  'this science idea',
  'this farm science idea',
  'science idea',
  'idea',
  'chapter',
  'topic',
]);

function isGenericTopicLabel(value) {
  const lower = String(value || '')
    .trim()
    .toLowerCase();
  return !lower || GENERIC_TOPIC_LABELS.has(lower);
}

/**
 * Infer the catalog topic from a farm-question stem, chapter title, or skill.
 * Order matters: specific lesson ideas beat generic words like "root" or "science".
 */
export function inferConceptFromText(text) {
  const lower = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!lower || isGenericTopicLabel(lower)) return null;
  if (/monocot|dicot|cotyledon|taproot|fibrous root/.test(lower)) {
    return 'Plant Diversity';
  }
  if (/physical change|chemical change/.test(lower)) {
    return 'Physical & Chemical Changes';
  }
  if (/food chain|ecosystem|habitat/.test(lower)) return 'Ecology';
  if (/capacitor|resistor|static electric|static charge/.test(lower)) {
    return 'Static Electricity';
  }
  if (/digest|stomach|intestin/.test(lower)) return 'Digestive System';
  if (/main parts of a plant|parts of a plant include/.test(lower)) {
    return 'Plant Biology';
  }
  if (/photo|chloroph|carbon dioxide|glucose/.test(lower)) return 'Photosynthesis';
  if (/pollen|bee|pollinat/.test(lower)) return 'Pollination';
  if (/\bsoil\b|fertiliz/.test(lower)) return 'Soil Science';
  if (/water cycle|evapor|precip/.test(lower)) return 'Water Cycle';
  if (/\bstem\b/.test(lower) && /support|transport|leaf|flower/.test(lower)) {
    return 'Plant Biology';
  }
  if (/flower|anther|pistil/.test(lower)) return 'Plant Biology';
  if (/\broot\b|\bstem\b|\bleaf\b|plant part/.test(lower)) return 'Plant Biology';
  if (/nutri|food energy/.test(lower)) return 'Nutrition';
  if (/\bplant/.test(lower)) return 'Plant Biology';
  return null;
}

/** Short kid-facing name for Sage prompts (not a generic catalog bucket). */
export function kidConceptLabel(evidence = {}) {
  const stem = String(
    evidence.farm_question ||
      evidence.questionText ||
      evidence.prompt ||
      evidence.current_question ||
      '',
  )
    .replace(/\s+/g, ' ')
    .trim();
  const fromStem = kidPhraseFromStem(stem);
  if (fromStem) return fromStem;

  const chapterBits = [
    evidence.skill,
    evidence.sub_concept,
    evidence.chapter_name,
    evidence.chapter,
  ]
    .map((value) =>
      String(value || '')
        .replace(/^Ch\.?\s*\d+:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((value) => value && value.length < 72 && !isGenericTopicLabel(value));
  if (chapterBits[0]) return chapterBits[0];

  const topic =
    inferConceptFromText(stem) ||
    resolveTopicKey(evidence.concept || evidence.concept_topic || evidence.topic);
  if (topic && !isGenericTopicLabel(topic)) return topic;
  return 'this science idea';
}

export function mixUpLabel(evidence = {}) {
  const stem = String(
    evidence.farm_question || evidence.questionText || evidence.prompt || '',
  ).toLowerCase();
  if (/monocot|dicot|cotyledon/.test(stem) && /root/.test(stem)) {
    return 'I mix taproots up with fibrous roots';
  }
  if (/monocot|dicot|cotyledon/.test(stem)) {
    return 'I mix monocots up with dicots';
  }
  if (/photosynth|chloroph/.test(stem)) {
    return 'I mix photosynthesis up with respiration';
  }
  if (/\bsoil\b/.test(stem)) {
    return 'I mix soil types or layers up with each other';
  }
  const concept = kidConceptLabel(evidence);
  return `I mix ${concept} up with a similar idea`;
}

function kidPhraseFromStem(stem) {
  const s = String(stem || '').toLowerCase();
  if (!s) return null;
  if (/monocot|dicot|cotyledon/.test(s) && /root/.test(s)) {
    return 'monocot and dicot root systems';
  }
  if (/monocot|dicot|cotyledon/.test(s) && /leaf|venation/.test(s)) {
    return 'monocot and dicot leaves';
  }
  if (/monocot|dicot|cotyledon/.test(s)) return 'monocot and dicot plants';
  if (/taproot|fibrous root/.test(s)) return 'taproots and fibrous roots';
  if (/photosynth/.test(s)) return 'how plants make food with light';
  if (/pollinat/.test(s)) return 'how pollen moves between flowers';
  if (/\bsoil\b/.test(s) && /erosion/.test(s)) return 'soil erosion';
  return null;
}

/** Normalize free-form topic labels to catalog keys. */
export function resolveTopicKey(topic) {
  if (!topic) return null;
  const t = String(topic).trim();
  if (!t || isGenericTopicLabel(t)) return inferConceptFromText(t);
  if (CONCEPT_CATALOG[t]) return t;
  const lower = t.toLowerCase();
  for (const key of Object.keys(CONCEPT_CATALOG)) {
    if (key.toLowerCase() === lower) return key;
  }
  // Prefer the longest catalog name contained in the label.
  // Never the reverse ("Science" must not match "Soil Science").
  let best = null;
  for (const key of Object.keys(CONCEPT_CATALOG)) {
    const k = key.toLowerCase();
    if (k.length < 5) continue;
    if (lower.includes(k) && (!best || k.length > best.length)) best = key;
  }
  if (best) return best;
  return inferConceptFromText(t) || t;
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
