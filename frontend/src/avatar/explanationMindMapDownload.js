/**
 * Download the explanation already on screen as a mind map.
 * The explanation text is not regenerated here.
 */
import {
  parseExplanationToTree,
  renderMindMapHtml,
  renderMindMapSvg,
  treeToMermaid,
} from '../../../backend/lib/explanationMindMapFormat.mjs';

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const link = a;
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function fileStamp() {
  const day = new Date().toISOString().slice(0, 10);
  return `science-explanation-mind-map-${day}`;
}

function localMaps(branches) {
  return branches
    .map((branch) => {
      const explanation = String(branch.keyExplain || branch.key_concept_explain || '').trim();
      if (!explanation) return null;
      const question = String(branch.question || branch.prompt || '').trim();
      const concept = String(branch.topic || branch.label || '').trim();
      const correctAnswer = String(
        branch.correctAnswer || branch.correct_answer || concept,
      ).trim();
      const tree = parseExplanationToTree(explanation, question, concept, correctAnswer);
      return {
        explanation,
        question,
        concept: concept || tree.label,
        tree,
        mermaid: treeToMermaid(tree),
        svg: renderMindMapSvg(tree),
        source: 'parsed',
      };
    })
    .filter(Boolean);
}

async function fetchMindMaps(items) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch('/api/explanation-mindmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false || !Array.isArray(data.maps) || !data.maps.length) {
      throw new Error(data?.error || 'Mind map export unavailable');
    }
    return data.maps;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Save one HTML file: drawn mind map, Mermaid source, and JSON.
 * Uses the on-screen explanation. A separate request only extracts the hierarchy.
 */
export async function downloadExplanationMindMap(branches = []) {
  const list = (Array.isArray(branches) ? branches : []).filter((branch) =>
    String(branch?.keyExplain || branch?.key_concept_explain || '').trim(),
  );
  if (!list.length) {
    throw new Error('Nothing to download yet');
  }
  const items = list.map((branch) => ({
    explanation: branch.keyExplain || branch.key_concept_explain,
    question: branch.question || branch.prompt || '',
    concept: branch.topic || branch.label || '',
    correct_answer: branch.correctAnswer || branch.correct_answer || '',
  }));
  let maps = null;
  try {
    maps = await fetchMindMaps(items);
  } catch {
    maps = localMaps(list);
  }
  const html = renderMindMapHtml(maps);
  triggerDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), `${fileStamp()}.html`);
  return maps;
}
