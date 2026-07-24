-- ============================================
-- Migration 005: Add Missing Columns
-- Adds columns that exist locally but may be missing in Railway
-- ============================================

-- Add updated_at to user_memories if it doesn't exist
-- This column is used by the code to track when memories are updated
ALTER TABLE user_memories
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create trigger to auto-update updated_at on user_memories
-- Only create if the function exists (it should from schema.sql)
DO $$
BEGIN
    -- Check if the update function exists
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        -- Drop trigger if it exists
        DROP TRIGGER IF EXISTS update_memories_updated_at ON user_memories;
        
        -- Create trigger
        CREATE TRIGGER update_memories_updated_at 
        BEFORE UPDATE ON user_memories
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Add project_id to user_memories if it doesn't exist
-- This allows memories to be linked to projects
ALTER TABLE user_memories
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Create index for project_id queries
CREATE INDEX IF NOT EXISTS idx_memories_project 
ON user_memories(project_id) 
WHERE project_id IS NOT NULL;

-- Add updated_at to projects if it doesn't exist (should already be there from migration_002)
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Verify columns were added
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('user_memories', 'projects')
  AND column_name IN ('updated_at', 'project_id')
ORDER BY table_name, column_name;

