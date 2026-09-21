/**
 * Radial keyword mind map — same Sports-style shape for every Science question.
 * Centre + coloured hubs + short keyword leaves.
 */
import {
  displayConceptName,
  isIncompleteLabel,
  isPolarityLabel,
  keywordLabel,
} from './conceptMapQuality.js';

export const HUB_PALETTE = [
  { fill: '#f5a623', text: '#ffffff' },
  { fill: '#1f9d58', text: '#ffffff' },
  { fill: '#f5a623', text: '#ffffff' },
  { fill: '#1f9d58', text: '#ffffff' },
  { fill: '#2f8a7a', text: '#ffffff' },
];

export const LEAF_PALETTE = [
  { fill: '#ffffff', stroke: '#c5cdd6', text: '#2a333c' },
  { fill: '#d5f5e3', stroke: '#8fd4ae', text: '#1a3a2a' },
  { fill: '#fdeee4', stroke: '#e8b48a', text: '#3a2418' },
  { fill: '#ffffff', stroke: '#c5cdd6', text: '#2a333c' },
];

const CENTER = { fill: '#4d7cfe', text: '#ffffff' };

function compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function asKeyword(text) {
  const raw = compact(text);
  if (!raw || isPolarityLabel(raw) || isIncompleteLabel(raw)) return '';
  const words = raw.split(/\s+/);
  if (words.length <= 4) return raw;
  return keywordLabel(raw, 4);
}

function uniqueKeywords(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const lab = asKeyword(item);
    if (!lab) continue;
    const key = lab.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lab);
  }
  return out;
}

function sharedCenter(map, branches) {
  if (branches.length === 1) {
    const b = branches[0];
    const named = displayConceptName({
      topic: b.topic,
      question: b.question || b.prompt,
      correctAnswer: b.correctAnswer,
    });
    const short = asKeyword(named || b.topic || map?.root);
    if (short) return short;
  }
  const topics = uniqueKeywords(branches.map((b) => b.topic));
  if (topics.length === 1) return topics[0];
  const blob = branches.map((b) => `${b.topic || ''} ${b.question || b.prompt || ''}`).join(' ');
  if (/rock|mineral|weathering|igneous|sedimentary|metamorphic|limestone/i.test(blob)) {
    return 'Rocks';
  }
  if (/plant|photo|leaf|flower|seed|monocot|dicot|chlorophyll/i.test(blob)) return 'Plants';
  if (/sound|vibrat/i.test(blob)) return 'Sound';
  if (/electric|circuit|current|charge|capacitor/i.test(blob)) return 'Electricity';
  if (/water cycle|evaporat|condens/i.test(blob)) return 'Water Cycle';
  const root = asKeyword(String(map?.root || map?.title || '').split('·')[0]);
  return root || 'Science';
}

function hubsFromPedagogy(branch, index) {
  const groups = Array.isArray(branch.pedagogy) ? branch.pedagogy : [];
  return groups
    .map((group, i) => ({
      id: `${branch.id || `b${index}`}-hub-${i}`,
      branchId: branch.id,
      label: asKeyword(group.title) || asKeyword(branch.topic),
      children: uniqueKeywords(group.children || []).slice(0, 5),
    }))
    .filter((hub) => hub.label);
}

function hubsFromGraph(branch, index) {
  const graph = branch.conceptGraph || branch.concept_graph;
  const nodes = (graph?.nodes || []).filter(
    (n) => n.kind !== 'mixup' && n.kind !== 'root',
  );
  const keys = nodes.filter((n) => n.kind === 'correct' || n.importance === 'key');
  const related = nodes.filter((n) => !keys.includes(n));
  if (keys.length >= 2) {
    return keys.slice(0, 5).map((kn, i) => {
      const childIds = new Set(
        (graph.relationships || []).filter((r) => r.from === kn.id).map((r) => r.to),
      );
      const kids = uniqueKeywords(
        nodes.filter((n) => childIds.has(n.id)).map((n) => n.label),
      );
      return {
        id: `${branch.id || `b${index}`}-g-${i}`,
        branchId: branch.id,
        label: asKeyword(kn.label),
        children: (kids.length ? kids : uniqueKeywords(related.map((n) => n.label))).slice(0, 5),
      };
    }).filter((hub) => hub.label);
  }
  const children = uniqueKeywords(nodes.map((n) => n.label)).slice(0, 5);
  const label = asKeyword(branch.topic || graph?.concept);
  if (!label) return [];
  return [
    {
      id: `${branch.id || `b${index}`}-g`,
      branchId: branch.id,
      label,
      children,
    },
  ];
}

export function toRadialModel(map, branches = []) {
  const list = Array.isArray(branches) && branches.length ? branches : map?.branches || [];
  const center = sharedCenter(map || {}, list);
  const hubs = [];
  for (const [i, branch] of list.entries()) {
    const fromPed = hubsFromPedagogy(branch, i);
    if (fromPed.length) {
      hubs.push(...fromPed);
      continue;
    }
    hubs.push(...hubsFromGraph(branch, i));
  }
  const seen = new Set();
  const unique = [];
  for (const hub of hubs) {
    const key = hub.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...hub,
      children: hub.children.filter((c) => c.toLowerCase() !== key && c.toLowerCase() !== center.toLowerCase()),
    });
    if (unique.length >= 5) break;
  }
  return {
    center,
    hubs: unique.filter((h) => h.label),
  };
}

function wrapCircle(text, maxChars = 13, maxLines = 2) {
  const words = compact(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = word;
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  else if (cur && lines.length) {
    lines[lines.length - 1] = `${String(lines[lines.length - 1]).replace(/\s+\S*$/, '')}`.trim() || lines[lines.length - 1];
  }
  return lines.slice(0, maxLines);
}

function clamp(x, y, r, width, height, pad = 10) {
  return {
    x: Math.min(width - r - pad, Math.max(r + pad, x)),
    y: Math.min(height - r - pad, Math.max(r + pad, y)),
  };
}

export function layoutRadialMap(model, { width = 920, height = 640 } = {}) {
  const cx = width / 2;
  const cy = height / 2 + 6;
  const hubsIn = Array.isArray(model?.hubs) ? model.hubs : [];
  const hubCount = Math.max(1, hubsIn.length);
  const hubRadius = hubCount <= 4 ? 168 : 148;
  const leafRadius = hubCount <= 4 ? 276 : 250;
  const start = -Math.PI * 0.75;
  const hubs = hubsIn.map((hub, i) => {
    const angle = start + (i * 2 * Math.PI) / hubCount;
    const hubPos = clamp(
      cx + hubRadius * Math.cos(angle),
      cy + hubRadius * Math.sin(angle),
      46,
      width,
      height,
    );
    const kids = hub.children || [];
    const spread = kids.length <= 1 ? 0 : Math.min(1.2, 0.4 * kids.length);
    const children = kids.map((label, j) => {
      const a =
        angle - spread / 2 + (kids.length === 1 ? 0 : (j * spread) / (Math.max(1, kids.length - 1)));
      const extra = 18 + (j % 2) * 14;
      const pos = clamp(
        cx + (leafRadius + extra) * Math.cos(a),
        cy + (leafRadius + extra) * Math.sin(a),
        32,
        width,
        height,
      );
      return {
        id: `leaf-${i}-${j}`,
        label,
        x: pos.x,
        y: pos.y,
        r: 30,
        color: LEAF_PALETTE[j % LEAF_PALETTE.length],
        lines: wrapCircle(label, 12, 2),
      };
    });
    return {
      id: hub.id || `hub-${i}`,
      branchId: hub.branchId,
      label: hub.label,
      x: hubPos.x,
      y: hubPos.y,
      r: 44,
      color: HUB_PALETTE[i % HUB_PALETTE.length],
      lines: wrapCircle(hub.label, 14, 2),
      children,
    };
  });
  return {
    width,
    height,
    cx,
    cy,
    center: {
      label: model?.center || 'Science',
      r: 56,
      color: CENTER,
      lines: wrapCircle(model?.center || 'Science', 12, 2),
    },
    hubs,
  };
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function svgText(x, y, lines, size, fill) {
  const start = y - ((lines.length - 1) * (size + 2)) / 2 + size / 3;
  return `<text x="${x}" y="${start}" text-anchor="middle" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="${size}" font-weight="700" fill="${fill}">${lines
    .map(
      (line, i) =>
        `<tspan x="${x}" ${i ? `dy="${size + 2}"` : ''}>${esc(line)}</tspan>`,
    )
    .join('')}</text>`;
}

export function buildRadialSvg(model, { title } = {}) {
  const layout = layoutRadialMap(model, { width: 980, height: 700 });
  const { width, height, cx, cy, center, hubs } = layout;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>`;
  for (const hub of hubs) {
    svg += `<line x1="${cx}" y1="${cy}" x2="${hub.x}" y2="${hub.y}" stroke="#c5cdd6" stroke-width="2.4"/>`;
    for (const leaf of hub.children) {
      svg += `<line x1="${hub.x}" y1="${hub.y}" x2="${leaf.x}" y2="${leaf.y}" stroke="#c5cdd6" stroke-width="1.8"/>`;
    }
  }
  for (const hub of hubs) {
    for (const leaf of hub.children) {
      svg += `<circle cx="${leaf.x}" cy="${leaf.y}" r="${leaf.r}" fill="${leaf.color.fill}" stroke="${leaf.color.stroke}" stroke-width="2"/>`;
      svg += svgText(leaf.x, leaf.y, leaf.lines, 11, leaf.color.text);
    }
    svg += `<circle cx="${hub.x}" cy="${hub.y}" r="${hub.r}" fill="${hub.color.fill}" stroke="${hub.color.fill}" stroke-width="1"/>`;
    svg += svgText(hub.x, hub.y, hub.lines, 13, hub.color.text);
  }
  svg += `<circle cx="${cx}" cy="${cy}" r="${center.r}" fill="${center.color.fill}"/>`;
  svg += svgText(cx, cy, center.lines, 16, center.color.text);
  svg += `</svg>`;
  const slug = String(title || center.label || 'science')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const day = new Date().toISOString().slice(0, 10);
  return {
    svg,
    width,
    height,
    filename: `${slug || 'science'}-mind-map-${day}`,
    layout,
  };
}
