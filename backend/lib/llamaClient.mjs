/**
 * Chat providers: offline | groq (alias: grok) | ollama | vllm
 * Groq cloud is the primary tutor. OpenRouter is used only when Groq
 * cannot produce a knowledgeable answer (uncertain/empty reply or Groq error).
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
  // Groq retired llama-3.3-70b-versatile / llama-3.1-8b-instant (Aug 2026).
  let model = env(
    'LLAMA_MODEL',
    provider === 'groq' ? 'openai/gpt-oss-120b' : 'llama3.2:3b',
  );
  if (provider === 'groq') {
    const retired = {
      'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
      'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
      'llama-3.1-70b-versatile': 'openai/gpt-oss-120b',
      'mixtral-8x7b-32768': 'openai/gpt-oss-120b',
    };
    const key = String(model || '').trim().toLowerCase();
    if (retired[key]) model = retired[key];
  }
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
    openrouterApiKey: env('OPENROUTER_API_KEY', ''),
    openrouterBase: env(
      'OPENROUTER_BASE_URL',
      'https://openrouter.ai/api/v1',
    ).replace(/\/$/, ''),
    openrouterModel: env('OPENROUTER_MODEL', 'openai/gpt-4o-mini'),
    openrouterReferer: env(
      'OPENROUTER_HTTP_REFERER',
      'https://sage-farm.local',
    ),
    openrouterTitle: env('OPENROUTER_APP_TITLE', 'SAGE Farm Mentor'),
    temperature: Number(env('LLAMA_TEMPERATURE', '0.7')) || 0.7,
  };
}

/**
 * Strong signals that Groq did not have enough knowledge to teach.
 * Pedagogical hedges ("maybe try…") are ignored so OpenRouter is not overused.
 */
export function looksLikeInsufficientKnowledge(content) {
  const s = String(content || '').trim();
  if (!s) return true;
  if (/\bINSUFFICIENT_KNOWLEDGE\b/i.test(s)) return true;
  const n = s.toLowerCase();
  const patterns = [
    /i don['’]?t want to guess/,
    /quiz key is not complete/,
    /not complete enough (for me )?to teach/,
    /i (do not|don['’]?t) (know enough|have enough (knowledge|information|context))/,
    /i (do not|don['’]?t) know (the answer|this|enough|how to (teach|explain|answer))/,
    /beyond my (current )?(knowledge|training)/,
    /outside (of )?my (knowledge|training)/,
    /knowledge cut[- ]?off/,
    /i (cannot|can['’]?t) (answer|teach|explain) (this|that|without)/,
    /my training (data )?(does not|doesn't) (include|cover)/,
    /i (do not|don['’]?t) have (the|this) (science )?knowledge/,
  ];
  return patterns.some((re) => re.test(n));
}

function hasOpenRouter(cfg = getLlamaConfig()) {
  return Boolean(cfg.openrouterApiKey?.trim());
}

function openRouterMessages(messages) {
  const list = Array.isArray(messages) ? messages.slice() : [];
  list.push({
    role: 'user',
    content:
      'PRIMARY TUTOR (Groq) did not have enough knowledge to teach this turn. ' +
      'Stay Sage for Grade 6–9. Use only the farm question and assessment-engine key in the context. ' +
      'Never invent a different quiz key. Never mention OpenRouter, Groq, or this fallback.',
  });
  return list;
}

async function chatOpenRouter({
  messages,
  maxTokens = null,
  temperature = null,
  responseFormat = null,
} = {}) {
  const cfg = getLlamaConfig();
  if (!hasOpenRouter(cfg)) {
    throw new Error('OPENROUTER_API_KEY is missing');
  }
  return openAiCompatibleChat({
    url: `${cfg.openrouterBase}/chat/completions`,
    apiKey: cfg.openrouterApiKey,
    model: cfg.openrouterModel,
    messages: openRouterMessages(messages),
    temperature: temperature ?? cfg.temperature,
    provider: 'openrouter',
    timeoutMs: Math.max(cfg.timeoutMs, 45000),
    maxTokens:
      maxTokens ??
      Math.max(
        cfg.maxTokens,
        Number(env('OPENROUTER_MAX_TOKENS', '400')) || 400,
      ),
    responseFormat,
    extraHeaders: {
      'HTTP-Referer': cfg.openrouterReferer,
      'X-Title': cfg.openrouterTitle,
    },
  });
}

async function withOpenRouterIfNeeded(primary, { messages, maxTokens, temperature, responseFormat }) {
  const cfg = getLlamaConfig();
  if (!hasOpenRouter(cfg)) return primary;
  if (!looksLikeInsufficientKnowledge(primary?.content)) return primary;
  try {
    const fallback = await chatOpenRouter({
      messages,
      maxTokens,
      temperature,
      responseFormat,
    });
    return {
      ...fallback,
      knowledgeFallback: true,
      primaryProvider: primary.provider,
      primaryModel: primary.model,
    };
  } catch {
    return primary;
  }
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
        'GROQ_API_KEY is missing. Add it to .env and restart the backend.',
      );
    }
    const groqOpts = {
      messages,
      maxTokens,
      temperature,
      responseFormat,
    };
    try {
      const result = await openAiCompatibleChat({
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
      return withOpenRouterIfNeeded(result, groqOpts);
    } catch (err) {
      if (hasOpenRouter(cfg)) {
        try {
          const fallback = await chatOpenRouter(groqOpts);
          return {
            ...fallback,
            knowledgeFallback: true,
            primaryProvider: 'groq',
            primaryError: err instanceof Error ? err.message : String(err),
          };
        } catch {
          throw err;
        }
      }
      throw err;
    }
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
  extraHeaders = null,
}) {
  const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
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

  if (cfg.provider === 'groq' && hasOpenRouter(cfg)) {
    const result = await chatCompletion({ messages, stream: false });
    onMeta?.({
      provider: result.provider,
      model: result.model,
      fallback: Boolean(result.knowledgeFallback),
      knowledgeFallback: Boolean(result.knowledgeFallback),
    });
    const text = String(result.content || '');
    if (text) onToken(text);
    return {
      provider: result.provider,
      model: result.model,
      knowledgeFallback: Boolean(result.knowledgeFallback),
    };
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
