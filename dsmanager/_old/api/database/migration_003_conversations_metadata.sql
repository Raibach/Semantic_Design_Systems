-- ============================================
-- ADD METADATA COLUMN TO CONVERSATIONS TABLE
-- Required for project_id storage in conversations
-- ============================================

-- Add metadata column to conversations table if it doesn't exist
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add index for general metadata queries (GIN works on JSONB)
CREATE INDEX IF NOT EXISTS idx_conversations_metadata 
ON conversations USING GIN (metadata);

-- Note: We don't need a separate index for project_id since we can use the GIN index on metadata
-- The GIN index on the JSONB column will efficiently handle queries like metadata->>'project_id'

-- Verify the column was added
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'conversations' 
        AND column_name = 'metadata'
    ) THEN
        RAISE EXCEPTION 'Failed to add metadata column to conversations table';
    END IF;
END $$;

