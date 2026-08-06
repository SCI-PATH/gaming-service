/**
 * Vite middleware: POST /api/avatar-chat (+ optional ?stream=1 SSE)
 *            POST /api/mind-map  (AI mind map from ALL incorrect answers)
 */
import { loadEnv } from 'vite';
import { handleAvatarChat, handleAvatarChatStream } from './lib/handler.mjs';
import { generateMindMapFromMistakes } from './lib/mindMapGenerator.mjs';

function applyEnv(mode = 'development') {
  const loaded = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readBody(req) {
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

function wantsStream(req, body) {
  if (body?.stream === true) return true;
  const url = req.url || '';
  if (url.includes('stream=1')) return true;
  const accept = req.headers.accept || '';
  return accept.includes('text/event-stream');
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

export function avatarApiPlugin() {
  return {
    name: 'avatar-api-plugin',
    config(_cfg, { mode }) {
      applyEnv(mode);
    },
    configureServer(server) {
      applyEnv(server.config.mode || 'development');
      // eslint-disable-next-line no-console
      console.log(
        `[avatar] provider=${process.env.LLAMA_PROVIDER || 'offline'} model=${process.env.LLAMA_MODEL || 'default'} groqKey=${process.env.GROQ_API_KEY ? 'set' : 'missing'}`,
      );

      server.middlewares.use(async (req, res, next) => {
        const pathOnly = req.url?.split('?')[0];
        if (pathOnly !== '/api/avatar-chat' && pathOnly !== '/api/mind-map') {
          next();
          return;
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          cors(res);
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          cors(res);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await readBody(req);
          cors(res);

          if (pathOnly === '/api/mind-map') {
            const result = await generateMindMapFromMistakes(body);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(result));
            return;
          }

          if (wantsStream(req, body)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            if (typeof res.flushHeaders === 'function') res.flushHeaders();

            await handleAvatarChatStream(body, (chunk) => {
              res.write(chunk);
            });
            res.end();
            return;
          }

          const result = await handleAvatarChat(body);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 400;
          cors(res);
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : 'Bad request',
            }),
          );
        }
      });
    },
  };
}
