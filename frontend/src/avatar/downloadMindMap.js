/**
 * Save the current science mind map as a PNG (SVG fallback).
 * Draws the same radial keyword map shown in Sage.
 */
import { buildRadialSvg, toRadialModel } from './radialMindMap.js';

function stampName(title) {
  const slug = String(title || 'science')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const day = new Date().toISOString().slice(0, 10);
  return `${slug || 'science'}-mind-map-${day}`;
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

/**
 * Build the downloadable SVG. Exported for tests.
 */
export function buildMindMapSvg(map, branches) {
  const model = toRadialModel(map || {}, branches || []);
  const title = model.center || map?.root || map?.title || map?.topic || 'Science';
  const drawn = buildRadialSvg(model, { title });
  return { ...drawn, filename: drawn.filename || stampName(title) };
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
      ctx.fillStyle = '#ffffff';
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
