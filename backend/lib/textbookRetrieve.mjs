/**
 * Retrieve textbook chunks (same chapter tagging as the assessment engine)
 * and turn them into a Sage concept graph + spoken excerpt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURRICULUM_CHAPTERS,
  resolveChapter,
  normalizeTitle,
} from './curriculumChapters.mjs';
import {
  extractTextbookSentences,
  graphFromTextbookSentences,
  rankSentences,
} from '../../frontend/src/avatar/textbookGraph.js';
import {
  validateConceptGraph,
} from '../../frontend/src/avatar/conceptGraph.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHUNK_FILES = [
  path.join(HERE, 'textbookChunks.json'),
  path.join(HERE, '../data/textbook-chunks.json'),
];

let cachedChunks = null;

export function setTextbookChunks(chunks) {
  cachedChunks = chunks == null ? null : Array.isArray(chunks) ? chunks : [];
}

export function loadTextbookChunks() {
  if (cachedChunks !== null) return cachedChunks;
  const override = process.env.TEXTBOOK_CHUNKS_PATH;
  const files = override ? [override, ...DEFAULT_CHUNK_FILES] : DEFAULT_CHUNK_FILES;
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        cachedChunks = Array.isArray(raw) ? raw : raw.chunks || [];
        return cachedChunks;
      }
    } catch {
      /* try next */
    }
  }
  cachedChunks = [];
  return cachedChunks;
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3);
}

function overlapScore(chunk, query) {
  const q = new Set(tokens(query));
  if (!q.size) return 0;
  const c = tokens(chunk.text);
  let n = 0;
  for (const w of c) {
    if (q.has(w)) n += 1;
  }
  return n;
}

export function retrieveTextbookChunks(miss = {}, { limit = 3 } = {}) {
  const chunks = loadTextbookChunks();
  if (!chunks.length) return [];
  const chapter = resolveChapter(miss);
  const query = [
    miss.question || miss.prompt,
    miss.correctAnswer,
    miss.topic,
    miss.chapter || miss.chapter_name,
  ]
    .filter(Boolean)
    .join(' ');
  let pool = chunks;
  if (chapter) {
    const scoped = chunks.filter(
      (c) =>
        c.chapter_id === chapter.chapter_id ||
        c.topic_id === chapter.topic_id ||
        normalizeTitle(c.chapter_name) === normalizeTitle(chapter.chapter_name),
    );
    if (scoped.length) pool = scoped;
  }
  return [...pool]
    .map((c) => ({ chunk: c, score: overlapScore(c, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.chunk);
}

export function graphFromTextbookChunks(miss = {}, chunks = []) {
  if (!chunks.length) return null;
  const teach = { ...miss, studentAnswer: '', missedBlanks: [] };
  const chapter = resolveChapter(miss) || {
    chapter_name: miss.topic || chunks[0].chapter_name || 'Science',
    chapter_id: chunks[0].chapter_id || '',
    topic_id: chunks[0].topic_id || '',
    grade: chunks[0].grade,
  };
  const sentences = chunks.flatMap((c) => extractTextbookSentences(c.text));
  const graph = graphFromTextbookSentences(teach, sentences, chapter);
  if (!graph) return null;
  const check = validateConceptGraph(graph, miss);
  return check.ok ? graph : null;
}

function textbookExcerpt(miss, chunks) {
  const teach = { ...miss, studentAnswer: '' };
  const sentences = chunks.flatMap((c) => extractTextbookSentences(c.text));
  const ranked = rankSentences(sentences, teach, 2);
  if (ranked.length) return ranked.join(' ').slice(0, 700);
  if (!chunks[0]?.text) return '';
  return String(chunks[0].text).replace(/\s+/g, ' ').trim().slice(0, 700);
}

export function excerptForQuestion(miss = {}) {
  const chunks = retrieveTextbookChunks(miss, { limit: 2 });
  return textbookExcerpt(miss, chunks);
}

export function attachTextbookGrounding(branch, attempt) {
  const teach = { ...attempt, studentAnswer: '', missedBlanks: [] };
  const chunks = retrieveTextbookChunks(teach, { limit: 3 });
  if (!chunks.length) return branch;
  const excerpt = textbookExcerpt(teach, chunks).slice(0, 220);
  const chapter = resolveChapter(attempt);
  const teachLine = excerpt;
  return {
    ...branch,
    textbook_excerpt: excerpt,
    chapter_id: chapter?.chapter_id || chunks[0].chapter_id || branch.chapter_id,
    topic_id: chapter?.topic_id || chunks[0].topic_id || branch.topic_id,
    key_concept_explain: branch.key_concept_explain || teachLine,
    farm_link: excerpt || branch.farm_link,
    textbook_grounded: true,
  };
}

export function catalogSize() {
  return {
    chapters: CURRICULUM_CHAPTERS.length,
    chunks: loadTextbookChunks().length,
  };
}
