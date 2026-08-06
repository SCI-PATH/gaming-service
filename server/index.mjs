/**
 * Standalone HTTP server: POST /api/avatar-chat
 * Dev: run alongside Vite (`npm run server`) or use the Vite middleware plugin.
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleAvatarChat } from './lib/handler.mjs';

/** Lightweight .env loader (no dotenv dependency) */
function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

const PORT = Number(process.env.AVATAR_PORT || process.env.PORT || 8787);

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'avatar-chat' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/mind-map') {
    try {
      const body = await readJson(req);
      const { generateMindMapFromMistakes } = await import(
        './lib/mindMapGenerator.mjs'
      );
      const result = await generateMindMapFromMistakes(body);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : 'Bad request',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/avatar-chat') {
    try {
      const body = await readJson(req);
      const stream =
        body?.stream === true ||
        url.searchParams.get('stream') === '1' ||
        String(req.headers.accept || '').includes('text/event-stream');

      if (stream) {
        const { handleAvatarChatStream } = await import('./lib/handler.mjs');
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        await handleAvatarChatStream(body, (chunk) => res.write(chunk));
        res.end();
        return;
      }

      const result = await handleAvatarChat(body);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : 'Bad request',
      });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[avatar] listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(
    `[avatar] LLAMA_PROVIDER=${process.env.LLAMA_PROVIDER || 'offline'} MODEL=${process.env.LLAMA_MODEL || 'llama-3.1-8b-instant'} groqKey=${process.env.GROQ_API_KEY ? 'set' : 'missing'}`,
  );
});
