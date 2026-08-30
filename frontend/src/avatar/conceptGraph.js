/**
 * Curriculum-grounded concept graphs for Sage mind maps.
 *
 * Assessment miss → diagnose misconception → keyword nodes and
 * labeled relationships. Mix-up nodes are never treated as true.
 */
import { looksLikeSymbolicTypedAnswer } from './explainMisconception.js';
import { compactText, answersEquivalent } from './assessmentMiss.js';
import {
  PLACEHOLDER_NODE,
  PLANT_PARTS,
  chargeLesson,
  floweringContrastLesson,
  diversityLesson,
  focusPlantPart,
  isPlantPartFunctionQuestion,
  isPlantQuestion,
  mixupPlantPart,
  phraseLabel,
  photosynthesisInputsLesson,
  pollinationLesson,
  questionBlob,
  waterCycleLesson,
} from './conceptLessons.js';
import { buildTextbookGraph } from './textbookGraph.js';

export const MISCONCEPTION_TYPES = Object.freeze({
  COMPLETE_MISS: 'complete_miss',
  RELATED: 'related_concept_confusion',
  PARTIAL: 'partial',
  INCOMPLETE: 'incomplete',
  VOCABULARY: 'vocabulary',
  REASONING: 'reasoning',
  TRUE_FALSE: 'statement_reasoning',
  NO_USABLE: 'no_usable_answer',
});

function lower(text) {
  return compactText(text).toLowerCase();
}

function has(text, re) {
  return re.test(lower(text));
}

function slug(text, fallback = 'node') {
  const s = compactText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
  return s || fallback;
}

function shortLabel(text, n = 28) {
  return phraseLabel(text, n);
}

function usableStudent(miss) {
  const s = compactText(miss.studentAnswer);
  if (!s) return false;
  if (looksLikeSymbolicTypedAnswer(s)) return false;
  if (/no pick|timed out|ran out of time|left blank/i.test(s)) return false;
  return true;
}

export function diagnoseMisconception(miss = {}) {
  const student = compactText(miss.studentAnswer);
  const correct = compactText(miss.correctAnswer);
  const question = compactText(miss.question || miss.prompt);
  const completeness = String(miss.completeness || '').toLowerCase();
  const missing = Array.isArray(miss.missingKeywords) ? miss.missingKeywords : [];
  const tf = /^(true|false|t|f|yes|no)$/i.test(student) && /^(true|false|t|f|yes|no)$/i.test(correct);
  const focus = focusPlantPart(miss);

  if (!usableStudent(miss)) {
    return {
      type: MISCONCEPTION_TYPES.NO_USABLE,
      summary: focus
        ? `Learn how ${focus.label.toLowerCase()} fit this question.`
        : 'Learn the concept this question is checking.',
      testedConcept: focus?.label || shortLabel(correct, 28) || 'This idea',
      missingConcept: shortLabel(correct, 28) || focus?.label,
    };
  }
  if (tf) {
    return {
      type: MISCONCEPTION_TYPES.TRUE_FALSE,
      summary: `The statement is ${correct}, not ${student}.`,
      testedConcept: shortLabel(question, 40) || 'This claim',
      missingConcept: correct,
    };
  }
  if (completeness === 'partial' || missing.length) {
    return {
      type: MISCONCEPTION_TYPES.PARTIAL,
      summary: 'Part of the idea is right; a key link is still missing.',
      testedConcept: focus?.process || shortLabel(correct, 28),
      missingConcept: missing[0] || shortLabel(correct, 28),
    };
  }
  if (
    student.length >= 8 &&
    correct.length >= 8 &&
    (lower(correct).includes(lower(student).slice(0, 12)) ||
      lower(student).includes(lower(correct).slice(0, 12)))
  ) {
    return {
      type: MISCONCEPTION_TYPES.INCOMPLETE,
      summary: 'The answer is on the right track but not complete.',
      testedConcept: focus?.label || shortLabel(correct, 28),
      missingConcept: shortLabel(correct, 28),
    };
  }

  const relatedPairs = [
    [/root/, /stem|leaf|flower/],
    [/stem/, /root|leaf|flower/],
    [/leaf/, /stem|transport|root/],
    [/carbon dioxide|co2/, /oxygen|helium|nitrogen/],
    [/oxygen/, /carbon dioxide|co2/],
    [/photosynth/, /respirat|transport/],
    [/pollinat/, /evaporat|erosi|condens/],
    [/anther|stamen/, /petal/],
    [/transpir/, /precipit|freez/],
    [/monocot/, /dicot/],
    [/capacitor/, /resistor/],
    [/seed/, /stem|leaf|root|flower/],
  ];
  const related = relatedPairs.some(
    ([a, b]) => (a.test(lower(correct)) && b.test(lower(student))) || (b.test(lower(correct)) && a.test(lower(student))),
  );
  const mixPart = mixupPlantPart(miss, focus);
  if (related || (focus && mixPart && mixPart.id !== focus.id)) {
    const mixName = mixPart?.label || shortLabel(student, 24);
    const rightName = focus?.label || shortLabel(correct, 24);
    return {
      type: MISCONCEPTION_TYPES.RELATED,
      summary: `${mixName} and ${rightName} are related, but they do different jobs.`,
      testedConcept: focus?.process || shortLabel(correct, 28),
      missingConcept: shortLabel(correct, 28),
    };
  }
  if (student.split(/\s+/).length <= 4 && correct.split(/\s+/).length <= 6) {
    return {
      type: MISCONCEPTION_TYPES.VOCABULARY,
      summary: `${shortLabel(student, 22)} is not the keyword this question is scoring.`,
      testedConcept: focus?.label || shortLabel(correct, 28),
      missingConcept: shortLabel(correct, 28),
    };
  }
  if (student.split(/\s+/).length > 8 || /because|so that|which means/.test(lower(student))) {
    return {
      type: MISCONCEPTION_TYPES.REASONING,
      summary: 'The reasoning misses the process that actually answers this question.',
      testedConcept: focus?.process || shortLabel(correct, 28),
      missingConcept: shortLabel(correct, 28),
    };
  }
  return {
    type: MISCONCEPTION_TYPES.COMPLETE_MISS,
    summary: `${shortLabel(student, 24)} is not the idea this question is checking.`,
    testedConcept: focus?.label || shortLabel(correct, 28),
    missingConcept: shortLabel(correct, 28),
  };
}

function node(id, label, extra = {}) {
  const lab = shortLabel(label, 28) || id;
  return {
    id,
    label: lab,
    explanation: extra.explanation || '',
    example: extra.example || '',
    importance: extra.importance || 'supporting',
    kind: extra.kind || 'related',
  };
}

function graph({ concept, misconception, nodes, relationships, learningPath, example, practice }) {
  const cleaned = (nodes || []).filter((n) => n?.id && n.label && !PLACEHOLDER_NODE.test(n.label));
  const ids = new Set(cleaned.map((n) => n.id));
  const rels = (relationships || []).filter(
    (r) => ids.has(r.from) && ids.has(r.to) && r.from !== r.to && r.label,
  );
  return {
    concept,
    misconception,
    nodes: cleaned.slice(0, 10),
    relationships: rels.slice(0, 12),
    learningPath: (learningPath || []).slice(0, 5),
    example: compactText(example),
    practice: practice || null,
  };
}

function partBranch(part, { kind, includeExtra = true }) {
  const nodes = [
    node(part.id, part.label, {
      kind,
      importance: 'key',
      explanation: part.explanation,
    }),
    node(`${part.id}-job`, part.process, {
      kind: kind === 'correct' ? 'correct' : kind === 'mixup' ? 'related' : 'related',
      importance: kind === 'correct' ? 'key' : 'supporting',
      explanation: part.processExplain,
    }),
    node(`${part.id}-obj`, part.object, {
      explanation: `${part.label} connect to ${part.object.toLowerCase()}.`,
    }),
  ];
  const relationships = [
    { from: part.id, to: `${part.id}-job`, label: 'do' },
    { from: `${part.id}-job`, to: `${part.id}-obj`, label: 'involve' },
  ];
  if (includeExtra && part.extra) {
    nodes.push(
      node(`${part.id}-x`, part.extra, {
        explanation: `${part.extra} belongs with ${part.label.toLowerCase()}.`,
      }),
    );
    relationships.push({
      from: `${part.id}-job`,
      to: `${part.id}-x`,
      label: part.extraEdge || 'with',
    });
  }
  return { nodes, relationships };
}

function plantSystemGraph(miss, diagnosis) {
  const focus = focusPlantPart(miss) || PLANT_PARTS.find((p) => p.id === 'leaves');
  const mix = usableStudent(miss) ? mixupPlantPart(miss, focus) : null;
  const flowering = has(questionBlob(miss), /flowering/) || focus.id === 'seeds' || focus.id === 'flowers';
  const rootLabel = flowering ? 'Flowering plant' : 'Plant';
  const siblings = [focus];
  if (mix && mix.id !== focus.id) siblings.push(mix);
  const contrastId =
    focus.id === 'seeds' || focus.id === 'flowers'
      ? 'flowers'
      : focus.id === 'leaves'
        ? 'stem'
        : focus.id === 'stem'
          ? 'roots'
          : 'leaves';
  const contrast = PLANT_PARTS.find((p) => p.id === contrastId && !siblings.some((s) => s.id === p.id));
  if (contrast) siblings.push(contrast);

  const nodes = [
    node('plant', rootLabel, {
      kind: 'root',
      importance: 'key',
      explanation: 'A plant has parts with different jobs.',
    }),
  ];
  const relationships = [];
  const seen = new Set(['plant']);

  for (const part of siblings) {
    const kind =
      part.id === focus.id ? 'correct' : mix && part.id === mix.id ? 'mixup' : 'related';
    const deepen = kind === 'correct' || kind === 'mixup';
    const branch = deepen
      ? partBranch(part, { kind, includeExtra: true })
      : { nodes: [node(part.id, part.label, { kind, explanation: part.explanation })], relationships: [] };
    for (const n of branch.nodes) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      nodes.push(n);
    }
    relationships.push({ from: 'plant', to: part.id, label: 'has' });
    relationships.push(...branch.relationships);
  }

  return graph({
    concept: `${focus.label}: ${focus.process.toLowerCase()}`,
    misconception: diagnosis,
    nodes,
    relationships,
    learningPath: [
      `${focus.label} have their own job`,
      `${focus.process} is what this question is about`,
      mix ? `${mix.label} ${mix.process.toLowerCase()} — a different job` : `Hold that ${focus.label.toLowerCase()} do ${focus.process.toLowerCase()}`,
    ],
    example: focus.explanation,
    practice: {
      question:
        focus.id === 'leaves'
          ? 'A plant has damaged leaves. Which job fails first: making food, or moving water up the stem?'
          : focus.id === 'seeds'
            ? 'A flowering plant makes no seeds. What cannot happen next?'
            : focus.id === 'roots'
              ? 'A plant’s roots are damaged. Which job fails first: absorbing water, or moving water up the stem?'
              : `If ${focus.label.toLowerCase()} stop working, which job fails first?`,
      expectedConcept: focus.process,
    },
  });
}

function photosynthesisGasGraph(miss, diagnosis) {
  const studentO2 = has(miss.studentAnswer, /oxygen|o2/);
  return graph({
    concept: 'Photosynthesis gases',
    misconception: diagnosis,
    nodes: [
      node('photo', 'Photosynthesis', { kind: 'root', importance: 'key', explanation: 'Green plants make food using light.' }),
      node('plants', 'Leaves', { explanation: 'Green leaves run this food-making process.' }),
      node('co2', 'CO₂ in', {
        kind: 'correct',
        importance: 'key',
        explanation: 'Carbon dioxide is the gas leaves take in to build sugar.',
      }),
      node('o2', 'O₂ out', {
        kind: studentO2 ? 'mixup' : 'related',
        explanation: 'Oxygen is usually released; it is not the main gas taken in to make food.',
      }),
      node('sun', 'Sunlight', { explanation: 'Light energy powers the reaction.' }),
      node('glucose', 'Glucose', { explanation: 'Sugar is the food the leaf builds.' }),
    ],
    relationships: [
      { from: 'photo', to: 'plants', label: 'in' },
      { from: 'plants', to: 'co2', label: 'take in' },
      { from: 'plants', to: 'o2', label: 'give off' },
      { from: 'photo', to: 'sun', label: 'needs' },
      { from: 'co2', to: 'glucose', label: 'builds' },
      { from: 'sun', to: 'glucose', label: 'powers' },
    ],
    learningPath: [
      'Photosynthesis makes plant food',
      'CO₂ is taken in',
      'Oxygen is given off, not taken in for food-making',
    ],
    example: 'A crop leaf in sunlight takes in carbon dioxide and builds sugar.',
    practice: {
      question: 'If a leaf could not take in carbon dioxide, which product would it fail to make first?',
      expectedConcept: 'Glucose',
    },
  });
}

function pollinationGraph(miss, diagnosis) {
  const mixErosion = has(miss.studentAnswer, /evaporat|erosi|condens/);
  return graph({
    concept: 'Pollination',
    misconception: diagnosis,
    nodes: [
      node('flower', 'Flower', { kind: 'root', importance: 'key', explanation: 'Flowers are set up for reproduction.' }),
      node('pollen', 'Pollen', { kind: 'correct', importance: 'key', explanation: 'Pollen carries the plant’s male cells.' }),
      node('move', 'Transfer', { kind: 'process', importance: 'key', explanation: 'Pollination is moving pollen to a pistil.' }),
      node('bee', 'Bee / wind', { explanation: 'Animals or wind can carry pollen.' }),
      node('seed', 'Seeds', { explanation: 'After pollination and fertilization, seeds can form.' }),
      node('other', mixErosion ? shortLabel(miss.studentAnswer, 22) || 'Weather' : 'Weather', {
        kind: mixErosion ? 'mixup' : 'related',
        explanation: 'Evaporation, erosion, and condensation are not pollen transfer.',
      }),
    ],
    relationships: [
      { from: 'flower', to: 'pollen', label: 'makes' },
      { from: 'pollen', to: 'move', label: 'needs' },
      { from: 'bee', to: 'move', label: 'helps' },
      { from: 'move', to: 'seed', label: 'leads to' },
      { from: 'flower', to: 'other', label: 'not' },
    ],
    learningPath: ['Flowers make pollen', 'Pollination moves pollen', 'Seeds can form after'],
    example: 'A bee on a farm flower is moving pollen, not drying water.',
    practice: {
      question: 'A bee walks across a flower. Which process is that an example of?',
      expectedConcept: 'Pollination',
    },
  });
}

function waterCycleGraph(miss, diagnosis) {
  const transpiration = has(questionBlob(miss), /transpir/) || has(miss.correctAnswer, /transpir/);
  return graph({
    concept: transpiration ? 'Transpiration' : 'Water cycle',
    misconception: diagnosis,
    nodes: [
      node('cycle', 'Water cycle', { kind: 'root', importance: 'key', explanation: 'Water moves between Earth, plants, and air.' }),
      node('evap', 'Evaporation', { kind: has(miss.correctAnswer, /evapor/) && !transpiration ? 'correct' : 'process', explanation: 'Liquid water becomes gas when heated.' }),
      node('transpire', 'Transpiration', {
        kind: transpiration ? 'correct' : 'related',
        importance: transpiration ? 'key' : 'supporting',
        explanation: 'Transpiration is water leaving a plant through its leaves.',
      }),
      node('cond', 'Condensation', { kind: has(miss.correctAnswer, /condens/) ? 'correct' : 'process', explanation: 'Water vapor cools and becomes liquid.' }),
      node('rain', 'Precipitation', { kind: has(miss.correctAnswer, /precipit|rain/) && !transpiration ? 'correct' : 'related', explanation: 'Water falls as rain, snow, or hail.' }),
    ],
    relationships: [
      { from: 'cycle', to: 'evap', label: 'includes' },
      { from: 'cycle', to: 'transpire', label: 'includes' },
      { from: 'evap', to: 'cond', label: 'then' },
      { from: 'cond', to: 'rain', label: 'then' },
    ],
    learningPath: transpiration
      ? ['Water moves through the plant', 'Leaves release vapor', 'That step is transpiration, not rain']
      : ['Water changes state', 'Heat drives evaporation', 'The steps loop'],
    example: transpiration
      ? 'On a hot farm day, leaves lose water vapor — that is transpiration.'
      : 'Puddles on a farm path shrink on a hot day because of evaporation.',
    practice: {
      question: transpiration
        ? 'Water leaving a leaf as vapor is precipitation, or transpiration?'
        : 'Wet soil dries on a hot day. Which water-cycle step is that?',
      expectedConcept: transpiration ? 'Transpiration' : 'Evaporation',
    },
  });
}

function diversityGraph(miss, diagnosis) {
  const mono = has(miss.correctAnswer, /monocot|one|fibrous/) || has(miss.question, /monocot/);
  return graph({
    concept: 'Monocots and dicots',
    misconception: diagnosis,
    nodes: [
      node('groups', 'Seed plants', { kind: 'root', importance: 'key', explanation: 'Flowering plants are grouped by seed leaves.' }),
      node('mono', 'Monocot', { kind: mono ? 'correct' : 'related', explanation: 'One seed leaf; often fibrous roots and parallel veins.' }),
      node('dicot', 'Dicot', { kind: mono ? 'related' : 'correct', explanation: 'Two seed leaves; often a taproot and net veins.' }),
      node('one', 'One seed leaf', { explanation: 'The cotyledon count names the group.' }),
      node('two', 'Two seed leaves', { explanation: 'Dicots have two cotyledons.' }),
    ],
    relationships: [
      { from: 'groups', to: 'mono', label: 'include' },
      { from: 'groups', to: 'dicot', label: 'include' },
      { from: 'mono', to: 'one', label: 'have' },
      { from: 'dicot', to: 'two', label: 'have' },
    ],
    learningPath: ['Count seed leaves', 'Link that count to roots and veins', 'Use the group name'],
    example: 'Maize is a monocot; bean is a dicot.',
    practice: {
      question: 'A seed has two cotyledons. Is that plant a monocot or a dicot?',
      expectedConcept: 'Dicot',
    },
  });
}

function chargeGraph(miss, diagnosis) {
  const mixR = has(miss.studentAnswer, /resistor/);
  return graph({
    concept: 'Electric charge storage',
    misconception: diagnosis,
    nodes: [
      node('charge', 'Charge', { kind: 'root', importance: 'key', explanation: 'Electric charge can be stored or resisted.' }),
      node('cap', 'Capacitor', { kind: 'correct', importance: 'key', explanation: 'A capacitor stores electric charge.' }),
      node('store', 'Store', { kind: 'process', explanation: 'Storage holds charge for later use.' }),
      node('res', 'Resistor', { kind: mixR ? 'mixup' : 'related', explanation: 'A resistor limits current; it is not the storage part.' }),
      node('limit', 'Limit current', { explanation: 'Resistance opposes flow; it does not store charge.' }),
    ],
    relationships: [
      { from: 'charge', to: 'cap', label: 'stored by' },
      { from: 'cap', to: 'store', label: 'does' },
      { from: 'charge', to: 'res', label: 'not stored by' },
      { from: 'res', to: 'limit', label: 'does' },
    ],
    learningPath: ['Charge can be stored', 'Capacitors store it', 'Resistors limit current instead'],
    example: 'A camera flash charges a capacitor, then dumps the charge as light.',
    practice: {
      question: 'Which part stores charge for a later burst: a capacitor or a resistor?',
      expectedConcept: 'Capacitor',
    },
  });
}

function trueFalseGraph(miss, diagnosis) {
  const claim = compactText(miss.question || miss.prompt);
  const focus = focusPlantPart(miss);
  const rightTrue = /^(true|t|yes)$/i.test(miss.correctAnswer);
  const idea = focus?.label || shortLabel(claim.replace(/true or false[:.]?/i, ''), 28) || 'Science idea';
  return graph({
    concept: idea,
    misconception: diagnosis,
    nodes: [
      node('idea', idea, { kind: 'root', importance: 'key', explanation: claim }),
      node('fact', focus?.process || (rightTrue ? 'Holds' : 'Breaks'), {
        kind: 'correct',
        importance: 'key',
        explanation: rightTrue ? 'The science in the sentence holds.' : 'A key claim in the sentence does not hold.',
      }),
      node('verdict', rightTrue ? 'True' : 'False', {
        kind: 'correct',
        explanation: `The scored judgement is ${compactText(miss.correctAnswer)}.`,
      }),
      ...(focus
        ? [
            node('job', focus.process, { explanation: focus.processExplain }),
          ]
        : []),
    ],
    relationships: [
      { from: 'idea', to: 'fact', label: 'checked by' },
      { from: 'fact', to: 'verdict', label: 'scores' },
      ...(focus ? [{ from: 'idea', to: 'job', label: 'uses' }] : []),
    ],
    learningPath: ['Read the science claim', 'Check the process it names', `The statement is ${compactText(miss.correctAnswer)}`],
    example: claim,
    practice: {
      question: 'In your own words, what science fact decides whether this sentence is true?',
      expectedConcept: idea,
    },
  });
}

function keywordFromCorrect(miss) {
  const c = compactText(miss.correctAnswer);
  if (!c || /see the lesson|key idea|placeholder/i.test(c)) return '';
  if (c.split(/\s+/).length <= 6) return phraseLabel(c, 28);
  const part = focusPlantPart(miss);
  if (part) return part.label;
  return phraseLabel(c, 28);
}

function genericGraph(miss, diagnosis) {
  const correct = keywordFromCorrect(miss) || focusPlantPart(miss)?.label || 'Key idea';
  const student = usableStudent(miss) ? shortLabel(miss.studentAnswer, 24) : '';
  const mix = Boolean(student && !answersEquivalent(student, correct));
  const q = compactText(miss.question || miss.prompt);
  const process =
    (has(q, /why|because|cause/) && 'Cause') ||
    (has(q, /how|process|happen/) && 'Process') ||
    (has(q, /function|job|role/) && (focusPlantPart(miss)?.process || 'Role')) ||
    focusPlantPart(miss)?.process ||
    keywordFromCorrect(miss) ||
    'Link';
  const strippedQ = q.replace(
    /^(what|which|why|how|is|are)\s+(is|are|the)?\s*(difference between|meaning of)?\s*/i,
    '',
  );
  const rootLabel =
    focusPlantPart(miss)?.label ||
    keywordFromCorrect(miss) ||
    phraseLabel(strippedQ, 24) ||
    'Science';
  const nodes = [
    node('root', PLACEHOLDER_NODE.test(rootLabel) ? correct : rootLabel, {
      kind: 'root',
      importance: 'key',
      explanation: compactText(miss.question || miss.prompt),
    }),
    node('correct', correct, {
      kind: 'correct',
      importance: 'key',
      explanation: `This is the idea the question is scoring.`,
    }),
    node('process', process, {
      kind: 'process',
      importance: 'key',
      explanation: `Connect this process to ${correct}.`,
    }),
  ];
  const relationships = [
    { from: 'root', to: 'correct', label: 'centers on' },
    { from: 'correct', to: 'process', label: 'does' },
  ];
  if (mix) {
    nodes.push(
      node('mixup', student, {
        kind: 'mixup',
        explanation: `${student} is a real idea in some lessons, but it is not what this question scores.`,
      }),
    );
    nodes.push(
      node('mix-job', 'Different job', {
        explanation: `Use ${student} for its own job, not for this one.`,
      }),
    );
    relationships.push({ from: 'root', to: 'mixup', label: 'confused with' });
    relationships.push({ from: 'mixup', to: 'mix-job', label: 'belongs to' });
  }
  if (diagnosis.type === MISCONCEPTION_TYPES.PARTIAL && miss.missingKeywords?.[0]) {
    nodes.push(
      node('missing', shortLabel(miss.missingKeywords[0], 24), {
        kind: 'related',
        importance: 'key',
        explanation: 'This piece was missing from an otherwise related answer.',
      }),
    );
    relationships.push({ from: 'correct', to: 'missing', label: 'also needs' });
  }
  return graph({
    concept: diagnosis.testedConcept || correct,
    misconception: diagnosis,
    nodes,
    relationships,
    learningPath: [
      `The question centers on ${correct}`,
      mix ? `${student} has a different job` : 'Hold the scored idea',
      `Link ${correct} to ${process.toLowerCase()}`,
    ].filter(Boolean),
    example: compactText(miss.question || miss.prompt),
    practice: {
      question: mix
        ? `Would ${student} or ${correct} answer a question about this process? Why?`
        : `What job does ${correct} do here?`,
      expectedConcept: correct,
    },
  });
}

function floweringContrastGraph(miss, diagnosis) {
  const student = usableStudent(miss) ? compactText(miss.studentAnswer) : '';
  const mixSize = has(student, /size|taller|bigger|smaller|look/);
  const mixHabitat = has(student, /water|habitat|where they live|soil/);
  const mix = mixSize || mixHabitat || Boolean(student);
  const mixLabel = mixHabitat
    ? 'Habitat'
    : mixSize
      ? 'Size'
      : student
        ? shortLabel(student, 22)
        : '';
  return graph({
    concept: 'Flowering vs non-flowering',
    misconception: diagnosis,
    nodes: [
      node('plants', 'Plants', {
        kind: 'root',
        importance: 'key',
        explanation: 'Plants can be grouped by how they reproduce.',
      }),
      node('flowering', 'Flowering', {
        kind: 'correct',
        importance: 'key',
        explanation: 'Flowering plants make flowers. Many then form fruits with seeds.',
      }),
      node('flowers', 'Flowers', {
        kind: 'correct',
        importance: 'key',
        explanation: 'Flowers are the reproductive parts that define this group.',
      }),
      node('fruits', 'Fruits', {
        explanation: 'Many flowering plants form fruits that hold seeds.',
      }),
      node('seeds', 'Seeds', {
        explanation: 'Seeds can grow into new flowering plants.',
      }),
      node('nonflowering', 'Non-flowering', {
        kind: mix ? 'related' : 'related',
        explanation: 'These plants do not make flowers. Many use spores or cones instead.',
      }),
      node('spores', 'Spores', {
        explanation: 'Mosses and ferns reproduce with spores, not flowers.',
      }),
      ...(mixLabel
        ? [
            node('mixup', mixLabel, {
              kind: 'mixup',
              explanation: 'Looks or habitat can differ, but that is not how this question groups plants.',
            }),
          ]
        : []),
    ],
    relationships: [
      { from: 'plants', to: 'flowering', label: 'include' },
      { from: 'flowering', to: 'flowers', label: 'make' },
      { from: 'flowers', to: 'fruits', label: 'can form' },
      { from: 'fruits', to: 'seeds', label: 'hold' },
      { from: 'plants', to: 'nonflowering', label: 'include' },
      { from: 'nonflowering', to: 'spores', label: 'make' },
      ...(mixLabel ? [{ from: 'plants', to: 'mixup', label: 'not grouped by' }] : []),
    ],
    learningPath: [
      'Group plants by how they reproduce',
      'Flowering plants make flowers, then often fruits and seeds',
      'Non-flowering plants use spores or cones, not flowers',
    ],
    example: 'A rose makes flowers and fruit. A fern makes spores and never flowers.',
    practice: {
      question: 'If a plant never makes flowers, is it flowering or non-flowering?',
      expectedConcept: 'Non-flowering',
    },
  });
}

function pickTemplate(miss, diagnosis) {
  if (
    (photosynthesisInputsLesson(miss) && has(miss.correctAnswer, /carbon dioxide|co2/)) ||
    (has(miss.correctAnswer, /carbon dioxide|co2/) && has(miss.studentAnswer, /oxygen|o2|helium|nitrogen/))
  ) {
    return photosynthesisGasGraph(miss, diagnosis);
  }
  if (floweringContrastLesson(miss)) return floweringContrastGraph(miss, diagnosis);
  if (pollinationLesson(miss)) return pollinationGraph(miss, diagnosis);
  if (waterCycleLesson(miss)) return waterCycleGraph(miss, diagnosis);
  if (diversityLesson(miss)) return diversityGraph(miss, diagnosis);
  if (chargeLesson(miss)) return chargeGraph(miss, diagnosis);
  if (
    isPlantQuestion(miss) &&
    isPlantPartFunctionQuestion(miss) &&
    (focusPlantPart(miss) || mixupPlantPart(miss, null))
  ) {
    return plantSystemGraph(miss, diagnosis);
  }
  const textbook = buildTextbookGraph(miss);
  if (textbook && validateConceptGraph(textbook, miss).ok) {
    return textbook;
  }
  if (diagnosis.type === MISCONCEPTION_TYPES.TRUE_FALSE) {
    return trueFalseGraph(miss, diagnosis);
  }
  return genericGraph(miss, diagnosis);
}

/**
 * Build a concept/keyword graph for one assessment miss.
 * Student mix-up nodes are marked kind:"mixup" and are never treated as true.
 */
export function buildConceptGraph(miss = {}) {
  const diagnosis = diagnoseMisconception(miss);
  const built = pickTemplate(miss, diagnosis);
  const correct = compactText(miss.correctAnswer);
  if (correct && built.nodes.every((n) => n.kind !== 'correct')) {
    const label = keywordFromCorrect(miss) || shortLabel(correct, 28);
    if (label && !PLACEHOLDER_NODE.test(label)) {
      built.nodes.push(
        node('ae-correct', label, {
          kind: 'correct',
          importance: 'key',
          explanation: `The assessment idea is ${correct}.`,
        }),
      );
    }
  }
  return built;
}

export function graphIncludesCorrectIdea(graph, missOrAnswer) {
  const miss = typeof missOrAnswer === 'object' && missOrAnswer ? missOrAnswer : { correctAnswer: missOrAnswer };
  const want = lower(miss.correctAnswer);
  if (!want || !graph?.nodes?.length) return !want;
  const focus = focusPlantPart(miss);
  return graph.nodes.some((n) => {
    if (n.kind === 'mixup') return false;
    const lab = lower(n.label);
    const expl = lower(n.explanation || '');
    if (!lab || PLACEHOLDER_NODE.test(lab)) return false;
    if (answersEquivalent(n.label, miss.correctAnswer)) return true;
    if (want.includes(lab) || lab.includes(want.slice(0, 8))) return true;
    if (focus && (lower(n.label) === lower(focus.label) || lower(n.label) === lower(focus.process))) {
      return true;
    }
    if (/root/.test(want) && /root/.test(lab)) return true;
    if (/seed|new plant|grow into/.test(want) && /seed|new plant|dispersal/.test(lab)) return true;
    if (/flower/.test(want) && /flower/.test(lab)) return true;
    if (/non[- ]?flower|spore|cone/.test(want) && /non[- ]?flower|spore|cone/.test(lab)) return true;
    if (/photosynth/.test(want) && /photosynth|food|leaf/.test(lab)) return true;
    if (/carbon dioxide|co2|co₂/.test(want) && /co2|co₂|carbon/.test(lab)) return true;
    if (/transpir/.test(want) && /transpir/.test(lab)) return true;
    if (/store and move|harvest/.test(want) && /storage|harvest|store/.test(`${lab} ${expl}`)) return true;
    if (expl.includes(want.slice(0, 24))) return true;
    if (/moving nutrients|photosynthesis and moving/.test(want) && /transport|water|photosynth|xylem/.test(`${lab} ${expl}`)) return true;
    if (/chlorophyll|leafy/.test(want) && /soil|mineral|leafy|growth|nutrient/.test(`${lab} ${expl}`)) return true;
    if (/gravity/.test(want) && /gravity|force/.test(lab)) return true;
    return false;
  });
}

export function validateConceptGraph(graph, miss) {
  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length < 3) {
    return { ok: false, reason: 'too_small' };
  }
  if (graph.nodes.length > 12) return { ok: false, reason: 'too_large' };
  if (!Array.isArray(graph.relationships) || !graph.relationships.length) {
    return { ok: false, reason: 'no_relationships' };
  }
  const placeholders = graph.nodes.filter((n) => PLACEHOLDER_NODE.test(n.label || ''));
  if (placeholders.length) return { ok: false, reason: 'placeholder_nodes' };
  if (compactText(miss.correctAnswer) && !graphIncludesCorrectIdea(graph, miss)) {
    return { ok: false, reason: 'missing_correct_concept' };
  }
  const mix = graph.nodes.find((n) => n.kind === 'mixup');
  if (mix && answersEquivalent(mix.label, miss.correctAnswer)) {
    return { ok: false, reason: 'student_marked_correct' };
  }
  const ids = new Set(graph.nodes.map((n) => n.id));
  const dangling = (graph.relationships || []).filter((r) => !ids.has(r.from) || !ids.has(r.to));
  if (dangling.length) return { ok: false, reason: 'dangling_edge' };
  return { ok: true };
}

export function layoutConceptTree(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const rels = Array.isArray(graph?.relationships) ? graph.relationships : [];
  const children = new Map();
  const incoming = new Set();
  for (const r of rels) {
    if (!r?.from || !r?.to || r.from === r.to) continue;
    if (!children.has(r.from)) children.set(r.from, []);
    children.get(r.from).push({ id: r.to, edge: r.label || '' });
    incoming.add(r.to);
  }
  const root =
    nodes.find((n) => n.kind === 'root') ||
    nodes.find((n) => !incoming.has(n.id)) ||
    nodes[0];
  const seen = new Set();
  function walk(id, depth) {
    if (!id || seen.has(id) || depth > 5) return null;
    seen.add(id);
    const n = nodes.find((x) => x.id === id);
    if (!n) return null;
    const kids = (children.get(id) || [])
      .map((c) => {
        const next = walk(c.id, depth + 1);
        if (!next) return null;
        return { ...next, edge: c.edge };
      })
      .filter(Boolean);
    return { ...n, depth, children: kids };
  }
  const tree = root ? walk(root.id, 0) : null;
  const leftover = nodes.filter((n) => !seen.has(n.id)).slice(0, 4);
  return { tree, leftover, rootId: root?.id || null };
}
