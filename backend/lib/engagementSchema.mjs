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

function tableRef(schema, prefixedPublic, name) {
  return prefixedPublic
    ? `public.${PUBLIC_PREFIX}${name}`
    : `${ident(schema)}.${name}`;
}

/** CREATE IF NOT EXISTS for every engagement table the game writes. */
async function bootstrapCoreTables(schema, prefixedPublic = false) {
  const t = (name) => tableRef(schema, prefixedPublic, name);
  const students = t('students');
  const sessions = t('game_sessions');
  const snaps = t('frustration_snapshots');
  const catalog = t('unlock_catalog');

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
    CREATE TABLE IF NOT EXISTS ${t('level_progress')} (
      level_progress_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ${sessions} (session_id) ON DELETE SET NULL,
      level_number INTEGER NOT NULL CHECK (level_number >= 1),
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('locked', 'in_progress', 'completed', 'abandoned')),
      lessons_completed INTEGER NOT NULL DEFAULT 0,
      lessons_total INTEGER,
      points_earned INTEGER NOT NULL DEFAULT 0,
      points_spent INTEGER NOT NULL DEFAULT 0,
      mastery_score NUMERIC(6,4),
      performance_band TEXT,
      gameplay_band TEXT,
      quiz_correct INTEGER NOT NULL DEFAULT 0,
      quiz_incorrect INTEGER NOT NULL DEFAULT 0,
      avg_response_ms INTEGER,
      retries_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (student_id, level_number)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ${t('lesson_completions')} (
      lesson_completion_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      level_progress_id TEXT REFERENCES ${t('level_progress')} (level_progress_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ${sessions} (session_id) ON DELETE SET NULL,
      level_number INTEGER NOT NULL,
      lesson_key TEXT NOT NULL,
      lesson_type TEXT NOT NULL DEFAULT 'other',
      lesson_title TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      points_awarded INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 1,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      detail JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ${t('quiz_attempts')} (
      attempt_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ${sessions} (session_id) ON DELETE SET NULL,
      level_number INTEGER,
      lesson_key TEXT,
      question_id TEXT,
      question_bank TEXT DEFAULT 'question_engine',
      concept_tags TEXT[] NOT NULL DEFAULT '{}',
      farm_action TEXT,
      is_correct BOOLEAN NOT NULL,
      selected_option TEXT,
      correct_option TEXT,
      response_ms INTEGER,
      hint_used BOOLEAN NOT NULL DEFAULT FALSE,
      retry_index INTEGER NOT NULL DEFAULT 0,
      points_delta INTEGER NOT NULL DEFAULT 0,
      answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ${catalog} (
      item_id TEXT PRIMARY KEY,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      base_price INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      image_path TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ${t('student_unlocks')} (
      student_unlock_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES ${catalog} (item_id),
      session_id TEXT REFERENCES ${sessions} (session_id) ON DELETE SET NULL,
      purchased_at_level INTEGER,
      price_paid INTEGER NOT NULL DEFAULT 0,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
      placement JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (student_id, item_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ${t('points_ledger')} (
      ledger_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ${sessions} (session_id) ON DELETE SET NULL,
      level_number INTEGER,
      entry_type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER,
      reason TEXT NOT NULL,
      reference_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
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
  await query(`
    CREATE TABLE IF NOT EXISTS ${t('mentor_interventions')} (
      intervention_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ${sessions} (session_id) ON DELETE SET NULL,
      level_number INTEGER,
      intervention_mode TEXT NOT NULL,
      perceived_state TEXT,
      trigger_reason TEXT,
      frustration_score NUMERIC(5,2),
      provider TEXT,
      model_name TEXT,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      student_message TEXT,
      mentor_reply TEXT,
      focus_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      telemetry_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ${t('gameplay_events')} (
      event_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ${students} (student_id) ON DELETE CASCADE,
      session_id TEXT REFERENCES ${sessions} (session_id) ON DELETE SET NULL,
      level_number INTEGER,
      event_type TEXT NOT NULL,
      event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb
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
  } catch (err) {
    lastSchemaError = err instanceof Error ? err.message : String(err);
    const canBoot =
      isMissingRelation(err) || (isPermissionDenied(err) && prefixedPublic);
    if (!canBoot) return false;
    try {
      await bootstrapCoreTables(schema, prefixedPublic);
      await tryProbe(schema, prefixedPublic);
    } catch (bootErr) {
      lastSchemaError =
        bootErr instanceof Error ? bootErr.message : String(bootErr);
      return false;
    }
  }
  try {
    await bootstrapCoreTables(schema, prefixedPublic);
  } catch (err) {
    lastSchemaError = err instanceof Error ? err.message : String(err);
    /* keep schema if core tables already work; extra CREATE may be denied */
  }
  resolved = schema;
  usePublicPrefix = prefixedPublic;
  lastSchemaError = null;
  return true;
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
