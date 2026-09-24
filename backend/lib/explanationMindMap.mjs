/**
 * Second step after an explanation already exists.
 * Reads that text and asks Grok only for a mind-map hierarchy.
 * Does not retrieve textbooks or rewrite the explanation.
 */
import { grokJson } from './grokMindMap.mjs';
import {
  normalizeMindMapTree,
  parseExplanationToTree,
  renderMindMapSvg,
  treeToMermaid,
} from './explanationMindMapFormat.mjs';

const SYSTEM = `You turn one finished science explanation into a mind map.
Use only ideas that are already in the explanation or the question.
Do not add facts, do not rewrite the lesson, and do not mention that you are an AI.
Return JSON only:
{
  "root": "core concept in 2 to 5 words",
  "nodes": [
    {
      "label": "topic in 2 to 6 words",
      "children": [{ "label": "sub concept in 2 to 6 words" }]
    }
  ]
}
Use 2 to 5 topics. Each topic has 0 to 3 children. Short noun phrases. No markdown.`;

function clip(value, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function readJsonContent(content) {
  const text = String(content || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function pack(tree, source, explanation, question, concept) {
  const mermaid = treeToMermaid(tree);
  return {
    explanation,
    question,
    concept: concept || tree.label,
    tree,
    mermaid,
    svg: renderMindMapSvg(tree),
    source,
  };
}

/**
 * @param {string} explanation_text Already generated explanation.
 * @param {string} [question_text] Original question.
 * @param {string} [correct_concept] Correct concept or topic name.
 */
export async function generate_mindmap_data(
  explanation_text,
  question_text = '',
  correct_concept = '',
  deps = {},
) {
  const explanation = clip(explanation_text);
  const question = clip(question_text, 400);
  const concept = clip(correct_concept, 80);
  if (!explanation) {
    const err = new Error('An explanation is required before a mind map can be built.');
    err.statusCode = 400;
    throw err;
  }

  const complete = deps.grokJson || grokJson;
  try {
    const result = await complete({
      system: SYSTEM,
      user: [
        concept ? `Correct concept: ${concept}` : '',
        question ? `Original question: ${question}` : '',
        `Explanation:\n${explanation}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      temperature: 0.1,
      maxTokens: 700,
    });
    const tree = normalizeMindMapTree(readJsonContent(result?.content), concept);
    if (tree) return pack(tree, result?.provider || 'grok', explanation, question, concept);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[explanation-mindmap] hierarchy model skipped: ${message}`);
  }

  const tree = parseExplanationToTree(explanation, question, concept);
  return pack(tree, 'parsed', explanation, question, concept);
}

export async function generateExplanationMindMaps(body = {}, deps = {}) {
  const items = Array.isArray(body.items) && body.items.length
    ? body.items
    : [
        {
          explanation: body.explanation_text || body.explanation,
          question: body.question_text || body.question,
          concept: body.correct_concept || body.concept || body.topic,
        },
      ];
  const maps = [];
  for (const item of items.slice(0, 6)) {
    const explanation = clip(item?.explanation || item?.explanation_text || '');
    if (!explanation) continue;
    maps.push(
      await generate_mindmap_data(
        explanation,
        item.question || item.question_text || '',
        item.concept || item.correct_concept || item.topic || '',
        deps,
      ),
    );
  }
  if (!maps.length) {
    const err = new Error('An explanation is required before a mind map can be built.');
    err.statusCode = 400;
    throw err;
  }
  return maps;
}
