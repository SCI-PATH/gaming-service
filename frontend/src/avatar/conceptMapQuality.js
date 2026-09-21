/**
 * Student-facing labels for any Science mind map.
 * Curriculum IDs and truncated stems must never appear on the map.
 */
import { compactText, scoredConceptList } from './assessmentMiss.js';
import { PLACEHOLDER_NODE } from './conceptLessons.js';
import {
  isCurriculumTopicId,
  pickCanonicalTopicId,
  skillDisplayName,
} from '../data/curriculumTopics.js';

const HANGING =
  /^(the|a|an|of|to|for|by|in|on|at|and|or|through|with|from|as|into|that|which|is|are|was|were|its|their|this|these|those)$/i;

const DISCOURSE =
  /^(thus|therefore|hence|so|moreover|additionally|from this|in this way|it is clear that|it is clear),?\s+/i;

const DUMMY_NODE =
  /^(link|process|cause|role|function|job|claim|correct idea|science idea|key idea|this idea|idea|example|topic|science|name|cover|covers|plant biology)$/i;

const POLARITY = /^(true|false|t|f|yes|no)$/i;

const WEAK_TOKEN = new Set([
  'rock',
  'rocks',
  'earth',
  'made',
  'type',
  'types',
  'also',
  'they',
  'this',
  'that',
  'from',
  'with',
  'have',
  'been',
  'into',
  'process',
  'processes',
  'pieces',
  'white',
  'green',
  'big',
  'see',
  'kind',
  'kinds',
  'features',
  'called',
  'which',
  'dead',
  'animals',
  'plants',
  'plant',
  'idea',
  'question',
  'main',
]);

export function isPolarityLabel(text) {
  return POLARITY.test(compactText(text));
}

export function isIncompleteLabel(text) {
  const s = compactText(text);
  if (!s || s.length < 2) return true;
  if (isCurriculumTopicId(s) || /^G[6-9]_C\d+/i.test(s)) return true;
  if (PLACEHOLDER_NODE.test(s) || DUMMY_NODE.test(s)) return true;
  const words = s.split(/\s+/);
  if (HANGING.test(words[words.length - 1])) return true;
  if (words.length === 1 && HANGING.test(words[0])) return true;
  if (/^(duce|vide|tion|ing|ment)\b/i.test(s)) return true;
  if (/\b(is|are|was|were)\s+\w+(ed|ing)$/i.test(s)) return true;
  if (isPolarityLabel(s)) return true;
  if (/^hold\b/i.test(s)) return true;
  if (/^conclusion is\b/i.test(s)) return true;
  if (/\bgot$/i.test(s)) return true;
  if (/^(these get|on big rocks)\b/i.test(s)) return true;
  if ((s.match(/\s[·|-]\s/g) || []).length >= 2) return true;
  return false;
}

const INSTRUCTION =
  /^(do the|do this|do that|please\b|try to\b|look at\b|draw\b|write\b|complete\b|fill in\b|choose\b|select\b|tick\b|circle\b|match the\b|name the\b|tell me\b|activity\b|figure\b|table\b|exercise\b)/i;

/**
 * Commands, worksheet leftovers, and filler that must never become nodes.
 */
export function isNoiseLabel(text) {
  const s = compactText(text);
  if (!s) return true;
  if (INSTRUCTION.test(s)) return true;
  if (/^(ok|okay|yes|no|hmm|uh|um)\b/i.test(s)) return true;
  if (/^[a-z]{1,2}$/i.test(s)) return true;
  return false;
}

/** Strip trailing list punctuation without inventing a new concept. */
export function cleanNodeLabel(text) {
  return compactText(text).replace(/[,:;]+$/g, '').replace(/\s+/g, ' ').trim();
}

function finishLabel(raw, max = 40) {
  let words = compactText(raw)
    .replace(/^(?:option\s*)?\(?[A-Da-d]\)?\s*[.):—–-]+\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && HANGING.test(words[words.length - 1])) words.pop();
  while (words.length > 1 && HANGING.test(words[0])) words.shift();
  let out = '';
  for (const word of words.slice(0, 8)) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > max) break;
    out = next;
  }
  if (!out || isIncompleteLabel(out)) return '';
  return out;
}

/**
 * 1–4 word node label for the radial keyword map.
 */
export function keywordLabel(text, maxWords = 4) {
  const s = studentConceptLabel(text, 36);
  if (!s) return '';
  const words = s.split(/\s+/).filter(Boolean);
  while (words.length && /^(they|this|that|these|those|it)$/i.test(words[0])) {
    words.shift();
  }
  while (words.length > maxWords) words.pop();
  while (words.length && HANGING.test(words[words.length - 1])) words.pop();
  const out = words.join(' ');
  if (!out || isIncompleteLabel(out)) return '';
  return out;
}

/**
 * Short complete concept label. Returns '' rather than a broken fragment.
 */
export function studentConceptLabel(text, max = 40) {
  const s = compactText(text).replace(/^(?:option\s*)?\(?[A-Da-d]\)?\s*[.):—–-]+\s+/i, '');
  if (!s) return '';
  if (isCurriculumTopicId(s)) return skillDisplayName(s, '') || '';
  if (/\s·\s|\s\|\s/.test(s) || (s.match(/\s-\s/g) || []).length >= 2) return '';
  if (isPolarityLabel(s) || /^hold\b/i.test(s)) return '';

  const called = s.match(/\b(?:is|are)\s+called\s+([^.,;]{3,48})/i);
  if (called?.[1]) {
    const lab = finishLabel(called[1], max);
    if (lab) return lab;
  }
  const known = s.match(/\bknown as\s+([^.,;]{3,48})/i);
  if (known?.[1]) {
    const lab = finishLabel(known[1], max);
    if (lab) return lab;
  }
  if (s.split(/\s+/).length > 8) {
    const via = s.match(/\b(?:through|by|via|using)\s+(?:the\s+)?([^.,;]{3,60})/i);
    if (via?.[1]) {
      const lab = finishLabel(via[1], max);
      if (lab) return lab;
    }
  }
  const direct = finishLabel(s, max);
  if (direct) return direct;
  return '';
}

function contentTokens(text) {
  return compactText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3 && !WEAK_TOKEN.has(w));
}

function questionDomain(question) {
  const s = compactText(question).toLowerCase();
  if (!s) return '';
  if (/limestone|igneous|sedimentary|metamorphic|weathering|mineral|rock cycle/.test(s)) {
    return 'rocks';
  }
  if (/sound|vibrat|guitar|flute|vocal/.test(s)) return 'sound';
  if (/photosynth|cotyledon|monocot|dicot|flowering|pollen|chlorophyll/.test(s)) return 'plants';
  if (/capacitor|resistor|circuit|current|charge/.test(s)) return 'electricity';
  return '';
}

function topicDomain(topic) {
  const s = compactText(topic).toLowerCase();
  if (/rock|mineral|weathering/.test(s)) return 'rocks';
  if (/sound/.test(s)) return 'sound';
  if (/plant|photo|flower|leaf|biology/.test(s)) return 'plants';
  if (/electric|charge|circuit/.test(s)) return 'electricity';
  return '';
}

export function topicFitsQuestion(topic, question) {
  const topicText = compactText(topic);
  if (!topicText || isCurriculumTopicId(topicText) || DUMMY_NODE.test(topicText) || /^science$/i.test(topicText)) {
    return false;
  }
  const td = topicDomain(topicText);
  const qd = questionDomain(question);
  if (qd && td && td !== qd) return false;
  return true;
}

function titleCasePhrase(text) {
  const s = compactText(text);
  if (!s) return '';
  return s.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function conceptFromQuestionStem(question) {
  const q = compactText(question);
  if (!q) return '';
  if (/heating and cooling|break into pieces/i.test(q) && /rock/i.test(q)) {
    return 'Rock weathering';
  }
  if (/limestone/i.test(q) && /igneous|sedimentary|magma/i.test(q)) {
    return 'Types of rocks';
  }
  if (/metamorphic/i.test(q) && /sedimentary|pressure|temperature/i.test(q)) {
    return 'Metamorphic rocks';
  }
  const into = q.match(/\binto\s+((?:[A-Za-z]+\s+){0,2}[A-Za-z]+?)(?:\s*\?|$)/);
  if (into?.[1] && !/^(the|a|an|pieces)\b/i.test(into[1])) {
    const lab = finishLabel(into[1], 40);
    if (lab) return titleCasePhrase(lab);
  }
  const classified = q.match(/^([A-Za-z][A-Za-z\s]{2,28}?)\s+is classified/i);
  if (classified?.[1]) {
    const lab = finishLabel(classified[1], 36);
    if (lab) return titleCasePhrase(lab);
  }
  return '';
}

export function displayConceptName(miss = {}) {
  const question = miss.question || miss.prompt || '';
  const fromStem = conceptFromQuestionStem(question);
  if (fromStem) return fromStem;

  const topicId = pickCanonicalTopicId(
    miss.topic_id,
    miss.topicId,
    miss.served_topic_id,
    miss.skill_id,
    miss.topic,
    miss.chapter_id,
    miss.chapterId,
  );
  const skill = skillDisplayName(topicId, '');
  if (skill && topicFitsQuestion(skill, question)) return skill;

  const topic = compactText(miss.topic);
  if (topicFitsQuestion(topic, question)) return topic;

  const chapter = compactText(miss.chapter_name || miss.chapterName || miss.chapter);
  if (topicFitsQuestion(chapter, question)) return chapter;

  const fromAnswer = studentConceptLabel(miss.correctAnswer, 36);
  if (
    fromAnswer &&
    fromAnswer.split(/\s+/).length <= 3 &&
    !/,| and /i.test(fromAnswer) &&
    !isPolarityLabel(fromAnswer)
  ) {
    return fromAnswer;
  }
  return skill || '';
}

export function labelFitsMiss(label, miss = {}) {
  const lab = compactText(label);
  if (!lab || isIncompleteLabel(lab) || isPolarityLabel(lab)) return false;
  const concepts = scoredConceptList(miss).map((c) => compactText(c).toLowerCase());
  if (concepts.some((c) => c && (c === lab.toLowerCase() || c.includes(lab.toLowerCase()) || lab.toLowerCase().includes(c)))) {
    return true;
  }
  const focus = contentTokens(`${miss.question || miss.prompt || ''} ${miss.correctAnswer || ''} ${concepts.join(' ')}`);
  const labTokens = contentTokens(lab);
  if (!labTokens.length) return false;
  if (!focus.length) return true;
  const hits = labTokens.filter(
    (w) => focus.includes(w) || focus.some((f) => f.includes(w) || w.includes(f)),
  );
  return hits.length >= Math.min(2, labTokens.length);
}

export function exampleFromQuestion(question) {
  const q = compactText(question);
  if (!q) return '';
  const inMatch = q.match(
    /\bin\s+(?:a|an|the)\s+([A-Za-z][A-Za-z-]{2,28})(?:s)?(?:\?|$|,|\.)/i,
  );
  if (inMatch?.[1] && !HANGING.test(inMatch[1])) {
    return finishLabel(inMatch[1], 24);
  }
  const various = q.match(/\bin\s+various\s+([^?]{3,40})/i);
  if (various?.[1]) return finishLabel(various[1], 28);
  return '';
}

export function teachingStep(sentence, maxWords = 14) {
  let s = compactText(sentence);
  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(DISCOURSE, '');
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const clause = compactText(s.split(/[;:]|\s+which\s+/i)[0] || '');
  const words = clause.split(/\s+/).filter(Boolean);
  let cut = words.length > maxWords ? words.slice(0, maxWords) : words;
  while (cut.length && HANGING.test(cut[cut.length - 1])) cut.pop();
  s = cut.join(' ').replace(/[.]+$/, '');
  if (!s || s.length < 12 || isIncompleteLabel(s)) return '';
  if (/^(these get|conclusion is|on big rocks)\b/i.test(s)) return '';
  if (/\bgot$/i.test(s)) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function studentPracticeQuestion(miss = {}, concept = '') {
  const name = displayConceptName(miss) || studentConceptLabel(concept, 40);
  if (!name || isCurriculumTopicId(name)) {
    return 'What is the key science idea this question is checking?';
  }
  const key = studentConceptLabel(miss.correctAnswer, 36);
  const example = exampleFromQuestion(miss.question || miss.prompt);
  if (example && key && key.split(/\s+/).length <= 6 && !isPolarityLabel(key)) {
    return `How does ${example.toLowerCase()} show ${name.toLowerCase()}?`;
  }
  if (key && key.split(/\s+/).length <= 5 && !isPolarityLabel(key)) {
    return `In your own words, what does ${key.toLowerCase()} have to do with ${name.toLowerCase()}?`;
  }
  return `What is the main idea of ${name.toLowerCase()}?`;
}

export function conceptKeywords(miss = {}, extra = []) {
  const seen = new Set();
  const out = [];
  const push = (raw) => {
    const lab = studentConceptLabel(raw, 36);
    const key = lab.toLowerCase();
    if (!lab || seen.has(key) || PLACEHOLDER_NODE.test(lab) || DUMMY_NODE.test(lab)) return;
    seen.add(key);
    out.push(lab);
  };
  scoredConceptList(miss).forEach(push);
  push(miss.correctAnswer);
  extra.forEach(push);
  const example = exampleFromQuestion(miss.question || miss.prompt);
  if (example) push(example);
  return out;
}

export function looksLikePoorStudentGraph(graph, miss = {}) {
  const labels = (graph?.nodes || []).map((n) => compactText(n.label));
  if (!labels.length) return true;
  if (labels.some((l) => isCurriculumTopicId(l) || isIncompleteLabel(l) || isPolarityLabel(l))) return true;
  if (labels.some((l) => DUMMY_NODE.test(l) || /^hold\b/i.test(l))) return true;
  if (labels.some((l) => /lichen/i.test(l) && !/lichen/i.test(`${miss.question || ''} ${miss.correctAnswer || ''}`))) {
    return true;
  }
  const practice = compactText(graph?.practice?.question);
  if (practice && (isCurriculumTopicId(practice) || /G[6-9]_C\d+/i.test(practice))) return true;
  const path = graph?.learningPath || [];
  if (path.some((step) => DISCOURSE.test(compactText(step)))) return true;
  if (path.some((step) => /plant biology is the idea/i.test(step))) return true;
  return false;
}

function uniquePath(steps) {
  const seen = new Set();
  const out = [];
  for (const step of steps || []) {
    const s = compactText(step);
    const key = s.toLowerCase();
    if (!s || seen.has(key) || isIncompleteLabel(s) || isCurriculumTopicId(s)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Strip IDs, hanging phrases, and dummy nodes from any graph.
 */
export function polishConceptGraph(graph, miss = {}) {
  if (!graph || !Array.isArray(graph.nodes)) return graph;
  const fromGraph = compactText(graph.concept);
  const fromMiss = displayConceptName(miss);
  const concept =
    fromGraph && !isCurriculumTopicId(fromGraph) && !isIncompleteLabel(fromGraph)
      ? studentConceptLabel(fromGraph, 48) || fromGraph
      : fromMiss || fromGraph;
  const nodes = [];
  const seenLabel = new Set();
  for (const n of graph.nodes) {
    const salvaged =
      n.kind === 'root'
        ? studentConceptLabel(n.label, 40) || concept || 'Science'
        : studentConceptLabel(n.label, 40);
    if (!salvaged) continue;
    if (n.kind !== 'root' && n.kind !== 'mixup' && DUMMY_NODE.test(salvaged)) continue;
    if (n.kind !== 'root' && n.kind !== 'mixup' && (isPolarityLabel(salvaged) || /^hold\b/i.test(salvaged))) {
      continue;
    }
    const key = salvaged.toLowerCase();
    if (seenLabel.has(key)) continue;
    seenLabel.add(key);
    nodes.push({
      ...n,
      label: salvaged,
      explanation: compactText(n.explanation).replace(/\bG[6-9]_C\d+[A-Z0-9_]*/gi, concept || 'this idea'),
    });
  }
  if (!nodes.some((n) => n.kind === 'root') && nodes[0]) {
    nodes[0] = { ...nodes[0], kind: 'root', importance: 'key' };
  }
  const rootLabel = compactText(nodes.find((n) => n.kind === 'root')?.label);
  const filtered = nodes.filter((n, i) => {
    if (i === 0 || n.kind === 'root') return true;
    return compactText(n.label).toLowerCase() !== rootLabel.toLowerCase();
  });
  const ids = new Set(filtered.map((n) => n.id));
  const relationships = (graph.relationships || []).filter(
    (r) => ids.has(r.from) && ids.has(r.to) && r.from !== r.to,
  );
  const learningPath = uniquePath(
    (graph.learningPath || []).map((step) => teachingStep(step) || compactText(step)),
  );
  let practiceQ = compactText(graph.practice?.question);
  if (!practiceQ || isCurriculumTopicId(practiceQ) || /G[6-9]_C\d+/i.test(practiceQ) || /textbook idea/i.test(practiceQ)) {
    practiceQ = studentPracticeQuestion(miss, concept);
  }
  return {
    ...graph,
    concept: concept || graph.concept,
    nodes: filtered.slice(0, 10),
    relationships: relationships.slice(0, 12),
    learningPath:
      learningPath.length
        ? learningPath
        : uniquePath([
            concept ? `${concept} is the idea this question checks` : '',
            ...scoredConceptList(miss).map((c) => studentConceptLabel(c, 48)),
          ]),
    practice: {
      question: practiceQ,
      expectedConcept: studentConceptLabel(graph.practice?.expectedConcept, 40) || concept,
    },
  };
}
