/**
 * Unlock shop — spend farm cash on animals & props after a level goal.
 * Prices scale with this level's quiz performance (speed + accuracy):
 *   strong / fast  → higher prices (challenge)
 *   emerging / slow → lower prices (encourage)
 *   developing     → mid prices
 */

import { DDA_BANDS, DDA_CONFIG, classifyPerformance } from './dda.js';
import { studentStorageKey } from './mockStudents.js';

const BASE_STORAGE_KEY = 'scipath_unlocks';

function storageKey() {
  return studentStorageKey(BASE_STORAGE_KEY);
}

/** Band multipliers applied to basePrice */
export const PRICE_BAND_MULTIPLIERS = {
  [DDA_BANDS.STRONG]: 1.4,
  [DDA_BANDS.DEVELOPING]: 1.0,
  [DDA_BANDS.EMERGING]: 0.65,
};

/**
 * Catalog of unlockable farm items (thumbnails under /assets/shop/).
 * Featured items appear first in the shop UI.
 */
/** Animal spritesheet frame sizes (Phaser + shop thumbnails). */
const FRAME_32 = { frameWidth: 32, frameHeight: 32, sheetCols: 6 };
const FRAME_64 = { frameWidth: 64, frameHeight: 64, sheetCols: 6 };

export const UNLOCK_ITEMS = [
  {
    id: 'sheep',
    name: 'Sheep',
    category: 'animal',
    featured: true,
    basePrice: 280,
    description: 'A woolly friend for your farm.',
    image: '/assets/shop/animals/sheep.png',
    textureKey: 'unlock_sheep',
    displayScale: 1.8,
    ...FRAME_32,
  },
  {
    id: 'house',
    name: 'Farm House',
    category: 'building',
    featured: true,
    basePrice: 520,
    description: 'Your homestead on the farm.',
    image: '/assets/shop/props/house.png',
    textureKey: 'unlock_house',
    displayScale: 0.22,
  },
  {
    id: 'calf',
    name: 'Calf',
    category: 'animal',
    featured: true,
    basePrice: 340,
    description: 'A young calf for the pasture.',
    image: '/assets/shop/animals/calf.png',
    textureKey: 'unlock_calf',
    displayScale: 0.9,
    ...FRAME_64,
  },
  {
    id: 'chick',
    name: 'Chick',
    category: 'animal',
    basePrice: 90,
    description: 'A tiny chirping chick.',
    image: '/assets/shop/animals/chick.png',
    textureKey: 'unlock_chick',
    displayScale: 1.8,
    frameWidth: 32,
    frameHeight: 32,
    sheetCols: 3,
  },
  {
    id: 'lamb',
    name: 'Lamb',
    category: 'animal',
    basePrice: 160,
    description: 'A soft little lamb.',
    image: '/assets/shop/animals/lamb.png',
    textureKey: 'unlock_lamb',
    displayScale: 1.8,
    ...FRAME_32,
  },
  {
    id: 'piglet',
    name: 'Piglet',
    category: 'animal',
    basePrice: 150,
    description: 'A playful piglet.',
    image: '/assets/shop/animals/piglet.png',
    textureKey: 'unlock_piglet',
    displayScale: 1.8,
    ...FRAME_32,
  },
  {
    id: 'rooster',
    name: 'Rooster',
    category: 'animal',
    basePrice: 130,
    description: 'Wakes the farm at dawn.',
    image: '/assets/shop/animals/rooster.png',
    textureKey: 'unlock_rooster',
    displayScale: 1.8,
    ...FRAME_32,
  },
  {
    id: 'turkey',
    name: 'Turkey',
    category: 'animal',
    basePrice: 170,
    description: 'A proud farm turkey.',
    image: '/assets/shop/animals/turkey.png',
    textureKey: 'unlock_turkey',
    displayScale: 1.8,
    ...FRAME_32,
  },
  {
    id: 'bull',
    name: 'Bull',
    category: 'animal',
    basePrice: 400,
    description: 'Strong bull for the pasture.',
    image: '/assets/shop/animals/bull.png',
    textureKey: 'unlock_bull',
    displayScale: 0.9,
    ...FRAME_64,
  },
  {
    id: 'well',
    name: 'Water Well',
    category: 'prop',
    basePrice: 200,
    description: 'Fresh water for crops & animals.',
    image: '/assets/shop/props/well.png',
    textureKey: 'unlock_well',
    displayScale: 0.35,
  },
  {
    id: 'windmill',
    name: 'Windmill',
    category: 'building',
    basePrice: 450,
    description: 'Grinds grain for the farm.',
    image: '/assets/shop/props/windmill.png',
    textureKey: 'unlock_windmill',
    displayScale: 0.18,
  },
  {
    id: 'tent',
    name: 'Camp Tent',
    category: 'prop',
    basePrice: 180,
    description: 'A cozy rest spot.',
    image: '/assets/shop/props/tent.png',
    textureKey: 'unlock_tent',
    displayScale: 0.3,
  },
  {
    id: 'tree_large',
    name: 'Large Tree',
    category: 'decor',
    basePrice: 120,
    description: 'Shade for the pasture.',
    image: '/assets/shop/props/tree_large.png',
    textureKey: 'unlock_tree_large',
    displayScale: 0.28,
  },
  {
    id: 'tree_medium',
    name: 'Medium Tree',
    category: 'decor',
    basePrice: 90,
    description: 'A sturdy farm tree.',
    image: '/assets/shop/props/tree_medium.png',
    textureKey: 'unlock_tree_medium',
    displayScale: 0.32,
  },
  {
    id: 'bushes_large',
    name: 'Large Bushes',
    category: 'decor',
    basePrice: 70,
    description: 'Fill empty edges of the farm.',
    image: '/assets/shop/props/bushes_large.png',
    textureKey: 'unlock_bushes_large',
    displayScale: 0.4,
  },
  {
    id: 'campfire',
    name: 'Campfire',
    category: 'prop',
    basePrice: 110,
    description: 'Warm glow for evenings.',
    image: '/assets/shop/props/campfire.png',
    textureKey: 'unlock_campfire',
    displayScale: 0.35,
  },
  {
    id: 'chest',
    name: 'Treasure Chest',
    category: 'prop',
    basePrice: 220,
    description: 'Store your farm treasures.',
    image: '/assets/shop/props/chest.png',
    textureKey: 'unlock_chest',
    displayScale: 0.35,
  },
  {
    id: 'cart',
    name: 'Wooden Cart',
    category: 'prop',
    basePrice: 160,
    description: 'Haul harvests to market.',
    image: '/assets/shop/props/cart.png',
    textureKey: 'unlock_cart',
    displayScale: 0.3,
  },
  {
    id: 'supplies',
    name: 'Farm Supplies',
    category: 'prop',
    basePrice: 100,
    description: 'Tools and bags for chores.',
    image: '/assets/shop/props/supplies.png',
    textureKey: 'unlock_supplies',
    displayScale: 0.3,
  },
  {
    id: 'barrel',
    name: 'Wooden Barrel',
    category: 'prop',
    basePrice: 80,
    description: 'Stores water or grain.',
    image: '/assets/shop/props/barrel.png',
    textureKey: 'unlock_barrel',
    displayScale: 0.4,
  },
];

/** World placement slots (tile coords) for purchased unlocks */
export const UNLOCK_WORLD_SLOTS = [
  { tileX: 40, tileY: 29 },
  { tileX: 42, tileY: 29 },
  { tileX: 44, tileY: 29 },
  { tileX: 46, tileY: 29 },
  { tileX: 40, tileY: 31 },
  { tileX: 42, tileY: 31 },
  { tileX: 44, tileY: 31 },
  { tileX: 46, tileY: 31 },
  { tileX: 38, tileY: 30 },
  { tileX: 48, tileY: 30 },
  { tileX: 39, tileY: 32 },
  { tileX: 41, tileY: 32 },
  { tileX: 43, tileY: 32 },
  { tileX: 45, tileY: 32 },
  { tileX: 47, tileY: 32 },
  { tileX: 49, tileY: 32 },
  { tileX: 38, tileY: 28 },
  { tileX: 50, tileY: 28 },
  { tileX: 37, tileY: 31 },
  { tileX: 51, tileY: 31 },
];

/** Ground tiles staged for next-level maps */
export const GROUND_TILE_KEYS = Array.from({ length: 56 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    key: `ground_${n}`,
    path: `/assets/shop/ground/ground_${n}.png`,
  };
});

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function readOwned() {
  try {
    const raw = localStorage.getItem(storageKey());
    const data = raw ? JSON.parse(raw) : { owned: [] };
    return Array.isArray(data.owned) ? data.owned : [];
  } catch {
    return [];
  }
}

function writeOwned(owned) {
  try {
    localStorage.setItem(
      storageKey(),
      JSON.stringify({ owned, savedAt: Date.now() }),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function getOwnedUnlockIds() {
  return readOwned();
}

export function isUnlocked(itemId) {
  return readOwned().includes(itemId);
}

export function markUnlocked(itemId) {
  const owned = readOwned();
  if (!owned.includes(itemId)) {
    owned.push(itemId);
    writeOwned(owned);
  }
  return owned;
}

/**
 * Performance band for shop pricing from this level's attempt scores.
 * Falls back to mastery band when no quiz data yet.
 */
export function shopBandFromPerformance({
  attemptScores,
  performanceBand,
  avgResponseMs,
} = {}) {
  if (attemptScores?.length) {
    return classifyPerformance(attemptScores);
  }
  if (performanceBand) return performanceBand;

  // Timing-only fallback
  const t = Number(avgResponseMs) || 0;
  if (t > 0) {
    if (t <= DDA_CONFIG.fastMs) return DDA_BANDS.STRONG;
    if (t >= DDA_CONFIG.slowMs) return DDA_BANDS.EMERGING;
  }
  return DDA_BANDS.DEVELOPING;
}

/**
 * Price multiplier: smarter/faster → pay more; slower/weaker → discount.
 */
export function priceMultiplier(perf = {}) {
  const band = shopBandFromPerformance(perf);
  let mult = PRICE_BAND_MULTIPLIERS[band] ?? 1;

  const t = Number(perf.avgResponseMs) || 0;
  if (t > 0) {
    if (t <= DDA_CONFIG.fastMs) mult *= 1.12;
    else if (t <= DDA_CONFIG.moderateMs) mult *= 1.0;
    else if (t <= DDA_CONFIG.slowMs) mult *= 0.88;
    else mult *= 0.75;
  }

  const score = Number(perf.performanceScore);
  if (Number.isFinite(score)) {
    if (score >= DDA_CONFIG.strongScore) mult *= 1.08;
    else if (score <= DDA_CONFIG.emergingScore) mult *= 0.9;
  }

  return clamp(mult, 0.5, 1.75);
}

export function priceForItem(item, perf = {}) {
  const mult = priceMultiplier(perf);
  return Math.max(10, Math.round((item.basePrice * mult) / 5) * 5);
}

export function bandPriceLabel(band) {
  switch (band) {
    case DDA_BANDS.STRONG:
      return 'Challenge prices (high performance)';
    case DDA_BANDS.EMERGING:
      return 'Encouragement prices (building up)';
    default:
      return 'Standard prices (keep practicing)';
  }
}

/**
 * Build priced catalog for the shop UI.
 */
export function buildShopCatalog(perf = {}, ownedIds = null) {
  const owned = ownedIds ?? getOwnedUnlockIds();
  const band = shopBandFromPerformance(perf);
  const mult = priceMultiplier(perf);

  const items = UNLOCK_ITEMS.map((item) => ({
    ...item,
    price: priceForItem(item, perf),
    owned: owned.includes(item.id),
  })).sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return a.price - b.price;
  });

  return {
    items,
    band,
    multiplier: Math.round(mult * 100) / 100,
    bandLabel: bandPriceLabel(band),
    ownedCount: owned.length,
  };
}

export function getUnlockItem(itemId) {
  return UNLOCK_ITEMS.find((i) => i.id === itemId) ?? null;
}
