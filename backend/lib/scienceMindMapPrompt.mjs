/**
 * Frustration-aware Grok prompts. Facts come only from retrieved textbook chunks.
 * Output is a short paragraph per miss — not a mind map.
 */

export const JSON_SCHEMA_HINT = `Return ONLY valid JSON:
{
  "status": "success" | "insufficient_context",
  "title": "string",
  "central_concept": "string",
  "paragraph": "string",
  "message": "string or null"
}`;

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
    'You are an educational AI assistant helping a Sri Lankan school student understand Science.',
    'The supplied textbook context is the primary factual source.',
    'You MUST ground the answer in the retrieved textbook content.',
    'Do not invent textbook facts.',
    'Do not invent chapter names or page numbers.',
    'Do not fabricate citations.',
    'Do not introduce unrelated concepts.',
    'Do not generate a mind map, branches, bullet lists, or a diagram.',
    'Write one short paragraph that teaches the idea the student missed.',
    'Use the student answer only to notice the mix-up. Never treat the student answer as a textbook fact.',
    'Adapt the complexity according to the student frustration score.',
    'If textbook context is present, you MUST return status "success" and use those facts.',
    'Return status "insufficient_context" only when no textbook context was supplied.',
    'Frustration changes presentation only. It must not change the scientific facts.',
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
    `Student Question:\n${question}`,
    `Student answer (may be wrong — do not treat as a fact):\n${studentAnswer || '(none)'}`,
    `Engine correct answer (teach this idea, do not copy it if the textbook says more):\n${correctAnswer || '(none)'}`,
    `Internal retrieval query (do not show to the student):\n${retrievalQuery}`,
    `Frustration Score:\n${frustrationScore}`,
    `Frustration Level:\n${frustrationLevel}`,
    `Presentation guidance:\n${BAND_COPY[frustrationLevel] || BAND_COPY.MODERATE}`,
    `Retrieved Textbook Context:\n${context}`,
  ].join('\n\n');
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
