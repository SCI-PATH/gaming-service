-- =============================================================================
-- SCI-PATH / Gaming Service — enterprise schema for Neon Postgres
-- Schema: engagement_gaming
-- Run this in DBeaver against neondb (SQL Editor → Execute SQL Script)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS engagement_gaming;

-- Drop placeholder table from DBeaver if present
DROP TABLE IF EXISTS engagement_gaming.newtable CASCADE;

-- ---------------------------------------------------------------------------
-- 1) Students (identity + live summary counters)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.students (
  student_id            TEXT PRIMARY KEY,                 -- e.g. S001 / UUID from shared auth
  student_name          TEXT NOT NULL,
  display_name          TEXT,
  grade_band            TEXT,                             -- e.g. '6-9'
  school_code           TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,

  -- denormalized rollups (fast dashboard reads; updated by app/triggers)
  current_level         INTEGER NOT NULL DEFAULT 1 CHECK (current_level >= 1),
  lessons_completed     INTEGER NOT NULL DEFAULT 0 CHECK (lessons_completed >= 0),
  total_points_earned   INTEGER NOT NULL DEFAULT 0,
  total_points_spent    INTEGER NOT NULL DEFAULT 0,
  wallet_balance        INTEGER NOT NULL DEFAULT 0,       -- farm cash / RP on hand
  unlocks_owned_count   INTEGER NOT NULL DEFAULT 0,
  latest_frustration_score NUMERIC(5,2),
  latest_frustration_level TEXT
    CHECK (latest_frustration_level IS NULL OR latest_frustration_level IN
      ('low', 'moderate', 'high', 'very_high')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_students_name
  ON engagement_gaming.students (student_name);

CREATE INDEX IF NOT EXISTS idx_students_last_seen
  ON engagement_gaming.students (last_seen_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 2) Game sessions (one login / play stretch)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.game_sessions (
  session_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,

  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at              TIMESTAMPTZ,
  duration_sec          INTEGER,

  start_level           INTEGER,
  end_level             INTEGER,
  points_earned         INTEGER NOT NULL DEFAULT 0,
  points_spent          INTEGER NOT NULL DEFAULT 0,
  quiz_correct          INTEGER NOT NULL DEFAULT 0,
  quiz_incorrect        INTEGER NOT NULL DEFAULT 0,
  avg_frustration_score NUMERIC(5,2),
  peak_frustration_score NUMERIC(5,2),
  peak_frustration_level TEXT,
  client_version        TEXT,
  device_info           JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_student_started
  ON engagement_gaming.game_sessions (student_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Level progress (lessons / levels completed + mastery / points per level)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.level_progress (
  level_progress_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id            UUID
    REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,

  level_number          INTEGER NOT NULL CHECK (level_number >= 1),
  status                TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('locked', 'in_progress', 'completed', 'abandoned')),

  lessons_completed     INTEGER NOT NULL DEFAULT 0,
  lessons_total         INTEGER,
  points_earned         INTEGER NOT NULL DEFAULT 0,       -- points taken this level
  points_spent          INTEGER NOT NULL DEFAULT 0,

  mastery_score         NUMERIC(6,4),                     -- 0–1
  performance_band      TEXT,                             -- weak / medium / smart
  gameplay_band         TEXT,
  quiz_correct          INTEGER NOT NULL DEFAULT 0,
  quiz_incorrect        INTEGER NOT NULL DEFAULT 0,
  avg_response_ms       INTEGER,
  retries_count         INTEGER NOT NULL DEFAULT 0,

  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  metrics_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb, -- DDA / farm extras

  UNIQUE (student_id, level_number)
);

CREATE INDEX IF NOT EXISTS idx_level_progress_student_status
  ON engagement_gaming.level_progress (student_id, status);

-- ---------------------------------------------------------------------------
-- 4) Lesson / challenge completions inside a level
--     (crop / animal / cleaning / world jobs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.lesson_completions (
  lesson_completion_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  level_progress_id     UUID
    REFERENCES engagement_gaming.level_progress (level_progress_id) ON DELETE CASCADE,
  session_id            UUID
    REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,

  level_number          INTEGER NOT NULL,
  lesson_key            TEXT NOT NULL,                    -- e.g. crop:tomato, animal:calf
  lesson_type           TEXT NOT NULL
    CHECK (lesson_type IN ('crop', 'animal', 'cleaning', 'world', 'other')),
  lesson_title          TEXT,
  status                TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
  points_awarded        INTEGER NOT NULL DEFAULT 0,
  attempts              INTEGER NOT NULL DEFAULT 1,
  completed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail                JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lesson_completions_student_level
  ON engagement_gaming.lesson_completions (student_id, level_number, completed_at DESC);

-- ---------------------------------------------------------------------------
-- 5) Quiz attempts (science items consumed from question_engine — soft ref)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.quiz_attempts (
  attempt_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id            UUID
    REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number          INTEGER,
  lesson_key            TEXT,

  -- soft reference to question_engine (no hard FK across schemas yet)
  question_id           TEXT,
  question_bank         TEXT DEFAULT 'question_engine',
  concept_tags          TEXT[] NOT NULL DEFAULT '{}',

  farm_action           TEXT,                             -- plant / harvest / sell / ...
  is_correct            BOOLEAN NOT NULL,
  selected_option       TEXT,
  correct_option        TEXT,
  response_ms           INTEGER,
  hint_used             BOOLEAN NOT NULL DEFAULT FALSE,
  retry_index           INTEGER NOT NULL DEFAULT 0,
  points_delta          INTEGER NOT NULL DEFAULT 0,

  answered_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_time
  ON engagement_gaming.quiz_attempts (student_id, answered_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_question
  ON engagement_gaming.quiz_attempts (question_id);

-- ---------------------------------------------------------------------------
-- 6) Unlock catalog + student inventory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.unlock_catalog (
  item_id               TEXT PRIMARY KEY,                 -- sheep, lamb, well, ...
  item_name             TEXT NOT NULL,
  category              TEXT NOT NULL
    CHECK (category IN ('animal', 'prop', 'decoration', 'other')),
  base_price            INTEGER NOT NULL DEFAULT 0,
  description           TEXT,
  image_path            TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  meta                  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS engagement_gaming.student_unlocks (
  student_unlock_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  item_id               TEXT NOT NULL
    REFERENCES engagement_gaming.unlock_catalog (item_id),
  session_id            UUID
    REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,

  purchased_at_level    INTEGER,
  price_paid            INTEGER NOT NULL DEFAULT 0,
  purchased_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_equipped           BOOLEAN NOT NULL DEFAULT FALSE,
  placement             JSONB NOT NULL DEFAULT '{}'::jsonb, -- map coords if placed

  UNIQUE (student_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_student_unlocks_student
  ON engagement_gaming.student_unlocks (student_id, purchased_at DESC);

-- ---------------------------------------------------------------------------
-- 7) Points ledger (audit trail for points taken / spent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.points_ledger (
  ledger_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id            UUID
    REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number          INTEGER,

  entry_type            TEXT NOT NULL
    CHECK (entry_type IN ('earn', 'spend', 'adjust', 'refund')),
  amount                INTEGER NOT NULL,                 -- signed: +earn / -spend
  balance_after         INTEGER,
  reason                TEXT NOT NULL,                    -- quiz_correct, sell_crop, unlock_shop, ...
  reference_id          TEXT,                             -- unlock id / attempt id
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta                  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_points_ledger_student_time
  ON engagement_gaming.points_ledger (student_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8) Frustration scores (time-series — research critical)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.frustration_snapshots (
  snapshot_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id            UUID
    REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number          INTEGER,

  frustration_score     NUMERIC(5,2) NOT NULL
    CHECK (frustration_score >= 0 AND frustration_score <= 100),
  frustration_level     TEXT NOT NULL
    CHECK (frustration_level IN ('low', 'moderate', 'high', 'very_high')),

  signals               JSONB NOT NULL DEFAULT '{}'::jsonb, -- weighted indicators
  dominant_indicators   TEXT[] NOT NULL DEFAULT '{}',
  source                TEXT NOT NULL DEFAULT 'gameplay'
    CHECK (source IN ('gameplay', 'quiz', 'mentor', 'level_end', 'manual')),

  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frustration_student_time
  ON engagement_gaming.frustration_snapshots (student_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_frustration_level_band
  ON engagement_gaming.frustration_snapshots (frustration_level, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- 9) Sage mentor interventions (your in-game chatbot events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.mentor_interventions (
  intervention_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id            UUID
    REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number          INTEGER,

  intervention_mode     TEXT NOT NULL,                    -- SUPPORT_AND_SCAFFOLD, ...
  perceived_state       TEXT,
  trigger_reason        TEXT,
  frustration_score     NUMERIC(5,2),
  provider              TEXT,                             -- groq / offline / fallback
  model_name            TEXT,
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at             TIMESTAMPTZ,
  student_message       TEXT,
  mentor_reply          TEXT,
  focus_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  telemetry_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mentor_student_time
  ON engagement_gaming.mentor_interventions (student_id, opened_at DESC);

-- ---------------------------------------------------------------------------
-- 10) Generic gameplay event log (enterprise analytics / replay)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_gaming.gameplay_events (
  event_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL
    REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id            UUID
    REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number          INTEGER,
  event_type            TEXT NOT NULL,                    -- plant, harvest, sell, enemy_hit, ...
  event_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gameplay_events_student_time
  ON engagement_gaming.gameplay_events (student_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_gameplay_events_type
  ON engagement_gaming.gameplay_events (event_type, event_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION engagement_gaming.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_updated_at ON engagement_gaming.students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON engagement_gaming.students
  FOR EACH ROW EXECUTE FUNCTION engagement_gaming.touch_updated_at();

DROP TRIGGER IF EXISTS trg_level_progress_updated_at ON engagement_gaming.level_progress;
CREATE TRIGGER trg_level_progress_updated_at
  BEFORE UPDATE ON engagement_gaming.level_progress
  FOR EACH ROW EXECUTE FUNCTION engagement_gaming.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Useful research views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW engagement_gaming.v_student_engagement_summary AS
SELECT
  s.student_id,
  s.student_name,
  s.current_level,
  s.lessons_completed,
  s.wallet_balance,
  s.total_points_earned,
  s.total_points_spent,
  s.unlocks_owned_count,
  s.latest_frustration_score,
  s.latest_frustration_level,
  s.last_seen_at,
  COUNT(DISTINCT lp.level_number) FILTER (WHERE lp.status = 'completed') AS levels_completed,
  COUNT(DISTINCT su.item_id) AS unlocks_count_live
FROM engagement_gaming.students s
LEFT JOIN engagement_gaming.level_progress lp ON lp.student_id = s.student_id
LEFT JOIN engagement_gaming.student_unlocks su ON su.student_id = s.student_id
GROUP BY s.student_id;

-- Seed a few catalog rows (safe to re-run)
INSERT INTO engagement_gaming.unlock_catalog (item_id, item_name, category, base_price, description)
VALUES
  ('sheep', 'Sheep', 'animal', 280, 'A woolly friend for your farm.'),
  ('lamb', 'Lamb', 'animal', 160, 'A soft little lamb.'),
  ('well', 'Well', 'prop', 220, 'Farm well decoration.'),
  ('windmill', 'Windmill', 'prop', 400, 'Decorative windmill.')
ON CONFLICT (item_id) DO NOTHING;

COMMENT ON SCHEMA engagement_gaming IS
  'SCI-PATH gaming engagement: farm practice, points, unlocks, frustration, Sage mentor events.';
