/**
 * Unlock shop — spend farm cash on animals & props after a level goal.
 * Prices scale with this level's quiz performance (speed + accuracy):
 *   strong / fast  → higher prices (challenge)
 *   emerging / slow → lower prices (encourage)
 *   developing     → mid prices
 */

import { DDA_BANDS, DDA_CONFIG, classifyPerformance } from './dda.js';
import { studentStorageKey, getCurrentStudent } from './mockStudents.js';
import { normalizePerformanceCategory, PERFORMANCE_CATEGORIES } from './performanceCategories.js';
import { FRUSTRATION_LEVELS } from './frustrationModel.js';
import { syncUnlock } from './engagementSync.js';

const BASE_STORAGE_KEY = 'scipath_unlocks';

function storageKey() {
  return studentStorageKey(BASE_STORAGE_KEY);
}

/** Band multipliers applied to basePrice (Weak cheaper, Smart higher). */
export const PRICE_BAND_MULTIPLIERS = {
  [PERFORMANCE_CATEGORIES.SMART]: 1.35,
  [PERFORMANCE_CATEGORIES.MEDIUM]: 1.0,
  [PERFORMANCE_CATEGORIES.WEAK]: 0.62,
};

export const PRICE_FRUSTRATION_MULTIPLIERS = {
  [FRUSTRATION_LEVELS.LOW]: 1,
  [FRUSTRATION_LEVELS.MODERATE]: 0.92,
  [FRUSTRATION_LEVELS.HIGH]: 0.78,
  [FRUSTRATION_LEVELS.VERY_HIGH]: 0.65,
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

/** World placement slots (tile coords) — spaced so large props don't cover each other */
export const UNLOCK_WORLD_SLOTS = [
  { tileX: 36, tileY: 26 },
  { tileX: 42, tileY: 26 },
  { tileX: 48, tileY: 26 },
  { tileX: 54, tileY: 26 },
  { tileX: 34, tileY: 30 },
  { tileX: 40, tileY: 30 },
  { tileX: 46, tileY: 30 },
  { tileX: 52, tileY: 30 },
  { tileX: 35, tileY: 34 },
  { tileX: 41, tileY: 34 },
  { tileX: 47, tileY: 34 },
  { tileX: 53, tileY: 34 },
  { tileX: 32, tileY: 28 },
  { tileX: 56, tileY: 28 },
  { tileX: 33, tileY: 32 },
  { tileX: 55, tileY: 32 },
  { tileX: 38, tileY: 28 },
  { tileX: 44, tileY: 28 },
  { tileX: 50, tileY: 28 },
  { tileX: 37, tileY: 36 },
];

/** Building-sized items get these roomier slots first */
export const UNLOCK_BUILDING_SLOTS = [
  { tileX: 34, tileY: 24 },
  { tileX: 44, tileY: 23 },
  { tileX: 54, tileY: 24 },
  { tileX: 30, tileY: 28 },
  { tileX: 58, tileY: 28 },
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

function emptyStore() {
  return { owned: [], meta: {}, savedAt: Date.now() };
}

function readStore() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return emptyStore();
    const data = JSON.parse(raw);
    return {
      owned: Array.isArray(data.owned) ? data.owned : [],
      meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
      savedAt: data.savedAt || Date.now(),
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(
      storageKey(),
      JSON.stringify({ ...store, savedAt: Date.now() }),
    );
  } catch {
    // ignore quota / private mode
  }
}

function readOwned() {
  return readStore().owned;
}

function writeOwned(owned) {
  const store = readStore();
  store.owned = owned;
  writeStore(store);
}

export function getOwnedUnlockIds() {
  return readOwned();
}

export function getUnlockMeta(itemId) {
  const store = readStore();
  return store.meta[itemId] || null;
}

export function getAllUnlockMeta() {
  return { ...readStore().meta };
}

export function isUnlocked(itemId) {
  return readOwned().includes(itemId);
}

/** Wipe owned unlocks + meta for the current student (dev / test). */
export function clearOwnedUnlocks() {
  writeStore(emptyStore());
  return [];
}

/**
 * Persist ownership. Pass purchasedAtLevel so later levels can stage challenges.
 * @param {string} itemId
 * @param {{ purchasedAtLevel?: number }} [opts]
 */
export function markUnlocked(itemId, opts = {}) {
  const store = readStore();
  if (!store.owned.includes(itemId)) {
    store.owned.push(itemId);
  }
  const prev = store.meta[itemId] || {};
  const level =
    Number(opts.purchasedAtLevel) > 0
      ? Number(opts.purchasedAtLevel)
      : Number(prev.purchasedAtLevel) > 0
        ? Number(prev.purchasedAtLevel)
        : 1;
  store.meta[itemId] = {
    ...prev,
    purchasedAtLevel: level,
    stageProgress: prev.stageProgress || {},
  };

  writeStore(store);
  const catalogItem = UNLOCK_ITEMS.find((i) => i.id === itemId);
  syncUnlock(
    itemId,
    {
      itemName: catalogItem?.name || itemId,
      category: catalogItem?.category || 'other',
      basePrice: catalogItem?.basePrice ?? 0,
      pricePaid: opts.pricePaid ?? catalogItem?.basePrice ?? 0,
      purchasedAtLevel: level,
    },
    getCurrentStudent(),
  );
  return store.owned;
}

/**
 * Ensure every owned item has purchase meta (migrates older saves).
 * @param {number} [fallbackPurchasedAt=1]
 */
export function ensureUnlockMeta(fallbackPurchasedAt = 1) {
  const store = readStore();
  let changed = false;
  const fallback = Math.max(1, Number(fallbackPurchasedAt) || 1);
  for (const itemId of store.owned) {
    const prev = store.meta[itemId];
    if (!prev || !(Number(prev.purchasedAtLevel) > 0)) {
      store.meta[itemId] = {
        ...(prev || {}),
        purchasedAtLevel: fallback,
        stageProgress: prev?.stageProgress || {},
      };
      changed = true;
    }
  }
  if (changed) writeStore(store);
  return store;
}

/**
 * Advance / complete a challenge step for an owned item.
 */
export function advanceChallengeProgress(itemId, stageId, { stepIndex, done, placed }) {
  const store = readStore();
  if (!store.owned.includes(itemId)) return null;
  const meta = store.meta[itemId] || {
    purchasedAtLevel: 1,
    stageProgress: {},
  };
  const prev = meta.stageProgress?.[stageId] || {
    stepIndex: 0,
    done: false,
    placed: [],
  };
  meta.stageProgress = {
    ...(meta.stageProgress || {}),
    [stageId]: {
      stepIndex: stepIndex ?? prev.stepIndex ?? 0,
      done: done ?? prev.done ?? false,
      placed: Array.isArray(placed) ? placed : prev.placed || [],
      updatedAt: Date.now(),
    },
  };
  store.meta[itemId] = meta;
  writeStore(store);
  return meta.stageProgress[stageId];
}

export function getChallengeProgress(itemId, stageId) {
  const meta = getUnlockMeta(itemId);
  return (
    meta?.stageProgress?.[stageId] || {
      stepIndex: 0,
      done: false,
      placed: [],
    }
  );
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
    return normalizePerformanceCategory(classifyPerformance(attemptScores));
  }
  if (performanceBand) return normalizePerformanceCategory(performanceBand);

  const t = Number(avgResponseMs) || 0;
  if (t > 0) {
    if (t <= DDA_CONFIG.fastMs) return PERFORMANCE_CATEGORIES.SMART;
    if (t >= DDA_CONFIG.slowMs) return PERFORMANCE_CATEGORIES.WEAK;
  }
  return PERFORMANCE_CATEGORIES.MEDIUM;
}

/**
 * Price multiplier: Smart pays more; Weak + high frustration gets a discount.
 */
export function priceMultiplier(perf = {}) {
  const band = shopBandFromPerformance(perf);
  let mult = PRICE_BAND_MULTIPLIERS[band] ?? 1;

  const frustrationLevel = String(perf.frustrationLevel || '').toLowerCase();
  if (PRICE_FRUSTRATION_MULTIPLIERS[frustrationLevel]) {
    mult *= PRICE_FRUSTRATION_MULTIPLIERS[frustrationLevel];
  } else if (Number(perf.frustrationScore) >= 81) {
    mult *= PRICE_FRUSTRATION_MULTIPLIERS.very_high;
  } else if (Number(perf.frustrationScore) >= 61) {
    mult *= PRICE_FRUSTRATION_MULTIPLIERS.high;
  } else if (Number(perf.frustrationScore) >= 31) {
    mult *= PRICE_FRUSTRATION_MULTIPLIERS.moderate;
  }

  const t = Number(perf.avgResponseMs) || 0;
  if (t > 0) {
    if (t <= DDA_CONFIG.fastMs) mult *= 1.08;
    else if (t <= DDA_CONFIG.moderateMs) mult *= 1.0;
    else if (t <= DDA_CONFIG.slowMs) mult *= 0.9;
    else mult *= 0.78;
  }

  const score = Number(perf.performanceScore);
  if (Number.isFinite(score)) {
    if (score >= DDA_CONFIG.strongScore) mult *= 1.06;
    else if (score <= DDA_CONFIG.emergingScore) mult *= 0.9;
  }

  return clamp(mult, 0.45, 1.7);
}

export function priceForItem(item, perf = {}) {
  const mult = priceMultiplier(perf);
  return Math.max(10, Math.round((item.basePrice * mult) / 5) * 5);
}

export function bandPriceLabel(band) {
  switch (normalizePerformanceCategory(band)) {
    case PERFORMANCE_CATEGORIES.SMART:
      return 'Smart prices (higher challenge)';
    case PERFORMANCE_CATEGORIES.WEAK:
      return 'Support prices (more affordable)';
    default:
      return 'Standard prices';
  }
}

/**
 * Build priced catalog for the shop UI.
 */
export function buildShopCatalog(perf = {}, ownedIds = null) {
  const owned = ownedIds ?? getOwnedUnlockIds();
  const band = shopBandFromPerformance(perf);
  const mult = priceMultiplier(perf);

  const items = UNLOCK_ITEMS.filter((item) => !item.shopHidden)
    .map((item) => ({
      ...item,
      price: priceForItem(item, perf),
      owned: owned.includes(item.id),
    }))
    .sort((a, b) => {
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

/**
 * Scale an unlock sprite to the farm tilemap (TILE_SIZE px).
 * Prefer mapTileHeight / mapTileWidth so large PNGs don't dwarf the map.
 */
export function resolveUnlockDisplayScale(
  item,
  sourceWidth = 0,
  sourceHeight = 0,
  tileSize = 16,
) {
  if (!item) return 1;
  const tw = Math.max(1, Number(tileSize) || 16);
  const sw = Math.max(1, Number(sourceWidth) || 1);
  const sh = Math.max(1, Number(sourceHeight) || 1);

  if (item.mapTileHeight > 0) {
    return (Number(item.mapTileHeight) * tw) / sh;
  }
  if (item.mapTileWidth > 0) {
    return (Number(item.mapTileWidth) * tw) / sw;
  }
  if (item.displayScale > 0) return Number(item.displayScale);
  return 1;
}
