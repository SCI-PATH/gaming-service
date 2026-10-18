-- Question-level frustration on quiz attempts.
-- Existing rows are kept. New columns are nullable.

ALTER TABLE engagement_gaming.quiz_attempts
  ADD COLUMN IF NOT EXISTS frustration_score NUMERIC(5,2);

ALTER TABLE engagement_gaming.quiz_attempts
  ADD COLUMN IF NOT EXISTS frustration_level TEXT;

ALTER TABLE engagement_gaming.quiz_attempts
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempt_once
  ON engagement_gaming.quiz_attempts (student_id, session_id, question_id, retry_index);
