/**
 * Save the current science mind map as a PNG (SVG fallback).
 */

const COLORS = [
  { stroke: '#c45c5c', fill: '#fde8e8' },
  { stroke: '#3a7fb8', fill: '#dceefb' },
  { stroke: '#d4892a', fill: '#fff0d6' },
  { stroke: '#2f8a7a', fill: '#d8f3ee' },
  { stroke: '#7a5aa8', fill: '#efe8f8' },
  { stroke: '#5a6570', fill: '#e8ecef' },
];

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLines(text, maxChars, maxLines = 6) {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return ['—'];
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
      if (lines.length >= maxLines) {
        cur = '';
        break;
      }
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const full = words.join(' ');
  const shown = lines.join(' ');
  if (full.length > shown.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.replace(/\s+\S+$/, last).slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines;
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

function buildMindMapSvg(map, branches) {
  const cols = branches.length <= 1 ? 1 : 2;
  const pageW = cols === 1 ? 760 : 1100;
  const margin = 28;
  const gap = 16;
  const innerW = pageW - margin * 2;
  const cardW = cols === 1 ? innerW : (innerW - gap) / 2;
  const lineH = 18;
  const title = map?.root || map?.title || map?.topic || 'Your Science Gaps';
  const summary =
    map?.summary ||
    map?.personalizedNote ||
    `One card per missed question · ${branches.length} miss${
      branches.length === 1 ? '' : 'es'
    }`;

  const titleLines = wrapLines(title, 42, 2);
  const summaryLines = wrapLines(summary, 88, 3);
  let y = margin;
  y += 22;
  y += titleLines.length * 28 + 8;
  y += summaryLines.length * 18 + 18;

  const cards = branches.map((b) => {
    const color = COLORS[b.colorIndex % COLORS.length] || COLORS[0];
    const question = wrapLines(b.question || '—', 46, 5);
    const pick = wrapLines(b.studentAnswer || '—', 46, 3);
    const correct = wrapLines(b.correctAnswer || '—', 46, 3);
    const key = wrapLines(b.keyConcept || '', 46, 3);
    const why = wrapLines(b.why || b.keyExplain || '', 46, 4);
    const blocks = [
      { label: 'Question', lines: question },
      { label: 'Your pick', lines: pick, tone: 'bad' },
      { label: 'Correct', lines: correct, tone: 'ok' },
    ];
    if (b.keyConcept) blocks.push({ label: 'Key idea', lines: key });
    if (b.why || b.keyExplain) blocks.push({ label: 'Why', lines: why });
    let h = 52;
    blocks.forEach((block) => {
      h += 16 + block.lines.length * lineH + 10;
    });
    h += 12;
    return { b, color, blocks, h };
  });

  const rows = [];
  for (let i = 0; i < cards.length; i += cols) {
    rows.push(cards.slice(i, i + cols));
  }
  const rowHeights = rows.map((row) =>
    Math.max(...row.map((card) => card.h)),
  );
  const bodyH = rowHeights.reduce((sum, h) => sum + h + gap, 0);
  const pageH = y + bodyH + 40;

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
  ty += 10;

  let rowY = ty;
  rows.forEach((row, rowIndex) => {
    const rowH = rowHeights[rowIndex];
    row.forEach((card, col) => {
      const x = margin + col * (cardW + gap);
      const { color, b, blocks } = card;
      svg += `<rect x="${x}" y="${rowY}" width="${cardW}" height="${rowH}" rx="14" fill="#fffdf7" stroke="${color.stroke}" stroke-width="2.5"/>`;
      svg += `<rect x="${x}" y="${rowY}" width="8" height="${rowH}" rx="4" fill="${color.stroke}"/>`;
      svg += `<text x="${x + 22}" y="${rowY + 24}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="12" font-weight="800" fill="${color.stroke}">MISS ${esc(
        String(b.index),
      )}</text>`;
      svg += `<text x="${x + 22}" y="${rowY + 42}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="11" font-weight="700" letter-spacing="0.6" fill="#5a4e38">${esc(
        String(b.topic || 'Science').toUpperCase(),
      )}</text>`;
      let by = rowY + 56;
      blocks.forEach((block) => {
        const fill =
          block.tone === 'bad'
            ? '#fde8e8'
            : block.tone === 'ok'
              ? '#e4f6ea'
              : '#fff';
        const blockH = 18 + block.lines.length * lineH;
        svg += `<rect x="${x + 16}" y="${by}" width="${cardW - 32}" height="${blockH}" rx="8" fill="${fill}" stroke="rgba(40,50,60,0.12)"/>`;
        svg += `<text x="${x + 26}" y="${by + 14}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="10" font-weight="800" letter-spacing="0.5" fill="#6a5638">${esc(
          block.label.toUpperCase(),
        )}</text>`;
        block.lines.forEach((line, li) => {
          svg += `<text x="${x + 26}" y="${by + 32 + li * lineH}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="13" fill="#1f1c12">${esc(
            line,
          )}</text>`;
        });
        by += blockH + 8;
      });
    });
    rowY += rowH + gap;
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
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
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
