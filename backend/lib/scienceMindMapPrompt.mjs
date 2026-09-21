/**
 * Frustration-aware Grok prompts. Facts from RAG; hierarchy from meaning.
 */

export const JSON_SCHEMA_HINT = `Return ONLY valid JSON:
{
  "status": "success" | "insufficient_context",
  "title": "string",
  "central_concept": "string",
  "summary": "string",
  "branches": [{"id":"branch-1","title":"string","relationship":"CATEGORY","points":[{"id":"point-1","text":"string","relationship":"EXAMPLE_OF","source":{"textbook":"string","chapter":"string","page":1,"chunk_id":"string"}}]}],
  "key_terms": [{"term":"string","meaning":"string"}],
  "examples": ["string"],
  "remember_this": ["string"],
  "one_sentence_summary": "string",
  "message": "string or null"
}`;

const BAND_COPY = {
  VERY_LOW:
    'Frustration is very low (0–20). Show a fuller hierarchy (up to 5 hubs, 4–5 children). Keep labels short. Normal educational tone.',
  LOW: 'Frustration is low (21–40). Clear hierarchy, up to 4 hubs, important relationships, short scientific labels.',
  MODERATE:
    'Frustration is moderate (41–60). Simpler hierarchy, 3–4 hubs, short labels, supportive tone.',
  HIGH: 'Frustration is high (61–80). Essential hubs only (max 3), 2–3 children each, very short labels, encouraging tone.',
  VERY_HIGH:
    'Frustration is very high (81–100). Learning-recovery map. Maximum 3 hubs and 2 children each. Short labels. Do NOT change facts — show fewer nodes only.',
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
    'You are an educational AI assistant helping a school student understand a textbook idea.',
    'You MUST ground every fact in the retrieved textbook content.',
    'Use the retrieved educational context as the factual source of truth.',
    'Do not treat every word in the question or student answer as a mind-map concept.',
    'Infer semantic relationships from the educational context and construct a meaningful hierarchy.',
    'Do not invent textbook facts, chapter names, page numbers, or citations.',
    'Do not introduce concepts that are not supported by the retrieved context.',
    '',
    'Internal process:',
    '1. Understand the question, the student answer, and the retrieved context.',
    '2. Name the educational topic (not the whole question) as central_concept.',
    '3. Extract concepts that are educational, relevant, and supported by the context.',
    '4. Identify relationships (IS_A, TYPE_OF, CATEGORY, EXAMPLE_OF, HAS_PROPERTY, CHARACTERISTIC, PART_OF, CAUSES, RESULT_OF, USED_FOR, FUNCTION, STEP, PROCESS, COMPARED_WITH, DIFFERENCE, SIMILARITY, FORMULA, DEFINITION, or OTHER).',
    '5. Group related ideas under hubs. Examples go under their category. Properties go under characteristics. Steps go under a process. Causes go under causes.',
    '6. Ignore instructions, commands, conversational filler, incomplete phrases, worksheet leftovers, and unrelated student-answer words.',
    '7. The student answer may show a misconception or a missing idea. It must never become a factual node unless the retrieved context supports that fact.',
    '8. Choose a hierarchy that fits THIS content (classification, process, cause/effect, comparison, parts, formula). Do not force the same four headings on every topic.',
    '9. Adjust how many nodes you show from the frustration score. The frustration score affects presentation complexity and tone, but must never change factual correctness.',
    '',
    'branch.title is a grouping or major concept (2–5 words). point.text is a child of that hub (1–6 words).',
    'Never use TRUE, FALSE, or curriculum IDs such as G7_C11_SOU_PRODUCE.',
    'Never truncate a node so it ends with the, of, through, by, a, or an.',
    'Never put an instruction such as "do the body shapes" on the map.',
    'Never promote a lone example or body part to a top-level hub when it belongs under a category.',
    'remember_this must be 2–4 short teaching steps, not raw leftovers.',
    'If textbook context is present, return status "success".',
    'Return status "insufficient_context" only when no textbook context was supplied.',
    JSON_SCHEMA_HINT,
  ].join('\n');
}

export function userPrompt({
  grade,
  question,
  studentAnswer = '',
  frustrationScore,
  frustrationLevel,
  context,
  retrievalQuery,
  subject = 'Science',
}) {
  return [
    `Grade:\n${grade}`,
    `Subject:\n${subject}`,
    `Student Question:\n${question}`,
    `Student Answer (misconception signal only — not a source of facts):\n${studentAnswer || '(none)'}`,
    `Internal retrieval query (do not show to the student):\n${retrievalQuery}`,
    `Frustration Score:\n${frustrationScore}`,
    `Frustration Level:\n${frustrationLevel}`,
    `Presentation guidance:\n${BAND_COPY[frustrationLevel] || BAND_COPY.MODERATE}`,
    'Retrieved Textbook Context (source of truth):\n' + context,
  ].join('\n\n');
}

export function repairPrompt(raw) {
  return `The previous response was not valid JSON for the mind-map schema. Convert it into the required JSON object only. Do not add new scientific facts. Keep a hierarchy: central concept, category hubs, related children. Drop instructions and ungrounded words.\n\n${String(raw).slice(0, 12000)}`;
}

export function formatContext(chunks = []) {
  return chunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}]\nchunk_id: ${chunk.chunk_id}\ntextbook: ${chunk.textbook}\ngrade: ${chunk.grade}\nchapter: ${chunk.chapter || 'unknown'}\npage: ${chunk.page ?? 'unknown'}\nrole: ${chunk.role}\ntext: ${chunk.text}`,
    )
    .join('\n\n');
}
