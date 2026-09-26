/**
 * Turn an already-written explanation into a mind-map tree, Mermaid, and a
 * downloadable page. This file does not call a model or read textbooks.
 */
import { validateExplanation } from './scienceMindMapPrompt.mjs';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** Mermaid mindmap nodes break on parentheses, fences, and colons. */
export function mindMapLabel(value, maxWords = 6) {
  const words = clean(value)
    .replace(/[()[\]{}#"`]/g, '')
    .replace(/[:]/g, ' -')
    .replace(/[^\w\s'+.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, maxWords);
  const text = words.join(' ').slice(0, 48).trim();
  return text || 'Science idea';
}

function node(label, children = []) {
  return { label: mindMapLabel(label), children };
}

/**
 * Local hierarchy when the model is not used.
 * Root is the correct concept. Each explanation sentence becomes a branch.
 */
export function ensureAnswerBranch(tree, correctAnswer = '') {
  if (!tree?.children?.length) return tree;
  const concept = clean(correctAnswer);
  if (!concept) return tree;
  const blob = tree.children
    .map((child) => {
      const nested = (child.children || []).map((item) => item.label).join(' ');
      return `${child.label} ${nested}`;
    })
    .join(' ');
  if (validateExplanation(blob, concept).ok) return tree;
  const label = mindMapLabel(concept, 6);
  if (!label || label === 'Science idea') return tree;
  return {
    ...tree,
    children: [{ label, children: [] }, ...tree.children].slice(0, 5),
  };
}

export function parseExplanationToTree(explanationText, questionText = '', correctConcept = '', correctAnswer = '') {
  const explanation = clean(explanationText);
  const question = clean(questionText);
  const concept = clean(correctConcept);
  const root = mindMapLabel(concept || firstWords(explanation, 4) || 'Science idea', 5);
  const sentences = explanation
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => clean(sentence))
    .filter((sentence) => sentence.length > 24)
    .slice(0, 5);

  const children = sentences.map((sentence) => {
    const called = sentence.match(/\b(?:is|are)\s+(?:called|known as)\s+([^.]{3,48})/i);
    const parts = sentence
      .replace(/[.!?]+$/g, '')
      .split(/\s+(?:when|because|so|and)\s+|,\s+/i)
      .map((part) => clean(part))
      .filter((part) => part.length > 8);
    const head = parts[0] || sentence;
    const kids = [];
    if (called?.[1]) kids.push(node(called[1]));
    for (const part of parts.slice(1, 3)) {
      const label = mindMapLabel(part);
      if (label.toLowerCase() === mindMapLabel(head).toLowerCase()) continue;
      if (kids.some((kid) => kid.label.toLowerCase() === label.toLowerCase())) continue;
      kids.push(node(part));
    }
    return node(head, kids.slice(0, 3));
  });

  if (!children.length && question) {
    children.push(node(question));
  }
  if (!children.length) {
    children.push(node(explanation || 'Key idea'));
  }
  return ensureAnswerBranch({ label: root, children }, correctAnswer || correctConcept);
}

function firstWords(text, count) {
  return clean(text).split(' ').slice(0, count).join(' ');
}

export function normalizeMindMapTree(raw, fallbackConcept = '') {
  const source = raw?.tree || raw?.mindmap || raw || {};
  const rootLabel = mindMapLabel(
    source.root || source.label || source.title || fallbackConcept || 'Science idea',
    5,
  );
  const list = source.nodes || source.children || source.topics || [];
  const children = (Array.isArray(list) ? list : [])
    .slice(0, 6)
    .map((item) => normalizeChild(item))
    .filter(Boolean);
  if (!children.length) return null;
  return { label: rootLabel, children };
}

function normalizeChild(item) {
  if (!item) return null;
  if (typeof item === 'string') return node(item);
  const label = mindMapLabel(item.label || item.title || item.name || item.text || '');
  const nested = item.children || item.nodes || item.topics || [];
  const children = (Array.isArray(nested) ? nested : [])
    .slice(0, 4)
    .map((child) => {
      if (!child) return null;
      if (typeof child === 'string') return node(child);
      return node(child.label || child.title || child.name || child.text || '');
    })
    .filter((child) => child && child.label && child.label !== 'Science idea');
  if (!label || label === 'Science idea') return null;
  return { label, children };
}

export function treeToMermaid(tree) {
  const root = mindMapLabel(tree?.label || 'Science idea', 5);
  const lines = ['mindmap', `  root((${root}))`];
  const walk = (items, depth) => {
    const indent = '  '.repeat(depth);
    for (const item of items || []) {
      const label = mindMapLabel(item?.label || '');
      if (!label) continue;
      lines.push(`${indent}${label}`);
      if (depth < 3 && item.children?.length) walk(item.children, depth + 1);
    }
  };
  walk(tree?.children || [], 2);
  return `${lines.join('\n')}\n`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layoutNode(item, depth, top) {
  const children = item.children || [];
  if (!children.length) {
    return { item, depth, top, height: 44, mid: top + 22, children: [] };
  }
  let cursor = top;
  const placed = children.map((child) => {
    const box = layoutNode(child, depth + 1, cursor);
    cursor += box.height + 12;
    return box;
  });
  const height = Math.max(44, cursor - top - 12);
  return {
    item,
    depth,
    top,
    height,
    mid: top + height / 2,
    children: placed,
  };
}

function svgText(label, x, y) {
  return `<text x="${x}" y="${y}" fill="#243028" font-size="13" font-family="Segoe UI, Trebuchet MS, sans-serif">${escapeHtml(label)}</text>`;
}

/** One mind map drawn left to right. */
export function renderMindMapSvg(tree) {
  const laid = layoutNode(tree || { label: 'Science idea', children: [] }, 0, 16);
  const width = 760;
  const height = Math.max(120, laid.height + 32);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#f6edd4"/>`,
  ];
  const draw = (box) => {
    const x = 24 + box.depth * 210;
    const y = box.mid - 16;
    const w = Math.min(190, 24 + String(box.item.label || '').length * 7);
    parts.push(
      `<rect x="${x}" y="${y}" rx="14" ry="14" width="${w}" height="32" fill="${box.depth ? '#fffaf0' : '#e7f6ec'}" stroke="${box.depth ? '#8a7048' : '#2f6a48'}" stroke-width="2"/>`,
    );
    parts.push(svgText(box.item.label, x + 12, y + 21));
    for (const child of box.children) {
      const cx = 24 + child.depth * 210;
      parts.push(
        `<path d="M ${x + w} ${box.mid} C ${x + w + 28} ${box.mid}, ${cx - 28} ${child.mid}, ${cx} ${child.mid}" fill="none" stroke="#8a7048" stroke-width="1.5"/>`,
      );
      draw(child);
    }
  };
  draw(laid);
  parts.push('</svg>');
  return parts.join('');
}

export function renderMindMapHtml(maps = []) {
  const sections = maps
    .map((map) => {
      const title = escapeHtml(map.concept || map.tree?.label || 'Science idea');
      const question = map.question ? `<p class="q">${escapeHtml(map.question)}</p>` : '';
      return `<section>
        <h2>${title}</h2>
        ${question}
        ${map.svg || renderMindMapSvg(map.tree)}
      </section>`;
    })
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Science explanation mind map</title>
  <style>
    body { margin: 0; padding: 24px; background: #f6edd4; color: #243028; font-family: "Segoe UI", "Trebuchet MS", sans-serif; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    h2 { font-size: 1.05rem; margin: 0 0 6px; }
    section { background: #fffaf0; border: 2px solid #2a3220; border-radius: 16px; padding: 16px; margin: 16px 0; }
    .q { margin: 0 0 12px; color: #5c6b76; font-size: 0.9rem; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <h1>Science explanation mind map</h1>
  ${sections}
</body>
</html>
`;
}
