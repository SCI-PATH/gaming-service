/**
 * Keywords the Chroma RAG pipeline actually uses, then short node labels
 * Grok must copy onto the radial mind map.
 */
import { isCurriculumTopicId } from '../../frontend/src/data/curriculumTopics.js';
import {
  isIncompleteLabel,
  isPolarityLabel,
  keywordLabel,
  studentConceptLabel,
} from '../../frontend/src/avatar/conceptMapQuality.js';

const STOP = new Set([
  'the',
  'and',
  'for',
  'are',
  'was',
  'were',
  'this',
  'that',
  'with',
  'from',
  'have',
  'has',
  'been',
  'they',
  'them',
  'their',
  'what',
  'when',
  'where',
  'which',
  'why',
  'how',
  'does',
  'did',
  'can',
  'would',
  'could',
  'should',
  'please',
  'about',
  'need',
  'needed',
  'help',
  'main',
  'also',
  'into',
  'than',
  'then',
  'very',
  'more',
  'some',
  'such',
  'using',
  'used',
  'called',
  'known',
  'name',
  'type',
  'types',
  'kind',
  'made',
  'make',
  'makes',
  'making',
  'come',
  'various',
  'occurs',
  'based',
  'named',
  'by',
]);

const JUNK =
  /^(activity|figure|table|exercise|assignment|question|answer|grade|science|chapter|unit|page|part|student|option|true|false)$/i;

function ngrams(words, n) {
  const out = [];
  for (let i = 0; i + n <= words.length; i += 1) {
    out.push(words.slice(i, i + n).join(' '));
  }
  return out;
}

export function formatKeyword(text) {
  const s = String(text || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || JUNK.test(s) || isPolarityLabel(s) || isCurriculumTopicId(s)) return '';
  const words = s.split(/\s+/).slice(0, 4);
  while (words.length && /^(the|a|an|of|and)$/i.test(words[words.length - 1])) {
    words.pop();
  }
  if (!words.length || isIncompleteLabel(words.join(' '))) return '';
  return words
    .map((w, i) => {
      if (i > 0 && /^(and|of|the|to|in|for|vs)$/i.test(w)) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Tokens + hint extras the RAG query builder already produced. */
export function pipelineKeywordList(retrieval = {}, question = '') {
  if (Array.isArray(retrieval.keywords) && retrieval.keywords.length) {
    return retrieval.keywords.map((k) => String(k).trim()).filter(Boolean);
  }
  const q = String(retrieval.retrieval_query || question || '');
  return [
    ...new Set(
      (q.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((t) => !STOP.has(t)),
    ),
  ];
}

/**
 * Ranked 1–4 word labels: pipeline keywords first, then matching phrases
 * from retrieved textbook chunks.
 */
export function extractRagKeywords({
  keywords,
  retrievalQuery,
  chunks = [],
  question,
} = {}) {
  const seeds = pipelineKeywordList(
    { keywords, retrieval_query: retrievalQuery },
    question,
  )
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 2 && !STOP.has(s) && !JUNK.test(s));
  const ranked = new Map();

  const add = (raw, score) => {
    const formatted = formatKeyword(keywordLabel(raw, 4) || raw);
    if (!formatted) return;
    const key = formatted.toLowerCase();
    if (JUNK.test(key) || isCurriculumTopicId(formatted)) return;
    const prev = ranked.get(key);
    if (!prev || score > prev.score) ranked.set(key, { label: formatted, score });
  };

  for (const seed of seeds) add(seed, 12);

  for (const chunk of (chunks || []).slice(0, 8)) {
    const text = String(chunk.text || '')
      .replace(/Science\s*\|[^.\n]*/gi, ' ')
      .replace(/\b(activity|figure|table|exercise|assignment)\s*\d+(\.\d+)?/gi, ' ');
    for (const m of text.matchAll(/\b(?:is|are)\s+called\s+([^.,;]{3,40})/gi)) {
      add(m[1], 9);
    }
    for (const m of text.matchAll(/\bknown as\s+([^.,;]{3,40})/gi)) {
      add(m[1], 9);
    }
    const words = (text.toLowerCase().match(/[a-z]+/g) || []).filter(Boolean);
    const bonus = Number(chunk.hybrid_score) || 0;
    const seedSet = new Set(seeds);
    for (const n of [3, 2, 1]) {
      for (const gram of ngrams(words, n)) {
        if (n === 1 && (STOP.has(gram) || gram.length < 4 || JUNK.test(gram))) continue;
        if (JUNK.test(gram.split(/\s+/)[0])) continue;
        const parts = gram.split(' ');
        if (n >= 2 && parts.some((p) => STOP.has(p))) continue;
        if (n >= 2 && parts.every((p) => seedSet.has(p))) continue;
        const hit = seeds.some((s) => gram.includes(s) || s.includes(gram));
        if (hit) add(gram, n + bonus);
      }
    }
  }

  pipelineKeywordList({}, question).forEach((k) => add(k, 3));

  return [...ranked.values()]
    .sort((a, b) => b.score - a.score || b.label.length - a.label.length)
    .map((row) => row.label)
    .filter((lab, i, arr) => arr.findIndex((x) => x.toLowerCase() === lab.toLowerCase()) === i)
    .slice(0, 24);
}

export function snapLabelToKeywords(label, allowed = []) {
  const direct = formatKeyword(keywordLabel(label, 4) || studentConceptLabel(label, 32) || label);
  if (!allowed.length) return direct;
  const lower = String(direct || label || '').toLowerCase();
  const exact = allowed.find((k) => k.toLowerCase() === lower);
  if (exact) return formatKeyword(exact);
  const contained = allowed.find(
    (k) => lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower),
  );
  if (contained) return formatKeyword(contained);
  const blob = String(label || '').toLowerCase();
  const hit = allowed.find((k) => blob.includes(String(k).toLowerCase()));
  if (hit) return formatKeyword(hit);
  return direct;
}

export function snapMindMapToKeywords(mindMap, allowed = []) {
  if (!mindMap || mindMap.status !== 'success') return mindMap;
  const list = Array.isArray(allowed) ? allowed : [];
  return {
    ...mindMap,
    title: snapLabelToKeywords(mindMap.title, list) || mindMap.title,
    central_concept:
      snapLabelToKeywords(mindMap.central_concept, list) || mindMap.central_concept,
    branches: (mindMap.branches || [])
      .map((b) => ({
        ...b,
        title: formatKeyword(b.title) || b.title,
        points: (b.points || [])
          .map((p) => ({
            ...p,
            text: snapLabelToKeywords(p.text, list) || formatKeyword(p.text) || p.text,
          }))
          .filter((p) => p.text),
      }))
      .filter((b) => b.title),
    key_terms: (mindMap.key_terms || []).map((t) => ({
      ...t,
      term: snapLabelToKeywords(t.term, list) || t.term,
    })),
  };
}

/** Fallback radial map when Grok cannot finish: keywords grouped as hubs. */
export function mindMapFromKeywords({
  question,
  chunks = [],
  keywords,
  retrievalQuery,
} = {}) {
  const list = extractRagKeywords({ keywords, retrievalQuery, chunks, question });
  if (!list.length) return null;
  const center = list[0];
  const rest = list.slice(1);
  const hubCount = Math.min(5, Math.max(3, Math.ceil(rest.length / 4) || 3));
  const per = Math.max(1, Math.ceil(rest.length / hubCount));
  const branches = [];
  for (let i = 0; i < hubCount; i += 1) {
    const slice = rest.slice(i * per, i * per + per);
    if (!slice.length) continue;
    const chunk = chunks[Math.min(i, Math.max(0, chunks.length - 1))] || {};
    branches.push({
      id: `branch-${branches.length + 1}`,
      title: slice[0],
      points: slice.slice(1).map((text, j) => ({
        id: `point-${branches.length + 1}-${j + 1}`,
        text,
        source: {
          textbook: chunk.textbook || '',
          chapter: chunk.chapter || '',
          page: chunk.page ?? null,
          chunk_id: chunk.chunk_id,
        },
      })),
    });
  }
  if (!branches.length) {
    branches.push({
      id: 'branch-1',
      title: center,
      points: list.slice(1, 5).map((text, j) => ({ id: `point-1-${j + 1}`, text })),
    });
  }
  return {
    status: 'success',
    title: center,
    central_concept: center,
    summary: `Keyword map from ${chunks[0]?.textbook || 'the Science textbook'}.`,
    branches,
    key_terms: list.slice(0, 6).map((term) => ({ term, meaning: '' })),
    examples: [],
    remember_this: list.slice(0, 3),
    one_sentence_summary: list.slice(0, 4).join(', '),
  };
}
