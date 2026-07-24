-- ============================================
-- MILVUS INTEGRATION MIGRATION
-- Migration 004: Replace Qdrant with Milvus references
-- ============================================

-- Update user_memories table to support Milvus
-- The vector_id field will now store Milvus point IDs instead of Qdrant IDs
-- embedding_model will be updated to reflect Milvus model version

-- Update user_memory_log table to support Milvus
-- Maintain backward compatibility during migration

-- Add Milvus columns (keep Qdrant columns for migration period)
ALTER TABLE user_memory_log
ADD COLUMN IF NOT EXISTS milvus_point_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS milvus_collection VARCHAR(255),
ADD COLUMN IF NOT EXISTS embedding_model_version VARCHAR(100) DEFAULT 'bge-small-en-v1',
ADD COLUMN IF NOT EXISTS context_type VARCHAR(50) DEFAULT 'general',  -- 'character', 'plot', 'general'
ADD COLUMN IF NOT EXISTS chunk_index INTEGER,
ADD COLUMN IF NOT EXISTS total_chunks INTEGER DEFAULT 1;

-- Update user_memories table comments to reflect Milvus usage
COMMENT ON COLUMN user_memories.vector_id IS 'Milvus vector point ID (primary chunk ID for multi-chunk memories)';
COMMENT ON COLUMN user_memories.embedding_model IS 'Embedding model version (e.g., bge-small-en-v1)';

-- Create indexes for Milvus queries
CREATE INDEX IF NOT EXISTS idx_memory_milvus_collection 
  ON user_memory_log(milvus_collection) 
  WHERE milvus_collection IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_milvus_point 
  ON user_memory_log(milvus_point_id) 
  WHERE milvus_point_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_context_type 
  ON user_memory_log(user_id, context_type) 
  WHERE context_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_embedding_model 
  ON user_memory_log(embedding_model_version);

-- Add comment explaining migration strategy
COMMENT ON COLUMN user_memory_log.milvus_point_id IS 'Milvus vector point ID (replaces qdrant_point_id)';
COMMENT ON COLUMN user_memory_log.milvus_collection IS 'Milvus collection name: grace_character_v1, grace_plot_v1, or grace_general_v1';
COMMENT ON COLUMN user_memory_log.context_type IS 'Context type for routing: character, plot, or general';
COMMENT ON COLUMN user_memory_log.embedding_model_version IS 'Embedding model version for migration and A/B testing';
COMMENT ON COLUMN user_memory_log.chunk_index IS 'Chunk index for multi-chunk conversations (0-based)';
COMMENT ON COLUMN user_memory_log.total_chunks IS 'Total number of chunks for this conversation';

-- Migration helper: Copy Qdrant references to Milvus (if needed)
-- This can be run manually after data migration
-- UPDATE user_memory_log 
-- SET milvus_point_id = qdrant_point_id,
--     milvus_collection = REPLACE(qdrant_collection, 'qdrant_', 'milvus_')
-- WHERE milvus_point_id IS NULL AND qdrant_point_id IS NOT NULL;

