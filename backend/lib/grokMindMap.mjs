/**
 * Grok / xAI JSON generation for Science mind maps.
 * Key never leaves the backend. Prefers XAI_API_KEY, then GROQ_API_KEY.
 */
import { fetchWithTimeout } from './llamaClient.mjs';

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function xaiConfig() {
  const apiKey = (env('XAI_API_KEY') || env('GROK_API_KEY')).trim();
  if (!apiKey) return null;
  return {
    provider: 'xai',
    apiKey,
    base: env('XAI_BASE_URL', 'https://api.x.ai/v1').replace(/\/$/, ''),
    model: env('XAI_MODEL', 'grok-4-1-fast-non-reasoning'),
    timeoutMs: Math.max(8000, Number(env('GROK_TIMEOUT_MS', '90000')) || 90000),
  };
}

function groqConfig() {
  const apiKey = env('GROQ_API_KEY').trim();
  if (!apiKey) return null;
  return {
    provider: 'groq',
    apiKey,
    base: env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    model: env('GROQ_MODEL') || env('LLAMA_MODEL') || 'openai/gpt-oss-120b',
    timeoutMs: Math.max(8000, Number(env('GROK_TIMEOUT_MS', '90000')) || 90000),
  };
}

export function getGrokConfig() {
  return xaiConfig() || groqConfig();
}

async function completeOnce(cfg, body) {
  const payload = { ...body };
  let res;
  try {
    res = await fetchWithTimeout(
      `${cfg.base}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      cfg.timeoutMs,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error(/timed out/i.test(message) ? 'Mind map generation timed out' : 'Mind map generation is temporarily unavailable'),
      { retryable: /timed out/i.test(message) },
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (/response_format|json_object/i.test(text) && payload.response_format) {
      delete payload.response_format;
      res = await fetchWithTimeout(
        `${cfg.base}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        cfg.timeoutMs,
      );
    }
  }
  if (!res.ok) {
    throw Object.assign(new Error('Mind map generation is temporarily unavailable'), {
      retryable: res.status >= 500,
    });
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content || '';
  if (!String(content).trim()) {
    throw Object.assign(new Error('The model returned an empty mind map'), { retryable: true });
  }
  return { content: String(content), provider: cfg.provider, model: cfg.model };
}

export async function grokJson({ system, user, temperature = 0.2, maxTokens = 1800 } = {}) {
  const configs = [xaiConfig(), groqConfig()].filter(Boolean);
  if (!configs.length) {
    throw Object.assign(
      new Error('Mind map generation is not configured. Set XAI_API_KEY (preferred) or GROQ_API_KEY.'),
      { retryable: false },
    );
  }
  const body = {
    model: configs[0].model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  };
  let lastErr = null;
  for (const cfg of configs) {
    try {
      return await completeOnce(cfg, { ...body, model: cfg.model });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
