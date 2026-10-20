/**
 * Question-level CSF frustration.
 * Uses calculateFrustrationScore — the same weights and companion-signal caps.
 * One incorrect or slow answer cannot by itself become a high score.
 */

import {
  calculateFrustrationScore,
  frustrationLevelFromScore,
} from './frustrationModel.js';
import { getEngagementSessionId } from './engagementSync.js';
import { studentStorageKey } from './mockStudents.js';
import {
  SHOP_BASE_PRICES,
  averageLevelFrustration,
  priceFromAverageFrustration,
} from './shopPricePolicy.js';

export { averageLevelFrustration, priceFromAverageFrustration };

const claimed = new Set();

/** Reject missing or negative times. Cap at two hours so a stuck clock cannot dominate CSF. */
export function validateResponseMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, 2 * 60 * 60 * 1000));
}

/** Pull the next gameplay score toward the new one so one noisy question cannot spike difficulty. */
export function smoothFrustration(previous, next, alpha = 0.35) {
  const n = Number(next);
  if (!Number.isFinite(n)) {
    return Number.isFinite(Number(previous)) ? Math.round(Number(previous)) : 0;
  }
  const clamped = Math.max(0, Math.min(100, n));
  const prev = Number(previous);
  if (!Number.isFinite(prev)) return Math.round(clamped);
  const a = Math.max(0.05, Math.min(1, Number(alpha) || 0.35));
  return Math.round(prev * (1 - a) + clamped * a);
}

/** Claim a quiz attempt once per page load so the same answer is not scored twice. */
export function claimAttemptKey(key) {
  const id = String(key || '').trim();
  // Already scored, or an empty key — the caller should ignore this attempt.
  if (!id || claimed.has(id)) return false;
  claimed.add(id);
  return true;
}

/** Drop one claim so a retried question can be scored again. */
export function releaseAttemptKey(key) {
  claimed.delete(String(key || '').trim());
}

/** Clear every in-memory attempt claim (new level or tests). */
export function resetAttemptClaims() {
  claimed.clear();
}

/**
 * @param {{ wasCorrect: boolean, responseTimeMs: number, metrics?: object, previousSmoothed?: number|null }} input
 */
export function scoreQuestionAttempt(input = {}) {
  const responseTimeMs = validateResponseMs(input.responseTimeMs);
  // No usable clock — do not invent a frustration score for this answer.
  if (responseTimeMs == null) {
    return { ok: false, error: 'invalid_response_time' };
  }
  const metrics = {
    ...(input.metrics && typeof input.metrics === 'object' ? input.metrics : {}),
  };
  const sec = responseTimeMs / 1000;
  if (!Number(metrics.time_per_question_avg_sec)) {
    metrics.time_per_question_avg_sec = sec;
  }
  const result = calculateFrustrationScore(metrics);
  const smoothedScore = smoothFrustration(input.previousSmoothed, result.score);
  return {
    ok: true,
    responseTimeMs,
    score: result.score,
    level: result.level,
    signals: result.signals,
    parts: result.parts,
    dominant: result.dominant,
    smoothedScore,
    smoothedLevel: frustrationLevelFromScore(smoothedScore),
    audit: {
      responseTimeMs,
      wasCorrect: Boolean(input.wasCorrect),
      metrics,
      parts: result.parts,
      dominant: result.dominant,
      recoveryFactor: result.recoveryFactor,
    },
  };
}

function shopPriceStorageKey(levelId, sessionId) {
  return studentStorageKey(
    `scipath_shop_prices__L${Number(levelId) || 1}__${String(sessionId || 'local')}`,
  );
}

/**
 * Freeze prices once per level session so a refresh cannot recalculate them.
 */
export function freezeShopOffer({ levelId, sessionId, scores } = {}) {
  const existing = readShopOffer(levelId, sessionId);
  // Already frozen for this level session — a refresh must not reprice the shop.
  if (existing?.prices && Object.keys(existing.prices).length) return existing;
  const avgFrustration = averageLevelFrustration(scores);
  const prices = {};
  for (const [itemId, basePrice] of Object.entries(SHOP_BASE_PRICES)) {
    prices[itemId] = priceFromAverageFrustration(basePrice, avgFrustration);
  }
  const snapshot = {
    levelId: Number(levelId) || 1,
    sessionId: sessionId || getEngagementSessionId() || null,
    avgFrustration,
    prices,
    multiplier: avgFrustration == null ? 1 : undefined,
    frozenAt: Date.now(),
  };
  try {
    localStorage.setItem(
      shopPriceStorageKey(snapshot.levelId, snapshot.sessionId),
      JSON.stringify(snapshot),
    );
  } catch {
    /* private mode */
  }
  return snapshot;
}

/** Read the frozen shop prices for this level, or null if none were saved. */
export function readShopOffer(levelId, sessionId) {
  const sid = sessionId || getEngagementSessionId() || null;
  try {
    const raw = localStorage.getItem(shopPriceStorageKey(levelId, sid));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.prices) return null;
    if (Number(data.levelId) !== Number(levelId || data.levelId)) return null;
    return data;
  } catch {
    return null;
  }
}
