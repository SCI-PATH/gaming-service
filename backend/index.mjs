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
    const { getPgStatus, isPostgresEnabled, query } = await import('./lib/pg.mjs');
    let engagement = { schema: null };
    let privileges = null;
    try {
      if (isPostgresEnabled()) {
        const priv = await query(`
          SELECT
            current_user AS db_user,
            current_database() AS db_name,
            has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_db,
            has_schema_privilege('public', 'USAGE') AS public_usage,
            has_schema_privilege('public', 'CREATE') AS public_create,
            has_schema_privilege('engagement_gaming', 'USAGE') AS engagement_usage
        `);
        privileges = priv.rows?.[0] || null;
      }
    } catch (err) {
      privileges = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
    try {
      const schema = await import('./lib/engagementSchema.mjs');
      if (isPostgresEnabled()) {
        await schema.ensureEngagementSchema();
      }
      engagement = schema.getEngagementSchemaStatus();
    } catch (err) {
      engagement = {
        schema: null,
        lastError: err instanceof Error ? err.message : String(err),
      };
    }
    sendJson(res, 200, {
      ok: true,
      service: 'gaming-service-backend',
      db: dbPath(),
      postgres: {
        ...getPgStatus(),
        enabled: isPostgresEnabled(),
        privileges,
        engagement,
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/engagement/leaderboard') {
    try {
      const eng = await import('./lib/engagementDb.mjs');
      const period = url.searchParams.get('period') === 'today' ? 'today' : 'all';
      const limit = Number(url.searchParams.get('limit') || 10);
      const studentId = url.searchParams.get('studentId') || '';
      const result = await eng.getLeaderboard({ period, limit, studentId });
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = /incorrect scheme|DATABASE_URL/i.test(raw)
        ? 'Leaderboard is using local rankings until a Postgres DATABASE_URL is set.'
        : raw;
      sendJson(res, 400, { ok: false, error: message, entries: [] });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/engagement/student') {
    try {
      const eng = await import('./lib/engagementDb.mjs');
      if (!eng.engagementAvailable()) {
        sendJson(res, 200, {
          ok: false,
          skipped: true,
          error: 'DATABASE_URL_not_configured',
          found: false,
          currentLevel: 1,
          highestCompletedLevel: 0,
          cash: 0,
          isReturning: false,
        });
        return;
      }
      const studentId = url.searchParams.get('studentId') || '';
      if (!studentId.trim()) {
        sendJson(res, 400, {
          ok: false,
          error: 'studentId required',
          found: false,
          currentLevel: 1,
        });
        return;
      }
      const result = await eng.getStudentProgress(studentId);
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, {
        ok: false,
        error: message,
        found: false,
        currentLevel: 1,
      });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/engagement/frustration') {
    try {
      const studentId = url.searchParams.get('studentId') || '';
      if (!String(studentId).trim()) {
        sendJson(res, 400, {
          ok: false,
          error: 'studentId required',
          frustrationScore: null,
          frustrationLevel: null,
          history: [],
        });
        return;
      }
      const eng = await import('./lib/engagementDb.mjs');
      if (!eng.engagementAvailable()) {
        sendJson(res, 200, {
          ok: false,
          skipped: true,
          error: 'DATABASE_URL_not_configured',
          studentId,
          frustrationScore: null,
          frustrationLevel: null,
          history: [],
        });
        return;
      }
      const sessionId = url.searchParams.get('sessionId') || '';
      const limit = Number(url.searchParams.get('limit') || 1);
      const result = await eng.getFrustration({ studentId, sessionId, limit });
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const skipped = /permission denied|DATABASE_URL|Could not open schema/i.test(
        message,
      );
      sendJson(res, skipped ? 200 : 400, {
        ok: false,
        skipped,
        error: message,
        frustrationScore: null,
        frustrationLevel: null,
        history: [],
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/engagement/')) {
    try {
      const body = await readJson(req);
      const eng = await import('./lib/engagementDb.mjs');
      const route = url.pathname.replace('/api/engagement/', '');
      if (!eng.engagementAvailable() && route !== 'leaderboard/score') {
        sendJson(res, 200, {
          ok: false,
          skipped: true,
          error: 'DATABASE_URL_not_configured',
          message:
            'Add DATABASE_URL (Neon connection string) to .env and restart the backend.',
        });
        return;
      }
      let result = null;
      switch (route) {
        case 'student':
          result = await eng.upsertStudent(body);
          break;
        case 'session/start':
          result = await eng.startSession(body);
          break;
        case 'session/end':
          result = await eng.endSession(body);
          break;
        case 'level':
          result = await eng.upsertLevelProgress(body);
          break;
        case 'lesson':
          result = await eng.insertLessonCompletion(body);
          break;
        case 'quiz':
          result = await eng.insertQuizAttempt(body);
          break;
        case 'unlock':
          result = await eng.insertStudentUnlock(body);
          break;
        case 'points':
          result = await eng.insertPointsLedger(body);
          break;
        case 'frustration':
          result = await eng.insertFrustrationSnapshot(body);
          break;
        case 'mentor':
          result = await eng.insertMentorIntervention(body);
          break;
        case 'event':
          result = await eng.insertGameplayEvent(body);
          break;
        case 'leaderboard/score':
          result = await eng.submitLeaderboardScore(body);
          break;
        default:
          sendJson(res, 404, { ok: false, error: 'Unknown engagement route' });
          return;
      }
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { ok: false, error: message });
    }
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
  import('./lib/engagementSchema.mjs')
    .then((schema) =>
      schema.ensureEngagementSchema().then((name) => {
        // eslint-disable-next-line no-console
        console.log(`[backend] engagement schema ${name}`);
      }),
    )
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[backend] engagement schema: ${err instanceof Error ? err.message : err}`,
      );
    });
  // eslint-disable-next-line no-console
  console.log(
    `[backend] LLAMA_PROVIDER=${process.env.LLAMA_PROVIDER || 'offline'} MODEL=${process.env.LLAMA_MODEL || 'openai/gpt-oss-120b'} groqKey=${process.env.GROQ_API_KEY ? 'set' : 'missing'} openrouterKey=${process.env.OPENROUTER_API_KEY ? 'set' : 'missing'}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[backend] DATABASE_URL=${process.env.DATABASE_URL ? 'set (Neon engagement sync ON)' : 'missing (engagement sync skipped)'}`,
  );
});
