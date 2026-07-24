-- ============================================
-- PROJECTS TABLE
-- User-scoped project organization for all user assets
-- 
-- Architecture:
-- - Each user has their own projects (user-scoped via user_id)
-- - Projects are the top-level container for:
--   * Chats (conversations)
--   * Attachments (files, documents)
--   * Memories (saved content for Milvus semantic search)
-- - Projects are the top-level container for Milvus collections
-- - All assets are organized under projects and tied to user_id
-- ============================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(user_id, is_archived);

-- Enable RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists, then create it
DROP POLICY IF EXISTS user_isolation ON projects;
CREATE POLICY user_isolation ON projects
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- Add update trigger for projects (drop first if exists)
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- UNIQUE CONSTRAINTS FOR SYSTEM PROJECTS
-- Prevent duplicate "Archived Unassigned Chats" and "Default Project"
-- ============================================

-- Unique constraint: Only one active "Archived Unassigned Chats" per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_unassigned_chats 
ON projects (user_id, name) 
WHERE name = 'Archived Unassigned Chats' AND (is_archived IS NULL OR is_archived = FALSE);

-- Unique constraint: Only one active "Default Project" per user (if it exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_default_project 
ON projects (user_id, name) 
WHERE name = 'Default Project' AND (is_archived IS NULL OR is_archived = FALSE);

-- Add project_id column to conversations (if not exists via ALTER TABLE)
-- Note: We'll use metadata JSONB for now to avoid schema changes, but we can add a proper column later
-- For now, projects are linked via metadata->>'project_id' in conversations table
-- 
-- IMPORTANT: The metadata column must be added via migration_003_conversations_metadata.sql
-- Run that migration before or after this one.

