/**
 * Backend HTTP server + JSON file database.
 * Run only this process: `npm run backend` or `npm run dev -w backend`
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Lightweight .env loader (no dotenv dependency) */
function loadDotEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(here, '..', '.env'),
    resolve(here, '.env'),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) return;
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

const PORT = Number(process.env.AVATAR_PORT || process.env.PORT || 8002);
const HOST = process.env.HOST || '0.0.0.0';

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    const { dbPath } = await import('./lib/db.mjs');
    sendJson(res, 200, {
      ok: true,
      service: 'gaming-service-backend',
      db: dbPath(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/storyline') {
    try {
      const studentId = url.searchParams.get('studentId') || '';
      const { getStorylineRecord } = await import('./lib/db.mjs');
      const record = getStorylineRecord(studentId);
      sendJson(res, 200, { ok: true, record });
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        error: err instanceof Error ? err.message : 'Bad request',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/storyline') {
    sendJson(res, 410, {
      ok: false,
      error: 'storyline_generation_disabled',
      message: 'AI storyline generation has been removed.',
    });
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
      const { handleAvatarChat, handleAvatarChatStream } = await import(
        './lib/handler.mjs'
      );
      const stream =
        body?.stream === true ||
        url.searchParams.get('stream') === '1' ||
        String(req.headers.accept || '').includes('text/event-stream');

      if (stream) {
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

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://${HOST}:${PORT}`);
  import('./lib/db.mjs')
    .then(({ dbPath }) => {
      // eslint-disable-next-line no-console
      console.log(`[backend] database ${dbPath()}`);
    })
    .catch(() => {});
  // eslint-disable-next-line no-console
  console.log(
    `[backend] LLAMA_PROVIDER=${process.env.LLAMA_PROVIDER || 'offline'} MODEL=${process.env.LLAMA_MODEL || 'llama-3.1-8b-instant'} groqKey=${process.env.GROQ_API_KEY ? 'set' : 'missing'}`,
  );
});
