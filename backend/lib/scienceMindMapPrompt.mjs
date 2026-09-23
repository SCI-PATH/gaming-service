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
    'Frustration is very low (0–20). Write 3–4 clear sentences with the important scientific terms. Do not make it unnecessarily complicated.',
  LOW: 'Frustration is low (21–40). Write 2–3 clear sentences with the important scientific terms and one familiar example if the textbook has one.',
  MODERATE:
    'Frustration is moderate (41–60). Write 2 short sentences in simple language. Keep the important keywords.',
  HIGH: 'Frustration is high (61–80). Write 1–2 very short sentences in simple language. One idea at a time.',
  VERY_HIGH:
    'Frustration is very high (81–100). Write one short, gentle sentence. Simple vocabulary. Do NOT remove scientifically important facts — simplify presentation only.',
};

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
    'Explain why their answer was incorrect, then clearly explain the correct concept.',
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
