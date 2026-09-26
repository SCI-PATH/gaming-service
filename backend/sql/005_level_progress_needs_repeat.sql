-- Allow a finished-but-not-passed level to stay on the same topic.
-- Runtime also widens this check in engagementDb.ensureLevelStatusConstraint.

ALTER TABLE engagement_gaming.level_progress
  DROP CONSTRAINT IF EXISTS level_progress_status_check;

ALTER TABLE engagement_gaming.level_progress
  ADD CONSTRAINT level_progress_status_check
  CHECK (status IN ('locked', 'in_progress', 'completed', 'abandoned', 'needs_repeat'));
