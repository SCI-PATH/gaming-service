/**
 * Curriculum-grounded concept graphs for Sage mind maps.
 *
 * Architecture: assessment miss → diagnose misconception → keyword nodes
 * and labeled relationships. Catalog/templates may enrich; they never
 * replace the assessment-engine correct idea.
 */
import { looksLikeSymbolicTypedAnswer } from './explainMisconception.js';
import { CONCEPT_CATALOG, resolveTopicKey } from './conceptMaps.js';
import { compactText, answersEquivalent } from './assessmentMiss.js';

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

function shortLabel(text, n = 22) {
  const s = compactText(text)
    .replace(/^(?:option\s*)?\(?[A-Da-d]\)?[.)]\s+/i, '')
    .replace(/^(true|false)$/i, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase());
  if (!s) return '';
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1).trim()}…`;
}

function firstJob(question) {
  const q = lower(question);
  if (/absorb|take in water|from the soil/.test(q)) return 'Absorb';
  if (/transport|carry water|move water/.test(q)) return 'Transport';
  if (/photosynth|make food|make glucose/.test(q)) return 'Photosynthesis';
  if (/pollinat|pollen/.test(q)) return 'Pollination';
  if (/transpir/.test(q)) return 'Transpiration';
  if (/named for|called|term for/.test(q)) return 'Name';
  if (/function|job|role|used for/.test(q)) return 'Function';
  if (/true or false|true\/false/.test(q)) return 'Claim';
  return '';
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

  if (!usableStudent(miss)) {
    return {
      type: MISCONCEPTION_TYPES.NO_USABLE,
      summary: 'No usable science idea was typed, so this map teaches the concept the question is checking.',
      testedConcept: firstJob(question) || shortLabel(correct, 28) || 'This idea',
      missingConcept: shortLabel(correct, 28) || firstJob(question),
    };
  }
  if (tf) {
    return {
      type: MISCONCEPTION_TYPES.TRUE_FALSE,
      summary: `The student judged the statement ${student} when it is ${correct}.`,
      testedConcept: shortLabel(question, 40) || 'This claim',
      missingConcept: correct,
    };
  }
  if (completeness === 'partial' || missing.length) {
    return {
      type: MISCONCEPTION_TYPES.PARTIAL,
      summary: 'The answer has some of the right idea, but a key piece is missing.',
      testedConcept: firstJob(question) || shortLabel(correct, 28),
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
      testedConcept: firstJob(question) || shortLabel(correct, 28),
      missingConcept: shortLabel(correct, 28),
    };
  }

  const relatedPairs = [
    [/root/, /stem|leaf|flower/],
    [/stem/, /root|leaf|flower/],
    [/carbon dioxide|co2/, /oxygen|helium|nitrogen/],
    [/oxygen/, /carbon dioxide|co2/],
    [/photosynth/, /respirat/],
    [/pollinat/, /evaporat|erosi|condens/],
    [/anther|stamen/, /petal/],
    [/transpir/, /precipit|freez/],
    [/monocot/, /dicot/],
    [/capacitor/, /resistor/],
  ];
  const related = relatedPairs.some(
    ([a, b]) => (a.test(lower(correct)) && b.test(lower(student))) || (b.test(lower(correct)) && a.test(lower(student))),
  );
  if (related) {
    return {
      type: MISCONCEPTION_TYPES.RELATED,
      summary: `The student mixed up ${shortLabel(student, 24)} with ${shortLabel(correct, 24)} — related ideas with different jobs.`,
      testedConcept: firstJob(question) || shortLabel(correct, 28),
      missingConcept: shortLabel(correct, 28),
    };
  }
  if (student.split(/\s+/).length <= 4 && correct.split(/\s+/).length <= 6) {
    return {
      type: MISCONCEPTION_TYPES.VOCABULARY,
      summary: `The keyword ${shortLabel(student, 20)} is not the term this question is scoring.`,
      testedConcept: firstJob(question) || shortLabel(correct, 28),
      missingConcept: shortLabel(correct, 28),
    };
  }
  if (student.split(/\s+/).length > 8 || /because|so that|which means/.test(lower(student))) {
    return {
      type: MISCONCEPTION_TYPES.REASONING,
      summary: 'The reasoning chain is missing the process that actually answers this question.',
      testedConcept: firstJob(question) || shortLabel(correct, 28),
      missingConcept: shortLabel(correct, 28),
    };
  }
  return {
    type: MISCONCEPTION_TYPES.COMPLETE_MISS,
    summary: `${shortLabel(student, 24)} does not do the job this question is checking.`,
    testedConcept: firstJob(question) || shortLabel(correct, 28),
    missingConcept: shortLabel(correct, 28),
  };
}

function node(id, label, extra = {}) {
  return {
    id,
    label: shortLabel(label, 24) || id,
    explanation: extra.explanation || '',
    example: extra.example || '',
    importance: extra.importance || 'supporting',
    kind: extra.kind || 'related',
  };
}

function graph({ concept, misconception, nodes, relationships, learningPath, example, practice }) {
  const ids = new Set(nodes.map((n) => n.id));
  const rels = (relationships || []).filter((r) => ids.has(r.from) && ids.has(r.to));
  return {
    concept,
    misconception,
    nodes: nodes.slice(0, 10),
    relationships: rels.slice(0, 12),
    learningPath: (learningPath || []).slice(0, 5),
    example: compactText(example),
    practice: practice || null,
  };
}

function catalogHint(topic, label) {
  const key = resolveTopicKey(topic);
  const cat = key ? CONCEPT_CATALOG[key] : null;
  if (!cat?.nodes) return '';
  const hit = cat.nodes.find((n) => lower(n.label).includes(lower(label).slice(0, 8)) || lower(label).includes(lower(n.label).slice(0, 6)));
  return hit?.explanation || '';
}

function plantWaterGraph(miss, diagnosis) {
  const studentStem = has(miss.studentAnswer, /stem/);
  return graph({
    concept: 'Plant water system',
    misconception: diagnosis,
    nodes: [
      node('plant', 'Plant', { kind: 'root', importance: 'key', explanation: 'A plant has parts with different jobs.' }),
      node('roots', 'Roots', {
        kind: 'correct',
        importance: 'key',
        explanation: 'Roots absorb water and minerals from the soil.',
        example: 'Root hairs take in soil water.',
      }),
      node('stem', 'Stem', {
        kind: studentStem ? 'mixup' : 'related',
        importance: 'key',
        explanation: 'The stem transports water; it does not absorb it from soil.',
      }),
      node('leaves', 'Leaves', { explanation: 'Leaves use water when they make food.' }),
      node('absorb', 'Absorb', { kind: 'process', importance: 'key', explanation: 'Absorption is taking water in.' }),
      node('transport', 'Transport', { kind: 'process', explanation: 'Transport is moving water that was already taken in.' }),
      node('water', 'Water', { explanation: 'Water comes from the soil and moves up the plant.' }),
      node('soil', 'Soil', { explanation: 'Soil is where roots find water.' }),
    ],
    relationships: [
      { from: 'plant', to: 'roots', label: 'has' },
      { from: 'plant', to: 'stem', label: 'has' },
      { from: 'plant', to: 'leaves', label: 'has' },
      { from: 'roots', to: 'absorb', label: 'do' },
      { from: 'absorb', to: 'water', label: 'take in' },
      { from: 'water', to: 'soil', label: 'from' },
      { from: 'stem', to: 'transport', label: 'do' },
      { from: 'transport', to: 'water', label: 'move' },
    ],
    learningPath: [
      'Plant parts have different jobs',
      'Roots absorb water from soil',
      'Stem transports water; it does not absorb it',
    ],
    example: 'A wilted crop usually needs water at the roots first, not a stronger stem.',
    practice: {
      question: 'A plant’s roots are damaged. Which job fails first: absorbing water, or moving water up the stem?',
      expectedConcept: 'Absorption at the roots',
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
      node('plants', 'Plants', { explanation: 'Green leaves run this food-making process.' }),
      node('gas', 'Gas exchange', { kind: 'process', importance: 'key', explanation: 'Leaves take one gas in and usually give another off.' }),
      node('co2', 'CO₂ in', {
        kind: 'correct',
        importance: 'key',
        explanation: 'Carbon dioxide is the gas leaves take in to build sugar.',
      }),
      node('o2', 'O₂ out', {
        kind: studentO2 ? 'mixup' : 'related',
        explanation: 'Oxygen is usually released; it is not the main gas taken in to make food.',
      }),
      node('glucose', 'Glucose', { explanation: 'Sugar is the food the leaf builds.' }),
    ],
    relationships: [
      { from: 'photo', to: 'plants', label: 'in' },
      { from: 'plants', to: 'gas', label: 'use' },
      { from: 'gas', to: 'co2', label: 'take in' },
      { from: 'gas', to: 'o2', label: 'give off' },
      { from: 'co2', to: 'photo', label: 'feeds' },
      { from: 'photo', to: 'glucose', label: 'makes' },
    ],
    learningPath: [
      'Photosynthesis makes plant food',
      'CO₂ is taken in',
      'Oxygen is given off, not taken in for food-making',
    ],
    example: 'A crop leaf in sunlight takes in carbon dioxide and builds sugar.',
    practice: {
      question: 'If a leaf could not take in carbon dioxide, which product would it fail to make first?',
      expectedConcept: 'Glucose / food',
    },
  });
}

function trueFalseGraph(miss, diagnosis) {
  const claim = shortLabel(miss.question || miss.prompt, 28) || 'Statement';
  const rightTrue = /^(true|t|yes)$/i.test(miss.correctAnswer);
  return graph({
    concept: diagnosis.testedConcept || 'This statement',
    misconception: diagnosis,
    nodes: [
      node('claim', 'Claim', { kind: 'root', importance: 'key', explanation: compactText(miss.question) }),
      node('science', shortLabel(diagnosis.missingConcept, 22) || 'Science idea', {
        kind: 'correct',
        importance: 'key',
        explanation: rightTrue
          ? 'The science in the sentence holds.'
          : 'A key claim in the sentence does not hold.',
      }),
      node('verdict', rightTrue ? 'True' : 'False', {
        kind: 'correct',
        explanation: `The scored judgement is ${compactText(miss.correctAnswer)}.`,
      }),
    ],
    relationships: [
      { from: 'claim', to: 'science', label: 'tests' },
      { from: 'science', to: 'verdict', label: 'means' },
    ],
    learningPath: ['Read the science claim', 'Check if that claim is true', 'Choose True or False from the science'],
    example: compactText(miss.question),
    practice: {
      question: 'In your own words, what science fact decides whether this sentence is true?',
      expectedConcept: diagnosis.testedConcept,
    },
  });
}

function genericGraph(miss, diagnosis) {
  const correct = shortLabel(miss.correctAnswer, 22) || 'Correct idea';
  const student = usableStudent(miss) ? shortLabel(miss.studentAnswer, 22) : '';
  const job = firstJob(miss.question || miss.prompt) || diagnosis.testedConcept || 'Job';
  const topic = compactText(miss.topic) || 'Science';
  const mix = Boolean(student && !answersEquivalent(student, correct));
  const nodes = [
    node('topic', topic, {
      kind: 'root',
      importance: 'key',
      explanation: catalogHint(topic, topic) || `This question is about ${topic}.`,
    }),
    node('job', job, {
      kind: 'process',
      importance: 'key',
      explanation: `The question is checking this job: ${job}.`,
    }),
    node('correct', correct, {
      kind: 'correct',
      importance: 'key',
      explanation:
        catalogHint(topic, correct) ||
        `“${correct}” is the idea that does this job for the question.`,
    }),
  ];
  const relationships = [
    { from: 'topic', to: 'job', label: 'asks' },
    { from: 'correct', to: 'job', label: 'does' },
  ];
  if (mix) {
    nodes.push(
      node('mixup', student, {
        kind: 'mixup',
        explanation: `“${student}” is a real idea for some questions, but it does not do this job.`,
      }),
    );
    relationships.push({ from: 'mixup', to: 'job', label: 'does not' });
    relationships.push({ from: 'topic', to: 'mixup', label: 'confused with' });
  }
  if (diagnosis.type === MISCONCEPTION_TYPES.PARTIAL && miss.missingKeywords?.[0]) {
    nodes.push(
      node('missing', shortLabel(miss.missingKeywords[0], 22), {
        kind: 'related',
        importance: 'key',
        explanation: 'This piece was missing from an otherwise related answer.',
      }),
    );
    relationships.push({ from: 'correct', to: 'missing', label: 'also needs' });
  }
  const extra = catalogHint(topic, correct);
  if (nodes.length < 8 && extra) {
    nodes.push(node('example', 'Example', { explanation: extra, example: extra }));
    relationships.push({ from: 'correct', to: 'example', label: 'shown by' });
  }
  return graph({
    concept: diagnosis.testedConcept || topic,
    misconception: diagnosis,
    nodes,
    relationships,
    learningPath: [
      `The question is about ${job}`,
      mix ? `${student} is not that job` : 'Hold the scored idea',
      `${correct} does the job`,
    ].filter(Boolean),
    example: extra,
    practice: {
      question: mix
        ? `If a scientist needed the job “${job}”, would they choose ${student} or ${correct}? Why?`
        : `What job does ${correct} do in this topic?`,
      expectedConcept: correct,
    },
  });
}

function pickTemplate(miss, diagnosis) {
  const q = `${miss.question || ''} ${miss.prompt || ''}`;
  const s = miss.studentAnswer || '';
  const c = miss.correctAnswer || '';
  if (
    has(q, /absorb|take in water|from the soil/) &&
    has(c, /root/) &&
    (has(s, /stem|leaf|flower/) || diagnosis.type === MISCONCEPTION_TYPES.NO_USABLE)
  ) {
    return plantWaterGraph(miss, diagnosis);
  }
  if (
    (has(q, /photosynth|make food|gas/) && has(c, /carbon dioxide|co2/) && has(s, /oxygen|helium|nitrogen|o2/)) ||
    (has(c, /carbon dioxide|co2/) && has(s, /oxygen|o2|helium/))
  ) {
    return photosynthesisGasGraph(miss, diagnosis);
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
    built.nodes.push(
      node('ae-correct', shortLabel(correct, 22), {
        kind: 'correct',
        importance: 'key',
        explanation: `The assessment idea is ${correct}.`,
      }),
    );
  }
  return built;
}

export function graphIncludesCorrectIdea(graph, correctAnswer) {
  const want = lower(correctAnswer);
  if (!want || !graph?.nodes?.length) return !want;
  return graph.nodes.some((n) => {
    if (n.kind === 'mixup') return false;
    const lab = lower(n.label);
    if (!lab) return false;
    if (answersEquivalent(n.label, correctAnswer)) return true;
    if (want.includes(lab) || lab.includes(want.slice(0, 8))) return true;
    if (/root/.test(want) && /root/.test(lab)) return true;
    if (/carbon dioxide|co2|co₂/.test(want) && /co2|co₂|carbon/.test(lab)) return true;
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
  if (compactText(miss.correctAnswer) && !graphIncludesCorrectIdea(graph, miss.correctAnswer)) {
    return { ok: false, reason: 'missing_correct_concept' };
  }
  const mix = graph.nodes.find((n) => n.kind === 'mixup');
  if (mix && answersEquivalent(mix.label, miss.correctAnswer)) {
    return { ok: false, reason: 'student_marked_correct' };
  }
  return { ok: true };
}

export function layoutConceptTree(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const rels = Array.isArray(graph?.relationships) ? graph.relationships : [];
  const children = new Map();
  const incoming = new Set();
  for (const r of rels) {
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
      .map((c) => ({ ...walk(c.id, depth + 1), edge: c.edge }))
      .filter(Boolean);
    return { ...n, depth, children: kids };
  }
  const tree = root ? walk(root.id, 0) : null;
  const leftover = nodes.filter((n) => !seen.has(n.id)).slice(0, 4);
  return { tree, leftover, rootId: root?.id || null };
}
