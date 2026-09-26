/**
 * Feedback prompts for a missed Science question.
 * Facts come only from chapter-filtered textbook chunks.
 * The student-facing field is one plain paragraph.
 */

export const JSON_SCHEMA_HINT = `Return ONLY valid JSON:
{
  "status": "success" | "insufficient_context",
  "title": "string",
  "central_concept": "string",
  "paragraph": "string",
  "message": "string or null"
}
The paragraph value must be one plain-text paragraph. No markdown, no preamble, no bullet list.`;

const BAND_COPY = {
  VERY_LOW:
    'Frustration is very low (0–20). Write 3–4 clear sentences. Sentence 1 states the correct answer and why it is right. Later sentences may add an example. Do not make it unnecessarily complicated.',
  LOW: 'Frustration is low (21–40). Write 2–3 clear sentences. Sentence 1 states the correct answer and why it is right, with the important scientific terms.',
  MODERATE:
    'Frustration is moderate (41–60). Write 2 short sentences. Sentence 1 states the correct answer and why it is right. Sentence 2 may say why the other answer does not fit.',
  HIGH: 'Frustration is high (61–80). Write 1–2 very short sentences. Sentence 1 must state the correct answer and why it is right. Do not use sentence 1 on the wrong answer.',
  VERY_HIGH:
    'Frustration is very high (81–100). Write one short, gentle sentence that states the correct answer and why it is right. Do NOT remove scientifically important facts — simplify presentation only.',
};

const ANSWER_STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'from',
  'by', 'is', 'are', 'was', 'were', 'be', 'that', 'this', 'it', 'its', 'as',
  'at', 'into', 'than', 'then', 'when', 'what', 'which', 'who', 'how', 'does',
  'do', 'did', 'can', 'could', 'would', 'should',
]);

/** Content words from the answer key. True and false are kept. */
export function answerKeywords(correctAnswer) {
  const tokens = String(correctAnswer || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(tokens.filter((token) => (
    token === 'true' || token === 'false' || (token.length > 2 && !ANSWER_STOP.has(token))
  )))];
}

/**
 * True when the paragraph teaches the keyed answer.
 * A keyword overlap or a small token similarity is enough.
 */
export function validateExplanation(generatedText, correctAnswer) {
  const text = String(generatedText || '');
  const keywords = answerKeywords(correctAnswer);
  if (!keywords.length) return { ok: true, keywords, coverage: 1, similarity: 1 };
  const lowered = text.toLowerCase();
  const key = keywords.join(' ');
  if (/^(true|false)$/.test(key)) {
    const ok = key === 'true'
      ? /\b(true|correct)\b/i.test(text)
      : /\b(false|not correct|incorrect)\b/i.test(text);
    return { ok, keywords, coverage: ok ? 1 : 0, similarity: ok ? 1 : 0 };
  }
  const hits = keywords.filter((token) => new RegExp(`\\b${token}\\b`, 'i').test(lowered));
  const coverage = hits.length / keywords.length;
  const explanationTerms = answerKeywords(text);
  const union = new Set([...explanationTerms, ...keywords]).size || 1;
  const similarity = hits.length / union;
  const ok = coverage >= 0.5 || similarity >= 0.34;
  return { ok, keywords, coverage, similarity };
}

export function ensureExplanationTeachesAnswer(text, correctAnswer, conceptSummary = '') {
  const paragraph = plainParagraph(text);
  const answer = String(correctAnswer || '').replace(/\s+/g, ' ').trim();
  const check = validateExplanation(paragraph, answer);
  if (!answer || check.ok) {
    return { paragraph, valid: check.ok, repaired: false };
  }
  const because = String(conceptSummary || '').replace(/\s+/g, ' ').trim()
    || 'that is the scientific idea this question is checking';
  const closing = `The correct answer is ${answer} because ${because}.`;
  return {
    paragraph: paragraph ? `${paragraph} ${closing}` : closing,
    valid: true,
    repaired: true,
  };
}

export function presentationBand(score) {
  const n = Math.max(0, Math.min(100, Number(score) || 0));
  if (n <= 20) return 'VERY_LOW';
  if (n <= 40) return 'LOW';
  if (n <= 60) return 'MODERATE';
  if (n <= 80) return 'HIGH';
  return 'VERY_HIGH';
}

export function systemPrompt() {
  return [
    'You are an educational AI assistant helping a school student who answered a Science question incorrectly.',
    'Tone: encouraging, supportive, and educational. Never scold or embarrass the student.',
    'Write a single explanatory feedback paragraph.',
    'Sentence 1 must state the correct answer and explain the correct concept: why it is scientifically correct.',
    'Sentence 2 may briefly explain why their answer was incorrect or incomplete.',
    'The paragraph MUST explicitly mention the key terms from the correct answer.',
    'If only one sentence is allowed, that sentence is the correct answer and why it is right.',
    'Do not repeat the question. Do not copy fill-in blanks. Do not reply with only the answer words.',
    'Use ONLY the provided textbook context for scientific facts.',
    'Do not invent textbook facts, chapter names, page numbers, or citations.',
    'Do not introduce concepts that are not in the textbook context.',
    'Do not treat the student answer as a fact.',
    'Do not generate a mind map, headings, bullet lists, or markdown.',
    'Do not add a preamble such as "Sure", "Here is", or "Incorrect:".',
    'The paragraph itself is plain text.',
    'Adapt sentence length according to the student frustration score. Frustration changes presentation only. It must not change the scientific facts.',
    'If textbook context is present, you MUST return status "success" and use those facts.',
    'Return status "insufficient_context" only when no textbook context was supplied.',
    JSON_SCHEMA_HINT,
  ].join('\n');
}

export function userPrompt({
  grade,
  question,
  studentAnswer,
  correctAnswer,
  frustrationScore,
  frustrationLevel,
  context,
  retrievalQuery,
}) {
  return [
    `Grade:\n${grade}`,
    'Subject:\nScience',
    `Original question:\n${question}`,
    `Student's incorrect answer:\n${studentAnswer || '(none)'}`,
    `Correct answer:\n${correctAnswer || '(none)'}`,
    `Internal retrieval query (do not show to the student):\n${retrievalQuery}`,
    `Frustration Score:\n${frustrationScore}`,
    `Frustration Level:\n${frustrationLevel}`,
    `Presentation guidance:\n${BAND_COPY[frustrationLevel] || BAND_COPY.MODERATE}`,
    'Textbook context (the only source of scientific facts):\n' +
      `${context || '(none)'}`,
  ].join('\n\n');
}

function normalizeAnswer(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[|·•]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the text is the question, a worksheet blank, or only the answer key. */
export function isNonExplanation(text, { question = '', correctAnswer = '' } = {}) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return true;
  if (/_{2,}|\[\s*_{0,4}\s*\]/.test(raw)) return true;
  const body = normalizeAnswer(raw);
  const key = normalizeAnswer(correctAnswer);
  if (key && (body === key || (key.length >= 8 && body.includes(key) && body.length < key.length + 20))) {
    return true;
  }
  const stem = String(question || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (stem.length >= 24 && raw.toLowerCase().includes(stem.slice(0, 48))) return true;
  return false;
}

/** Collapse model clutter so the student sees one plain paragraph. */
export function plainParagraph(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  text = text.replace(/```(?:\w+)?/g, ' ');
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s*[-*•]\s+/gm, '');
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/__(.*?)__/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  const preamble =
    /^(sure[,!]?\s+|of course[,!]?\s+|here(?:'s| is)(?:\s+\w+){0,8}[:.]?\s+|incorrect[:.]\s+)/i;
  let previous = '';
  while (text && previous !== text) {
    previous = text;
    text = text.replace(preamble, '').trim();
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function repairPrompt(raw) {
  return `The previous response was not valid JSON for the paragraph schema. Convert it into the required JSON object only. Do not add new scientific facts.\n\n${String(raw).slice(0, 12000)}`;
}

export function formatContext(chunks = []) {
  return chunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}]\nchunk_id: ${chunk.chunk_id}\ntextbook: ${chunk.textbook}\ngrade: ${chunk.grade}\nchapter: ${chunk.chapter || 'unknown'}\npage: ${chunk.page ?? 'unknown'}\nrole: ${chunk.role}\ntext: ${chunk.text}`,
    )
    .join('\n\n');
}
