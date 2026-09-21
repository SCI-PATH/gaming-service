/**
 * Student question → grade-filtered Chroma RAG → existing frustration → Grok → mind map.
 * Frustration changes presentation only. Facts come from retrieved textbook chunks.
 */
import { queryChunks } from './chromaService.mjs';
import { grokJson } from './grokMindMap.mjs';
import {
  formatContext,
  presentationBand,
  systemPrompt,
  userPrompt,
} from './scienceMindMapPrompt.mjs';
import { validateMindMap } from './scienceMindMapValidator.mjs';

const GRADES = new Set([6, 7, 8, 9]);

const INSUFFICIENT_MESSAGE =
  'I could not find enough matching Science textbook content for this question. Try a more specific Science topic from your Grade 6–9 textbook.';

function clipQuestion(raw) {
  return String(raw || '').trim().slice(0, 500);
}

function sourcesFromChunks(chunks = []) {
  return chunks.map((chunk) => ({
    textbook: chunk.textbook,
    chapter: chunk.chapter || '',
    page: chunk.page ?? null,
    chunk_id: chunk.chunk_id,
    role: chunk.role || 'primary',
    score: Number(chunk.hybrid_score || 0),
    excerpt: String(chunk.text || '').slice(0, 240),
  }));
}

export async function readExistingFrustration(studentId) {
  const fallback = {
    frustrationScore: 50,
    frustrationLevel: 'MODERATE',
    storedLevel: null,
    missing: true,
    recordedAt: null,
  };
  const id = String(studentId || '').trim();
  if (!id) return fallback;
  try {
    const eng = await import('./engagementDb.mjs');
    if (!eng.engagementAvailable()) return fallback;
    const result = await eng.getFrustration({ studentId: id, limit: 1 });
    const score = Number(result.frustrationScore);
    if (!Number.isFinite(score)) return fallback;
    return {
      frustrationScore: Math.max(0, Math.min(100, score)),
      frustrationLevel: presentationBand(score),
      storedLevel: result.frustrationLevel || null,
      missing: false,
      recordedAt: result.recordedAt || null,
    };
  } catch {
    return fallback;
  }
}

function insufficientPayload({ question, grade, frustration, retrieval, message }) {
  return {
    ok: true,
    status: 'insufficient_context',
    message: message || INSUFFICIENT_MESSAGE,
    mind_map: null,
    sources: sourcesFromChunks(retrieval?.chunks || []),
    grade,
    question,
    frustration,
    retrieval: {
      original_question: retrieval?.original_question || question,
      retrieval_query: retrieval?.retrieval_query || question,
      enough: false,
      confidence: retrieval?.confidence || 0,
      used_cross_grade: Boolean(retrieval?.used_cross_grade),
      collection_count: retrieval?.collection_count || 0,
    },
  };
}

function applyPresentationCap(mindMap, band) {
  if (!mindMap || mindMap.status !== 'success') return mindMap;
  if (band !== 'VERY_HIGH') return mindMap;
  return {
    ...mindMap,
    branches: mindMap.branches.slice(0, 5),
  };
}

function clipSentence(text, n = 160) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`;
}

function isUsableSentence(sentence) {
  const s = String(sentence || '').replace(/\s+/g, ' ').trim();
  if (s.length < 28 || s.length > 220) return false;
  if (/science\s*\|/i.test(s)) return false;
  if (/\d+Science\s*\|/i.test(s)) return false;
  if (/^(activity|assignment|assingnment|figure|table|exercise|tabulate)\b/i.test(s)) return false;
  if (/^[²•\-\u2022]/u.test(s) && s.length < 50) return false;
  return true;
}

function keywords(text) {
  return String(text || '')
    .toLowerCase()
    .match(/[a-z]{4,}/g) || [];
}

function branchTitle(sentence, fallback) {
  const cleaned = String(sentence || '')
    .replace(/^[²•\-\u2022]\s*/u, '')
    .replace(/^[A-Z0-9 |]+Science\s*\|?\s*/i, '');
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 6);
  return clipSentence(words.join(' '), 36) || fallback;
}

/** Build a textbook map from Chroma hits when Grok cannot finish. */
export function mindMapFromChunks({ question, chunks = [] } = {}) {
  const pool = (chunks || []).filter((chunk) => String(chunk.text || '').trim());
  if (!pool.length) return null;
  const qTerms = new Set(keywords(question));
  const scored = [];
  for (const chunk of pool.slice(0, 8)) {
    const sentences = String(chunk.text)
      .replace(/Science\s*\|\s*[A-Za-z ]+\s*\d+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((row) => row.replace(/^[²•\-\u2022]\s*/u, '').replace(/\s+/g, ' ').trim())
      .filter(isUsableSentence);
    for (const sentence of sentences) {
      const terms = keywords(sentence);
      let overlap = terms.reduce((n, term) => n + (qTerms.has(term) ? 1 : 0), 0);
      if (/photosynthes|chlorophyll|monocot|dicot|cotyledon|leaf|leaves|root|stem/.test(sentence.toLowerCase())) {
        overlap += 2;
      }
      scored.push({ sentence, chunk, overlap });
    }
  }
  scored.sort((a, b) => b.overlap - a.overlap || a.sentence.length - b.sentence.length);
  const seen = new Set();
  const picked = [];
  for (const row of scored) {
    const key = row.sentence.toLowerCase().slice(0, 56);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(row);
    if (picked.length >= 6) break;
  }
  if (!picked.length) {
    picked.push({
      sentence: clipSentence(pool[0].text, 160),
      chunk: pool[0],
      overlap: 1,
    });
  }
  const title = pool[0]?.chapter || clipSentence(question, 48) || 'Science';
  const branches = [];
  for (let i = 0; i < picked.length; i += 2) {
    const group = picked.slice(i, i + 2);
    branches.push({
      id: `branch-${branches.length + 1}`,
      title: branchTitle(group[0].sentence, `${title} ${branches.length + 1}`),
      points: group.map((row, j) => ({
        id: `point-${branches.length + 1}-${j + 1}`,
        text: clipSentence(row.sentence, 160),
        source: {
          textbook: row.chunk.textbook || '',
          chapter: row.chunk.chapter || '',
          page: row.chunk.page ?? null,
          chunk_id: row.chunk.chunk_id,
        },
      })),
    });
  }
  return {
    status: 'success',
    title,
    central_concept: title,
    summary: `Facts from ${pool[0]?.textbook || 'the Science textbook'}${
      pool[0]?.chapter ? ` · ${pool[0].chapter}` : ''
    }.`,
    branches,
    key_terms: [],
    examples: [],
    remember_this: picked.slice(0, 3).map((row) => clipSentence(row.sentence, 120)),
    one_sentence_summary: clipSentence(picked[0].sentence, 160),
  };
}

export async function generateScienceMindMap(body = {}, deps = {}) {
  const query = deps.queryChunks || queryChunks;
  const complete = deps.grokJson || grokJson;
  const readFrustration = deps.readExistingFrustration || readExistingFrustration;

  const grade = Number(body.grade);
  const question = clipQuestion(body.question);
  const studentId = String(body.studentId || '').trim();

  if (!GRADES.has(grade)) {
    const err = new Error('Choose Grade 6, 7, 8, or 9.');
    err.statusCode = 400;
    throw err;
  }
  if (!question) {
    const err = new Error('Enter a Science question.');
    err.statusCode = 400;
    throw err;
  }

  const frustration = await readFrustration(studentId);
  const hint = clipQuestion(body.hint || body.correctAnswer || '');
  const retrievalQuestion =
    hint && !question.toLowerCase().includes(hint.toLowerCase().slice(0, 24))
      ? `${question} ${hint}`
      : question;

  let retrieval;
  try {
    retrieval = await query({
      grade,
      question: retrievalQuestion,
      top_k: Math.max(4, Math.min(12, Number(body.top_k) || 8)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return insufficientPayload({
      question,
      grade,
      frustration,
      retrieval: { original_question: question, retrieval_query: question, chunks: [], collection_count: 0 },
      message: /python|chroma|worker/i.test(message)
        ? 'Textbook search is not ready yet. Ask a teacher to ingest the Grade 6–9 Science textbooks into ChromaDB.'
        : INSUFFICIENT_MESSAGE,
    });
  }

  if (!retrieval?.enough || !Array.isArray(retrieval.chunks) || retrieval.chunks.length === 0) {
    return insufficientPayload({ question, grade, frustration, retrieval });
  }

  const successFrom = (mindMap, raw) => ({
    ok: true,
    status: 'success',
    message: null,
    mind_map: applyPresentationCap(mindMap, frustration.frustrationLevel),
    sources: sourcesFromChunks(retrieval.chunks),
    grade,
    question,
    frustration,
    retrieval: {
      original_question: retrieval.original_question || question,
      retrieval_query: retrieval.retrieval_query,
      enough: true,
      confidence: retrieval.confidence,
      used_cross_grade: Boolean(retrieval.used_cross_grade),
      collection_count: retrieval.collection_count,
    },
    provider: raw?.provider || 'chroma-extractive',
    model: raw?.model || 'chunks',
  });

  const fromChunks = () => {
    const extracted = mindMapFromChunks({ question, chunks: retrieval.chunks });
    return extracted ? successFrom(extracted, { provider: 'chroma-extractive', model: 'chunks' }) : null;
  };

  let parsed;
  let raw;
  try {
    const context = formatContext(retrieval.chunks);
    const system = systemPrompt();
    const user = userPrompt({
      grade,
      question,
      frustrationScore: frustration.frustrationScore,
      frustrationLevel: frustration.frustrationLevel,
      context,
      retrievalQuery: retrieval.retrieval_query,
    });
    raw = await complete({ system, user, temperature: 0.2, maxTokens: 900 });
    parsed = validateMindMap(raw.content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[mind-map] Grok failed after Chroma retrieval; using textbook chunks (${message})`);
    const fallback = fromChunks();
    if (fallback) return fallback;
    const out = new Error(message || 'Mind map generation failed');
    out.statusCode = err?.retryable ? 503 : 502;
    out.retryable = Boolean(err?.retryable);
    throw out;
  }

  if (parsed.status === 'insufficient_context') {
    const fallback = fromChunks();
    if (fallback) {
      console.warn('[mind-map] model claimed insufficient_context despite Chroma hits; using textbook chunks');
      return fallback;
    }
    return {
      ...insufficientPayload({
        question,
        grade,
        frustration,
        retrieval,
        message: parsed.message || INSUFFICIENT_MESSAGE,
      }),
      provider: raw.provider,
      model: raw.model,
    };
  }

  return successFrom(parsed, raw);
}
