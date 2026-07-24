-- migration_017_prompt_version_scores.sql
-- Adds per-version scoring to prompt_versions.
-- overall_score: 0.00–10.00 composite, null until an evaluation runs.
-- score_breakdown: JSONB storing dimension scores (accuracy, relevance, clarity, completeness, safety).

ALTER TABLE prompt_versions
  ADD COLUMN IF NOT EXISTS overall_score NUMERIC(4,2) CHECK (overall_score >= 0 AND overall_score <= 10),
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB;

CREATE INDEX IF NOT EXISTS idx_prompt_versions_overall_score
  ON prompt_versions(session_id, overall_score DESC NULLS LAST);

COMMENT ON COLUMN prompt_versions.overall_score IS
  'Composite quality score 0–10. Null until an AI evaluation has run on this version.';
COMMENT ON COLUMN prompt_versions.score_breakdown IS
  'JSON object with dimension scores: {accuracy, relevance, clarity, completeness, safety}.';
