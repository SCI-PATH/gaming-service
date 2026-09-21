/**
 * Frustration-aware Grok prompts. Facts come only from retrieved textbook chunks.
 */

export const JSON_SCHEMA_HINT = `Return ONLY valid JSON:
{
  "status": "success" | "insufficient_context",
  "title": "string",
  "central_concept": "string",
  "summary": "string",
  "branches": [{"id":"branch-1","title":"string","points":[{"id":"point-1","text":"string","source":{"textbook":"string","chapter":"string","page":1,"chunk_id":"string"}}]}],
  "key_terms": [{"term":"string","meaning":"string"}],
  "examples": ["string"],
  "remember_this": ["string"],
  "one_sentence_summary": "string",
  "message": "string or null"
}`;

const BAND_COPY = {
  VERY_LOW:
    'Frustration is very low (0–20). Detailed mind map, more relationships, scientific terminology, extra supporting concepts, a few clear examples. Do not make it unnecessarily complicated.',
  LOW: 'Frustration is low (21–40). Reasonably detailed map, clear hierarchy, important scientific terms, supporting examples.',
  MODERATE:
    'Frustration is moderate (41–60). Simplified language, fewer branches, short explanations, important keywords, one or two examples, clear hierarchy.',
  HIGH: 'Frustration is high (61–80). Very simple language, short phrases, fewer branches, step-by-step relationships, familiar examples, minimal extra terminology.',
  VERY_HIGH:
    'Frustration is very high (81–100). Highly simplified learning-recovery map. Maximum 3–5 major branches. Very short phrases, simple vocabulary, one concept at a time, basic examples, Remember this, and In one sentence. Do NOT remove scientifically important facts — simplify presentation only.',
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
    'Adapt the complexity according to the student frustration score.',
    'Generate a structured mind map rather than a long essay.',
    'Student-facing labels must be complete science phrases (2–6 words).',
    'Never use curriculum IDs such as G7_C11_SOU_PRODUCE.',
    'Never truncate a node so it ends with the, of, through, by, a, or an.',
    'remember_this must be 2–4 short teaching steps, not raw textbook leftovers.',
    'If textbook context is present, you MUST return status "success" and use those facts.',
    'Return status "insufficient_context" only when no textbook context was supplied.',
    'Frustration changes presentation only. It must not change the scientific facts.',
    JSON_SCHEMA_HINT,
  ].join('\n');
}

export function userPrompt({
  grade,
  question,
  frustrationScore,
  frustrationLevel,
  context,
  retrievalQuery,
}) {
  return [
    `Grade:\n${grade}`,
    'Subject:\nScience',
    `Student Question:\n${question}`,
    `Internal retrieval query (do not show to the student):\n${retrievalQuery}`,
    `Frustration Score:\n${frustrationScore}`,
    `Frustration Level:\n${frustrationLevel}`,
    `Presentation guidance:\n${BAND_COPY[frustrationLevel] || BAND_COPY.MODERATE}`,
    `Retrieved Textbook Context:\n${context}`,
  ].join('\n\n');
}

export function repairPrompt(raw) {
  return `The previous response was not valid JSON for the mind-map schema. Convert it into the required JSON object only. Do not add new scientific facts.\n\n${String(raw).slice(0, 12000)}`;
}

export function formatContext(chunks = []) {
  return chunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}]\nchunk_id: ${chunk.chunk_id}\ntextbook: ${chunk.textbook}\ngrade: ${chunk.grade}\nchapter: ${chunk.chapter || 'unknown'}\npage: ${chunk.page ?? 'unknown'}\nrole: ${chunk.role}\ntext: ${chunk.text}`,
    )
    .join('\n\n');
}
