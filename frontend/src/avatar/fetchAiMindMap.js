/**
 * Client: AI mind map covering incorrect answers, personalized by frustration.
 */
import { softProviderNote } from './kidFriendlySpeech.js';

export async function fetchAiMindMap({
  attempts = [],
  misconceptions = [],
  frustrationScore = null,
  frustrationLevel = null,
  frustrationAdaptation = null,
  signal,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch('/api/mind-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        attempts,
        misconceptions,
        frustrationScore,
        frustrationLevel,
        frustrationAdaptation,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Mind map API ${res.status}`);
    }
    return {
      mindMap: data.mindMap || null,
      provider: data.provider || 'unknown',
      note: softProviderNote(data.note) || data.note || '',
      aiError: Boolean(data.aiError),
      frustrationLevel: data.frustrationLevel || frustrationLevel || null,
    };
  } finally {
    clearTimeout(timer);
  }
}
