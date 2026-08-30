/**
 * Mind maps from official EduPub textbook sentences, tagged with the
 * same chapter_id / topic_id the assessment engine uses.
 */
import { compactText, answersEquivalent } from './assessmentMiss.js';
import { PLACEHOLDER_NODE, phraseLabel } from './conceptLessons.js';
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
  if (s.length < 48 || s.length > 220) return false;
  if (
    /^(activity|assignment|exercise|fig\.|figure|table|complete the|let'?s do|you will learn|for your extra|copy the|what can you|y )/i.test(
      s,
    )
  ) {
    return false;
  }
  if (/\?$/.test(s)) return false;
  if (/['']{6,}|_{4,}|\^{|…{2,}|\.{6,}/.test(s)) return false;
  if ((s.match(/\|/g) || []).length >= 1) return false;
  if (!/[A-Za-z]{4,}/.test(s)) return false;
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
  return [
    miss.question || miss.prompt,
    miss.correctAnswer,
    miss.studentAnswer,
    miss.topic,
    miss.chapter_name || miss.chapter,
  ]
    .filter(Boolean)
    .join(' ');
}

export function rankSentences(sentences, miss = {}, limit = 5) {
  const q = new Set(tokens(queryBlob(miss)));
  const correctBits = new Set(tokens(miss.correctAnswer));
  return [...sentences]
    .map((text) => {
      let score = overlap(text, q);
      const lower = String(text || '').toLowerCase();
      for (const w of correctBits) {
        if (lower.includes(w)) score += 4;
      }
      return { text, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.text);
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

function labelFromSentence(sentence) {
  const called = sentence.match(/\b(?:is|are)\s+called\s+([^.]{3,40})/i);
  if (called) return phraseLabel(called[1], 28);
  return phraseLabel(sentence, 28);
}

/**
 * Build a validated concept graph from textbook sentences.
 */
export function graphFromTextbookSentences(miss = {}, sentences = [], chapterMeta = {}) {
  const usable = [...sentences].filter(isTeachableSentence);
  const ranked = rankSentences(usable.length ? usable : sentences, miss, 5);
  if (!ranked.length) return null;
  const chapterName =
    chapterMeta.chapter_name ||
    miss.chapter_name ||
    miss.chapter ||
    miss.topic ||
    'Science';
  const chapterId = chapterMeta.chapter_id || miss.chapter_id || '';
  const correct = compactText(miss.correctAnswer);
  const student = compactText(miss.studentAnswer);
  const rootLabel = phraseLabel(chapterName, 28) || 'Science';
  const nodes = [
    {
      id: 'tb-root',
      label: rootLabel,
      kind: 'root',
      importance: 'key',
      explanation: chapterId
        ? `Official textbook chapter ${chapterId}: ${chapterName}.`
        : `From the official science textbook: ${chapterName}.`,
    },
  ];
  const relationships = [];
  const seen = new Set(['tb-root', normalizeTitle(rootLabel)]);

  if (correct) {
    const cid = slug(correct.split(/\s+/).slice(0, 3).join(' '), 'correct');
    nodes.push({
      id: cid,
      label: phraseLabel(correct, 28),
      kind: 'correct',
      importance: 'key',
      explanation: ranked[0].slice(0, 220),
    });
    relationships.push({ from: 'tb-root', to: cid, label: 'teaches' });
    seen.add(cid);
    seen.add(normalizeTitle(phraseLabel(correct, 28)));
  }

  for (const sentence of ranked) {
    const label = labelFromSentence(sentence);
    if (!label || PLACEHOLDER_NODE.test(label)) continue;
    const id = slug(label);
    const key = normalizeTitle(label);
    if (seen.has(id) || seen.has(key)) continue;
    const isCorrect =
      correct &&
      (answersEquivalent(label, correct) ||
        correct.toLowerCase().includes(label.toLowerCase()) ||
        sentence.toLowerCase().includes(correct.toLowerCase().slice(0, 18)));
    const isMix =
      student &&
      !isCorrect &&
      !/no pick|timed out|left blank/i.test(student) &&
      (student.toLowerCase().includes(label.toLowerCase()) ||
        sentence.toLowerCase().includes(student.toLowerCase().slice(0, 12)));
    seen.add(id);
    seen.add(key);
    nodes.push({
      id,
      label,
      kind: isCorrect ? 'correct' : isMix ? 'mixup' : 'related',
      importance: isCorrect ? 'key' : 'supporting',
      explanation: sentence.slice(0, 220),
    });
    relationships.push({
      from: 'tb-root',
      to: id,
      label: isCorrect ? 'teaches' : isMix ? 'confused with' : 'includes',
    });
    if (nodes.length >= 8) break;
  }

  if (
    student &&
    !/no pick|timed out|left blank/i.test(student) &&
    !nodes.some((n) => n.kind === 'mixup') &&
    !answersEquivalent(student, correct)
  ) {
    const mid = slug(student.split(/\s+/).slice(0, 3).join(' '), 'mixup');
    if (!nodes.some((n) => n.id === mid)) {
      nodes.push({
        id: mid,
        label: phraseLabel(student, 28),
        kind: 'mixup',
        explanation: `That pick is not the idea ${chapterName} is scoring here.`,
      });
      relationships.push({ from: 'tb-root', to: mid, label: 'confused with' });
    }
  }

  if (nodes.length < 3) return null;
  return {
    concept: chapterName,
    misconception: {
      type: 'textbook_grounded',
      summary: `Grounded in ${chapterId || chapterName} of the official Grade ${chapterMeta.grade || ''} science textbook.`
        .replace(/\s+/g, ' ')
        .trim(),
    },
    nodes,
    relationships,
    learningPath: ranked.slice(0, 3),
    example: ranked[0].slice(0, 180),
    practice: {
      question: `Using the textbook idea, what does ${rootLabel} say about this?`,
      expectedConcept: phraseLabel(correct, 28) || rootLabel,
    },
    chapter_id: chapterId,
    topic_id: chapterMeta.topic_id || miss.topic_id || '',
  };
}

export function buildTextbookGraph(miss = {}) {
  const matched = matchDigestChapter(miss);
  if (!matched) return null;
  return graphFromTextbookSentences(miss, matched.row.sentences || [], {
    ...matched.chapter,
    ...matched.row,
  });
}
