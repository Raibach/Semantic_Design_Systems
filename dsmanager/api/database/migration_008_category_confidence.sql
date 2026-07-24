-- ============================================
-- Migration 008: Category Confidence Storage
-- Adds memory_category_confidence column to track detection confidence
-- ============================================

-- Add memory_category_confidence column to user_memories
ALTER TABLE user_memories
ADD COLUMN IF NOT EXISTS memory_category_confidence DECIMAL(3,2);

-- Add index for filtering by confidence
CREATE INDEX IF NOT EXISTS idx_memories_category_confidence 
ON user_memories(memory_category, memory_category_confidence) 
WHERE memory_category IS NOT NULL AND memory_category_confidence IS NOT NULL;

-- Add comment to document the column
COMMENT ON COLUMN user_memories.memory_category_confidence IS 
'Confidence score (0.0-1.0) for memory_category detection. Higher values indicate more reliable categorization.';

-- Set default confidence for existing records (medium confidence)
UPDATE user_memories
SET memory_category_confidence = 0.5
WHERE memory_category IS NOT NULL AND memory_category_confidence IS NULL;

