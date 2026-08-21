/**
 * Client for POST /api/storyline (Grok / Groq JSON storyline).
 * If the backend is down (Vite 502) or Grok fails, use a local fallback
 * so the prototype still completes.
 */

import { buildFallbackStoryline } from './fallbackStoryline.js';

export async function requestLevelStoryline(payload, { timeoutMs = 45000 } = {}) {
  const fallback = {
    ok: true,
    storyline: buildFallbackStoryline(payload),
    provider: 'offline',
    fallback: true,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('/api/storyline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.storyline) {
      return data;
    }
    return {
      ...fallback,
      error: data?.error || `Storyline request failed (${res.status})`,
    };
  } catch (err) {
    return {
      ...fallback,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
