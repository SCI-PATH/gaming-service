/**
 * Frustration-aware Grok prompts. Node labels come from RAG keywords.
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
    'Frustration is very low (0–20). Radial keyword map with 4–5 hubs and 4–5 keywords each. Keep every node 1–4 words.',
  LOW: 'Frustration is low (21–40). Radial keyword map, 4 hubs, 3–5 keywords each, short scientific terms.',
  MODERATE:
    'Frustration is moderate (41–60). Radial keyword map, 3–4 hubs, 3–4 keywords each, simple terms.',
  HIGH: 'Frustration is high (61–80). Radial keyword map, 3 hubs, 3 keywords each, very short familiar words.',
  VERY_HIGH:
    'Frustration is very high (81–100). Learning-recovery radial map. Maximum 3 hubs. 2–3 keyword children each. Do NOT remove scientifically important keywords — show fewer nodes only.',
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
    'The mind map MUST be a radial keyword map: one centre node, 3–5 coloured branch hubs, and 3–5 short keyword children on each hub (the same shape for every Science question).',
    'central_concept and every point.text MUST be copied from the allowed keywords list. Do not invent new terms.',
    'branch.title is a short 2–4 word grouping name (like Individual Sports / Team Sports), not a sentence.',
    'Every node is 1–4 words. Never write a sentence on a node. Never use TRUE, FALSE, or curriculum IDs such as G7_C11_SOU_PRODUCE.',
    'Never truncate a node so it ends with the, of, through, by, a, or an.',
    'remember_this must be 2–4 short teaching steps, not raw textbook leftovers.',
    'If textbook context is present, you MUST return status "success" and use those facts.',
    'Return status "insufficient_context" only when no textbook context was supplied.',
    'Frustration changes presentation only. It must not change the scientific facts.',
    JSON_SCHEMA_HINT,
  ].join('\n');
}

function formatKeywordList(keywords = []) {
  const list = (keywords || []).map((k) => String(k).trim()).filter(Boolean);
  if (!list.length) return '(none — use short terms copied from the textbook context)';
  return list.map((k) => `- ${k}`).join('\n');
}

export function userPrompt({
  grade,
  question,
  frustrationScore,
  frustrationLevel,
  context,
  retrievalQuery,
  keywords = [],
}) {
  return [
    `Grade:\n${grade}`,
    'Subject:\nScience',
    `Student Question:\n${question}`,
    `Internal retrieval query (do not show to the student):\n${retrievalQuery}`,
    'Allowed mind-map keywords (copy these onto nodes; do not invent new terms; do not write sentences on nodes):',
    formatKeywordList(keywords),
    `Frustration Score:\n${frustrationScore}`,
    `Frustration Level:\n${frustrationLevel}`,
    `Presentation guidance:\n${BAND_COPY[frustrationLevel] || BAND_COPY.MODERATE}`,
    `Retrieved Textbook Context:\n${context}`,
  ].join('\n\n');
}

export function repairPrompt(raw) {
  return `The previous response was not valid JSON for the mind-map schema. Convert it into the required JSON object only. Do not add new scientific facts. Keep node labels as 1–4 word keywords from the allowed list.\n\n${String(raw).slice(0, 12000)}`;
}

export function formatContext(chunks = []) {
  return chunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}]\nchunk_id: ${chunk.chunk_id}\ntextbook: ${chunk.textbook}\ngrade: ${chunk.grade}\nchapter: ${chunk.chapter || 'unknown'}\npage: ${chunk.page ?? 'unknown'}\nrole: ${chunk.role}\ntext: ${chunk.text}`,
    )
    .join('\n\n');
}
