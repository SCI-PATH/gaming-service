/**
 * Streaming + timed client for avatar chat.
 * Supports JSON (legacy) and SSE stream from /api/avatar-chat?stream=1
 */

const CLIENT_TIMEOUT_MS = 45000;

const LOCAL_FALLBACKS = [
  "You're not alone feeling mixed up. Look at the farm story in the question—what natural link (water, air, soil, insects) might matter? What would you rule out first?",
  "It's okay that this feels hard. Shrink it: which single word in the science question is newest? Start there, then pick the farm choice that matches.",
  "I hear the grind. Stay with your farm quest—what is the question really asking plants or soil to do? Name one tiny next step.",
];

function localFallback(studentMessage = '') {
  const msg = String(studentMessage).toLowerCase();
  if (msg.includes('confused') || msg.includes('hint')) return LOCAL_FALLBACKS[0];
  if (msg.includes('hard')) return LOCAL_FALLBACKS[1];
  return LOCAL_FALLBACKS[2];
}

/**
 * Stream mentor reply. Calls onToken as text arrives (real-time capture of AI response).
 * @param {object} opts
 * @param {(chunk: string, full: string) => void} [opts.onToken]
 * @param {(meta: object) => void} [opts.onMeta]
 */
export async function streamAvatarChat({
  contextPayload,
  studentMessage,
  quickPrompt,
  history = [],
  signal,
  onToken,
  onMeta,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  let full = '';

  try {
    const res = await fetch('/api/avatar-chat?stream=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        contextPayload,
        studentMessage,
        quickPrompt,
        history,
        stream: true,
        intervention_mode: contextPayload?.intervention_mode,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Fall back to non-stream endpoint
      return requestAvatarChatOnce({
        contextPayload,
        studentMessage,
        quickPrompt,
        history,
        signal: controller.signal,
      });
    }

    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('text/event-stream') && !ctype.includes('ndjson')) {
      const data = await res.json().catch(() => null);
      if (data?.reply) {
        onToken?.(data.reply, data.reply);
        onMeta?.(data);
        return {
          reply: data.reply,
          provider: data.provider,
          model: data.model,
          fallback: Boolean(data.fallback),
          avatarMood: data.avatarMood || 'neutral',
          error: data.error || null,
        };
      }
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No stream body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let meta = {
      provider: 'unknown',
      model: null,
      fallback: false,
      avatarMood: 'neutral',
      error: null,
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        const payload = trimmed.startsWith('data:')
          ? trimmed.slice(5).trim()
          : trimmed;
        if (payload === '[DONE]') continue;
        let evt;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (evt.type === 'meta') {
          meta = { ...meta, ...evt };
          onMeta?.(meta);
        } else if (evt.type === 'token' && evt.text) {
          full += evt.text;
          onToken?.(evt.text, full);
        } else if (evt.type === 'done' && evt.reply) {
          full = evt.reply;
          onToken?.('', full);
          meta = { ...meta, ...evt };
        } else if (evt.type === 'error') {
          meta.error = evt.error || 'stream error';
        }
      }
    }

    if (!full.trim()) {
      full = localFallback(studentMessage);
      meta.fallback = true;
      meta.provider = meta.provider || 'fallback';
      onToken?.(full, full);
    }

    return {
      reply: full.trim(),
      provider: meta.provider,
      model: meta.model,
      fallback: Boolean(meta.fallback),
      avatarMood: meta.avatarMood || 'neutral',
      error: meta.error || null,
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      const reply = full.trim() || localFallback(studentMessage);
      return {
        reply,
        provider: full ? 'partial' : 'client-timeout',
        model: null,
        fallback: true,
        avatarMood: 'empathetic',
        error: full
          ? 'Stream interrupted — showing what arrived.'
          : 'Request timed out. Using fast mentor mode.',
      };
    }
    const reply = localFallback(studentMessage);
    onToken?.(reply, reply);
    return {
      reply,
      provider: 'client-error',
      model: null,
      fallback: true,
      avatarMood: 'empathetic',
      error: err instanceof Error ? err.message : 'Avatar chat failed',
    };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

/** Non-stream POST (backup) */
export async function requestAvatarChat(opts) {
  return streamAvatarChat(opts);
}

async function requestAvatarChatOnce({
  contextPayload,
  studentMessage,
  quickPrompt,
  history,
  signal,
}) {
  const res = await fetch('/api/avatar-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextPayload,
      studentMessage,
      quickPrompt,
      history,
      intervention_mode: contextPayload?.intervention_mode,
    }),
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Avatar chat failed (${res.status})`);
  }
  return {
    reply: data?.reply || localFallback(studentMessage),
    provider: data?.provider || 'unknown',
    model: data?.model || null,
    fallback: Boolean(data?.fallback),
    avatarMood: data?.avatarMood || 'neutral',
    error: data?.error || null,
  };
}
