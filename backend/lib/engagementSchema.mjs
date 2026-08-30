/**
 * Resolve a writable Neon schema for engagement tables.
 * The deployed role often cannot USE schema `engagement_gaming` (permission denied).
 * We try grants first, then create `scipath_engagement` owned by the current role.
 */
import { isPostgresEnabled, query } from './pg.mjs';

const PREFERRED = 'engagement_gaming';
const FALLBACK = 'scipath_engagement';
const PUBLIC_PREFIX = 'scipath_eg_';

const ENGAGEMENT_TABLES = [
  'frustration_snapshots',
  'mentor_interventions',
  'lesson_completions',
  'gameplay_events',
  'student_unlocks',
  'unlock_catalog',
  'points_ledger',
  'level_progress',
  'game_sessions',
  'quiz_attempts',
  'students',
];

let resolved = null;
let usePublicPrefix = false;
let ensuring = null;
let lastSchemaError = null;

export function ident(name) {
  const raw = String(name || '').trim();
  if (!/^[a-z_][a-z0-9_]*$/i.test(raw)) {
    throw new Error(`Invalid schema name: ${raw}`);
  }
  return `"${raw.replace(/"/g, '""')}"`;
}

export function engagementSchemaName() {
  return resolved || process.env.ENGAGEMENT_SCHEMA || PREFERRED;
}

export function getEngagementSchemaStatus() {
  return {
    schema: resolved,
    publicPrefix: usePublicPrefix,
    preferred: process.env.ENGAGEMENT_SCHEMA || PREFERRED,
    fallback: FALLBACK,
    lastError: lastSchemaError,
  };
}

function rewriteEngagementSql(sql, schema, prefixedPublic) {
  const text = String(sql);
  if (prefixedPublic) {
    let out = text;
    const tables = [...ENGAGEMENT_TABLES].sort((a, b) => b.length - a.length);
    for (const table of tables) {
      out = out.replaceAll(
        `${PREFERRED}.${table}`,
        `public.${PUBLIC_PREFIX}${table}`,
      );
    }
    return out;
  }
  return text.replaceAll(`${PREFERRED}.`, `${schema}.`);
}

function isPermissionDenied(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('permission denied');
}

function isMissingRelation(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('undefinedtable');
}

async function tryProbe(schema, prefixedPublic = false) {
  const sql = prefixedPublic
    ? `SELECT 1 FROM public.${PUBLIC_PREFIX}frustration_snapshots LIMIT 1`
    : `SELECT 1 FROM ${ident(schema)}.frustration_snapshots LIMIT 1`;
  await query(sql);
}

async function schemaExists(schema) {
  const result = await query(
    `SELECT 1 AS ok FROM pg_namespace WHERE nspname = $1 LIMIT 1`,
    [schema],
  );
  return Boolean(result.rows?.[0]);
}

async function tryCreateSchema(schema) {
  if (await schemaExists(schema)) return;
  await query(`CREATE SCHEMA IF NOT EXISTS ${ident(schema)}`);
}

async function tryGrantPreferred() {
  const s = ident(PREFERRED);
  const statements = [
    `GRANT USAGE ON SCHEMA ${s} TO PUBLIC`,
    `GRANT CREATE ON SCHEMA ${s} TO PUBLIC`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${s} TO PUBLIC`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${s} TO PUBLIC`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO PUBLIC`,
  ];
  for (const sql of statements) {
    try {
      await query(sql);
    } catch {
      /* role may not own the schema */
    }
  }
}

async function bootstrapCoreTables(schema, prefixedPublic = false) {
  const students = prefixedPublic
    ? `public.${PUBLIC_PREFIX}students`
    : `${ident(schema)}.students`;
  const sessions = prefixedPublic
    ? `public.${PUBLIC_PREFIX}game_sessions`
    : `${ident(schema)}.game_sessions`;
  const snaps = prefixedPublic
    ? `public.${PUBLIC_PREFIX}frustration_snapshots`
    : `${ident(schema)}.frustration_snapshots`;
  await query(`
    CREATE TABLE IF NOT EXISTS ${students} (
      student_id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      display_name TEXT,
      grade_band TEXT,
      school_code TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      current_level INTEGER NOT NULL DEFAULT 1,
      lessons_completed INTEGER NOT NULL DEFAULT 0,
      total_points_earned INTEGER NOT NULL DEFAULT 0,
      total_points_spent INTEGER NOT NULL DEFAULT 0,
      wallet_balance INTEGER NOT NULL DEFAULT 0,
      unlocks_owned_count INTEGER NOT NULL DEFAULT 0,
      latest_frustration_score NUMERIC(5,2),
      latest_frustration_level TEXT
        CHECK (latest_frustration_level IS NULL OR latest_frustration_level IN
          ('low', 'moderate', 'high', 'very_high')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ${sessions} (
      session_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      duration_sec INTEGER,
      start_level INTEGER,
      end_level INTEGER,
      points_earned INTEGER NOT NULL DEFAULT 0,
      points_spent INTEGER NOT NULL DEFAULT 0,
      quiz_correct INTEGER NOT NULL DEFAULT 0,
      quiz_incorrect INTEGER NOT NULL DEFAULT 0,
      avg_frustration_score NUMERIC(5,2),
      peak_frustration_score NUMERIC(5,2),
      peak_frustration_level TEXT,
      client_version TEXT,
      device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ${snaps} (
      snapshot_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ${sessions} (session_id) ON DELETE SET NULL,
      level_number INTEGER,
      frustration_score NUMERIC(5,2) NOT NULL
        CHECK (frustration_score >= 0 AND frustration_score <= 100),
      frustration_level TEXT NOT NULL
        CHECK (frustration_level IN ('low', 'moderate', 'high', 'very_high')),
      signals JSONB NOT NULL DEFAULT '{}'::jsonb,
      dominant_indicators TEXT[] NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'gameplay',
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function adoptSchema(schema, prefixedPublic = false) {
  if (!prefixedPublic) {
    try {
      await tryCreateSchema(schema);
    } catch (err) {
      lastSchemaError = err instanceof Error ? err.message : String(err);
      const exists = await schemaExists(schema).catch(() => false);
      if (!exists && isPermissionDenied(err)) return false;
    }
  }
  try {
    await tryProbe(schema, prefixedPublic);
    resolved = schema;
    usePublicPrefix = prefixedPublic;
    lastSchemaError = null;
    return true;
  } catch (err) {
    lastSchemaError = err instanceof Error ? err.message : String(err);
    if (isMissingRelation(err) || isPermissionDenied(err) && prefixedPublic) {
      try {
        await bootstrapCoreTables(schema, prefixedPublic);
        await tryProbe(schema, prefixedPublic);
        resolved = schema;
        usePublicPrefix = prefixedPublic;
        lastSchemaError = null;
        return true;
      } catch (bootErr) {
        lastSchemaError =
          bootErr instanceof Error ? bootErr.message : String(bootErr);
        return false;
      }
    }
    if (isMissingRelation(err)) {
      try {
        await bootstrapCoreTables(schema, prefixedPublic);
        await tryProbe(schema, prefixedPublic);
        resolved = schema;
        usePublicPrefix = prefixedPublic;
        lastSchemaError = null;
        return true;
      } catch (bootErr) {
        lastSchemaError =
          bootErr instanceof Error ? bootErr.message : String(bootErr);
        return false;
      }
    }
    return false;
  }
}

export async function ensureEngagementSchema() {
  if (resolved) return resolved;
  if (ensuring) return ensuring;
  ensuring = (async () => {
    if (!isPostgresEnabled()) {
      throw new Error('DATABASE_URL_not_configured');
    }
    const preferred = process.env.ENGAGEMENT_SCHEMA || PREFERRED;
    if (preferred === PREFERRED) {
      await tryGrantPreferred();
    }
    const names = [...new Set([preferred, FALLBACK])];
    for (const name of names) {
      if (await adoptSchema(name, false)) return resolved;
    }
    if (await adoptSchema('public', true)) return resolved;
    throw new Error(
      lastSchemaError ||
        `Could not open schema ${preferred}, ${FALLBACK}, or public.${PUBLIC_PREFIX}*`,
    );
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

/** Run engagement SQL, rewriting the preferred schema name after resolve. */
export async function eq(text, params = []) {
  const schema = await ensureEngagementSchema();
  const sql = rewriteEngagementSql(text, schema, usePublicPrefix);
  return query(sql, params);
}
