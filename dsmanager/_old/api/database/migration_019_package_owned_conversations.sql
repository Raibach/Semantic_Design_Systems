-- Migration 019: Package-owned conversations + tag_definitions.updated_at
-- Conversations belong to prompt sessions (packages), not users.
-- All statements are additive and idempotent — safe to re-run.

-- ── conversations: package ownership columns ──────────────────────────
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tab VARCHAR(50);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS surface_state_json TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS surface_updated_at TIMESTAMP;

-- Backfill created_by from legacy user_id if that column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'user_id'
  ) THEN
    UPDATE conversations SET created_by = user_id WHERE created_by IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_tab ON conversations(session_id, tab);

-- ── tag_definitions: updated_at (used by ON CONFLICT DO UPDATE) ───────
ALTER TABLE tag_definitions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
