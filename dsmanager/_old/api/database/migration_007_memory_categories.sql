-- ============================================
-- Migration 007: Memory Categories for Teacher Grading
-- Adds memory_category column to support categorization of student writing
-- ============================================

-- Add memory_category column to user_memories
ALTER TABLE user_memories
ADD COLUMN IF NOT EXISTS memory_category VARCHAR(50);

-- Add index for filtering by category (useful for teacher queries)
CREATE INDEX IF NOT EXISTS idx_memories_category 
ON user_memories(user_id, memory_category) 
WHERE memory_category IS NOT NULL;

-- Add composite index for project + category queries
CREATE INDEX IF NOT EXISTS idx_memories_project_category 
ON user_memories(project_id, memory_category) 
WHERE project_id IS NOT NULL AND memory_category IS NOT NULL;

-- Add constraint to ensure valid categories
ALTER TABLE user_memories
DROP CONSTRAINT IF EXISTS check_memory_category;

ALTER TABLE user_memories
ADD CONSTRAINT check_memory_category CHECK (
    memory_category IS NULL OR 
    memory_category IN (
        'writing_voice', 
        'tone_preference', 
        'character_style',
        'narrative_technique', 
        'feedback_pattern', 
        'project_context',
        'imagination_style', 
        'dialogue_style', 
        'description_style', 
        'general'
    )
);

-- Add comment to document the column
COMMENT ON COLUMN user_memories.memory_category IS 
'Categorizes writing into one of 10 categories for teacher grading: writing_voice, tone_preference, character_style, narrative_technique, feedback_pattern, project_context, imagination_style, dialogue_style, description_style, or general';

