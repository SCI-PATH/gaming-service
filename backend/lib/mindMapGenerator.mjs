/**
 * Assessment Engine → textbook evidence → pedagogical mind-map JSON.
 * The engine owns the correct answer. The LLM only organizes that knowledge.
 * Student wrong answers never appear on the map.
 */
import { chatCompletion, getLlamaConfig } from './llamaClient.mjs';
import { explainCorrectIdea, scienceKeyIdea } from '../../frontend/src/avatar/explainMisconception.js';
import {
  collectAssessmentMisses,
  scoredConceptList,
  validateMindMapAgainstAssessments,
  compactText,
} from '../../frontend/src/avatar/assessmentMiss.js';
import { toSageAssessmentType, SAGE_ASSESSMENT_TYPES } from '../../frontend/src/avatar/normalizeSageMindMapInput.js';
import { buildConceptGraph, validateConceptGraph } from '../../frontend/src/avatar/conceptGraph.js';
import {
  attachTextbookGrounding,
  retrieveTextbookChunks,
  excerptForQuestion,
} from './textbookRetrieve.mjs';
import { extractTextbookSentences, rankSentences } from '../../frontend/src/avatar/textbookGraph.js';
import { hasAuthoritativeCorrectAnswer } from '../../frontend/src/assessmentEngine/engineCorrectAnswer.js';

const TOPIC_ICONS = {
  photosynthesis: '☀️',
  pollination: '🐝',
  'plant biology': '🌿',
  'water cycle': '💧',
  soil: '🌱',
  ecology: '🌍',
  nutrition: '🍎',
  default: '🔬',
};

const FORBIDDEN_MAP_LANGUAGE =
  /\b(your answer|wrong answer|you selected|you picked|you said|incorrect because|mix-?up|your pick|vs\.?|versus)\b/i;

function iconFor(topic) {
  const t = String(topic || '').toLowerCase();
  for (const [k, v] of Object.entries(TOPIC_ICONS)) {
    if (k !== 'default' && t.includes(k)) return v;
  }
  return TOPIC_ICONS.default;
}

function clip(text, n = 120) {
  const s = compactText(text);
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1).trim()}…` : s;
}

function sameRough(a, b) {
  const left = compactText(a)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const right = compactText(b)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 24 && right.includes(left)) return true;
  if (right.length >= 24 && left.includes(right)) return true;
  return false;
}

function looksLikeMetaAnswer(raw) {
  const s = compactText(raw);
  if (!s) return true;
  if (/^(id|guid|uuid|null|undefined|nan)$/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f-]{10,}$/i.test(s)) return true;
  if (/^\[object object\]$/i.test(s)) return true;
  return false;
}

function topicFromAttempt(a) {
  const topic = compactText(a.topic);
  if (topic && !/^science$/i.test(topic)) return topic;
  const chapter = compactText(a.chapter || a.chapter_name);
  if (chapter) return chapter;
  return 'Science';
}

function cleanCorrectAnswer(raw) {
  const s = compactText(raw);
  if (!s || looksLikeMetaAnswer(s)) return '';
  if (/^\d+\s+of\s+\d+\s+blanks/i.test(s)) return '';
  if (/^no answer provided/i.test(s)) return '';
  if (/^correct\.?$/i.test(s)) return '';
  return s;
}

function cleanStudentAnswer(raw) {
  const s = compactText(raw);
  if (!s || looksLikeMetaAnswer(s)) return '';
  return s;
}

/** Assessment fields used to teach — never the student's pick. */
function teachingView(a) {
  return {
    ...a,
    studentAnswer: '',
    missedBlanks: Array.isArray(a.missedBlanks)
      ? a.missedBlanks.map((b) => ({ ...b, studentAnswer: '' }))
      : [],
  };
}

function explainBudget(adaptation) {
  const depth = String(adaptation?.mindMap?.explainDepth || 'medium');
  if (depth === 'micro') return 72;
  if (depth === 'simple') return 100;
  if (depth === 'rich') return 180;
  return 140;
}

function isTrueFalseToken(raw) {
  return /^(true|false|t|f|yes|no)$/i.test(compactText(raw));
}

function isMatchingType(questionType) {
  const raw = String(questionType || '')
    .replace(/[_\s-]/g, '')
    .toLowerCase();
  return raw === 'matching' || raw === 'match' || raw === 'matchingpairs';
}

function nounFromQuestion(prompt) {
  const q = compactText(prompt).replace(/\?+$/, '');
  if (!q) return '';
  const during = q.match(/\b(?:for|during|called|of)\s+([A-Za-z][A-Za-z\s-]{2,40})$/i);
  if (during?.[1] && !/^(the|a|an)\b/i.test(during[1])) return clip(during[1], 40);
  const whatIs = q.match(/\bwhat is\s+(?:the\s+)?(.+)$/i);
  if (whatIs?.[1] && whatIs[1].split(/\s+/).length <= 6) return clip(whatIs[1], 40);
  return '';
}

/**
 * Root is the scientific concept under assessment, not the raw answer sentence.
 */
export function identifyCentralConcept(attempt = {}) {
  const topic = topicFromAttempt(attempt);
  const correct = cleanCorrectAnswer(attempt.correctAnswer);
  const prompt = compactText(attempt.prompt || attempt.question);
  const sage = toSageAssessmentType(attempt.questionType);

  if (sage === SAGE_ASSESSMENT_TYPES.TrueFalse || isTrueFalseToken(correct)) {
    const fromQ = nounFromQuestion(prompt);
    if (fromQ) return titleCase(fromQ);
    if (topic && !/^science$/i.test(topic)) return topic;
    const idea = scienceKeyIdea(teachingView(attempt));
    if (idea && !isTrueFalseToken(idea)) return clip(idea, 40);
    return topic || 'Science';
  }

  if (isMatchingType(attempt.questionType) && topic && !/^science$/i.test(topic)) {
    return topic;
  }

  const fromQ = nounFromQuestion(prompt);
  if (fromQ && !sameRough(fromQ, correct)) return titleCase(fromQ);

  if (correct && !isTrueFalseToken(correct) && correct.split(/\s+/).length <= 4) {
    return titleCase(correct);
  }

  if (topic && !/^science$/i.test(topic)) return topic;
  const idea = scienceKeyIdea(teachingView(attempt));
  if (idea && !sameRough(idea, prompt)) return clip(idea, 40);
  return topic || 'Science';
}

function titleCase(text) {
  const s = compactText(text);
  if (!s) return '';
  if (s === s.toUpperCase() && s.length <= 4) return s;
  return s.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function uniquePhrases(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const text = clip(item, 90);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function parseMatchingPairs(correct) {
  const s = compactText(correct);
  if (!s) return [];
  const rows = s.split(/\s*[;|\n]\s*/).map((row) => compactText(row)).filter(Boolean);
  const pairs = [];
  for (const row of rows) {
    const parts = row.split(/\s*(?:→|->|:|=)\s*/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      pairs.push({ left: clip(parts[0], 40), right: clip(parts.slice(1).join(' '), 70) });
    }
  }
  return pairs;
}

function textbookFacts(attempt) {
  const teach = teachingView(attempt);
  const chunks = retrieveTextbookChunks(teach, { limit: 3 });
  const sentences = chunks.flatMap((c) => extractTextbookSentences(c.text));
  const ranked = rankSentences(sentences, teach, 4).map((s) => clip(s, 110));
  return {
    chunks,
    facts: uniquePhrases(ranked),
    excerpt: clip(excerptForQuestion(teach), 220),
    grounded: Boolean(chunks.length && ranked.length),
  };
}

function branch(title, children) {
  const kids = uniquePhrases(children).slice(0, 5);
  if (!kids.length) return null;
  return { title: clip(title, 28), children: kids };
}

function typeAwarePedagogy(attempt, facts, adaptation) {
  const sage = toSageAssessmentType(attempt.questionType);
  const matching = isMatchingType(attempt.questionType);
  const correct = cleanCorrectAnswer(attempt.correctAnswer);
  const concepts = scoredConceptList(attempt);
  const budget = explainBudget(adaptation);
  const explain = clip(
    facts.facts[0] || explainCorrectIdea(teachingView(attempt), { explainDepth: adaptation?.mindMap?.explainDepth }),
    budget,
  );
  const extraFacts = facts.facts.slice(0, 3);
  const example = facts.facts.find((s) => /\bfor example\b|\bsuch as\b|\be\.g\./i.test(s)) || extraFacts[1];
  const takeaway = clip(extraFacts[0] || explain, budget);

  if (sage === SAGE_ASSESSMENT_TYPES.Matching || matching) {
    const pairs = parseMatchingPairs(correct);
    const kids = pairs.length
      ? pairs.map((p) => `${p.left} → ${p.right}`)
      : concepts.length
        ? concepts
        : [correct];
  return [
      branch('Correct relationships', kids),
      extraFacts.length ? branch('Key facts', extraFacts) : null,
      takeaway ? branch('Takeaway', [takeaway]) : null,
    ].filter(Boolean);
  }

  if (sage === SAGE_ASSESSMENT_TYPES.TrueFalse) {
    const rightTrue = /^(true|t|yes)$/i.test(correct);
    if (rightTrue) {
      const statement = clip(attempt.prompt || attempt.question, 90);
      return [
        statement ? branch('Correct statement', [statement]) : null,
        explain ? branch('Explanation', [explain]) : null,
        extraFacts[1] ? branch('Supporting fact', [extraFacts[1]]) : null,
      ].filter(Boolean);
    }
    const falseClaim = compactText(attempt.prompt || attempt.question).toLowerCase();
    const scrubFalse = (text) => {
      const s = compactText(text);
      if (!s || !falseClaim) return s;
      if (s.toLowerCase().includes(falseClaim.slice(0, Math.min(40, falseClaim.length)))) return '';
      return s;
    };
    const safeExplain = scrubFalse(explain);
    const safeFacts = extraFacts.map(scrubFalse).filter(Boolean);
    return [
      branch('Correct concept', [identifyCentralConcept(attempt)]),
      safeExplain ? branch('How it works', [safeExplain]) : null,
      concepts.length ? branch('Key points', concepts.filter((c) => !isTrueFalseToken(c))) : safeFacts.length ? branch('Key facts', safeFacts) : null,
      scrubFalse(example) ? branch('Example', [scrubFalse(example)]) : null,
    ].filter(Boolean);
  }

  if (sage === SAGE_ASSESSMENT_TYPES.FillInTheBlank) {
    const terms = concepts.length ? concepts : [correct];
    return [
      branch('Correct term', terms),
      explain ? branch('Meaning', [explain]) : null,
      extraFacts[1] ? branch('Function / role', [extraFacts[1]]) : null,
      example ? branch('Example', [example]) : null,
    ].filter(Boolean);
  }

  if (sage === SAGE_ASSESSMENT_TYPES.ShortAnswer) {
    return [
      branch('Core idea', [clip(correct, 90)]),
      extraFacts.length ? branch('Important points', extraFacts.slice(0, 2)) : null,
      explain ? branch('Explanation', [explain]) : null,
      example ? branch('Example', [example]) : null,
      takeaway && !sameRough(takeaway, explain) ? branch('Application', [takeaway]) : null,
    ].filter(Boolean);
  }

  return [
    branch('Correct idea', [clip(correct, 90)]),
    explain ? branch('Why it is correct', [explain]) : null,
    extraFacts.length ? branch('Key facts', extraFacts) : null,
    example ? branch('Example', [example]) : null,
  ].filter(Boolean);
}

function minimalPedagogy(attempt, adaptation) {
  const correct = cleanCorrectAnswer(attempt.correctAnswer);
  const explain = clip(
    explainCorrectIdea(teachingView(attempt), {
      explainDepth: adaptation?.mindMap?.explainDepth,
    }),
    explainBudget(adaptation),
  );
  return [
    branch('Correct concept', [clip(correct, 90) || identifyCentralConcept(attempt)]),
    explain ? branch('Key explanation', [explain]) : null,
    branch('Important takeaway', [clip(scienceKeyIdea(teachingView(attempt)) || correct, 90)]),
  ].filter(Boolean);
}

function looksLikeFragmentGraph(graph) {
  const labels = (graph?.nodes || []).map((n) => compactText(n.label));
  if (!labels.length) return true;
  if (
    labels.some((l) =>
      /assignment|\balmost all parts\b|these bacteria|diversity among roots|naturally, roots/i.test(
        l,
      ),
    )
  ) {
    return true;
  }
  if (labels.some((l) => /^(almost|these|naturally|additionally|among)\b/i.test(l))) {
    return true;
  }
  const includes = (graph?.relationships || []).filter((r) => r.label === 'includes').length;
  return includes >= 3;
}

function slug(text, fallback = 'n') {
  const s = compactText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
  return s || fallback;
}

export function structuredToConceptGraph(centralConcept, pedagogy) {
  const rootId = 'root';
  const nodes = [
    {
      id: rootId,
      label: clip(centralConcept, 40) || 'Science',
      kind: 'root',
      importance: 'key',
      explanation: '',
    },
  ];
  const relationships = [];
  const seen = new Set([rootId, compactText(centralConcept).toLowerCase()]);
  (pedagogy || []).forEach((cat, i) => {
    const catId = slug(cat.title, `cat-${i}`);
    if (seen.has(catId)) return;
    seen.add(catId);
    nodes.push({
      id: catId,
      label: clip(cat.title, 28),
      kind: 'correct',
      importance: 'key',
      explanation: '',
    });
    relationships.push({ from: rootId, to: catId, label: 'includes' });
    (cat.children || []).forEach((child, j) => {
      const id = slug(`${catId}-${child}`, `n-${i}-${j}`);
      const key = compactText(child).toLowerCase();
      if (seen.has(id) || seen.has(key)) return;
      seen.add(id);
      seen.add(key);
      nodes.push({
        id,
        label: clip(child, 72),
        kind: 'related',
        importance: 'supporting',
        explanation: clip(child, 140),
      });
      relationships.push({ from: catId, to: id, label: 'has' });
    });
  });
  return {
    concept: centralConcept,
    misconception: null,
    nodes: nodes.slice(0, 12),
    relationships: relationships.slice(0, 14),
    learningPath: (pedagogy || [])
      .flatMap((cat) => cat.children || [])
      .slice(0, 4),
    example: pedagogy?.[0]?.children?.[0] || '',
    practice: null,
  };
}

function collectMapText(mapOrBranch) {
  const parts = [];
  const walk = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'sourceAttempts') continue;
        walk(v);
      }
    }
  };
  walk(mapOrBranch);
  return parts.join(' \n ');
}

export function validatePedagogicalMindMap(map, attempts = []) {
  const branches = Array.isArray(map?.branches) ? map.branches : [];
  if (!map || !compactText(map.title || map.central_idea || map.root)) {
    return { ok: false, reason: 'missing_root' };
  }
  if (!branches.length) return { ok: false, reason: 'no_branches' };

  for (let i = 0; i < branches.length; i += 1) {
    const branchRow = branches[i];
    const attempt = attempts[i] || attempts.find((a) => a.questionId && a.questionId === branchRow.questionId);
    const blob = collectMapText({
      ...branchRow,
      student_answer: '',
      studentAnswer: '',
    });
    if (FORBIDDEN_MAP_LANGUAGE.test(blob)) {
      return { ok: false, reason: 'forbidden_language' };
    }
    const student = cleanStudentAnswer(attempt?.studentAnswer);
    const correct = cleanCorrectAnswer(attempt?.correctAnswer || branchRow.correct_answer);
    if (student && !sameRough(student, correct)) {
      const studentKey = student.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (studentKey.length >= 4) {
        const labels = [
          branchRow.key_concept,
          branchRow.topic,
          ...(branchRow.pedagogy || []).flatMap((p) => [p.title, ...(p.children || [])]),
          ...(branchRow.concept_graph?.nodes || []).map((n) => n.label),
        ]
          .map((s) => compactText(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
          .filter(Boolean);
        if (labels.some((lab) => lab === studentKey)) {
          return { ok: false, reason: 'student_answer_on_map' };
        }
      }
    }
    if (correct && !sameRough(blob, correct) && !blob.toLowerCase().includes(correct.toLowerCase().slice(0, 18))) {
      const concepts = scoredConceptList(attempt || { correctAnswer: correct });
      const represented = concepts.some((c) => blob.toLowerCase().includes(compactText(c).toLowerCase()));
      if (!represented && !isTrueFalseToken(correct)) {
        return { ok: false, reason: 'correct_answer_missing' };
      }
    }
    const pedagogy = branchRow.pedagogy || [];
    const childTexts = pedagogy.flatMap((p) => p.children || []);
    if (childTexts.some((t) => compactText(t).length > 140)) {
      return { ok: false, reason: 'verbose_node' };
    }
    const graph = branchRow.concept_graph || branchRow.conceptGraph;
    if (graph?.nodes?.some((n) => n.kind === 'mixup')) {
      return { ok: false, reason: 'mixup_node' };
    }
  }

  const engineCheck = validateMindMapAgainstAssessments(toClientShape(map), attempts);
  if (!engineCheck.ok) return engineCheck;
  return { ok: true };
}

function normalizeAttempts(body = {}) {
  return collectAssessmentMisses(body).map((a) => ({
    questionId: a.questionId,
    topic: a.topic || topicFromAttempt(a),
    prompt: a.question || a.prompt || '',
    question: a.question || a.prompt || '',
    studentAnswer: cleanStudentAnswer(a.studentAnswer),
    correctAnswer: cleanCorrectAnswer(a.correctAnswer),
    canonicalCorrectAnswer: a.canonicalCorrectAnswer || a.correctAnswer,
    acceptedAnswers: a.acceptedAnswers || [],
    missedBlanks: a.missedBlanks || [],
    blankIndex: a.blankIndex || null,
    questionType: a.questionType,
    options: a.options || [],
    hint: a.hint || null,
    completeness: a.completeness,
    missingKeywords: a.missingKeywords || [],
    isCorrect: Boolean(a.isCorrect),
    chapter: a.chapter || a.chapter_name,
    chapter_name: a.chapter || a.chapter_name,
    chapter_id: a.chapter_id || a.chapterId,
    topic_id: a.topic_id || a.topicId,
    grade: a.grade,
    explanation: a.explanation || '',
  }));
}

function unavailableResult(questionIds) {
  const ids = (questionIds || []).filter(Boolean);
  console.warn('[mind-map] Assessment Engine correct answer missing', { questionIds: ids });
  return {
    ok: false,
    unavailable: true,
    error: 'MIND_MAP_UNAVAILABLE',
    questionIds: ids,
    mindMap: {
      unavailable: true,
      title: 'Mind Map unavailable',
      root: 'Mind Map unavailable',
      topic: 'Mind Map unavailable',
      summary: 'The assessment result did not include a verified correct answer.',
      branches: [],
      missCount: 0,
      conceptCount: 0,
    },
  };
}

/**
 * Deterministic map from the engine key + textbook evidence.
 */
export function buildLocalMindMap(attempts, adaptation = null) {
  const list = (attempts || []).map((a) => ({
    ...a,
    topic: topicFromAttempt(a),
    studentAnswer: cleanStudentAnswer(a.studentAnswer),
    correctAnswer: cleanCorrectAnswer(a.correctAnswer),
  }));
  const topics = [...new Set(list.map((a) => identifyCentralConcept(a)).filter(Boolean))];
  const title = topics.length === 1 ? topics[0] : topics.slice(0, 3).join(' · ') || 'Science';
  const voice = {
    tone: adaptation?.mindMap?.tone || 'practice',
    frustrationLevel: adaptation?.level || 'moderate',
    explainDepth: adaptation?.mindMap?.explainDepth || 'medium',
  };

  const branches = list.map((a, i) => {
    const teach = teachingView(a);
    const concept = identifyCentralConcept(a);
    const facts = textbookFacts(a);
    const pedagogy = facts.grounded
      ? typeAwarePedagogy(a, facts, adaptation)
      : minimalPedagogy(a, adaptation);
    const safePedagogy = pedagogy.length ? pedagogy : minimalPedagogy(a, adaptation);
    const structuredGraph = structuredToConceptGraph(concept, safePedagogy);
    const localGraph = buildConceptGraph({
      ...teach,
      frustrationLevel: adaptation?.level,
    });
    const fallbackCheck = validateConceptGraph(localGraph, teach);
    const structuredOk = validateConceptGraph(structuredGraph, teach).ok;
    const localOk = fallbackCheck.ok && !looksLikeFragmentGraph(localGraph);
    const conceptGraph = localOk
      ? localGraph
      : structuredOk
        ? structuredGraph
        : localGraph;

    const explain = clip(
      facts.facts[0] || explainCorrectIdea(teach, voice),
      explainBudget(adaptation),
    );
    const branchRow = {
      miss_index: i + 1,
      questionId: a.questionId || null,
      questionType: a.questionType || '',
      blankIndex: a.blankIndex || null,
      topic: concept,
      icon: iconFor(concept),
      question: a.prompt || a.question || '',
      student_answer: '',
      correct_answer: a.correctAnswer || '',
      missed_blanks: [],
      options: [],
      why_wrong: '',
      key_concept: clip(concept, 90),
      key_concept_explain: explain,
      pedagogy: safePedagogy,
      lesson: null,
      concept_graph: conceptGraph,
      farm_link: facts.excerpt
        ? clip(facts.excerpt, 160)
        : clip(scienceKeyIdea(teach) || a.correctAnswer, 80),
      color_index: i % 6,
      textbook_grounded: facts.grounded,
    };
    return attachTextbookGrounding(branchRow, teach);
  });

  const groundedCount = branches.filter((b) => b.textbook_grounded).length;

  return {
    title,
    central_idea: title,
    summary:
      list.length === 0
        ? 'No assessed concept to map yet.'
        : `Concept map of ${list.length} idea${list.length === 1 ? '' : 's'} from the assessment.`,
    big_picture:
      topics.length > 1
        ? `These maps cover: ${topics.join(', ')}.`
        : `This map teaches ${title}.`,
    study_path: branches.flatMap((b) => (b.pedagogy || []).flatMap((p) => p.children || [])).slice(0, 6),
    branches,
    missCount: list.length,
    conceptCount: topics.length || 1,
    sourceAttempts: list,
    generatedBy: 'local',
    textbookGrounded: groundedCount,
  };
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* try fence / slice */
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeAiPedagogy(rawBranches, index) {
  const list = Array.isArray(rawBranches) ? rawBranches : [];
  const hit =
    list.find((b) => Number(b.miss_index) === index + 1) ||
    list.find((b) => Number(b.index) === index + 1) ||
    list[index] ||
    null;
  if (!hit) return null;
  if (Array.isArray(hit.branches) && hit.branches.length) {
    return hit.branches
      .map((row) => branch(row.title || row.name, row.children || row.facts || []))
      .filter(Boolean);
  }
  if (Array.isArray(hit.children) && hit.title) {
    return [branch(hit.title, hit.children)].filter(Boolean);
  }
  return null;
}

/**
 * Merge AI pedagogical structure onto engine-grounded attempts.
 * Never lets Groq replace the correct answer or add the student's pick.
 */
export function mergeAiOntoAttempts(attempts, ai, adaptation = null) {
  const local = buildLocalMindMap(attempts, adaptation);
  if (!ai || typeof ai !== 'object') return local;

  const aiBranches = Array.isArray(ai.branches) ? ai.branches : [];
  const mergedBranches = local.branches.map((base, i) => {
    const hintedPedagogy = normalizeAiPedagogy(aiBranches, i);
    const teach = teachingView(attempts[i] || {});
    let pedagogy = base.pedagogy;
    const conceptGraph = base.concept_graph;
    if (hintedPedagogy?.length) {
      const concept = identifyCentralConcept(attempts[i] || { topic: base.topic });
      const hintedGraph = structuredToConceptGraph(concept, hintedPedagogy);
      const hintedCheck = validateConceptGraph(hintedGraph, {
        ...teach,
        correctAnswer: base.correct_answer,
      });
      const probe = {
        ...local,
        branches: [
          {
            ...base,
            pedagogy: hintedPedagogy,
            concept_graph: hintedCheck.ok ? hintedGraph : base.concept_graph,
          },
        ],
      };
      const pedCheck = validatePedagogicalMindMap(probe, [attempts[i]]);
      if (pedCheck.ok) {
        pedagogy = hintedPedagogy;
      }
    }

    return {
      ...base,
      student_answer: '',
      why_wrong: '',
      options: [],
      lesson: null,
      pedagogy,
      concept_graph: conceptGraph,
      correct_answer: base.correct_answer,
      miss_index: i + 1,
    };
  });

  const topics = [...new Set(mergedBranches.map((b) => b.topic).filter(Boolean))];
  const title =
    clip(ai.title || ai.centralConcept || ai.central_idea || local.title, 60) || local.title;

  return {
    title,
    central_idea: clip(ai.centralConcept || ai.central_idea || title, 80) || local.central_idea,
    summary: clip(ai.summary || local.summary, 280) || local.summary,
    big_picture: clip(ai.big_picture || ai.bigPicture || local.big_picture, 400) || local.big_picture,
    study_path: Array.isArray(ai.study_path) ? ai.study_path.map(String).slice(0, 10) : local.study_path,
    branches: mergedBranches,
    missCount: attempts.length,
    conceptCount: topics.length || 1,
    sourceAttempts: attempts,
    generatedBy: 'ai',
    textbookGrounded: local.textbookGrounded,
  };
}

function buildPrompt(attempts, adaptation = null) {
  const payload = attempts.map((a, i) => ({
    item: i + 1,
    question_id: a.questionId || null,
    question_type: a.questionType || 'unknown',
    topic: identifyCentralConcept(a),
    question: a.prompt,
    correct_answer: a.correctAnswer,
    scored_concepts: scoredConceptList(a),
    textbook_facts: textbookFacts(a).facts,
    chapter: a.chapter || a.chapter_name || null,
    grade: a.grade || null,
  }));

  const level = String(adaptation?.level || 'moderate').toLowerCase();
  const map = adaptation?.mindMap || {};
  const depth = map.explainDepth || 'medium';
  const simplify = Boolean(map.simplifyLanguage);

  return `You organize verified science knowledge into a student mind map.
You do NOT decide the correct answer. Copy correct_answer exactly. Never invent a different key.

AUTHORITATIVE RULES:
- The Assessment Engine correct_answer / scored_concepts are the only answer key.
- Teach the correct concept only.
- NEVER mention the student, a wrong answer, an incorrect option, "your answer", "mix-up", or comparisons against a mistake.
- Root node = the scientific concept (e.g. Photosynthesis), not a full answer sentence.
- Adapt branch count to the concept. Simple questions get fewer branches.
- Each child is a short phrase (max ~12 words). No paragraphs.
- Use textbook_facts when present. If textbook_facts is empty, keep a minimal map from the engine key only.
- Do not introduce unrelated topics.

Question types:
- MCQ: Correct idea, Why it is correct, Key facts, Example (skip unused).
- True (True/False): Correct statement, Explanation, Supporting fact.
- False (True/False): do NOT quote the false statement. Teach the underlying correct concept.
- Fill-in: Correct term(s) from the engine, Meaning, Function / role, Example.
- Matching: one child per confirmed relationship ("Camouflage → blend with surroundings").
- Short answer: Core idea, Important points, Explanation, Example, Application.

Personalization (PRIVATE — never write these words on the map): frustration_level=${level}, explain_depth=${depth}.
${simplify ? 'Use very simple Grade-6 words.' : 'Use clear school language.'}

Assessment items:
${JSON.stringify(payload, null, 2)}

Return JSON only:
{
  "title": "central scientific concept",
  "centralConcept": "same as title",
  "summary": "one sentence on what to learn",
  "branches": [
    {
      "title": "Photosynthesis",
      "branches": [
        { "title": "Definition", "children": ["Green plants make food using light"] },
        { "title": "Requirements", "children": ["Sunlight", "Water", "Carbon dioxide"] }
      ]
    }
  ]
}`;
}

/**
 * Generate a correct-knowledge mind map from evaluated assessment results.
 */
export async function generateMindMapFromMistakes(body = {}) {
  const attempts = normalizeAttempts(body);
  if (!attempts.length) {
    return {
      ok: true,
      mindMap: buildLocalMindMap([]),
      provider: 'none',
      note: 'No assessed concept provided.',
    };
  }

  const missing = attempts.filter((a) => !hasAuthoritativeCorrectAnswer(a.correctAnswer));
  if (missing.length === attempts.length) {
    return unavailableResult(missing.map((a) => a.questionId));
  }
  const usable = attempts.filter((a) => hasAuthoritativeCorrectAnswer(a.correctAnswer));
  if (missing.length) {
    console.warn('[mind-map] Skipping items without an engine key', {
      questionIds: missing.map((a) => a.questionId).filter(Boolean),
    });
  }

  const frustrationScore = Number(body.frustrationScore ?? body.frustration_score);
  const frustrationLevel = String(body.frustrationLevel || body.frustration_level || '').toLowerCase();
  const adaptation =
    body.frustrationAdaptation ||
    body.frustration_adaptation ||
    buildAdaptationFromScore(frustrationScore, frustrationLevel);

  const capped = usable.slice(0, adaptation.mindMap.maxBranches || usable.length);
  const local = buildLocalMindMap(capped, adaptation);
  const cfg = getLlamaConfig();

  if (cfg.provider === 'offline' || cfg.provider === 'fallback') {
    const check = validatePedagogicalMindMap(local, capped);
    const safe = check.ok ? local : buildLocalMindMap(capped, adaptation);
    return {
      ok: true,
      mindMap: toClientShape({
        ...safe,
        summary: `${adaptation.mindMap.label}: ${safe.summary}`,
      }),
      provider: 'offline',
      note: 'Local concept map (set GROQ_API_KEY for AI structuring).',
      frustrationLevel: adaptation.level,
    };
  }

  try {
    const result = await chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'The assessment engine owns the correct answer. Organize that knowledge pedagogically. Never mention a student mistake. JSON only. Never mention frustration.',
        },
        { role: 'user', content: buildPrompt(capped, adaptation) },
      ],
      maxTokens: Math.max(1400, Number(process.env.MINDMAP_MAX_TOKENS || 1800) || 1800),
      temperature: adaptation.level === 'very_high' ? 0.2 : 0.3,
    });

    const parsed = extractJson(result.content);
    const merged = mergeAiOntoAttempts(capped, parsed, adaptation);
    const check = validatePedagogicalMindMap(merged, capped);
    const safe = check.ok ? merged : local;
    return {
      ok: true,
      mindMap: toClientShape({
        ...safe,
        summary: safe.summary || `${adaptation.mindMap.label} map`,
      }),
      provider: check.ok ? result.provider : 'local-fallback',
      model: check.ok ? result.model : undefined,
      note: check.ok
        ? `AI concept map (${adaptation.mindMap.label}).`
        : 'AI map failed validation — showing the textbook-grounded local map.',
      frustrationLevel: adaptation.level,
      frustrationScore: Number.isFinite(frustrationScore) ? frustrationScore : null,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err || '');
    const soft = /model_not_found|does not exist|404|rate.?limit|429|GROQ|timeout/i.test(raw)
      ? 'AI map unavailable — showing the local concept map.'
      : 'AI unavailable — using the local concept map.';
    return {
      ok: true,
      mindMap: toClientShape(local),
      provider: 'local-fallback',
      note: soft,
      aiError: true,
      frustrationLevel: adaptation.level,
    };
  }
}

function buildAdaptationFromScore(score, levelIn) {
  const s = Number(score);
  let level = String(levelIn || '').toLowerCase();
  if (!level || level === 'null') {
    if (!Number.isFinite(s)) level = 'moderate';
    else if (s <= 30) level = 'low';
    else if (s <= 60) level = 'moderate';
    else if (s <= 80) level = 'high';
    else level = 'very_high';
  }
  const mindMapByLevel = {
    low: {
      maxBranches: 8,
      extraLinks: true,
      explainDepth: 'rich',
      tone: 'challenge',
      simplifyLanguage: false,
      label: 'Explore connections',
    },
    moderate: {
      maxBranches: 5,
      extraLinks: false,
      explainDepth: 'medium',
      tone: 'practice',
      simplifyLanguage: false,
      label: 'Concept practice',
    },
    high: {
      maxBranches: 3,
      extraLinks: false,
      explainDepth: 'simple',
      tone: 'support',
      simplifyLanguage: true,
      label: 'Gentle map',
    },
    very_high: {
      maxBranches: 2,
      extraLinks: false,
      explainDepth: 'micro',
      tone: 'support',
      simplifyLanguage: true,
      label: 'One idea at a time',
    },
  };
  return {
    level,
    score: Number.isFinite(s) ? s : null,
    mindMap: mindMapByLevel[level] || mindMapByLevel.moderate,
  };
}

/** Shape used by the React mind-map component */
export function toClientShape(map) {
  if (map?.unavailable) {
    return {
      unavailable: true,
      title: map.title || 'Mind Map unavailable',
      root: map.root || 'Mind Map unavailable',
      topic: map.topic || 'Mind Map unavailable',
      summary: map.summary || '',
      branches: [],
      missCount: 0,
      conceptCount: 0,
      layout: 'concept-map',
      generatedBy: map.generatedBy || 'none',
    };
  }

  const branches = (map.branches || []).map((b, i) => ({
    id: `concept-${i}`,
    index: b.miss_index || i + 1,
    questionId: b.questionId || null,
    questionType: b.questionType || '',
    blankIndex: b.blankIndex || null,
    topic: b.topic,
    label: b.topic,
    shortLabel: String(b.topic || 'Science').slice(0, 18),
    icon: b.icon || iconFor(b.topic),
    colorIndex: b.color_index ?? i % 6,
    prompt: b.question,
    studentAnswer: '',
    correctAnswer: b.correct_answer,
    missedBlanks: [],
    options: [],
    why: '',
    keyConcept: b.key_concept,
    keyExplain: b.key_concept_explain,
    farmLink: b.farm_link,
    summary: b.key_concept_explain,
    lesson: null,
    pedagogy: b.pedagogy || [],
    conceptGraph: b.concept_graph || b.conceptGraph || null,
    textbookGrounded: Boolean(b.textbook_grounded),
  }));

  return {
    topic: map.title,
    root: map.title || map.central_idea,
    title: map.title,
    centralIdea: map.central_idea,
    centralConcept: map.central_idea,
    summary: map.summary,
    bigPicture: map.big_picture,
    studyPath: map.study_path || [],
    branches,
    missCount: map.missCount ?? branches.length,
    conceptCount: map.conceptCount ?? 1,
    sourceAttempts: map.sourceAttempts || [],
    personalizedNote: map.summary || `Concept map with ${branches.length} idea${branches.length === 1 ? '' : 's'}.`,
    layout: 'concept-map',
    generatedBy: map.generatedBy || 'local',
  };
}
