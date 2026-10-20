/**
 * Adaptive physical Farm Shop — shop stock, customer queue, FIFO auto-fulfill.
 *
 * Reuses CSF frustration score (does NOT reimplement frustration).
 * Recovery-oriented: higher frustration → easier shop (fewer/simpler/more patient).
 *
 * Flow: player inventory → unload into shopStock → FIFO customers auto-receive.
 */
import {
  buildFrustrationAdaptation,
  frustrationLevelFromScore,
} from './frustrationModel.js';
import {
  cartStackFromInventory,
  countInventory,
  getAllShopCatalogItems,
  getShopItemById,
  inventoryFromCartStack,
} from './farmShopCatalog.js';

export const CUSTOMER_STATUS = Object.freeze({
  WAITING: 'WAITING',
  SERVING: 'SERVING',
  SERVED: 'SERVED',
  IMPATIENT: 'IMPATIENT',
  LEFT: 'LEFT',
});

export const SHOP_EVENTS = Object.freeze({
  SHOP_OPENED: 'SHOP_OPENED',
  SHOP_ITEM_UNLOADED: 'SHOP_ITEM_UNLOADED',
  CUSTOMER_JOINED_QUEUE: 'CUSTOMER_JOINED_QUEUE',
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_ORDER_GENERATED: 'CUSTOMER_ORDER_GENERATED',
  CUSTOMER_ORDER_PARTIALLY_FULFILLED: 'CUSTOMER_ORDER_PARTIALLY_FULFILLED',
  CUSTOMER_ORDER_COMPLETED: 'CUSTOMER_ORDER_COMPLETED',
  CUSTOMER_PAID: 'CUSTOMER_PAID',
  ORDER_VIEWED: 'ORDER_VIEWED',
  ITEM_SELECTED: 'ITEM_SELECTED',
  ITEM_DELIVERED: 'ITEM_DELIVERED',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  CUSTOMER_WAITING: 'CUSTOMER_WAITING',
  CUSTOMER_IMPATIENT: 'CUSTOMER_IMPATIENT',
  CUSTOMER_LEFT: 'CUSTOMER_LEFT',
  CUSTOMER_PATIENCE_CHANGED: 'CUSTOMER_PATIENCE_CHANGED',
  ORDER_FAILED: 'ORDER_FAILED',
  ORDER_RETRY: 'ORDER_RETRY',
  SHOP_CLOSED: 'SHOP_CLOSED',
  RECOVERY_SNAPSHOT: 'RECOVERY_SNAPSHOT',
});

let _seq = 0;
function nextId(prefix) {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq}`;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(n) || 0));
}

function resolveLevel(score, level) {
  if (level) return String(level).toLowerCase();
  return frustrationLevelFromScore(Number(score) || 0);
}

/**
 * Shop difficulty from existing CSF score — recovery-oriented (high FS → easier).
 */
export function getShopDifficulty(frustrationScore = 0, frustrationLevel = null) {
  const score = clamp(Math.round(Number(frustrationScore) || 0), 0, 100);
  const level = resolveLevel(score, frustrationLevel);
  const adapt = buildFrustrationAdaptation(score);

  // Very high frustration: one customer, a tiny order, and patience that runs out fast.
  if (level === 'very_high') {
    return {
      level,
      score,
      maxCustomers: 1,
      minItemsPerOrder: 1,
      maxItemsPerOrder: 1,
      maxQtyPerItem: 1,
      patienceMs: 18000,
      tickMs: 600,
      patienceDrainPerTick: 2.6,
      highlightHelp: true,
      showHints: true,
      bubbleScale: 1.35,
      label: 'Angry queue',
      adaptLabel: adapt.gameplay?.label || 'Maximum farm support',
    };
  }
  // High frustration: a short queue and hints, still easier than a calm shop.
  if (level === 'high') {
    return {
      level,
      score,
      maxCustomers: 2,
      minItemsPerOrder: 1,
      maxItemsPerOrder: 2,
      maxQtyPerItem: 1,
      patienceMs: 28000,
      tickMs: 700,
      patienceDrainPerTick: 2.0,
      highlightHelp: true,
      showHints: true,
      bubbleScale: 1.2,
      label: 'Short tempers',
      adaptLabel: adapt.gameplay?.label || 'Supportive farm pace',
    };
  }
  // Moderate: a normal queue. Low frustration falls through to the patient, fuller shop.
  if (level === 'moderate') {
    return {
      level,
      score,
      maxCustomers: 3,
      minItemsPerOrder: 1,
      maxItemsPerOrder: 3,
      maxQtyPerItem: 2,
      patienceMs: 55000,
      tickMs: 800,
      patienceDrainPerTick: 1.15,
      highlightHelp: false,
      showHints: true,
      bubbleScale: 1.05,
      label: 'Balanced shop',
      adaptLabel: adapt.gameplay?.label || 'Gentle farm support',
    };
  }
  return {
    level,
    score,
    maxCustomers: 4,
    minItemsPerOrder: 2,
    maxItemsPerOrder: 3,
    maxQtyPerItem: 2,
    patienceMs: 110000,
    tickMs: 1400,
    patienceDrainPerTick: 0.45,
    highlightHelp: false,
    showHints: false,
    bubbleScale: 1,
    label: 'Patient queue',
    adaptLabel: adapt.gameplay?.label || 'Challenge farm pace',
  };
}

function pickRandom(arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Order from sellable item pool (level produce), not from current cart stock.
 * Never invents ids outside the provided pool.
 */
export function generateCustomerOrderFromPool(itemIds = [], difficulty = null) {
  const diff = difficulty || getShopDifficulty(40);
  const pool = [...new Set((itemIds || []).filter(Boolean).map(String))];
  if (!pool.length) {
    return { orderId: nextId('ord'), items: [], empty: true };
  }

  const itemCount = clamp(
    Math.floor(
      Math.random() * (diff.maxItemsPerOrder - diff.minItemsPerOrder + 1),
    ) + diff.minItemsPerOrder,
    1,
    Math.min(diff.maxItemsPerOrder, pool.length),
  );

  const remaining = [...pool];
  const chosen = [];
  for (let i = 0; i < itemCount && remaining.length; i += 1) {
    const idx = Math.floor(Math.random() * remaining.length);
    const [itemId] = remaining.splice(idx, 1);
    const maxQty = Math.min(
      diff.maxQtyPerItem,
      diff.level === 'very_high' ? 1 : 3,
    );
    const qty = clamp(1 + Math.floor(Math.random() * maxQty), 1, maxQty);
    const meta = getShopItemById(itemId);
    chosen.push({
      itemId,
      name: meta.name,
      icon: meta.icon,
      qty,
      delivered: 0,
    });
  }

  return {
    orderId: nextId('ord'),
    items: chosen,
    empty: chosen.length === 0,
  };
}

/** @deprecated Prefer generateCustomerOrderFromPool for physical shop */
export function generateCustomerOrder(stock = {}, difficulty = null) {
  const ids = Object.entries(stock)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([id]) => id);
  return generateCustomerOrderFromPool(ids, difficulty);
}

/** Queue customer plus a cash reward a little above the order's produce value. */
export function createCustomerFromPool(itemIds, difficulty, unitValue = 10) {
  const order = generateCustomerOrderFromPool(itemIds, difficulty);
  const lineValue = order.items.reduce(
    (sum, line) => sum + line.qty * unitValue,
    0,
  );
  const reward = Math.max(unitValue, Math.round(lineValue * 1.15));
  const maxPatience = 100;
  return {
    id: nextId('cust'),
    requestedItems: order.items,
    orderId: order.orderId,
    patience: maxPatience,
    maxPatience,
    status: CUSTOMER_STATUS.WAITING,
    served: false,
    reward,
    createdAt: Date.now(),
    patienceAtStart: maxPatience,
    patienceAtEnd: null,
    patienceDrainPerTick: difficulty?.patienceDrainPerTick || 2,
    speech: '🙂 I am waiting for my order.',
    queueIndex: 0,
  };
}

function emitLocal(shop, type, payload = {}) {
  const ev = {
    type,
    at: Date.now(),
    sessionId: shop.sessionId,
    frustrationScore: shop.frustrationScore,
    ...payload,
  };
  shop.events.push(ev);
  return ev;
}

function livingCustomers(shop) {
  return (shop.customers || []).filter(
    (c) =>
      c.status !== CUSTOMER_STATUS.SERVED &&
      c.status !== CUSTOMER_STATUS.LEFT,
  );
}

function markFrontServing(shop) {
  const living = livingCustomers(shop);
  living.forEach((c, i) => {
    c.queueIndex = i;
  });
  if (!living.length) {
    shop.activeCustomerId = null;
    return;
  }
  const front = living[0];
  for (const c of living) {
    if (c.id === front.id) {
      c.status = CUSTOMER_STATUS.SERVING;
      if (c.patience / c.maxPatience > 0.35) {
        c.speech = '😊 Please help with my order!';
      }
    } else if (c.status !== CUSTOMER_STATUS.IMPATIENT) {
      c.status = CUSTOMER_STATUS.WAITING;
      c.speech = '🙂 I am waiting for my order.';
    }
  }
  shop.activeCustomerId = front.id;
}

/**
 * Persistent world shop (physical building + queue).
 */
export function createWorldShop({
  frustrationScore = 0,
  frustrationLevel = null,
  sellableItemIds = [],
  unitValue = 10,
  cashMult = 1,
} = {}) {
  const difficulty = getShopDifficulty(frustrationScore, frustrationLevel);
  const pool = [...new Set((sellableItemIds || []).filter(Boolean))];
  const shop = {
    sessionId: nextId('shop'),
    openedAt: Date.now(),
    frustrationBefore: clamp(Math.round(Number(frustrationScore) || 0), 0, 100),
    frustrationScore: clamp(Math.round(Number(frustrationScore) || 0), 0, 100),
    frustrationLevelBefore: difficulty.level,
    difficulty,
    sellableItemIds: pool,
    /** Shop stock — separate from player cart */
    shopStock: {},
    customers: [],
    activeCustomerId: null,
    unitValue,
    cashMult: Number(cashMult) || 1,
    completedCount: 0,
    leftCount: 0,
    coinsEarned: 0,
    events: [],
    closed: false,
    catalog: getAllShopCatalogItems(),
    lastTickAt: 0,
  };

  for (let i = 0; i < difficulty.maxCustomers; i += 1) {
    addCustomerToQueue(shop, { silent: i > 0 });
  }
  markFrontServing(shop);

  emitLocal(shop, SHOP_EVENTS.SHOP_OPENED, {
    customerCount: shop.customers.length,
    difficulty: shop.difficulty,
    sellableItemIds: pool,
  });

  return shop;
}

/** Join the queue up to the frustration cap. No produce pool means nobody waits. */
export function addCustomerToQueue(shop, { silent = false } = {}) {
  if (!shop || shop.closed) return null;
  const living = livingCustomers(shop);
  // High frustration keeps this cap small so the stall stays manageable.
  if (living.length >= shop.difficulty.maxCustomers) return null;
  if (!shop.sellableItemIds?.length) return null;

  const customer = createCustomerFromPool(
    shop.sellableItemIds,
    shop.difficulty,
    shop.unitValue,
  );
  if (!customer.requestedItems.length) return null;

  customer.queueIndex = living.length;
  shop.customers.push(customer);

  if (!silent) {
    emitLocal(shop, SHOP_EVENTS.CUSTOMER_JOINED_QUEUE, {
      customerId: customer.id,
      orderId: customer.orderId,
      queueIndex: customer.queueIndex,
    });
  }
  emitLocal(shop, SHOP_EVENTS.CUSTOMER_CREATED, {
    customerId: customer.id,
    orderId: customer.orderId,
    requestedItems: customer.requestedItems,
    patienceAtStart: customer.patienceAtStart,
  });
  emitLocal(shop, SHOP_EVENTS.CUSTOMER_ORDER_GENERATED, {
    customerId: customer.id,
    orderId: customer.orderId,
    requestedItems: customer.requestedItems,
  });

  markFrontServing(shop);
  return customer;
}

/**
 * Keep the order pool aligned with the active farm challenge.
 * Waiting customers whose items are no longer sellable are gently dismissed
 * and replaced so harvests of the new crop can sell immediately.
 */
export function syncWorldShopSellableIds(shop, sellableItemIds = []) {
  if (!shop || shop.closed) return shop;
  const pool = [...new Set((sellableItemIds || []).filter(Boolean))];
  const prevKey = (shop.sellableItemIds || []).slice().sort().join(',');
  const nextKey = pool.slice().sort().join(',');
  shop.sellableItemIds = pool;
  if (!pool.length || prevKey === nextKey) return shop;

  for (const customer of livingCustomers(shop)) {
    const obsolete = (customer.requestedItems || []).some(
      (line) =>
        (line.delivered || 0) < (line.qty || 0) &&
        !pool.includes(String(line.itemId || '')),
    );
    if (!obsolete) continue;
    customer.status = CUSTOMER_STATUS.LEFT;
    customer.speech = '🙂 Back soon for the new harvest!';
    customer.patienceAtEnd = customer.patience;
  }

  while (livingCustomers(shop).length < shop.difficulty.maxCustomers) {
    const added = addCustomerToQueue(shop, { silent: true });
    if (!added) break;
  }
  markFrontServing(shop);
  return shop;
}

/**
 * Gradually refresh difficulty when CSF changes (new joiners / drain rate).
 * Does not rewrite existing open orders.
 */
export function adaptWorldShopFrustration(shop, frustrationScore, frustrationLevel = null) {
  if (!shop || shop.closed) return shop;
  const score = clamp(Math.round(Number(frustrationScore) || 0), 0, 100);
  const previous = Number(shop.frustrationScore) || 0;
  const nextDiff = getShopDifficulty(score, frustrationLevel);
  shop.frustrationScore = score;
  shop.difficulty = nextDiff;
  // A rising score gives current customers a little extra patience.
  if (score > previous) {
    for (const customer of livingCustomers(shop)) {
      customer.patience = Math.min(
        customer.maxPatience || 100,
        customer.patience + 8,
      );
    }
  }

  // Trim excess waiters gently when frustration rises (supportive)
  let living = livingCustomers(shop);
  while (living.length > nextDiff.maxCustomers) {
    const last = living[living.length - 1];
    last.status = CUSTOMER_STATUS.LEFT;
    last.speech = '🙂 I will come back later.';
    last.patienceAtEnd = last.patience;
    // Not counted as impatient leave / failure
    living = livingCustomers(shop);
  }

  // Fill toward target when frustration drops
  while (livingCustomers(shop).length < nextDiff.maxCustomers) {
    const added = addCustomerToQueue(shop);
    if (!added) break;
  }

  markFrontServing(shop);
  return shop;
}

/**
 * Move harvested carry stack directly into shop stock, then FIFO fulfill.
 */
export function loadCarryStackToShop(shop, carryStack = [], fallbacks = {}) {
  if (!shop || shop.closed) return { ok: false, reason: 'closed' };
  const stock = inventoryFromCartStack(carryStack, fallbacks);
  const moved = {};
  for (const [id, qty] of Object.entries(stock)) {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (!n) continue;
    shop.shopStock[id] = (shop.shopStock[id] || 0) + n;
    moved[id] = n;
  }
  const unloadEv = emitLocal(shop, SHOP_EVENTS.SHOP_ITEM_UNLOADED, {
    itemId: Object.keys(moved).join(','),
    qty: Object.values(moved).reduce((a, b) => a + b, 0),
    shopStockAfter: { ...shop.shopStock },
    source: 'farm_shop',
  });
  const fulfill = autoFulfillQueue(shop);

  // Always pay for every unloaded item so Press-E never leaves cash unchanged.
  const unit = Math.max(1, Math.round(Number(shop.unitValue) || 10));
  const unitsSold = Object.values(moved).reduce(
    (sum, n) => sum + (Number(n) || 0),
    0,
  );
  const pay = unitsSold * unit;
  if (pay > 0) {
    shop.coinsEarned = (shop.coinsEarned || 0) + pay;
    emitLocal(shop, SHOP_EVENTS.CUSTOMER_PAID, {
      customerId: 'unload_sale',
      qty: unitsSold,
      reward: pay,
    });
  }
  // Clear leftover stock so the same items are not sold twice later
  for (const id of Object.keys(moved)) {
    delete shop.shopStock[id];
  }

  return {
    ok: true,
    moved,
    leftoverSold: moved,
    shopStock: shop.shopStock,
    unloadEvent: unloadEv,
    completed: fulfill.completed || [],
    partial: fulfill.partial || [],
    events: fulfill.events || [],
    rewards: pay > 0 ? [pay] : [],
  };
}

/**
 * Move qty of itemId from player stock map into shopStock, then FIFO fulfill.
 */
export function unloadItemsToShop(shop, playerStock, itemId, qty = 1) {
  if (!shop || shop.closed) return { ok: false, reason: 'closed' };
  const id = String(itemId || '');
  const want = Math.max(1, Math.floor(Number(qty) || 1));
  const have = Math.max(0, Math.floor(Number(playerStock?.[id]) || 0));
  if (!id || have < 1) return { ok: false, reason: 'empty' };
  const move = Math.min(want, have);

  playerStock[id] = have - move;
  if (playerStock[id] <= 0) delete playerStock[id];
  shop.shopStock[id] = (shop.shopStock[id] || 0) + move;

  const unloadEv = emitLocal(shop, SHOP_EVENTS.SHOP_ITEM_UNLOADED, {
    itemId: id,
    qty: move,
    shopStockAfter: { ...shop.shopStock },
  });

  const fulfill = autoFulfillQueue(shop);
  return {
    ok: true,
    moved: move,
    playerStock,
    shopStock: shop.shopStock,
    unloadEvent: unloadEv,
    ...fulfill,
  };
}

function customerCanTakeStock(customer, shop) {
  return (customer?.requestedItems || []).some(
    (line) =>
      (line.delivered || 0) < (line.qty || 0) &&
      (shop.shopStock[line.itemId] || 0) > 0,
  );
}

/**
 * Any waiting customer whose order matches shop stock can buy.
 * Leftover stock is sold as a walk-in so unloading always pays cash.
 */
export function autoFulfillQueue(shop) {
  if (!shop || shop.closed) {
    return { completed: [], partial: [], rewards: [], events: [] };
  }

  const completed = [];
  const partial = [];
  const rewards = [];
  const events = [];
  const seenPartial = new Set();

  let guard = 0;
  while (guard < 40) {
    guard += 1;
    const customer = livingCustomers(shop).find((c) =>
      customerCanTakeStock(c, shop),
    );
    if (!customer) break;

    let progressed = false;
    for (const line of customer.requestedItems) {
      while (
        line.delivered < line.qty &&
        (shop.shopStock[line.itemId] || 0) > 0
      ) {
        shop.shopStock[line.itemId] -= 1;
        if (shop.shopStock[line.itemId] <= 0) delete shop.shopStock[line.itemId];
        line.delivered += 1;
        progressed = true;
        events.push(
          emitLocal(shop, SHOP_EVENTS.ITEM_DELIVERED, {
            customerId: customer.id,
            orderId: customer.orderId,
            itemId: line.itemId,
            delivered: line.delivered,
            needed: line.qty,
          }),
        );
      }
    }

    const done = customer.requestedItems.every((l) => l.delivered >= l.qty);
    if (done) {
      const result = completeCustomer(shop, customer);
      if (result.ok) {
        completed.push(result.customer);
        rewards.push(result.reward);
        if (result.event) events.push(result.event);
      }
      continue;
    }

    if (progressed && !seenPartial.has(customer.id)) {
      seenPartial.add(customer.id);
      partial.push(customer);
      events.push(
        emitLocal(shop, SHOP_EVENTS.CUSTOMER_ORDER_PARTIALLY_FULFILLED, {
          customerId: customer.id,
          orderId: customer.orderId,
          requestedItems: customer.requestedItems,
        }),
      );
      customer.speech = '🙂 Almost there — thank you!';
    }
    continue;
  }

  markFrontServing(shop);
  // Soft refill of queue after completions
  while (livingCustomers(shop).length < shop.difficulty.maxCustomers) {
    const added = addCustomerToQueue(shop);
    if (!added) break;
  }
  markFrontServing(shop);

  return { completed, partial, rewards, events, shop };
}

function completeCustomer(shop, customer) {
  if (!customer) return { ok: false };

  const reward = Math.max(
    1,
    Math.round(customer.reward * (shop.cashMult || 1)),
  );
  customer.status = CUSTOMER_STATUS.SERVED;
  customer.served = true;
  customer.patienceAtEnd = customer.patience;
  customer.speech = '😊 Thank you!';
  shop.completedCount += 1;
  shop.coinsEarned += reward;

  const ev = emitLocal(shop, SHOP_EVENTS.CUSTOMER_ORDER_COMPLETED, {
    customerId: customer.id,
    orderId: customer.orderId,
    reward,
    requestedItems: customer.requestedItems,
    orderCompletionTime: Date.now() - customer.createdAt,
  });
  emitLocal(shop, SHOP_EVENTS.CUSTOMER_PAID, {
    customerId: customer.id,
    orderId: customer.orderId,
    reward,
  });
  emitLocal(shop, SHOP_EVENTS.ORDER_COMPLETED, {
    customerId: customer.id,
    orderId: customer.orderId,
    reward,
  });

  markFrontServing(shop);
  return { ok: true, customer, reward, event: ev };
}

/**
 * Drain patience on the difficulty tick.
 * High frustration drains faster. At zero the customer leaves and counts as a shop failure.
 */
export function tickWorldShopPatience(shop, now = Date.now()) {
  if (!shop || shop.closed) return { events: [], left: [] };
  const tickMs = shop.difficulty.tickMs || 700;
  if (shop.lastTickAt && now - shop.lastTickAt < tickMs) {
    return { events: [], left: [], shop };
  }
  shop.lastTickAt = now;

  const fallbackDrain = shop.difficulty.patienceDrainPerTick || 2;
  const events = [];
  const left = [];

  for (const c of shop.customers) {
    if (
      c.status === CUSTOMER_STATUS.SERVED ||
      c.status === CUSTOMER_STATUS.LEFT
    ) {
      continue;
    }
    const before = c.patience;
    const drain = Number(c.patienceDrainPerTick) > 0 ? c.patienceDrainPerTick : fallbackDrain;
    c.patience = Math.max(0, c.patience - drain);
    if (c.patience !== before) {
      events.push(
        emitLocal(shop, SHOP_EVENTS.CUSTOMER_PATIENCE_CHANGED, {
          customerId: c.id,
          patience: c.patience,
          patienceAtStart: c.patienceAtStart,
        }),
      );
    }

    const ratio = c.patience / c.maxPatience;
    // Under 35% patience the customer looks impatient, except the one being served.
    if (ratio <= 0.35 && c.status !== CUSTOMER_STATUS.IMPATIENT) {
      if (c.id !== shop.activeCustomerId) {
        c.status = CUSTOMER_STATUS.IMPATIENT;
        events.push(
          emitLocal(shop, SHOP_EVENTS.CUSTOMER_IMPATIENT, {
            customerId: c.id,
            patience: c.patience,
          }),
        );
      }
      c.speech = '😠 I have been waiting for a while!';
    } else if (ratio > 0.35 && c.id !== shop.activeCustomerId) {
      c.speech = '🙂 I am waiting for my order.';
    }

    // A leave feeds the frustration model's shop-customers-left signal.
    if (c.patience <= 0) {
      c.status = CUSTOMER_STATUS.LEFT;
      c.served = false;
      c.patienceAtEnd = 0;
      c.speech = '😞 I could not wait any longer.';
      shop.leftCount += 1;
      left.push(c);
      events.push(
        emitLocal(shop, SHOP_EVENTS.CUSTOMER_LEFT, {
          customerId: c.id,
          orderId: c.orderId,
          customerLeft: true,
          reason: 'patience_expired',
          patienceAtStart: c.patienceAtStart,
          patienceAtEnd: 0,
          requestedItems: c.requestedItems,
        }),
      );
      events.push(
        emitLocal(shop, SHOP_EVENTS.ORDER_FAILED, {
          customerId: c.id,
          orderId: c.orderId,
          reason: 'patience_expired',
        }),
      );
    }
  }

  markFrontServing(shop);
  while (livingCustomers(shop).length < shop.difficulty.maxCustomers) {
    const added = addCustomerToQueue(shop);
    if (!added) break;
  }
  markFrontServing(shop);

  return { events, left, shop };
}

/** HUD copy of stock, queue, coins, and the frustration score that set this shop. */
export function snapshotWorldShop(shop) {
  if (!shop) return null;
  return {
    sessionId: shop.sessionId,
    shopStock: { ...shop.shopStock },
    customers: livingCustomers(shop).map((c) => ({
      id: c.id,
      orderId: c.orderId,
      status: c.status,
      queueIndex: c.queueIndex,
      patience: c.patience,
      maxPatience: c.maxPatience,
      speech: c.speech,
      reward: c.reward,
      requestedItems: c.requestedItems.map((l) => ({ ...l })),
    })),
    activeCustomerId: shop.activeCustomerId,
    difficulty: shop.difficulty,
    completedCount: shop.completedCount,
    leftCount: shop.leftCount,
    coinsEarned: shop.coinsEarned,
    frustrationScore: shop.frustrationScore,
  };
}

/** Close the stall and record how much the frustration score moved during the visit. */
export function closeWorldShop(shop, frustrationAfter = null) {
  if (!shop) return null;
  shop.closed = true;
  shop.closedAt = Date.now();
  const after =
    frustrationAfter != null
      ? clamp(Math.round(Number(frustrationAfter) || 0), 0, 100)
      : null;
  shop.frustrationAfter = after;
  shop.recoveryDelta =
    after != null ? shop.frustrationBefore - after : null;
  emitLocal(shop, SHOP_EVENTS.SHOP_CLOSED, {
    completedCount: shop.completedCount,
    leftCount: shop.leftCount,
    coinsEarned: shop.coinsEarned,
  });
  if (after != null) {
    emitLocal(shop, SHOP_EVENTS.RECOVERY_SNAPSHOT, {
      frustrationBefore: shop.frustrationBefore,
      frustrationAfter: after,
      recoveryDelta: shop.recoveryDelta,
    });
  }
  return {
    shopStock: { ...shop.shopStock },
    coinsEarned: shop.coinsEarned,
    completedCount: shop.completedCount,
    leftCount: shop.leftCount,
    recoveryDelta: shop.recoveryDelta,
    frustrationBefore: shop.frustrationBefore,
    frustrationAfter: after,
    events: shop.events,
  };
}

/** Face for the customer HUD. Same 65% and 35% patience cutoffs as mood alerts. */
export function patienceMood(customer) {
  if (!customer) return { label: '—', face: '🙂', ratio: 1 };
  const ratio = customer.patience / Math.max(1, customer.maxPatience);
  if (ratio > 0.65) return { label: 'Patient', face: '😊', ratio };
  if (ratio > 0.35) return { label: 'Waiting', face: '😐', ratio };
  return { label: 'Impatient', face: '😠', ratio };
}

/** Remaining quantity on each line of the order bubble. */
export function orderLineProgress(customer) {
  if (!customer) return [];
  return customer.requestedItems.map((l) => ({
    ...l,
    remaining: Math.max(0, l.qty - l.delivered),
    done: l.delivered >= l.qty,
  }));
}

/** Customer at the counter, or the first person still in the queue. */
export function getActiveCustomer(shop) {
  if (!shop) return null;
  return (
    shop.customers.find((c) => c.id === shop.activeCustomerId) ||
    livingCustomers(shop)[0] ||
    null
  );
}

/* ── Legacy modal session helpers (thin wrappers) ── */

/** Older modal shop. The cart is treated as stall stock so the same fulfill path runs. */
export function createShopSession(opts = {}) {
  const stock = inventoryFromCartStack(opts.cartStack || [], {
    cropId: opts.cropId,
    animalProduceId: opts.animalProduceId,
  });
  const ids = Object.keys(stock);
  const shop = createWorldShop({
    ...opts,
    sellableItemIds: ids.length ? ids : [opts.cropId || 'tomato'],
  });
  // Legacy treated cart as stock; keep that for old modal path
  shop.stock = { ...stock };
  shop.shopStock = { ...stock };
  return shop;
}

/** Hand one carried item to the queue and pay if an order completes. */
export function deliverItemToActiveCustomer(session, itemId) {
  const stock = session.shopStock || session.stock || {};
  if ((stock[itemId] || 0) < 1) return { ok: false, reason: 'out_of_stock' };
  stock[itemId] -= 1;
  if (stock[itemId] <= 0) delete stock[itemId];
  session.shopStock = stock;
  session.stock = stock;
  const result = autoFulfillQueue(session);
  const customer = getActiveCustomer(session);
  return {
    ok: true,
    customer,
    complete: result.completed.length > 0,
    reward: result.rewards[0] || 0,
    session,
  };
}

/** The physical shop is first-in-first-out, so picking a customer is refused. */
export function selectCustomer() {
  return { ok: false, reason: 'fifo_only' };
}

/** Modal-shop alias for the world patience tick. */
export function tickShopPatience(session) {
  return tickWorldShopPatience(session);
}

/** Close the modal shop and return unsold stock as a carry stack. */
export function closeShopSession(session, frustrationAfter = null) {
  const snap = closeWorldShop(session, frustrationAfter);
  if (!snap) return null;
  return {
    ...snap,
    remainingStack: cartStackFromInventory(session.shopStock || {}),
    remainingCount: countInventory(session.shopStock || {}),
  };
}

export { countInventory, cartStackFromInventory, inventoryFromCartStack };
