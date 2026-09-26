/**
 * Student miss → grade-filtered Chroma RAG → existing frustration → Grok → short paragraph.
 * Frustration changes presentation only. Facts come from retrieved textbook chunks.
 */
import { queryChunks } from './chromaService.mjs';
import { resolveChapter } from './curriculumChapters.mjs';
import { grokJson } from './grokMindMap.mjs';
import {
  answerKeywords,
  ensureExplanationTeachesAnswer,
  formatContext,
  isNonExplanation,
  plainParagraph,
  presentationBand,
  systemPrompt,
  userPrompt,
  validateExplanation,
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

function paragraphLimit(band) {
  if (band === 'VERY_HIGH') return 140;
  if (band === 'HIGH') return 220;
  if (band === 'MODERATE') return 320;
  return 480;
}

function conceptSummaryFor(correctAnswer, chunks = [], concept = '') {
  const keywords = answerKeywords(correctAnswer);
  for (const chunk of chunks) {
    const sentences = String(chunk?.text || '').split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const clean = sentence.replace(/\s+/g, ' ').trim();
      if (clean.length < 24) continue;
      if (keywords.some((token) => clean.toLowerCase().includes(token))) {
        return clipSentence(clean, 90).replace(/[.!?]+$/, '');
      }
    }
  }
  const title = String(concept || '').replace(/\s+/g, ' ').trim();
  if (title && !/^science$/i.test(title) && title.toLowerCase() !== String(correctAnswer || '').toLowerCase()) {
    return title;
  }
  return '';
}

/** Keep the sentence that teaches the answer when the frustration cap is short. */
function clipPreferringAnswer(text, limit, correctAnswer) {
  const sentences = String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences.length) return '';
  const teaches = (sentence) => validateExplanation(sentence, correctAnswer).ok;
  const ordered = [
    ...sentences.filter(teaches),
    ...sentences.filter((sentence) => !teaches(sentence)),
  ];
  let out = '';
  for (const sentence of ordered) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length <= limit) out = next;
    else break;
  }
  if (out) return out;
  return clipSentence(ordered[0], limit);
}

function applyPresentationCap(mindMap, band, { correctAnswer = '', chunks = [] } = {}) {
  if (!mindMap || mindMap.status !== 'success') return mindMap;
  const raw = plainParagraph(mindMap.paragraph || mindMap.summary);
  const taught = ensureExplanationTeachesAnswer(
    raw,
    correctAnswer,
    conceptSummaryFor(correctAnswer, chunks, mindMap.central_concept || mindMap.title),
  );
  const paragraph = clipPreferringAnswer(
    taught.paragraph,
    paragraphLimit(band),
    correctAnswer,
  );
  return {
    ...mindMap,
    paragraph,
    summary: paragraph,
    one_sentence_summary: clipSentence(mindMap.one_sentence_summary || paragraph, 180),
    branches: [],
    explanation_repaired: taught.repaired,
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
  if (/_{2,}|\[\s*_{0,4}\s*\]/.test(s)) return false;
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

/** Build a textbook paragraph from Chroma hits when Grok cannot finish. */
export function mindMapFromChunks({ question, chunks = [], correctAnswer = '' } = {}) {
  const pool = (chunks || []).filter((chunk) => String(chunk.text || '').trim());
  if (!pool.length) return null;
  const qTerms = new Set(keywords(question));
  const answerTerms = new Set(answerKeywords(correctAnswer));
  const scored = [];
  for (const chunk of pool.slice(0, 8)) {
    const sentences = String(chunk.text)
      .replace(/Science\s*\|\s*[A-Za-z ]+\s*\d+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((row) => row.replace(/^[²•\-\u2022]\s*/u, '').replace(/\s+/g, ' ').trim())
      .filter(isUsableSentence);
    for (const sentence of sentences) {
      const terms = keywords(sentence);
      let answerHits = 0;
      let questionHits = 0;
      for (const term of terms) {
        if (answerTerms.has(term)) answerHits += 1;
        else if (qTerms.has(term)) questionHits += 1;
      }
      const overlap = answerHits * 3 + questionHits;
      scored.push({ sentence, chunk, overlap, answerHits });
    }
  }
  scored.sort((a, b) => b.answerHits - a.answerHits || b.overlap - a.overlap || a.sentence.length - b.sentence.length);
  const seen = new Set();
  const picked = [];
  for (const row of scored) {
    const key = row.sentence.toLowerCase().slice(0, 56);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(row);
    if (picked.length >= 2) break;
  }
  if (!picked.length) return null;
  const paragraph = picked.map((row) => clipSentence(row.sentence, 180)).join(' ');
  const title = pool[0]?.chapter || clipSentence(question, 48) || 'Science';
  return {
    status: 'success',
    title,
    central_concept: title,
    paragraph,
    summary: paragraph,
    branches: [],
    key_terms: [],
    examples: [],
    remember_this: [],
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
  const studentAnswer = clipQuestion(body.studentAnswer || body.student_answer || '');
  const correctAnswer = clipQuestion(body.correctAnswer || body.correct_answer || hint);
  const chapter = resolveChapter({
    grade,
    chapter_id: body.chapter_id || body.chapterId,
    topic_id: body.topic_id || body.topicId,
    chapter: body.chapter || body.chapter_name,
    chapter_name: body.chapter_name,
    topic: body.topic,
  });
  const chapterId = String(chapter?.chapter_id || body.chapter_id || body.chapterId || '').trim();
  const topicId = String(chapter?.topic_id || body.topic_id || body.topicId || '').trim();
  const retrievalQuestion =
    hint && !question.toLowerCase().includes(hint.toLowerCase().slice(0, 24))
      ? `${question} ${hint}`
      : question;

  let retrieval;
  try {
    retrieval = await query({
      grade,
      question: retrievalQuestion,
      ...(correctAnswer ? { correct_answer: correctAnswer } : {}),
      top_k: Math.max(4, Math.min(12, Number(body.top_k) || 8)),
      ...(chapterId ? { chapter_id: chapterId } : {}),
      ...(topicId ? { topic_id: topicId } : {}),
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
    mind_map: applyPresentationCap(mindMap, frustration.frustrationLevel, {
      correctAnswer,
      chunks: retrieval.chunks,
    }),
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
    const extracted = mindMapFromChunks({
      question,
      chunks: retrieval.chunks,
      correctAnswer,
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
      studentAnswer,
      correctAnswer,
      frustrationScore: frustration.frustrationScore,
      frustrationLevel: frustration.frustrationLevel,
      context,
      retrievalQuery: retrieval.retrieval_query,
    });
    raw = await complete({ system, user, temperature: 0.2, maxTokens: 400 });
    parsed = validateMindMap(raw.content);
    const taught = ensureExplanationTeachesAnswer(
      parsed?.paragraph,
      correctAnswer,
      conceptSummaryFor(correctAnswer, retrieval.chunks, parsed?.central_concept),
    );
    parsed = {
      ...parsed,
      paragraph: taught.paragraph,
      summary: taught.paragraph,
    };
    if (isNonExplanation(parsed.paragraph, { question, correctAnswer })) {
      throw new Error('model repeated the question');
    }
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
