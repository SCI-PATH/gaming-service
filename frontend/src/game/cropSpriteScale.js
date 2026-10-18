/**
 * Carry-trail icon scale for harvested produce.
 * Tiny Kenney tiles get a boost; large Harvest Moon assets (e.g. hm_potato)
 * are fit to ~tile size so they do not dominate the farm.
 */
export function cropCarryScale(width, height, fallback = 0.7, tileSize = 16) {
  const w = Number(width) || 32;
  const h = Number(height) || 32;
  const maxDim = Math.max(w, h);
  if (maxDim <= 20) return fallback * 1.7;
  return (tileSize * 1.2) / maxDim;
}
