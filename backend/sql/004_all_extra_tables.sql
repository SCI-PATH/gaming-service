CREATE TABLE IF NOT EXISTS engagement_gaming.game_sessions (
  session_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
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
);

CREATE TABLE IF NOT EXISTS engagement_gaming.level_progress (
  level_progress_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
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
);

CREATE TABLE IF NOT EXISTS engagement_gaming.lesson_completions (
  lesson_completion_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  level_progress_id TEXT REFERENCES engagement_gaming.level_progress (level_progress_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number INTEGER NOT NULL,
  lesson_key TEXT NOT NULL,
  lesson_type TEXT NOT NULL
    CHECK (lesson_type IN ('crop', 'animal', 'cleaning', 'world', 'other')),
  lesson_title TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
  points_awarded INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS engagement_gaming.quiz_attempts (
  attempt_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
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
);

CREATE TABLE IF NOT EXISTS engagement_gaming.unlock_catalog (
  item_id TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('animal', 'prop', 'decoration', 'other')),
  base_price INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS engagement_gaming.student_unlocks (
  student_unlock_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES engagement_gaming.unlock_catalog (item_id),
  session_id TEXT REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  purchased_at_level INTEGER,
  price_paid INTEGER NOT NULL DEFAULT 0,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  placement JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (student_id, item_id)
);

CREATE TABLE IF NOT EXISTS engagement_gaming.points_ledger (
  ledger_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number INTEGER,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('earn', 'spend', 'adjust', 'refund')),
  amount INTEGER NOT NULL,
  balance_after INTEGER,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS engagement_gaming.frustration_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number INTEGER,
  frustration_score NUMERIC(5,2) NOT NULL
    CHECK (frustration_score >= 0 AND frustration_score <= 100),
  frustration_level TEXT NOT NULL
    CHECK (frustration_level IN ('low', 'moderate', 'high', 'very_high')),
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  dominant_indicators TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'gameplay'
    CHECK (source IN ('gameplay', 'quiz', 'mentor', 'level_end', 'manual')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engagement_gaming.mentor_interventions (
  intervention_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
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
);

CREATE TABLE IF NOT EXISTS engagement_gaming.gameplay_events (
  event_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES engagement_gaming.students (student_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES engagement_gaming.game_sessions (session_id) ON DELETE SET NULL,
  level_number INTEGER,
  event_type TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO engagement_gaming.unlock_catalog (item_id, item_name, category, base_price, description)
VALUES
  ('sheep', 'Sheep', 'animal', 280, 'A woolly friend for your farm.'),
  ('lamb', 'Lamb', 'animal', 160, 'A soft little lamb.'),
  ('well', 'Well', 'prop', 220, 'Farm well decoration.'),
  ('windmill', 'Windmill', 'prop', 400, 'Decorative windmill.')
ON CONFLICT (item_id) DO NOTHING;

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
