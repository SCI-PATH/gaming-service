/**
 * Save the current science mind map as a PNG (SVG fallback).
 * Draws the same concept-keyword trees shown in the Sage UI.
 */
import { layoutConceptTree } from './conceptGraph.js';

const COLORS = [
  { stroke: '#c45c5c', fill: '#fde8e8' },
  { stroke: '#3a7fb8', fill: '#dceefb' },
  { stroke: '#d4892a', fill: '#fff0d6' },
  { stroke: '#2f8a7a', fill: '#d8f3ee' },
  { stroke: '#7a5aa8', fill: '#efe8f8' },
  { stroke: '#5a6570', fill: '#e8ecef' },
];

const NODE_MIN_W = 132;
const NODE_MAX_W = 220;
const CHAR_W = 7.1;
const LINE_H = 13;
const NODE_PAD_X = 14;
const NODE_PAD_Y = 8;
const H_GAP = 18;
const V_GAP = 52;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function norm(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapLines(text, maxChars, maxLines = 80) {
  const words = norm(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const cap = Math.max(8, maxChars);
  const lines = [];
  let cur = '';
  const push = (line, more) => {
    lines.push(more ? `${line}…` : line);
  };
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= cap) {
      cur = next;
      continue;
    }
    if (cur) {
      const last = i < words.length;
      if (lines.length + 1 >= maxLines && last) {
        push(cur, true);
        return lines;
      }
      lines.push(cur);
      cur = word;
    } else {
      if (lines.length + 1 >= maxLines) {
        push(word, i < words.length - 1);
        return lines;
      }
      lines.push(word);
      cur = '';
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function stampName(title) {
  const slug = String(title || 'science-gaps')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const day = new Date().toISOString().slice(0, 10);
  return `${slug || 'science-gaps'}-mind-map-${day}`;
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function nodeStyle(kind) {
  if (kind === 'root') return { fill: '#e8f3ea', stroke: '#2f6a48', dash: '0' };
  if (kind === 'correct') return { fill: '#e7f6ec', stroke: '#2f8a5a', dash: '4 3' };
  if (kind === 'mixup') return { fill: '#fff4ea', stroke: '#b86b3a', dash: '4 3' };
  return { fill: '#f7faf6', stroke: '#5a6a58', dash: '4 3' };
}

function nodeBox(node) {
  const lines = wrapLines(norm(node?.label).toUpperCase(), 22, 5);
  const longest = Math.max(8, ...lines.map((line) => line.length));
  return {
    lines,
    w: Math.min(NODE_MAX_W, Math.max(NODE_MIN_W, longest * CHAR_W + NODE_PAD_X)),
    h: NODE_PAD_Y + Math.max(1, lines.length) * LINE_H + 6,
  };
}

function measureTree(node) {
  if (!node) return { node: null, kids: [], w: 0, h: 0, box: { lines: [], w: 0, h: 0 } };
  const box = nodeBox(node);
  const kids = (Array.isArray(node.children) ? node.children : []).map(measureTree);
  const kidsW = kids.reduce((sum, k, i) => sum + k.w + (i ? H_GAP : 0), 0);
  const w = Math.max(box.w, kidsW);
  const kidH = kids.length ? Math.max(...kids.map((k) => k.h)) : 0;
  return {
    node,
    kids,
    box,
    w,
    h: box.h + (kids.length ? V_GAP + kidH : 0),
  };
}

function drawMultiline(x, y, lines, size = 10) {
  const start = y + size;
  return `<text x="${x}" y="${start}" text-anchor="middle" font-family="Consolas, Cascadia Mono, ui-monospace, monospace" font-size="${size}" font-weight="800" fill="#1a2a20">${lines
    .map(
      (line, i) =>
        `<tspan x="${x}" ${i ? `dy="${LINE_H}"` : ''}>${esc(line)}</tspan>`,
    )
    .join('')}</text>`;
}

function drawTree(measured, originX, originY) {
  if (!measured?.node) return '';
  const kind = measured.node.kind || 'related';
  const style = nodeStyle(kind);
  const box = measured.box || nodeBox(measured.node);
  const nx = originX + measured.w / 2 - box.w / 2;
  const ny = originY;
  let svg = `<rect x="${nx}" y="${ny}" width="${box.w}" height="${box.h}" rx="6" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.6" stroke-dasharray="${style.dash}"/>`;
  svg += drawMultiline(nx + box.w / 2, ny + 4, box.lines);

  if (!measured.kids.length) return svg;
  const kidsW = measured.kids.reduce((sum, k, i) => sum + k.w + (i ? H_GAP : 0), 0);
  let kx = originX + (measured.w - kidsW) / 2;
  const ky = originY + box.h + V_GAP;
  const parentCx = originX + measured.w / 2;
  const parentBottom = ny + box.h;
  measured.kids.forEach((k) => {
    const childCx = kx + k.w / 2;
    svg += `<line x1="${parentCx}" y1="${parentBottom}" x2="${childCx}" y2="${ky}" stroke="#8aa08c" stroke-width="1.4" stroke-dasharray="4 4"/>`;
    if (k.node?.edge) {
      svg += `<text x="${(parentCx + childCx) / 2}" y="${(parentBottom + ky) / 2 + 3}" text-anchor="middle" font-family="Consolas, Cascadia Mono, ui-monospace, monospace" font-size="9" font-weight="700" fill="#6a8070">${esc(
        String(k.node.edge).toLowerCase(),
      )}</text>`;
    }
    svg += drawTree(k, kx, ky);
    kx += k.w + H_GAP;
  });
  return svg;
}

function branchGraph(b) {
  return b?.conceptGraph || b?.concept_graph || null;
}

function cardCopy(b, maxChars) {
  const graph = branchGraph(b);
  const blocks = [];
  const q = b.question || b.prompt || '';
  if (q) blocks.push({ label: 'Question', lines: wrapLines(q, maxChars, 4) });
  if (graph?.concept) {
    blocks.push({ label: 'Concept', lines: wrapLines(graph.concept, maxChars, 2) });
  }
  if (!graph?.nodes?.length) {
    if (b.keyConcept) blocks.push({ label: 'Key idea', lines: wrapLines(b.keyConcept, maxChars, 3) });
  }
  if (Array.isArray(graph?.learningPath) && graph.learningPath.length) {
    const lines = [];
    graph.learningPath.forEach((step, i) => {
      wrapLines(`${i + 1}. ${step}`, maxChars, 8).forEach((line) => lines.push(line));
    });
    if (lines.length) blocks.push({ label: 'Learning path', lines });
  }
  if (graph?.practice?.question) {
    blocks.push({ label: 'Try this', lines: wrapLines(graph.practice.question, maxChars, 4) });
  }
  return blocks;
}

function measureCard(b, maxChars, treePad) {
  const graph = branchGraph(b);
  const layout = graph?.nodes?.length ? layoutConceptTree(graph) : { tree: null, leftover: [] };
  const tree = layout.tree ? measureTree(layout.tree) : { w: 0, h: 0, kids: [], node: null };
  const leftoverH = layout.leftover?.length ? 56 : 0;
  const blocks = cardCopy(b, maxChars);
  const lineH = 17;
  let textH = 56;
  blocks.forEach((block) => {
    textH += 18 + block.lines.length * lineH + 8;
  });
  const treeW = tree.w + (tree.w ? treePad : 0);
  const treeH = tree.h + leftoverH + (tree.h ? 18 : 0);
  return {
    b,
    layout,
    tree,
    blocks,
    treeW,
    treeH,
    h: textH + treeH + 16,
  };
}

/**
 * Build the downloadable SVG. Exported for tests.
 */
export function buildMindMapSvg(map, branches) {
  const pageMin = 920;
  const margin = 28;
  const gap = 22;
  const treePad = 36;
  const title = map?.root || map?.title || map?.topic || 'Your Science Gaps';
  const summary =
    map?.summary ||
    map?.personalizedNote ||
    `Keyword concept map · ${branches.length} miss${branches.length === 1 ? '' : 'es'}`;

  const titleLines = wrapLines(title, 48, 3);
  const summaryLines = wrapLines(summary, 92, 4);
  const maxChars = 78;
  const measured = branches.map((b) => measureCard(b, maxChars, treePad));
  const treeMax = Math.max(0, ...measured.map((c) => c.treeW));
  const pageW = Math.max(pageMin, treeMax + margin * 2 + 24);
  const cardW = pageW - margin * 2;

  let y = margin + 22 + titleLines.length * 28 + 8 + summaryLines.length * 18 + 18;
  const bodyH = measured.reduce((sum, card) => sum + card.h + gap, 0);
  const pageH = y + bodyH + 36;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
  <rect width="100%" height="100%" fill="#f6edd4"/>
  <rect x="12" y="12" width="${pageW - 24}" height="${pageH - 24}" rx="18" fill="#fbf6e8" stroke="#c9b27a" stroke-width="2"/>
  <text x="${pageW / 2}" y="${margin + 14}" text-anchor="middle" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="11" font-weight="800" letter-spacing="1.4" fill="#6a5638">SCI-PATH MIND MAP · ${esc(
    String(branches.length),
  )} MISSED QUESTION${branches.length === 1 ? '' : 'S'}</text>`;

  let ty = margin + 44;
  titleLines.forEach((line) => {
    svg += `<text x="${pageW / 2}" y="${ty}" text-anchor="middle" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="26" font-weight="800" fill="#2a2418">${esc(
      line,
    )}</text>`;
    ty += 28;
  });
  summaryLines.forEach((line) => {
    svg += `<text x="${pageW / 2}" y="${ty}" text-anchor="middle" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="13" fill="#4a4030">${esc(
      line,
    )}</text>`;
    ty += 18;
  });
  ty += 12;

  let cardY = ty;
  measured.forEach((card) => {
    const x = margin;
    const color = COLORS[(card.b.colorIndex || 0) % COLORS.length] || COLORS[0];
    const { b, blocks, h, tree, layout } = card;
    svg += `<rect x="${x}" y="${cardY}" width="${cardW}" height="${h}" rx="14" fill="#fffdf7" stroke="${color.stroke}" stroke-width="2.5"/>`;
    svg += `<rect x="${x}" y="${cardY}" width="8" height="${h}" rx="4" fill="${color.stroke}"/>`;
    svg += `<text x="${x + 22}" y="${cardY + 24}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="12" font-weight="800" fill="${color.stroke}">MISS ${esc(
      String(b.index || ''),
    )}</text>`;
    svg += `<text x="${x + 22}" y="${cardY + 42}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="11" font-weight="700" letter-spacing="0.6" fill="#5a4e38">${esc(
      String(b.topic || card.b.conceptGraph?.concept || 'Science').toUpperCase(),
    )}</text>`;

    let by = cardY + 56;
    const lineH = 17;
    blocks.forEach((block) => {
      if (block.label === 'Question' || block.label === 'Concept') {
        svg += `<text x="${x + 22}" y="${by + 12}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="10" font-weight="800" letter-spacing="0.5" fill="#6a5638">${esc(
          block.label.toUpperCase(),
        )}</text>`;
        block.lines.forEach((line, li) => {
          svg += `<text x="${x + 22}" y="${by + 30 + li * lineH}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="13" fill="#1f1c12">${esc(
            line,
          )}</text>`;
        });
        by += 20 + block.lines.length * lineH + 6;
      }
    });

    if (tree.node) {
      const treeX = x + Math.max(18, (cardW - tree.w) / 2);
      svg += drawTree(tree, treeX, by);
      by += tree.h + 8;
      if (layout.leftover?.length) {
        let lx = x + 22;
        let ly = by;
        layout.leftover.forEach((n) => {
          const st = nodeStyle(n.kind || 'related');
          const box = nodeBox(n);
          if (lx + box.w > x + cardW - 18) {
            lx = x + 22;
            ly += box.h + 8;
          }
          svg += `<rect x="${lx}" y="${ly}" width="${box.w}" height="${box.h}" rx="5" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1.4" stroke-dasharray="${st.dash}"/>`;
          svg += drawMultiline(lx + box.w / 2, ly + 3, box.lines, 10);
          lx += box.w + 8;
        });
        by = ly + 40;
      }
    }

    blocks.forEach((block) => {
      if (block.label === 'Question' || block.label === 'Concept') return;
      svg += `<text x="${x + 22}" y="${by + 12}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="10" font-weight="800" letter-spacing="0.5" fill="#6a5638">${esc(
        block.label.toUpperCase(),
      )}</text>`;
      block.lines.forEach((line, li) => {
        svg += `<text x="${x + 22}" y="${by + 30 + li * lineH}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="13" fill="#1f1c12">${esc(
          line,
        )}</text>`;
      });
      by += 20 + block.lines.length * lineH + 8;
    });

    cardY += h + gap;
  });

  svg += `<text x="${pageW / 2}" y="${pageH - 22}" text-anchor="middle" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="11" fill="#6a5638">Saved ${esc(
    new Date().toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  )} · Sci-Path</text>
</svg>`;
  return { svg, width: pageW, height: pageH, filename: stampName(title) };
}

function svgToPngBlob(svg, width, height) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const maxDim = 16000;
      const scale = Math.min(2, maxDim / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.fillStyle = '#f6edd4';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (png) => {
          if (!png) {
            reject(new Error('Could not create image'));
            return;
          }
          resolve(png);
        },
        'image/png',
        0.95,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not draw mind map'));
    };
    img.src = url;
  });
}

export async function downloadMindMap(map, branches = []) {
  const list = Array.isArray(branches) ? branches : [];
  if (!list.length) {
    throw new Error('Nothing to download yet');
  }
  const { svg, width, height, filename } = buildMindMapSvg(map || {}, list);
  try {
    const png = await svgToPngBlob(svg, width, height);
    triggerDownload(png, `${filename}.png`);
  } catch {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(blob, `${filename}.svg`);
  }
}
