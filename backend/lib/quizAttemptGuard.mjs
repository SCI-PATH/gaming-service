/**
 * Server-side quiz timing and CSF frustration.
 * Client scores are ignored. The same calculateFrustrationScore formula runs here.
 */

import {
  calculateFrustrationScore,
  frustrationLevelFromScore,
} from '../../frontend/src/data/frustrationModel.js';

/** Accept a quiz timing, or reject a negative one. Caps at two hours. */
export function normalizeResponseMs(value) {
  if (value == null || value === '') return { ok: true, responseMs: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: 'invalid_response_ms' };
  }
  return { ok: true, responseMs: Math.round(Math.min(n, 2 * 60 * 60 * 1000)) };
}

/** Recompute frustration on the server from timing and this answer. Client scores are unused. */
export function scoreServerFrustration(body = {}, responseMs = null) {
  const metrics =
    body.metrics && typeof body.metrics === 'object' ? { ...body.metrics } : {};
  if (responseMs != null && !Number(metrics.time_per_question_avg_sec)) {
    metrics.time_per_question_avg_sec = responseMs / 1000;
  }
  if (metrics.correct_answers == null && metrics.incorrect_answers == null) {
    const correct = Boolean(body.isCorrect);
    metrics.correct_answers = correct ? 1 : 0;
    metrics.incorrect_answers = correct ? 0 : 1;
    metrics.consecutive_fails = correct ? 0 : Number(body.retryIndex) > 0 ? Number(body.retryIndex) : 1;
  }
  const result = calculateFrustrationScore(metrics);
  return {
    score: result.score,
    level: result.level || frustrationLevelFromScore(result.score),
    signals: result.signals || [],
    parts: result.parts || {},
    dominant: result.dominant || [],
    metrics,
  };
}
