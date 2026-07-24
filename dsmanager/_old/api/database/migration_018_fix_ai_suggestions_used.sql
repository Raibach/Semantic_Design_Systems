-- Migration 018: Fix missing 'used' column in ai_suggestions table
-- This column was defined in migration_015 but may not have been applied

DO $$
BEGIN
    -- Add 'used' column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_suggestions' AND column_name = 'used'
    ) THEN
        ALTER TABLE ai_suggestions ADD COLUMN used BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added used column to ai_suggestions';
    END IF;

    -- Add 'used_at' column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_suggestions' AND column_name = 'used_at'
    ) THEN
        ALTER TABLE ai_suggestions ADD COLUMN used_at TIMESTAMP;
        RAISE NOTICE 'Added used_at column to ai_suggestions';
    END IF;

    -- Add 'inserted_position' column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_suggestions' AND column_name = 'inserted_position'
    ) THEN
        ALTER TABLE ai_suggestions ADD COLUMN inserted_position INTEGER;
        RAISE NOTICE 'Added inserted_position column to ai_suggestions';
    END IF;

    -- Create index if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_ai_suggestions_used'
    ) THEN
        CREATE INDEX idx_ai_suggestions_used ON ai_suggestions(used) WHERE used = FALSE;
        RAISE NOTICE 'Created idx_ai_suggestions_used index';
    END IF;
END $$;
