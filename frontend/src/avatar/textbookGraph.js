/**
 * Mind maps from official EduPub textbook sentences, tagged with the
 * same chapter_id / topic_id the assessment engine uses.
 */
import { compactText, scoredConceptList, blankRolesFromQuestion } from './assessmentMiss.js';
import { PLACEHOLDER_NODE } from './conceptLessons.js';
import {
  displayConceptName,
  exampleFromQuestion,
  isIncompleteLabel,
  labelFitsMiss,
  polishConceptGraph,
  studentConceptLabel,
  studentPracticeQuestion,
  teachingStep,
  topicFitsQuestion,
} from './conceptMapQuality.js';
import digestJson from './textbookChapterDigest.json' with { type: 'json' };

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let digestOverride = null;

export function setTextbookDigest(rows) {
  digestOverride = rows == null ? null : Array.isArray(rows) ? rows : [];
}

export function loadTextbookDigest() {
  if (digestOverride !== null) return digestOverride;
  return Array.isArray(digestJson) ? digestJson : digestJson.chapters || [];
}

export function extractTextbookSentences(text) {
  const blob = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[•²]/g, '. ')
    .trim();
  if (!blob) return [];
  return blob
    .split(/(?<=[.?!])\s+/)
    .map((s) =>
      s
        .replace(/^[\d\s|]+/, '')
        .replace(/^(Science\s*\|\s*)+/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((s) => isTeachableSentence(s));
}

function isTeachableSentence(s) {
  const text = String(s || '').trim();
  if (text.length < 40 || text.length > 240) return false;
  if (
    /^(activity|assignment|exercise|fig\.|figure|table|complete the|let'?s do|you will learn|for your extra|copy the|what can you|y |tabulate|collect|compare|observe|draw|list the|write down|identify the)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  if (/tabulate the|collect many|compare the|complete the table|for extra knowledge/i.test(text)) {
    return false;
  }
  if (/^[a-z]/.test(text) && !/^(the|a|an|in|on|to)\b/i.test(text)) return false;
  if (/^(duce|vide|tion|ing)\b/i.test(text)) return false;
  if (/\?$/.test(text)) return false;
  if (/['']{6,}|_{4,}|\^{|…{2,}|\.{6,}/.test(text)) return false;
  if ((text.match(/\|/g) || []).length >= 1) return false;
  if (!/[A-Za-z]{4,}/.test(text)) return false;
  return true;
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3);
}

function overlap(sentence, queryTokens) {
  if (!queryTokens.size) return 0;
  const words = tokens(sentence);
  let n = 0;
  for (const w of words) {
    if (queryTokens.has(w)) n += 1;
  }
  if (/\bis called\b|\bare called\b|\bthis process\b|\bknown as\b/i.test(sentence)) {
    n += 2;
  }
  return n;
}

function slug(text, fallback = 'n') {
  const s = compactText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
  return s || fallback;
}

function queryBlob(miss = {}) {
  const topic = compactText(miss.topic);
  const chapter = compactText(miss.chapter_name || miss.chapter);
  const question = miss.question || miss.prompt;
  return [
    question,
    miss.correctAnswer,
    topicFitsQuestion(topic, question) ? topic : '',
    topicFitsQuestion(chapter, question) ? chapter : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function rankSentences(sentences, miss = {}, limit = 5) {
  const q = new Set(tokens(queryBlob(miss)));
  const concepts = scoredConceptList(miss);
  const correctBits = new Set(concepts.flatMap((c) => tokens(c)));
  if (!correctBits.size) {
    for (const w of tokens(miss.correctAnswer)) correctBits.add(w);
  }
  return [...sentences]
    .map((text) => {
      let score = overlap(text, q);
      const lower = String(text || '').toLowerCase();
      let hits = 0;
      for (const w of correctBits) {
        if (lower.includes(w)) {
          score += 4;
          hits += 1;
        }
      }
      return { text, score, hits };
    })
    .filter((row) => {
      if (correctBits.size >= 2) return row.hits > 0;
      return row.score > 0;
    })
    .sort((a, b) => b.score - a.score || b.hits - a.hits)
    .slice(0, limit)
    .map((row) => row.text);
}

function isJunkLabel(label) {
  const s = compactText(label);
  if (!s || s.length < 3) return true;
  if (/^\d+$/.test(s)) return true;
  if (PLACEHOLDER_NODE.test(s)) return true;
  if (isIncompleteLabel(s)) return true;
  if (/^(tabulate|collect|compare|observe|draw|list|write|complete|copy|identify|whereas|and that|and plants)$/i.test(s)) {
    return true;
  }
  if (/tabulate|collect many|compare the/i.test(s)) return true;
  if (/^(duce|vide|tion)\b/i.test(s)) return true;
  if (/^hold\b/i.test(s)) return true;
  return false;
}

function supportLimit(miss = {}) {
  const level = String(miss.frustrationLevel || '').toLowerCase();
  if (level === 'very_high') return 0;
  if (level === 'high') return 1;
  if (level === 'low') return 3;
  return 2;
}

function sentenceForConcept(ranked, concept) {
  const key = String(concept || '').toLowerCase();
  if (!key) return '';
  return ranked.find((s) => s.toLowerCase().includes(key)) || ranked[0] || '';
}

function labelFromSentence(sentence, concepts = []) {
  const text = compactText(sentence);
  const extracted = studentConceptLabel(text, 36);
  if (extracted && !isJunkLabel(extracted)) {
    const isOnlyScoredConcept = concepts.some(
      (c) => normalizeTitle(c) === normalizeTitle(extracted),
    );
    if (!isOnlyScoredConcept) return extracted;
  }
  const hit = concepts.find((c) => text.toLowerCase().includes(String(c).toLowerCase()));
  if (hit) {
    const lab = studentConceptLabel(hit, 36);
    if (lab && !isJunkLabel(lab)) return lab;
  }
  return extracted && !isJunkLabel(extracted) ? extracted : '';
}

function resolveDigestRow(miss = {}) {
  const digest = loadTextbookDigest();
  const chapterId = String(miss.chapter_id || miss.chapterId || '').trim();
  const topicId = String(miss.topic_id || miss.topicId || '').trim();
  const grade = Number(String(miss.grade || '').replace(/.*?(\d).*/, '$1')) || 0;
  const name = normalizeTitle(miss.chapter_name || miss.chapter || miss.topic || '');
  if (chapterId) {
    const hit = digest.find((row) => row.chapter_id === chapterId);
    if (hit) return hit;
  }
  if (topicId) {
    const hit = digest.find((row) => row.topic_id === topicId);
    if (hit) return hit;
  }
  const pool = grade ? digest.filter((row) => row.grade === grade) : digest;
  if (name) {
    const exact = pool.find((row) => normalizeTitle(row.chapter_name) === name);
    if (exact) return exact;
    const loose = pool.find(
      (row) =>
        normalizeTitle(row.chapter_name).includes(name) ||
        name.includes(normalizeTitle(row.chapter_name)),
    );
    if (loose) return loose;
  }
  return null;
}

function matchDigestChapter(miss = {}) {
  const resolved = resolveDigestRow(miss);
  if (!resolved?.sentences?.length) return null;
  return { chapter: resolved, row: resolved };
}

/**
 * Assessment keys are the nodes. Textbook sentences only explain those keys.
 */
export function graphFromTextbookSentences(miss = {}, sentences = [], chapterMeta = {}) {
  const usable = [...sentences].filter(isTeachableSentence);
  const rawConcepts = scoredConceptList(miss);
  const concepts = rawConcepts
    .map((c) => studentConceptLabel(c, 36))
    .filter((c) => c && !isJunkLabel(c));
  const ranked = rankSentences(usable.length ? usable : sentences.filter(isTeachableSentence), miss, 8);
  if (!ranked.length && !concepts.length) return null;
  const chapterName =
    displayConceptName({
      ...miss,
      chapter_name: chapterMeta.chapter_name || miss.chapter_name || miss.chapter,
    }) ||
    studentConceptLabel(chapterMeta.chapter_name, 40) ||
    'Science';
  const chapterId = chapterMeta.chapter_id || miss.chapter_id || '';
  const roles = blankRolesFromQuestion(miss.question || miss.prompt);
  const rootLabel = studentConceptLabel(chapterName, 40) || 'Science';
  const nodes = [
    {
      id: 'tb-root',
      label: rootLabel,
      kind: 'root',
      importance: 'key',
      explanation: chapterId
        ? `Official textbook chapter ${chapterId}: ${rootLabel}.`
        : `From the official science textbook: ${rootLabel}.`,
    },
  ];
  const relationships = [];
  const seen = new Set(['tb-root', normalizeTitle(rootLabel)]);

  concepts.forEach((label, i) => {
    const id = slug(label, `ae-${i}`);
    const key = normalizeTitle(label);
    if (seen.has(id) || seen.has(key)) return;
    const expl =
      sentenceForConcept(ranked, rawConcepts[i] || label) ||
      ranked.find((s) => s.toLowerCase().includes(label.toLowerCase())) ||
      `${label} is part of ${rootLabel}.`;
    seen.add(id);
    seen.add(key);
    nodes.push({
      id,
      label,
      kind: 'correct',
      importance: 'key',
      explanation: String(expl).slice(0, 220),
    });
    relationships.push({
      from: 'tb-root',
      to: id,
      label: roles[i] && roles[i] !== 'teaches' ? roles[i] : 'includes',
    });
  });

  let extra = 0;
  const extraCap = Math.max(supportLimit(miss), nodes.length < 3 ? 3 : 2);
  for (const sentence of ranked) {
    if (extra >= extraCap && nodes.length >= 3) break;
    const label = labelFromSentence(sentence, concepts);
    if (!label || isJunkLabel(label) || !labelFitsMiss(label, miss)) continue;
    const id = slug(label);
    const key = normalizeTitle(label);
    if (seen.has(id) || seen.has(key)) continue;
    seen.add(id);
    seen.add(key);
    nodes.push({
      id,
      label,
      kind: 'related',
      importance: 'supporting',
      explanation: sentence.slice(0, 220),
    });
    relationships.push({ from: 'tb-root', to: id, label: 'includes' });
    extra += 1;
  }

  const example = exampleFromQuestion(miss.question || miss.prompt);
  if (
    example &&
    labelFitsMiss(example, miss) &&
    !seen.has(normalizeTitle(example)) &&
    nodes.length < 8
  ) {
    const id = slug(example, 'ex');
    if (!seen.has(id)) {
      seen.add(id);
      seen.add(normalizeTitle(example));
      nodes.push({
        id,
        label: example,
        kind: 'related',
        explanation: compactText(miss.question || miss.prompt).slice(0, 180),
      });
      relationships.push({ from: 'tb-root', to: id, label: 'example' });
    }
  }

  if (nodes.length < 3) return null;
  const firstConcept = concepts[0] || rootLabel;
  const path = [
    ...ranked.map((s) => teachingStep(s)),
    ...concepts.map((c) => `${c} belongs with ${rootLabel}`),
  ].filter(Boolean);
  const graph = {
    concept: rootLabel,
    misconception: {
      type: 'textbook_grounded',
      summary: `Grounded in the assessment key${chapterId ? ` and chapter ${chapterId}` : ''}.`
        .replace(/\s+/g, ' ')
        .trim(),
    },
    nodes,
    relationships,
    learningPath: path.slice(0, 4),
    example: (ranked[0] || compactText(miss.question)).slice(0, 180),
    practice: {
      question:
        concepts.length > 1
          ? 'Name the ideas this question is scoring.'
          : studentPracticeQuestion(miss, rootLabel),
      expectedConcept: firstConcept,
    },
    chapter_id: chapterId,
    topic_id: chapterMeta.topic_id || miss.topic_id || '',
  };
  return polishConceptGraph(graph, miss);
}

export function buildTextbookGraph(miss = {}) {
  const matched = matchDigestChapter(miss);
  const sentences = matched?.row?.sentences || [];
  const meta = matched
    ? { ...matched.chapter, ...matched.row }
    : {
        chapter_name: miss.topic || miss.chapter_name || 'Science',
        chapter_id: miss.chapter_id,
        topic_id: miss.topic_id,
      };
  if (!sentences.length && !scoredConceptList(miss).length) return null;
  return graphFromTextbookSentences(miss, sentences, meta);
}
