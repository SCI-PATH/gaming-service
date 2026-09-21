/**
 * Curriculum concept trees for Grade 6–9. Labels are keywords;
 * explanations live on the node, not in the box.
 */
import { compactText } from './assessmentMiss.js';

export const PLACEHOLDER_NODE = /^(function|job|claim|correct idea|science idea|key idea|this idea|idea|example|topic|plant biology|science|name|is the difference|the difference|difference|different job)$/i;
export const WEAK_EDGE = /^(asks|does not|tests|means)$/i;

function lower(text) {
  return compactText(text).toLowerCase();
}

function has(text, re) {
  return re.test(lower(text));
}

export function phraseLabel(text, n = 72) {
  const s = compactText(text)
    .replace(/^(?:option\s*)?\(?[A-Da-d]\)?[.)]\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.…]{2,}$/g, '')
    .trim();
  if (!s) return '';
  const cap = Math.max(8, n);
  const words = s.split(' ').filter(Boolean).slice(0, 10);
  let out = '';
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > cap) break;
    out = next;
  }
  if (out) return out;
  const first = words[0] || s;
  return first.length <= cap ? first : first.slice(0, cap);
}

export function questionBlob(miss = {}) {
  return `${miss.question || ''} ${miss.prompt || ''} ${miss.correctAnswer || ''} ${miss.topic || ''}`;
}

/** Plant parts and their real jobs — used to contrast mix-ups. */
export const PLANT_PARTS = [
  {
    id: 'roots',
    keys: /\broots?\b/,
    label: 'Roots',
    process: 'Absorb',
    object: 'Water',
    extra: 'Soil',
    extraEdge: 'from',
    explanation: 'Roots take in water and minerals from the soil.',
    processExplain: 'Absorption is taking water in, not moving it.',
    mixHints: /stem|transport|leaf|flower/,
  },
  {
    id: 'stem',
    keys: /\bstems?\b/,
    label: 'Stem',
    process: 'Transport',
    object: 'Water',
    extra: 'Nutrients',
    extraEdge: 'and',
    explanation: 'The stem moves water and nutrients through the plant.',
    processExplain: 'Transport is moving materials that were already taken in.',
    mixHints: /root|absorb|leaf|photosynth/,
  },
  {
    id: 'leaves',
    keys: /\bleaves\b|\bleaf\b/,
    label: 'Leaves',
    process: 'Photosynthesis',
    object: 'Food',
    extra: 'Sunlight',
    extraEdge: 'needs',
    explanation: 'Leaves are the main food-making parts of the plant.',
    processExplain: 'Photosynthesis uses light, water, and carbon dioxide to make food.',
    mixHints: /stem|transport|root|flower/,
  },
  {
    id: 'flowers',
    keys: /\bflowers?\b|\banther\b|\bpistil\b|\bpollen\b/,
    label: 'Flowers',
    process: 'Reproduce',
    object: 'Pollen',
    extra: 'Seeds',
    extraEdge: 'lead to',
    explanation: 'Flowers are the reproductive parts of many plants.',
    processExplain: 'Flowers make pollen and can form seeds after pollination.',
    mixHints: /root|leaf|stem/,
  },
  {
    id: 'seeds',
    keys: /\bseeds?\b/,
    label: 'Seeds',
    process: 'New plants',
    object: 'Dispersal',
    extra: 'Food store',
    extraEdge: 'has',
    explanation: 'A seed can grow into a new plant when conditions are right.',
    processExplain: 'Seeds carry the next generation, not water from soil.',
    mixHints: /stem|leaf|root|transport/,
  },
  {
    id: 'fruits',
    keys: /\bfruits?\b/,
    label: 'Fruits',
    process: 'Protect',
    object: 'Seeds',
    extra: '',
    extraEdge: '',
    explanation: 'Fruits often protect seeds and help them spread.',
    processExplain: 'Fruits protect and help move seeds; they do not absorb soil water.',
    mixHints: /root|leaf/,
  },
];

export function findPlantPart(text) {
  const t = lower(text);
  return PLANT_PARTS.find((p) => p.keys.test(t)) || null;
}

export function isPlantPartFunctionQuestion(miss) {
  const q = `${miss.question || ''} ${miss.prompt || ''}`;
  return has(
    q,
    /which part|what part|function of|role of|job of|parts? of (a |the )?plant|absorbs? water|from the soil|grows? underground|produces pollen/,
  );
}

export function focusPlantPart(miss) {
  const q = `${miss.question || ''} ${miss.prompt || ''}`;
  const c = miss.correctAnswer || '';
  const fromCorrect = findPlantPart(c);
  if (fromCorrect) return fromCorrect;
  if (
    !isPlantPartFunctionQuestion(miss) &&
    !has(q, /\b(root|stem|leaf|leaves|anther|pistil)\b/)
  ) {
    return null;
  }
  const ordered = [
    { re: /\bseeds?\b/, id: 'seeds' },
    { re: /\bleaves\b|\bleaf\b/, id: 'leaves' },
    { re: /\banther\b|\bpistil\b|\bpollen\b/, id: 'flowers' },
    { re: /\bfruits?\b/, id: 'fruits' },
    { re: /\babsorb|from the soil|underground/, id: 'roots' },
    { re: /\broots?\b/, id: 'roots' },
    { re: /\bstems?\b/, id: 'stem' },
    { re: /\bflowers?\b/, id: 'flowers' },
  ];
  for (const row of ordered) {
    if (row.re.test(lower(q))) return PLANT_PARTS.find((p) => p.id === row.id);
  }
  return findPlantPart(q);
}

export function mixupPlantPart(miss, focus) {
  const s = miss.studentAnswer || '';
  if (!compactText(s)) return null;
  if (has(s, /transport|nutrient|carry water|move water/)) {
    return PLANT_PARTS.find((p) => p.id === 'stem');
  }
  if (has(s, /photosynth|make food|glucose/)) {
    return PLANT_PARTS.find((p) => p.id === 'leaves');
  }
  if (has(s, /absorb|soil water/)) {
    return PLANT_PARTS.find((p) => p.id === 'roots');
  }
  const hit = findPlantPart(s);
  if (hit && hit.id !== focus?.id) return hit;
  return null;
}

export function isPlantQuestion(miss) {
  return has(
    questionBlob(miss),
    /\bplant|\bleaf|\bleaves\b|\broot|\bstem|\bseed|\bflower|\bfruit|\bpollen|\banther|\bphotosynth/,
  );
}

export function photosynthesisInputsLesson(miss) {
  return has(
    questionBlob(miss),
    /photosynth|make food|make glucose/,
  ) && has(miss.correctAnswer, /carbon dioxide|co2|sunlight|water|chlorophyll/);
}

export function pollinationLesson(miss) {
  return has(questionBlob(miss), /pollinat|pollen from|bee/);
}

export function waterCycleLesson(miss) {
  return has(questionBlob(miss), /evaporat|condens|precipit|transpir|water cycle/);
}

export function floweringContrastLesson(miss) {
  const q = `${miss.question || ''} ${miss.prompt || ''}`;
  const blob = questionBlob(miss);
  if (has(q, /flowering/) && has(q, /non[- ]?flowering|without flowers|no flowers/)) {
    return true;
  }
  if (has(q, /difference/) && has(q, /flowering/)) return true;
  if (has(blob, /angiosperm/) && has(blob, /gymnosperm|cone|spore|moss|fern/)) {
    return true;
  }
  return false;
}

export function diversityLesson(miss) {
  return has(questionBlob(miss), /monocot|dicot|cotyledon|taproot|fibrous/);
}

export function chargeLesson(miss) {
  return has(questionBlob(miss), /capacitor|resistor|electric charge|electron|static/);
}
