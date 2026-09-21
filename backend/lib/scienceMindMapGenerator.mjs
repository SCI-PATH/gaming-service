/**
 * Student question → grade-filtered Chroma RAG → existing frustration → Grok → mind map.
 * Frustration changes presentation only. Facts come from retrieved textbook chunks.
 */
import { queryChunks } from './chromaService.mjs';
import { grokJson } from './grokMindMap.mjs';
import {
  formatContext,
  presentationBand,
  repairPrompt,
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

  let retrieval;
  try {
    retrieval = await query({
      grade,
      question,
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
    raw = await complete({ system, user, temperature: 0.2, maxTokens: 1800 });
    try {
      parsed = validateMindMap(raw.content);
    } catch {
      raw = await complete({
        system,
        user: repairPrompt(raw.content),
        temperature: 0,
        maxTokens: 1800,
      });
      parsed = validateMindMap(raw.content);
    }
  } catch (err) {
    const retryable = Boolean(err?.retryable);
    const out = new Error(err instanceof Error ? err.message : 'Mind map generation failed');
    out.statusCode = retryable ? 503 : 502;
    out.retryable = retryable;
    throw out;
  }

  if (parsed.status === 'insufficient_context') {
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

  const mindMap = applyPresentationCap(parsed, frustration.frustrationLevel);
  return {
    ok: true,
    status: 'success',
    message: null,
    mind_map: mindMap,
    sources: sourcesFromChunks(retrieval.chunks),
    grade,
    question,
    frustration,
    retrieval: {
      original_question: retrieval.original_question,
      retrieval_query: retrieval.retrieval_query,
      enough: true,
      confidence: retrieval.confidence,
      used_cross_grade: Boolean(retrieval.used_cross_grade),
      collection_count: retrieval.collection_count,
    },
    provider: raw.provider,
    model: raw.model,
  };
}
