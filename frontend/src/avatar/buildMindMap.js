/**
 * Build one comprehensive mind map from ALL incorrect quiz attempts.
 * Each miss = one main branch (like the hand-drawn reference layout).
 */
import { bandFromMastery, getMasteryForLevelStart } from '../data/masteryModel.js';
import { DDA_BANDS } from '../data/dda.js';
import {
  buildFrustrationAdaptation,
  frustrationLevelFromScore,
} from '../data/frustrationModel.js';
import {
  CONCEPT_CATALOG,
  inferConceptFromText,
  resolveTopicKey,
} from './conceptMaps.js';
import { safeScienceLine, friendlyWrongAnswer } from './kidFriendlySpeech.js';
import {
  explainWhyWrong,
  explainCorrectIdea,
  scienceKeyIdea,
  shortConceptLabel,
  composeFiveStepLesson,
  validateStructuredLesson,
} from './explainMisconception.js';
import {
  isFillInQuestionType,
  isTypedAnswerQuestionType,
  normalizeSageMindMapInput,
  SAGE_QUESTION_TYPES,
} from './normalizeSageMindMapInput.js';

export { explainWhyWrong, explainCorrectIdea, scienceKeyIdea } from './explainMisconception.js';

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
  const fillIn = isFillInQuestionType(questionData);
  const typed = isTypedAnswerQuestionType(questionData);
  const freeText = fillIn || typed;
  const options = freeText
    ? []
    : (questionData.options || []).map((opt, idx) => {
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
  const correctIndex = freeText
    ? -1
    : typeof questionData.correctIndex === 'number'
      ? questionData.correctIndex
      : options.findIndex((o) => o.isCorrect);
  const correct = freeText
    ? null
    : (correctIndex >= 0 ? options[correctIndex] : null) ||
      options.find((o) => o.isCorrect) ||
      null;
  const normalized = normalizeSageMindMapInput({
    questionData,
    studentAnswer: questionData.studentAnswer,
    selectedText: questionData.selectedText,
    correctAnswer: questionData.correctAnswer,
    acceptedAnswers: questionData.acceptedAnswers,
    grade: questionData.grade || questionData.gradePayload,
    completeness: questionData.completeness,
    missingKeywords: questionData.missingKeywords,
    accuracyScore: questionData.accuracyScore,
    errorCategory: questionData.errorCategory,
  });

  return {
    id: questionData.id || null,
    topic:
      inferConceptFromText(questionData.prompt || questionData.question) ||
      inferConceptFromText(questionData.skill || questionData.chapter_name) ||
      resolveTopicKey(questionData.topic) ||
      questionData.topic ||
      'Science',
    prompt: questionData.prompt || questionData.question || '',
    hint: questionData.hint || null,
    grade: questionData.grade || null,
    questionType: normalized.questionType,
    options: freeText ? [] : options.map((o) => o.text),
    correctIndex,
    correctAnswer: freeText
      ? normalized.correctAnswer || questionData.correctAnswer || null
      : questionData.correctAnswer || correct?.text || null,
    acceptedAnswers: freeText ? normalized.acceptedAnswers : undefined,
    studentAnswer: freeText ? normalized.studentAnswer || null : undefined,
    completeness: typed ? normalized.completeness : undefined,
    missingKeywords: typed ? normalized.missingKeywords : undefined,
  };
}

export function buildMissAttempt(questionData, selectedText = null) {
  const normalized = normalizeSageMindMapInput({
    questionData,
    selectedText,
    studentAnswer:
      questionData?.studentAnswer ??
      questionData?.blanks ??
      selectedText,
    correctAnswer: questionData?.correctAnswer,
    acceptedAnswers: questionData?.acceptedAnswers,
    grade: questionData?.grade || questionData?.gradePayload,
    completeness: questionData?.completeness,
    missingKeywords: questionData?.missingKeywords,
    accuracyScore: questionData?.accuracyScore,
    errorCategory: questionData?.errorCategory,
    isCorrect: false,
  });
  const facts = extractQuestionFacts(questionData);
  const fillIn = normalized.questionType === SAGE_QUESTION_TYPES.FILL_IN_THE_BLANK;
  const typed = normalized.questionType === SAGE_QUESTION_TYPES.TYPED_ANSWER;
  const freeText = fillIn || typed;
  const studentAnswer = freeText
    ? normalized.studentAnswer ||
      (typeof selectedText === 'string' ? selectedText.trim() : '') ||
      '(timed out / no selection)'
    : selectedText || '(timed out / no selection)';
  const correctAnswer = freeText
    ? normalized.correctAnswer || null
    : safeScienceLine(facts?.correctAnswer, null);

  if (!facts || !facts.prompt) {
    return {
      questionId: questionData?.id || null,
      topic: normalized.topic || questionData?.topic || 'Science',
      prompt: normalized.question || questionData?.prompt || 'a science challenge',
      questionType: normalized.questionType,
      options: freeText ? [] : [],
      correctAnswer: correctAnswer,
      canonicalCorrectAnswer: normalized.canonicalCorrectAnswer || correctAnswer,
      acceptedAnswers: freeText ? normalized.acceptedAnswers : undefined,
      studentAnswer: freeText
        ? normalized.studentAnswer || selectedText || '(no selection)'
        : selectedText || '(no selection)',
      completeness: typed ? normalized.completeness : undefined,
      missingKeywords: typed ? normalized.missingKeywords : undefined,
      hint: questionData?.hint || null,
      at: Date.now(),
    };
  }
  return {
    questionId: facts.id,
    topic: facts.topic,
    prompt: facts.prompt,
    questionType: normalized.questionType || facts.questionType,
    options: freeText ? [] : facts.options,
    correctIndex: freeText ? -1 : facts.correctIndex,
    correctAnswer,
    canonicalCorrectAnswer: freeText
      ? normalized.canonicalCorrectAnswer || correctAnswer
      : correctAnswer,
    acceptedAnswers: freeText ? normalized.acceptedAnswers : undefined,
    studentAnswer,
    completeness: typed ? normalized.completeness || facts.completeness : undefined,
    missingKeywords: typed ? normalized.missingKeywords : undefined,
    hint: facts.hint,
    grade: facts.grade,
    at: Date.now(),
  };
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

function mindMapProfile({ mastery, band, frustrationScore, frustrationLevel } = {}) {
  // Frustration personalization takes priority when available (CSF adaptation).
  const frScore =
    frustrationScore != null && Number.isFinite(Number(frustrationScore))
      ? Number(frustrationScore)
      : null;
  const frLevel =
    frustrationLevel ||
    (frScore != null ? frustrationLevelFromScore(frScore) : null);

  if (frLevel) {
    const adapt = buildFrustrationAdaptation(frScore ?? frLevel);
    const mm = adapt.mindMap || {};
    return {
      maxAttempts: mm.maxBranches ?? 5,
      extraLinks: Boolean(mm.extraLinks),
      tone: mm.tone || 'practice',
      label: mm.label || 'Personalized map',
      explainDepth: mm.explainDepth || 'medium',
      simplifyLanguage: Boolean(mm.simplifyLanguage),
      frustrationLevel: adapt.level,
      complexity: mm.complexity || 'focused',
    };
  }

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
  frustrationScore = null,
  frustrationLevel = null,
} = {}) {
  const masteryInfo = resolveMindMapMastery({
    mastery: masteryIn,
    masteryBand,
    masterySource,
    levelId,
  });
  const profile = mindMapProfile({
    ...masteryInfo,
    frustrationScore,
    frustrationLevel,
  });

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

  // Cap for layout — high frustration maps THIS miss only
  const complexity = profile.complexity || 'focused';
  const list =
    complexity === 'micro' || complexity === 'simplified'
      ? attempts.slice(-1)
      : attempts.slice(0, profile.maxAttempts);
  const usedRelated = new Set();
  const topicsSeen = new Set();

  const branches = list.map((a, i) => {
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
    const t = resolveTopicKey(a.topic) || a.topic || 'Science';
    topicsSeen.add(t);
    const fillIn =
      isFillInQuestionType(a.questionType) ||
      isFillInQuestionType(a) ||
      /_{2,}|\[\s*_{0,4}\s*\]/.test(String(a.prompt || a.question || ''));
    const typed =
      isTypedAnswerQuestionType(a.questionType) ||
      isTypedAnswerQuestionType(a);
    const freeText = fillIn || typed;
    const cleanWrong = freeText
      ? safeScienceLine(a.studentAnswer, null) ||
        friendlyWrongAnswer(a.studentAnswer, typed ? 160 : 80) ||
        a.studentAnswer ||
        'no pick yet'
      : shortConceptLabel(a.studentAnswer, 48) ||
        friendlyWrongAnswer(a.studentAnswer, 80) ||
        a.studentAnswer ||
        'no pick yet';
    const cleanRight = freeText
      ? safeScienceLine(a.correctAnswer, null) ||
        a.correctAnswer ||
        'see the lesson key idea'
      : shortConceptLabel(a.correctAnswer, 48) ||
        safeScienceLine(a.correctAnswer, null) ||
        'see the lesson key idea';
    const related = catalogRelated(t, cleanRight, usedRelated);
    const conceptual = {
      ...a,
      studentAnswer: a.studentAnswer,
      correctAnswer: a.correctAnswer,
    };
    const lesson = composeFiveStepLesson(conceptual, {
      tone: profile.tone,
      frustrationLevel: profile.frustrationLevel,
      explainDepth: profile.explainDepth,
    });
    const lessonOk = validateStructuredLesson(lesson);
    const why = '';
    const rightExplain = lessonOk
      ? lesson.correctAnswer.scientificDefinition
      : explainCorrectIdea(conceptual, {
          tone: profile.tone,
          frustrationLevel: profile.frustrationLevel,
          explainDepth: profile.explainDepth,
        });
    const keyIdea = lessonOk
      ? lesson.comparisonFields?.keyScientificDifference ||
        lesson.correctAnswer?.concept ||
        scienceKeyIdea(conceptual)
      : scienceKeyIdea(conceptual);
    const catalog = CONCEPT_CATALOG[resolveTopicKey(t)];

    let nodes = [
      {
        id: `m${i}-wrong`,
        kind: 'wrong',
        label: shortLabel(cleanWrong, 22) || 'Your pick',
        title: 'Your answer',
        icon: '✗',
        body: why,
        meta: { studentAnswer: cleanWrong },
      },
      {
        id: `m${i}-diff`,
        kind: 'ask',
        label: 'Difference',
        title: "What's the difference?",
        icon: '↔',
        body: why,
        meta: {},
      },
      {
        id: `m${i}-right`,
        kind: 'right',
        label: shortLabel(cleanRight, 22) || 'Correct idea',
        title: 'Correct idea',
        icon: '✓',
        body: rightExplain,
        meta: {
          correctAnswer: cleanRight,
          hint: a.hint,
        },
      },
    ];
    if (complexity !== 'micro') {
      nodes.push({
        id: `m${i}-ask`,
        kind: 'ask',
        label: shortLabel(clip(a.prompt, 26), 26) || 'The question',
        title: 'What was asked',
        icon: '❓',
        body: clip(a.prompt, 180),
        meta: { prompt: a.prompt },
      });
    }
    if (complexity === 'broader') {
      nodes.push({
        id: `m${i}-link`,
        kind: 'link',
        label: shortLabel(related.label, 22),
        title: related.role || 'Connects to',
        icon: '🔗',
        body: related.explanation,
        meta: {},
      });
    }
    if (profile.extraLinks && complexity === 'broader') {
      const extra = catalogRelated(t, cleanRight, usedRelated);
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
      studentAnswer: cleanWrong,
      correctAnswer: cleanRight,
      options: Array.isArray(a.options) ? a.options : [],
      hint: a.hint,
      why,
      why_wrong: why,
      rightExplain,
      keyConcept: clip(keyIdea, 90) || t,
      key_concept: clip(keyIdea, 90) || t,
      keyExplain: rightExplain,
      key_concept_explain: rightExplain,
      lesson: lessonOk ? lesson : null,
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
    complexity,
    sourceAttempts: list,
    primaryAttempt: list[0],
    samplePrompts: list.map((a) => a.prompt).filter(Boolean),
    personalizedNote: profile.frustrationLevel
      ? `${profile.label} (${profile.frustrationLevel}). ${totalMisses} miss${totalMisses === 1 ? '' : 'es'}.`
      : `${profile.label} map (${Math.round((masteryInfo.mastery || 0) * 100)}%, ${masteryInfo.source || 'mastery'}). ${totalMisses} miss${totalMisses === 1 ? '' : 'es'}.`,
    learningPath: branches.map((b) => b.id),
    layout: 'all-misses-ai',
    generatedBy: 'local',
    mastery: masteryInfo.mastery,
    masteryBand: masteryInfo.band,
    masterySource: masteryInfo.source,
    frustrationScore:
      frustrationScore != null ? Number(frustrationScore) : null,
    frustrationLevel: profile.frustrationLevel || frustrationLevel || null,
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
