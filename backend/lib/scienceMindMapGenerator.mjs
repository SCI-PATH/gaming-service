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
import {
  extractRagKeywords,
  mindMapFromKeywords,
  snapMindMapToKeywords,
} from './ragKeywords.mjs';

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
    branches: mindMap.branches.slice(0, 3).map((b) => ({
      ...b,
      points: (b.points || []).slice(0, 3),
    })),
  };
}

/** Build a keyword map from Chroma hits when Grok cannot finish. */
export function mindMapFromChunks({ question, chunks = [], keywords, retrievalQuery } = {}) {
  return mindMapFromKeywords({ question, chunks, keywords, retrievalQuery });
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

  const ragKeywords = extractRagKeywords({
    keywords: retrieval.keywords,
    retrievalQuery: retrieval.retrieval_query,
    chunks: retrieval.chunks,
    question,
  });

  const successFrom = (mindMap, raw) => ({
    ok: true,
    status: 'success',
    message: null,
    mind_map: applyPresentationCap(mindMap, frustration.frustrationLevel),
    keywords: ragKeywords,
    sources: sourcesFromChunks(retrieval.chunks),
    grade,
    question,
    frustration,
    retrieval: {
      original_question: retrieval.original_question || question,
      retrieval_query: retrieval.retrieval_query,
      keywords: ragKeywords,
      enough: true,
      confidence: retrieval.confidence,
      used_cross_grade: Boolean(retrieval.used_cross_grade),
      collection_count: retrieval.collection_count,
    },
    provider: raw?.provider || 'chroma-extractive',
    model: raw?.model || 'chunks',
  });

  const fromChunks = () => {
    const extracted = mindMapFromChunks({
      question,
      chunks: retrieval.chunks,
      keywords: ragKeywords,
      retrievalQuery: retrieval.retrieval_query,
    });
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
      keywords: ragKeywords,
    });
    raw = await complete({ system, user, temperature: 0.2, maxTokens: 900 });
    parsed = snapMindMapToKeywords(validateMindMap(raw.content), ragKeywords);
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
