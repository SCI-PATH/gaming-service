/**
 * Build one comprehensive mind map from ALL incorrect quiz attempts.
 * Each miss = one main branch (like the hand-drawn reference layout).
 */
import { bandFromMastery, getMasteryForLevelStart } from '../data/masteryModel.js';
import { DDA_BANDS } from '../data/dda.js';
import {
  CONCEPT_CATALOG,
  resolveTopicKey,
} from './conceptMaps.js';

const BRANCH_COLORS = [
  { key: 'rose', stroke: '#c45c5c', fill: '#fde8e8', accent: '#9a3030' },
  { key: 'sky', stroke: '#3a7fb8', fill: '#dceefb', accent: '#1f567e' },
  { key: 'amber', stroke: '#d4892a', fill: '#fff0d6', accent: '#a05e10' },
  { key: 'teal', stroke: '#2f8a7a', fill: '#d8f3ee', accent: '#1a5c50' },
  { key: 'violet', stroke: '#7a5aa8', fill: '#efe8f8', accent: '#52387a' },
  { key: 'slate', stroke: '#5a6570', fill: '#e8ecef', accent: '#3d4650' },
];

export function extractQuestionFacts(questionData) {
  if (!questionData) return null;
  const options = (questionData.options || []).map((opt, idx) => {
    if (typeof opt === 'string') {
      return {
        text: opt,
        isCorrect: idx === questionData.correctIndex,
      };
    }
    return {
      text: opt.text || String(opt),
      isCorrect:
        Boolean(opt.isCorrect) || idx === questionData.correctIndex,
    };
  });
  const correctIndex =
    typeof questionData.correctIndex === 'number'
      ? questionData.correctIndex
      : options.findIndex((o) => o.isCorrect);
  const correct =
    (correctIndex >= 0 ? options[correctIndex] : null) ||
    options.find((o) => o.isCorrect) ||
    null;

  return {
    id: questionData.id || null,
    topic: resolveTopicKey(questionData.topic) || questionData.topic || 'Science',
    prompt: questionData.prompt || questionData.question || '',
    hint: questionData.hint || null,
    grade: questionData.grade || null,
    options: options.map((o) => o.text),
    correctIndex,
    correctAnswer: correct?.text || null,
  };
}

export function buildMissAttempt(questionData, selectedText = null) {
  const facts = extractQuestionFacts(questionData);
  if (!facts || !facts.prompt) {
    return {
      questionId: questionData?.id || null,
      topic: questionData?.topic || 'Science',
      prompt: questionData?.prompt || 'a science challenge',
      options: [],
      correctAnswer: null,
      studentAnswer: selectedText || '(no selection)',
      hint: questionData?.hint || null,
      at: Date.now(),
    };
  }
  return {
    questionId: facts.id,
    topic: facts.topic,
    prompt: facts.prompt,
    options: facts.options,
    correctIndex: facts.correctIndex,
    correctAnswer: facts.correctAnswer,
    studentAnswer: selectedText || '(timed out / no selection)',
    hint: facts.hint,
    grade: facts.grade,
    at: Date.now(),
  };
}

export function explainWhyWrong(attempt) {
  const wrong = String(attempt.studentAnswer || '').trim();
  const right = String(attempt.correctAnswer || '').trim();

  if (!wrong || wrong.startsWith('(')) {
    return `You need the correct science idea: ${right || 'see the lesson key idea'}.`;
  }
  if (right && wrong.toLowerCase() === right.toLowerCase()) {
    return `That matches the correct idea (${right}).`;
  }

  const w = wrong.toLowerCase();
  if (/petal|leaf tip|leaf vein/.test(w)) {
    return `"${wrong}" is a plant part, but not the pollen-maker.`;
  }
  if (/oxygen|nitrogen|helium/.test(w) && /carbon dioxide|co2/i.test(right)) {
    return `Plants mainly take in carbon dioxide for food-making—not "${wrong}".`;
  }
  if (/evaporation|erosion|condensation/.test(w)) {
    return `"${wrong}" is a different Earth process—not pollen transfer.`;
  }
  if (/making metal|rocks|soil disappear|thunder/.test(w)) {
    return `"${wrong}" is not a real job for this farm science idea.`;
  }
  return `You chose "${wrong}". The correct idea is "${right || '…'}".`;
}

export function explainCorrectIdea(attempt) {
  const right = attempt.correctAnswer;
  const hint = attempt.hint;
  const topic = attempt.topic || 'Science';
  if (right && hint) {
    return `Correct: ${right}. ${hint}`;
  }
  if (right) {
    return `Correct: ${right}. Link it to ${topic} on the farm.`;
  }
  if (hint) return hint;
  return `Re-read the key idea under ${topic}.`;
}

function collectAttempts({
  attemptsIn,
  misconceptions,
  questionData,
  studentWrongAnswer,
  topic,
  prompt,
}) {
  const out = [];

  if (Array.isArray(attemptsIn)) {
    for (const a of attemptsIn) {
      if (a?.prompt || a?.correctAnswer || a?.studentAnswer) out.push(a);
    }
  }

  if (Array.isArray(misconceptions)) {
    for (const m of misconceptions) {
      if (Array.isArray(m.attempts) && m.attempts.length) {
        for (const a of m.attempts) out.push(a);
      } else if (m.prompts?.length) {
        const n = Math.max(
          m.prompts.length,
          (m.wrongAnswers || []).length,
          1,
        );
        for (let i = 0; i < n; i += 1) {
          out.push({
            topic: m.topic,
            prompt: m.prompts[i] || m.prompts[0] || '',
            studentAnswer: (m.wrongAnswers || [])[i] || m.wrongAnswers?.[0],
            correctAnswer: m.correctAnswers?.[i] || m.lastCorrectAnswer || null,
            hint: m.hint || null,
            options: m.lastOptions || [],
            at: m.lastAt || 0,
            questionId: `${m.topic}-${i}`,
          });
        }
      }
    }
  }

  if (questionData) {
    out.push(buildMissAttempt(questionData, studentWrongAnswer));
  } else if (prompt && (studentWrongAnswer || topic)) {
    out.push({
      topic: topic || 'Science',
      prompt,
      studentAnswer: studentWrongAnswer,
      correctAnswer: null,
      hint: null,
      options: [],
      at: Date.now(),
    });
  }

  const seen = new Set();
  return out.filter((a) => {
    const key = `${a.questionId || ''}|${String(a.prompt || '').slice(0, 80)}|${a.studentAnswer}|${a.correctAnswer}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(a.prompt || a.correctAnswer || a.topic);
  });
}

function mindMapProfile({ mastery, band } = {}) {
  const resolved = band || bandFromMastery(mastery ?? 0.5);
  if (resolved === DDA_BANDS.WEAK || resolved === DDA_BANDS.EMERGING) {
    return {
      maxAttempts: 3,
      extraLinks: false,
      tone: 'support',
      label: 'Building mastery',
    };
  }
  if (resolved === DDA_BANDS.SMART || resolved === DDA_BANDS.STRONG) {
    return {
      maxAttempts: 8,
      extraLinks: true,
      tone: 'challenge',
      label: 'High mastery',
    };
  }
  return {
    maxAttempts: 5,
    extraLinks: false,
    tone: 'practice',
    label: 'Developing mastery',
  };
}

function resolveMindMapMastery(opts = {}) {
  if (opts.mastery != null && Number.isFinite(Number(opts.mastery))) {
    const mastery = Number(opts.mastery);
    return {
      mastery,
      band: opts.masteryBand || bandFromMastery(mastery),
      source: opts.masterySource || 'passed',
    };
  }
  try {
    return getMasteryForLevelStart(opts.levelId || 1);
  } catch {
    return { mastery: 0.5, band: DDA_BANDS.MEDIUM, source: 'default' };
  }
}

function catalogRelated(topic, correctAnswer, usedLabels = new Set()) {
  const key = resolveTopicKey(topic);
  const cat = key ? CONCEPT_CATALOG[key] : null;
  if (!cat?.nodes?.length) {
    return {
      label: 'Farm link',
      role: 'Connection',
      explanation: `Connect this idea to other ${topic || 'science'} concepts on your farm.`,
    };
  }
  const correctLower = String(correctAnswer || '').toLowerCase();
  const related =
    cat.nodes.find((n) => {
      const lab = String(n.label).toLowerCase();
      if (usedLabels.has(lab)) return false;
      if (correctLower && lab.includes(correctLower.slice(0, 8))) return false;
      if (correctLower && correctLower.includes(lab.slice(0, 8))) return false;
      return true;
    }) || cat.nodes[0];

  usedLabels.add(String(related.label).toLowerCase());
  return {
    label: related.label,
    role: related.role || 'Related',
    explanation: related.explanation || cat.summary,
  };
}

/**
 * One main branch per incorrect answer — student sees EVERY miss on the map.
 */
export function buildPersonalizedMindMap({
  topic = null,
  prompt = null,
  misconceptions = [],
  studentWrongAnswer = null,
  questionData = null,
  attempts: attemptsIn = null,
  mastery: masteryIn = null,
  masteryBand = null,
  masterySource = null,
  levelId = 1,
} = {}) {
  const masteryInfo = resolveMindMapMastery({
    mastery: masteryIn,
    masteryBand,
    masterySource,
    levelId,
  });
  const profile = mindMapProfile(masteryInfo);

  const attempts = collectAttempts({
    attemptsIn,
    misconceptions,
    questionData,
    studentWrongAnswer,
    topic,
    prompt,
  });

  if (!attempts.length) {
    if (!topic && !prompt) return null;
    return buildEmptyTopicMap(topic || 'Science', prompt, profile, masteryInfo);
  }

  // Cap for layout — weaker mastery gets a shorter, more scaffolded map
  const list = attempts.slice(0, profile.maxAttempts);
  const usedRelated = new Set();
  const topicsSeen = new Set();

  const branches = list.map((a, i) => {
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
    const t = resolveTopicKey(a.topic) || a.topic || 'Science';
    topicsSeen.add(t);
    const related = catalogRelated(t, a.correctAnswer, usedRelated);
    const why = explainWhyWrong(a);
    const rightExplain = explainCorrectIdea(a);
    const catalog = CONCEPT_CATALOG[resolveTopicKey(t)];

    const nodes = [
      {
        id: `m${i}-wrong`,
        kind: 'wrong',
        label: shortLabel(a.studentAnswer, 22) || 'Your pick',
        title: 'Your pick',
        icon: '✗',
        body: why,
        meta: { studentAnswer: a.studentAnswer },
      },
      {
        id: `m${i}-right`,
        kind: 'right',
        label: shortLabel(a.correctAnswer, 22) || 'Correct idea',
        title: 'Correct idea',
        icon: '✓',
        body: rightExplain,
        meta: {
          correctAnswer: a.correctAnswer,
          hint: a.hint,
        },
      },
      {
        id: `m${i}-ask`,
        kind: 'ask',
        label: shortLabel(clip(a.prompt, 26), 26) || 'The question',
        title: 'What was asked',
        icon: '❓',
        body: `You missed this: “${clip(a.prompt, 220)}”`,
        meta: { prompt: a.prompt },
      },
      {
        id: `m${i}-link`,
        kind: 'link',
        label: shortLabel(related.label, 22),
        title: related.role || 'Connects to',
        icon: '🔗',
        body: related.explanation,
        meta: {},
      },
    ];
    if (profile.extraLinks) {
      const extra = catalogRelated(t, a.correctAnswer, usedRelated);
      nodes.push({
        id: `m${i}-link2`,
        kind: 'link',
        label: shortLabel(extra.label, 22),
        title: extra.role || 'Goes further',
        icon: '🔗',
        body: extra.explanation,
        meta: {},
      });
    }

    return {
      id: `miss-${i}`,
      index: i + 1,
      topic: t,
      label: t,
      shortLabel: shortLabel(t, 16),
      icon: pickTopicIcon(t),
      color,
      colorIndex: i,
      prompt: a.prompt,
      question: a.prompt,
      studentAnswer: a.studentAnswer,
      correctAnswer: a.correctAnswer,
      hint: a.hint,
      why,
      why_wrong: why,
      rightExplain,
      keyConcept: shortLabel(a.correctAnswer, 32) || t,
      key_concept: shortLabel(a.correctAnswer, 32) || t,
      keyExplain: rightExplain,
      key_concept_explain: rightExplain,
      farmLink: related.explanation,
      farm_link: related.explanation,
      summary:
        catalog?.summary ||
        `Review this ${t} idea so the farm lesson sticks.`,
      nodes,
      attempt: a,
      children: nodes.map((n) => ({
        id: n.id,
        kind: n.kind === 'wrong' ? 'mistake' : n.kind === 'right' ? 'correct' : n.kind === 'ask' ? 'question' : 'link',
        label: n.label,
        role: n.title,
        icon: n.icon,
        explanation: n.body,
        meta: n.meta,
      })),
      missCount: 1,
    };
  });

  const totalMisses = list.length;
  const conceptCount = topicsSeen.size;
  const rootTitle =
    conceptCount === 1
      ? [...topicsSeen][0]
      : 'Your Science Gaps';

  return {
    topic: rootTitle,
    root: rootTitle,
    title: rootTitle,
    centralIdea: rootTitle,
    summary: `${profile.label}: ${totalMisses} incorrect answer${totalMisses === 1 ? '' : 's'} on one map.`,
    bigPicture:
      profile.tone === 'support'
        ? `Start with the correct idea on each card. ${conceptCount > 1 ? `Topics: ${[...topicsSeen].join(', ')}.` : `Focus on ${rootTitle}.`}`
        : conceptCount > 1
        ? `These misses cover: ${[...topicsSeen].join(', ')}. Study each card, then connect the farm story.`
        : `Every miss is about ${rootTitle}. Say the correct idea for each card out loud.`,
    studyPath: branches.map((b) => `Miss ${b.index}: ${b.topic}`),
    branches,
    nodes: branches.map((b) => ({
      id: b.id,
      label: b.label,
      role: `Miss ${b.index}`,
      kind: 'branch',
      explanation: b.summary,
    })),
    links: [],
    focusIds: branches.map((b) => b.id),
    missCount: totalMisses,
    conceptCount,
    sourceAttempts: list,
    primaryAttempt: list[0],
    samplePrompts: list.map((a) => a.prompt).filter(Boolean),
    personalizedNote: `${profile.label} map (${Math.round((masteryInfo.mastery || 0) * 100)}%, ${masteryInfo.source || 'mastery'}). ${totalMisses} miss${totalMisses === 1 ? '' : 'es'}.`,
    learningPath: branches.map((b) => b.id),
    layout: 'all-misses-ai',
    generatedBy: 'local',
    mastery: masteryInfo.mastery,
    masteryBand: masteryInfo.band,
    masterySource: masteryInfo.source,
  };
}

function buildEmptyTopicMap(topic, prompt, profile = null, masteryInfo = null) {
  const color = BRANCH_COLORS[0];
  const label = profile?.label || 'Developing mastery';
  return {
    topic,
    root: topic,
    title: topic,
    summary: prompt || `${label}: review ${topic}`,
    branches: [
      {
        id: 'miss-0',
        index: 1,
        topic,
        label: topic,
        shortLabel: shortLabel(topic, 16),
        icon: pickTopicIcon(topic),
        color,
        prompt: prompt || '',
        studentAnswer: '',
        correctAnswer: '',
        why: 'Answer a quiz question incorrectly and that miss will appear here as a full branch.',
        rightExplain: '',
        summary: prompt || `Explore ${topic}`,
        nodes: [
          {
            id: 'tip',
            kind: 'link',
            label: 'After a miss',
            title: 'Next step',
            icon: '🌱',
            body: 'Each wrong answer becomes its own branch with your pick, the correct idea, and a farm connection.',
            meta: {},
          },
        ],
        children: [],
        missCount: 0,
      },
    ],
    nodes: [],
    links: [],
    focusIds: [],
    missCount: 0,
    conceptCount: 1,
    sourceAttempts: [],
    personalizedNote: `Starter map for ${topic}.`,
    learningPath: [],
    layout: 'sketch-radial-all-misses',
  };
}

export function pickTopMisconceptionTopic(misconceptions = []) {
  if (!Array.isArray(misconceptions) || misconceptions.length === 0) return null;
  const sorted = [...misconceptions].sort(
    (a, b) => (b.missCount || 0) - (a.missCount || 0),
  );
  return resolveTopicKey(sorted[0]?.topic) || sorted[0]?.topic || null;
}

export function summarizeMindMapForLlm(map) {
  if (!map) return null;
  return {
    topic: map.topic,
    root: map.root,
    summary: map.summary,
    layout: map.layout,
    based_on_all_incorrect_questions: (map.sourceAttempts || []).map((a) => ({
      topic: a.topic,
      prompt: a.prompt,
      student_answer: a.studentAnswer,
      correct_answer: a.correctAnswer,
    })),
    branches: (map.branches || []).map((b) => ({
      miss_number: b.index,
      concept: b.label,
      student_answer: b.studentAnswer,
      correct_answer: b.correctAnswer,
      why: b.why,
      nodes: (b.nodes || []).map((n) => ({
        kind: n.kind,
        label: n.label,
        title: n.title,
        body: n.body,
      })),
    })),
    personalized_note: map.personalizedNote,
  };
}

function pickTopicIcon(topic) {
  const t = String(topic || '').toLowerCase();
  if (/photo|light|sun/.test(t)) return '☀️';
  if (/pollin|flower|bee/.test(t)) return '🐝';
  if (/water|cycle|rain/.test(t)) return '💧';
  if (/soil|earth/.test(t)) return '🌱';
  if (/root|plant part|plant biology/.test(t)) return '🌿';
  if (/storage|transport|harvest/.test(t)) return '🚛';
  if (/nutrition|food|energy|digest/.test(t)) return '🍎';
  if (/force|motion/.test(t)) return '⚙️';
  if (/ecology|eco/.test(t)) return '🌍';
  return '🔬';
}

function clip(s, n) {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function shortLabel(s, n) {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
