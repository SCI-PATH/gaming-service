/**
 * Server-side unlock shop prices (mirrors frontend/src/data/shopPricePolicy.js).
 * Kept in backend/lib so Docker images that only copy /app/lib do not import ../frontend.
 */

export const SHOP_PRICE_LIMITS = Object.freeze({
  minMultiplier: 0.45,
  maxMultiplier: 1.15,
  minPrice: 10,
});

/** Catalog base prices. The server charges from this map, not from the client price. */
export const SHOP_BASE_PRICES = Object.freeze({
  sheep: 280,
  lamb: 160,
  piglet: 150,
  rooster: 130,
  turkey: 170,
  bull: 400,
  well: 200,
  windmill: 450,
  tent: 180,
  tree_large: 120,
  tree_medium: 90,
  bushes_large: 70,
  campfire: 110,
  chest: 220,
  cart: 160,
  supplies: 100,
  barrel: 80,
});

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Band shop multiplier matching frontend frustrationModel shop.priceMult. */
function shopBandMult(score) {
  const s = clamp(Number(score) || 0, 0, 100);
  if (s <= 30) return 1.0;
  if (s <= 60) return 0.9;
  if (s <= 80) return 0.75;
  return 0.58;
}

/**
 * Blend continuous CSF curve with band mult (same formula as frontend).
 */
export function frustrationShopPriceFactor(score) {
  const s = clamp(Number(score) || 0, 0, 100);
  const continuous = 1.05 - (s / 100) * 0.5;
  const band = shopBandMult(s);
  return clamp(continuous * 0.55 + band * 0.45, 0.5, 1.15);
}

/**
 * Average of valid 0–100 scores. Missing/invalid values are dropped.
 * Returns null when the level has no usable scores.
 */
export function averageLevelFrustration(scores) {
  const valid = (Array.isArray(scores) ? scores : [])
    .filter((n) => n != null && n !== '')
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  if (!valid.length) return null;
  const avg = valid.reduce((sum, n) => sum + n, 0) / valid.length;
  return Math.round(avg * 10) / 10;
}

/** Multiplier from the CSF shop curve, clamped to SHOP_PRICE_LIMITS. */
export function shopMultiplierForAverage(averageScore) {
  if (averageScore == null || !Number.isFinite(Number(averageScore))) return 1;
  const factor = frustrationShopPriceFactor(Number(averageScore));
  return clamp(
    factor,
    SHOP_PRICE_LIMITS.minMultiplier,
    SHOP_PRICE_LIMITS.maxMultiplier,
  );
}

export function priceFromAverageFrustration(basePrice, averageScore) {
  const base = Math.max(0, Number(basePrice) || 0);
  const mult = shopMultiplierForAverage(averageScore);
  const raw = base * mult;
  const rounded = Math.round(raw / 5) * 5;
  return Math.max(SHOP_PRICE_LIMITS.minPrice, rounded);
}

export function basePriceForItem(itemId) {
  const price = SHOP_BASE_PRICES[String(itemId || '').trim()];
  return Number.isFinite(price) ? price : null;
}
