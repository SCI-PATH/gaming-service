/**
 * Farm item catalog for the adaptive customer shop.
 * Reuses crop / animal / cleaning produce definitions — no duplicate item DB.
 */
import { CROP_CHALLENGES } from './cropChallenges.js';
import { ANIMAL_CHALLENGES } from './animalChallenges.js';

const CROP_ICON = {
  tomato: '🍅',
  carrot: '🥕',
  potato: '🥔',
  pumpkin: '🎃',
  onion: '🧅',
  cabbage: '🥬',
  lettuce: '🥗',
  corn: '🌽',
  bean: '🫘',
  chilli: '🌶️',
  cucumber: '🥒',
  eggplant: '🍆',
  spinach: '🥬',
  radish: '🩷',
  beetroot: '🟣',
  pea: '🟢',
  watermelon: '🍉',
  strawberry: '🍓',
  sunflower: '🌻',
  rose: '🌹',
  daisy: '🌼',
  marigold: '🧡',
  flower: '🌸',
  wheat: '🌾',
  turnip: '🤍',
};

const ANIMAL_PRODUCE = {
  milk: { name: 'Milk', icon: '🥛' },
  eggs: { name: 'Eggs', icon: '🥚' },
  wool: { name: 'Wool', icon: '🧶' },
  goat_milk: { name: 'Goat milk', icon: '🥛' },
  grain: { name: 'Grain', icon: '🌾' },
  hay: { name: 'Hay', icon: '🌾' },
};

/** Unique sellable produce entries from crop challenges. */
export function getCropShopItems() {
  const seen = new Set();
  const out = [];
  for (const c of CROP_CHALLENGES) {
    if (!c?.cropId || seen.has(c.cropId)) continue;
    seen.add(c.cropId);
    out.push({
      id: c.cropId,
      name: singularName(c.cropName || c.cropId),
      icon: CROP_ICON[c.cropId] || '🌱',
      kind: 'crop',
      textureKey: c.produce || null,
    });
  }
  return out;
}

export function getAnimalProduceShopItems() {
  const seen = new Set();
  const out = [];
  for (const a of ANIMAL_CHALLENGES || []) {
    const id = String(a.produceName || '')
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const meta = ANIMAL_PRODUCE[id] || {
      name: singularName(a.produceName),
      icon: '🧺',
    };
    // Prefer milk/egg sprites only — sack/pouch/feed look wrong in bubbles
    const safeAnimalTex =
      a.produceKey === 'kf_milk' || a.produceKey === 'kf_egg'
        ? a.produceKey
        : null;
    out.push({
      id,
      name: meta.name,
      icon: meta.icon,
      kind: 'animal',
      textureKey: safeAnimalTex,
    });
  }
  // Ensure milk exists even if catalog shape varies
  if (!seen.has('milk')) {
    out.push({
      id: 'milk',
      name: 'Milk',
      icon: '🥛',
      kind: 'animal',
      textureKey: 'kf_milk',
    });
  }
  return out;
}

export function getCleaningShopItems() {
  return [
    {
      id: 'compost',
      name: 'Compost',
      icon: '♻️',
      kind: 'clean',
      // No plant/pot texture — bubbles use the emoji only
      textureKey: null,
    },
  ];
}

/** Produce textures that look like real challenge items in tiny bubbles. */
const SAFE_BUBBLE_TEXTURES = new Set([
  'kf_tomato',
  'kf_carrot',
  'kf_corn',
  'kf_cabbage',
  'kf_turnip',
  'kf_wheat',
  'kf_sunflower',
  'kf_milk',
  'kf_egg',
  'hm_potato',
  'hm_turnip',
  'hm_berry',
  'hm_corn',
  'hm_tomato',
  'crop_flower',
  'crop_corn',
]);

/**
 * Icon + optional safe produce sprite for order bubbles.
 * Never returns sack/pot/bucket stand-ins that confuse challenge items.
 */
export function getBubbleItemVisual(itemId) {
  const meta = getShopItemById(itemId);
  const tex = meta.textureKey;
  const useTexture = Boolean(tex && SAFE_BUBBLE_TEXTURES.has(tex));
  return {
    id: meta.id,
    name: meta.name,
    icon: meta.icon || '🛒',
    textureKey: useTexture ? tex : null,
    kind: meta.kind,
  };
}

export function getAllShopCatalogItems() {
  return [
    ...getCropShopItems(),
    ...getAnimalProduceShopItems(),
    ...getCleaningShopItems(),
  ];
}

export function getShopItemById(itemId) {
  return (
    getAllShopCatalogItems().find((i) => i.id === itemId) || {
      id: itemId,
      name: singularName(itemId),
      icon: '🛒',
      kind: 'crop',
    }
  );
}

function singularName(name) {
  const s = String(name || 'item').trim();
  if (s.endsWith('oes')) return s.slice(0, -2); // tomatoes → tomato
  if (s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

/**
 * Aggregate cartStack tokens into { itemId: qty }.
 * Supports legacy tokens: crop / animal / clean.
 */
export function inventoryFromCartStack(cartStack = [], fallbacks = {}) {
  const stock = {};
  const cropFallback = fallbacks.cropId || 'tomato';
  const animalFallback = fallbacks.animalProduceId || 'milk';
  for (const raw of cartStack || []) {
    let id = String(raw || '').toLowerCase();
    if (!id) continue;
    if (id === 'crop') id = cropFallback;
    if (id === 'animal') id = animalFallback;
    if (id === 'clean') id = 'compost';
    stock[id] = (stock[id] || 0) + 1;
  }
  return stock;
}

export function cartStackFromInventory(stock = {}) {
  const stack = [];
  for (const [id, qty] of Object.entries(stock)) {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    for (let i = 0; i < n; i += 1) stack.push(id);
  }
  return stack;
}

export function countInventory(stock = {}) {
  return Object.values(stock).reduce((a, b) => a + (Number(b) || 0), 0);
}
