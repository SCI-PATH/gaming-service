/**
 * Save the current science mind map as a PNG (SVG fallback).
 * Includes the full miss: question, choices, and SAGE's scientific teaching.
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

function norm(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapLines(text, maxChars, maxLines = 80) {
  const words = norm(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = '';
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    const word = words[i];
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
      i += 1;
    } else if (word.length > maxChars && !cur) {
      lines.push(word.slice(0, maxChars - 1));
      words[i] = word.slice(maxChars - 1);
    } else {
      cur = next;
      i += 1;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (i < words.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines;
}

function choiceText(opt) {
  if (opt == null) return '';
  if (typeof opt === 'string') return norm(opt);
  return norm(opt.text || opt.label || opt.value || opt.option || '');
}

function sameChoice(a, b) {
  const x = choiceText(a)
    .replace(/^\(?[A-Da-d]\)?[.)]\s+/, '')
    .toLowerCase();
  const y = choiceText(b)
    .replace(/^\(?[A-Da-d]\)?[.)]\s+/, '')
    .toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 8 && y.length >= 8 && (x.includes(y) || y.includes(x))) return true;
  return false;
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

function pushBlock(blocks, label, text, tone, maxChars) {
  const lines = wrapLines(text, maxChars);
  if (!lines.length) return;
  blocks.push({ label, lines, tone: tone || '' });
}

function cardBlocks(b, maxChars) {
  const blocks = [];
  const lesson = b.lesson || {};
  const student = lesson.studentAnswer || {};
  const correct = lesson.correctAnswer || {};
  const cmp = lesson.comparisonFields || lesson.scientificComparison || {};

  pushBlock(blocks, 'Question', b.question || b.prompt || '—', '', maxChars);

  const options = Array.isArray(b.options) ? b.options.map(choiceText).filter(Boolean) : [];
  if (options.length) {
    const lines = [];
    options.forEach((text, i) => {
      const letter = String.fromCharCode(65 + i);
      const yours = sameChoice(text, b.studentAnswer) ? '  · your pick' : '';
      const ok = sameChoice(text, b.correctAnswer) ? '  · correct' : '';
      wrapLines(`${letter}. ${text}${yours}${ok}`, maxChars).forEach((line) => lines.push(line));
    });
    if (lines.length) blocks.push({ label: 'Choices', lines, tone: '' });
  } else {
    pushBlock(blocks, 'Your pick', b.studentAnswer || '—', 'bad', maxChars);
    pushBlock(blocks, 'Correct', b.correctAnswer || '—', 'ok', maxChars);
  }

  if (student.scientificDefinition || student.scientificFunction) {
    const head = student.concept ? `${student.concept}. ` : '';
    pushBlock(
      blocks,
      'Your answer — scientifically',
      `${head}${student.scientificDefinition || ''}`,
      'bad',
      maxChars,
    );
    pushBlock(blocks, 'Your answer — function', student.scientificFunction, '', maxChars);
    pushBlock(blocks, 'Your answer — example', student.example, '', maxChars);
  }

  if (correct.scientificDefinition || correct.scientificFunction) {
    const head = correct.concept ? `${correct.concept}. ` : '';
    pushBlock(
      blocks,
      'Correct answer — scientifically',
      `${head}${correct.scientificDefinition || ''}`,
      'ok',
      maxChars,
    );
    pushBlock(blocks, 'Correct answer — function', correct.scientificFunction, '', maxChars);
    pushBlock(blocks, 'Correct answer — example', correct.example, '', maxChars);
  }

  if (cmp.studentConcept && cmp.correctConcept) {
    pushBlock(
      blocks,
      'Scientific comparison',
      `${cmp.studentConcept} → ${cmp.studentConceptFunction || ''}. ${cmp.correctConcept} → ${cmp.correctConceptFunction || ''}. ${cmp.keyScientificDifference || ''}`,
      '',
      maxChars,
    );
  }

  const connection =
    lesson.questionConnection ||
    cmp.whyCorrectAnswerFitsQuestion ||
    cmp.whyCorrectAnswerFits ||
    '';
  pushBlock(blocks, 'Question connection', connection, '', maxChars);

  if (!student.scientificDefinition) {
    if (b.keyConcept) pushBlock(blocks, 'Key idea', b.keyConcept, '', maxChars);
    const why = b.why || b.keyExplain || '';
    if (why && !/one is about/i.test(why)) {
      pushBlock(blocks, 'Look closer', why, '', maxChars);
    }
  }

  return blocks;
}

function buildMindMapSvg(map, branches) {
  const pageW = 920;
  const margin = 28;
  const gap = 18;
  const innerW = pageW - margin * 2;
  const cardW = innerW;
  const lineH = 17;
  const maxChars = 78;
  const title = map?.root || map?.title || map?.topic || 'Your Science Gaps';
  const summary =
    map?.summary ||
    map?.personalizedNote ||
    `One card per missed question · ${branches.length} miss${
      branches.length === 1 ? '' : 'es'
    }`;

  const titleLines = wrapLines(title, 48, 3);
  const summaryLines = wrapLines(summary, 92, 4);

  const cards = branches.map((b) => {
    const color = COLORS[(b.colorIndex || 0) % COLORS.length] || COLORS[0];
    const blocks = cardBlocks(b, maxChars);
    let h = 56;
    blocks.forEach((block) => {
      h += 20 + block.lines.length * lineH + 10;
    });
    h += 14;
    return { b, color, blocks, h };
  });

  let y = margin + 22 + titleLines.length * 28 + 8 + summaryLines.length * 18 + 18;
  const bodyH = cards.reduce((sum, card) => sum + card.h + gap, 0);
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
  cards.forEach((card) => {
    const x = margin;
    const { color, b, blocks, h } = card;
    svg += `<rect x="${x}" y="${cardY}" width="${cardW}" height="${h}" rx="14" fill="#fffdf7" stroke="${color.stroke}" stroke-width="2.5"/>`;
    svg += `<rect x="${x}" y="${cardY}" width="8" height="${h}" rx="4" fill="${color.stroke}"/>`;
    svg += `<text x="${x + 22}" y="${cardY + 24}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="12" font-weight="800" fill="${color.stroke}">MISS ${esc(
      String(b.index || ''),
    )}</text>`;
    svg += `<text x="${x + 22}" y="${cardY + 42}" font-family="Trebuchet MS, Segoe UI, sans-serif" font-size="11" font-weight="700" letter-spacing="0.6" fill="#5a4e38">${esc(
      String(b.topic || 'Science').toUpperCase(),
    )}</text>`;
    let by = cardY + 56;
    blocks.forEach((block) => {
      const fill =
        block.tone === 'bad' ? '#fde8e8' : block.tone === 'ok' ? '#e4f6ea' : '#fff';
      const blockH = 20 + block.lines.length * lineH;
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
