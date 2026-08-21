/**
 * Chat providers: offline | groq (alias: grok) | ollama | vllm
 * Groq cloud is preferred for real-time personalized replies on low-power laptops.
 */

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function normalizeProvider(raw) {
  const p = String(raw || 'offline').toLowerCase().trim();
  // User-facing "Grok" often means Groq (gsk_ keys) — map the alias
  if (p === 'grok' || p === 'groq-ai' || p === 'groqai') return 'groq';
  return p;
}

export function getLlamaConfig() {
  const hasGroqKey = Boolean(env('GROQ_API_KEY', '').trim());
  const provider = normalizeProvider(
    env('LLAMA_PROVIDER', hasGroqKey ? 'groq' : 'offline'),
  );
  const model = env(
    'LLAMA_MODEL',
    provider === 'groq' ? 'llama-3.3-70b-versatile' : 'llama3.2:3b',
  );
  const timeoutMs = Math.max(
    3000,
    Number(env('AVATAR_TIMEOUT_MS', provider === 'groq' ? '30000' : '12000')) ||
      12000,
  );
  return {
    provider,
    model,
    timeoutMs,
    maxTokens: Math.max(
      60,
      Number(env('AVATAR_MAX_TOKENS', '180')) || 180,
    ),
    ollamaBase: env('OLLAMA_BASE_URL', 'http://localhost:11434').replace(
      /\/$/,
      '',
    ),
    vllmBase: env('VLLM_BASE_URL', 'http://localhost:8000/v1').replace(
      /\/$/,
      '',
    ),
    // Spec endpoint: https://api.groq.com/openai/v1/chat/completions
    groqBase: env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1').replace(
      /\/$/,
      '',
    ),
    groqApiKey: env('GROQ_API_KEY', ''),
    temperature: Number(env('LLAMA_TEMPERATURE', '0.7')) || 0.7,
  };
}

/**
 * fetch with an Abort timeout (Node 18+ / browser).
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(
        `AI provider timed out after ${timeoutMs}ms (model may be too heavy for this device)`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ messages: Array<{role:string, content:string}>, stream?: boolean, maxTokens?: number, temperature?: number }} opts
 */
export async function chatCompletion({
  messages,
  stream = false,
  maxTokens = null,
  temperature = null,
  responseFormat = null,
} = {}) {
  const cfg = getLlamaConfig();

  if (cfg.provider === 'offline' || cfg.provider === 'fallback') {
    throw new Error('OFFLINE_MODE');
  }

  if (cfg.provider === 'groq') {
    if (!cfg.groqApiKey?.trim()) {
      throw new Error(
        'GROQ_API_KEY is missing. Add it to .env and restart the dev server.',
      );
    }
    return openAiCompatibleChat({
      url: `${cfg.groqBase}/chat/completions`,
      apiKey: cfg.groqApiKey,
      model: cfg.model,
      messages,
      temperature: temperature ?? cfg.temperature,
      provider: 'groq',
      timeoutMs: Math.max(cfg.timeoutMs, 45000),
      maxTokens: maxTokens ?? cfg.maxTokens,
      responseFormat,
    });
  }

  if (cfg.provider === 'vllm') {
    return openAiCompatibleChat({
      url: `${cfg.vllmBase}/chat/completions`,
      apiKey: env('VLLM_API_KEY', ''),
      model: cfg.model,
      messages,
      temperature: temperature ?? cfg.temperature,
      provider: 'vllm',
      timeoutMs: Math.max(cfg.timeoutMs, 45000),
      maxTokens: maxTokens ?? cfg.maxTokens,
    });
  }

  // Ollama — cap tokens + timeout so laptops are not hung
  const url = `${cfg.ollamaBase}/api/chat`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: Boolean(stream),
        // Unload soon after so RAM is freed (helps slow laptops)
        keep_alive: env('OLLAMA_KEEP_ALIVE', '0'),
        options: {
          temperature: temperature ?? cfg.temperature,
          num_predict:
            maxTokens ??
            (Number(env('OLLAMA_NUM_PREDICT', '120')) || 120),
        },
      }),
    },
    cfg.timeoutMs,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Ollama error ${res.status}: ${text || res.statusText || 'unknown'}`,
    );
  }

  const data = await res.json();
  const content =
    data?.message?.content ||
    data?.response ||
    (Array.isArray(data?.messages)
      ? data.messages[data.messages.length - 1]?.content
      : '') ||
    '';

  if (!String(content).trim()) {
    throw new Error('Ollama returned an empty response. Is the model pulled?');
  }

  return {
    content: String(content).trim(),
    provider: 'ollama',
    model: cfg.model,
    raw: data,
  };
}

async function openAiCompatibleChat({
  url,
  apiKey,
  model,
  messages,
  temperature,
  provider,
  timeoutMs,
  maxTokens: maxTokensOverride = null,
  responseFormat = null,
}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const maxTokens =
    maxTokensOverride ??
    (Number(env('AVATAR_MAX_TOKENS', '180')) || 180);

  const payload = {
    model,
    messages,
    temperature,
    stream: false,
    max_tokens: maxTokens,
  };
  if (responseFormat) payload.response_format = responseFormat;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `${provider} error ${res.status}: ${text || res.statusText || 'unknown'}`,
    );
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  if (!String(content).trim()) {
    throw new Error(`${provider} returned an empty response`);
  }

  return {
    content: String(content).trim(),
    provider,
    model,
    raw: data,
  };
}

/**
 * Stream tokens via callback. Works for offline (chunked), Ollama NDJSON, or non-stream fallback.
 * @param {{ messages: Array, onToken: (t: string) => void, onMeta?: (m: object) => void }} opts
 */
export async function streamChatCompletion({ messages, onToken, onMeta }) {
  const cfg = getLlamaConfig();

  if (cfg.provider === 'offline' || cfg.provider === 'fallback') {
    throw new Error('OFFLINE_MODE');
  }

  // Prefer Ollama native streaming for real tokens
  if (cfg.provider === 'ollama' || cfg.provider === 'llama' || !cfg.provider) {
    // handled below if provider is ollama (default after offline check is ollama when set)
  }

  if (cfg.provider === 'groq' || cfg.provider === 'vllm') {
    // Stream via OpenAI-compatible SSE (Groq / vLLM)
    const base = cfg.provider === 'groq' ? cfg.groqBase : cfg.vllmBase;
    const apiKey =
      cfg.provider === 'groq' ? cfg.groqApiKey : env('VLLM_API_KEY', '');
    if (cfg.provider === 'groq' && !apiKey?.trim()) {
      throw new Error(
        'GROQ_API_KEY is missing. Add it to .env and restart the dev server.',
      );
    }
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetchWithTimeout(
      `${base}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: cfg.temperature,
          stream: true,
          max_tokens: cfg.maxTokens || 180,
        }),
      },
      cfg.timeoutMs,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${cfg.provider} stream error ${res.status}: ${text}`);
    }
    onMeta?.({ provider: cfg.provider, model: cfg.model, fallback: false });
    await readOpenAiSse(res, onToken);
    return { provider: cfg.provider, model: cfg.model };
  }

  // Ollama stream:true
  const url = `${cfg.ollamaBase}/api/chat`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        keep_alive: env('OLLAMA_KEEP_ALIVE', '0'),
        options: {
          temperature: cfg.temperature,
          num_predict: Number(env('OLLAMA_NUM_PREDICT', '120')) || 120,
        },
      }),
    },
    Math.max(cfg.timeoutMs, 30000),
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama stream error ${res.status}: ${text}`);
  }

  onMeta?.({ provider: 'ollama', model: cfg.model, fallback: false });

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No Ollama stream body');
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const piece = row?.message?.content || row?.response || '';
      if (piece) onToken(piece);
      if (row?.done) return { provider: 'ollama', model: cfg.model };
    }
  }
  return { provider: 'ollama', model: cfg.model };
}

async function readOpenAiSse(res, onToken) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No SSE body');
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const piece = json?.choices?.[0]?.delta?.content || '';
        if (piece) onToken(piece);
      } catch {
        /* ignore */
      }
    }
  }
}
