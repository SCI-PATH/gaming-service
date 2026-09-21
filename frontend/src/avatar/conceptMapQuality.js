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
  /^(link|process|cause|role|function|job|claim|correct idea|science idea|key idea|this idea|idea|example|topic|science|name|cover|covers)$/i;

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
  return false;
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
 * Short complete concept label. Returns '' rather than a broken fragment.
 */
export function studentConceptLabel(text, max = 40) {
  const s = compactText(text).replace(/^(?:option\s*)?\(?[A-Da-d]\)?\s*[.):—–-]+\s+/i, '');
  if (!s) return '';
  if (isCurriculumTopicId(s)) return skillDisplayName(s, '') || '';

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

export function displayConceptName(miss = {}) {
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
  if (skill) return skill;

  const topic = compactText(miss.topic);
  if (topic && !isCurriculumTopicId(topic) && !/^science$/i.test(topic)) return topic;

  const chapter = compactText(miss.chapter_name || miss.chapterName || miss.chapter);
  if (chapter && !isCurriculumTopicId(chapter) && !/^science$/i.test(chapter)) return chapter;

  const fromAnswer = studentConceptLabel(miss.correctAnswer, 36);
  if (
    fromAnswer &&
    fromAnswer.split(/\s+/).length <= 3 &&
    !/,| and /i.test(fromAnswer) &&
    !/^(true|false|t|f|yes|no)$/i.test(fromAnswer)
  ) {
    return fromAnswer;
  }
  return '';
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
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function studentPracticeQuestion(miss = {}, concept = '') {
  const name = displayConceptName(miss) || studentConceptLabel(concept, 40);
  if (!name || isCurriculumTopicId(name)) {
    return 'What is the key science idea this question is checking?';
  }
  const key = studentConceptLabel(miss.correctAnswer, 36);
  const example = exampleFromQuestion(miss.question || miss.prompt);
  if (example && key && key.split(/\s+/).length <= 6 && !/^(true|false)$/i.test(key)) {
    return `How does ${example.toLowerCase()} show ${name.toLowerCase()}?`;
  }
  if (key && key.split(/\s+/).length <= 5 && !/^(true|false)$/i.test(key)) {
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

export function looksLikePoorStudentGraph(graph) {
  const labels = (graph?.nodes || []).map((n) => compactText(n.label));
  if (!labels.length) return true;
  if (labels.some((l) => isCurriculumTopicId(l) || isIncompleteLabel(l))) return true;
  if (labels.some((l) => DUMMY_NODE.test(l))) return true;
  const practice = compactText(graph?.practice?.question);
  if (practice && (isCurriculumTopicId(practice) || /G[6-9]_C\d+/i.test(practice))) return true;
  const path = graph?.learningPath || [];
  if (path.some((step) => DISCOURSE.test(compactText(step)))) return true;
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
