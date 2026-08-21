/**
 * Client: AI mind map covering ALL incorrect answers.
 */
export async function fetchAiMindMap({
  attempts = [],
  misconceptions = [],
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
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Mind map API ${res.status}`);
    }
    return {
      mindMap: data.mindMap || null,
      provider: data.provider || 'unknown',
      note: data.note || '',
      aiError: Boolean(data.aiError),
    };
  } finally {
    clearTimeout(timer);
  }
}
