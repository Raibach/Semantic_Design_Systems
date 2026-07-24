-- Database Schema Required for Grace Storage System
-- Run this migration to create missing tables and columns

-- ============================================
-- PROJECTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_is_archived ON projects(is_archived);

-- ============================================
-- CONVERSATIONS TABLE (Add missing metadata column)
-- ============================================

-- Check if conversations table exists, if not create it
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversations') THEN
        CREATE TABLE conversations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            message_count INTEGER DEFAULT 0,
            is_archived BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            deleted_at TIMESTAMP,
            metadata JSONB DEFAULT '{}'
        );
    ELSE
        -- Add metadata column if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                       WHERE table_name = 'conversations' AND column_name = 'metadata') THEN
            ALTER TABLE conversations ADD COLUMN metadata JSONB DEFAULT '{}';
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at ON conversations(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_is_archived ON conversations(is_archived);
CREATE INDEX IF NOT EXISTS idx_conversations_metadata ON conversations USING GIN(metadata);

-- ============================================
-- MESSAGES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_metadata ON messages USING GIN(metadata);

-- ============================================
-- VERIFY SCHEMA
-- ============================================

-- Check if all required tables exist
DO $$
DECLARE
    missing_tables TEXT[];
BEGIN
    missing_tables := ARRAY[]::TEXT[];
    
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'projects') THEN
        missing_tables := array_append(missing_tables, 'projects');
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'conversations') THEN
        missing_tables := array_append(missing_tables, 'conversations');
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages') THEN
        missing_tables := array_append(missing_tables, 'messages');
    END IF;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE NOTICE 'Missing tables: %', array_to_string(missing_tables, ', ');
    ELSE
        RAISE NOTICE 'All required tables exist';
    END IF;
END $$;

-- Check if conversations table has metadata column
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                   WHERE table_name = 'conversations' AND column_name = 'metadata') THEN
        RAISE NOTICE 'WARNING: conversations table missing metadata column';
    ELSE
        RAISE NOTICE 'conversations table has metadata column';
    END IF;
END $$;

-- ============================================
-- CLEAN UP INVALID DATA (Optional)
-- ============================================

-- Remove any conversations with invalid UUID format (if any exist)
-- This is a safety check, shouldn't be necessary if frontend is fixed
-- DELETE FROM conversations WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ============================================
-- VERIFY USERS TABLE EXISTS
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        RAISE EXCEPTION 'users table does not exist. Please create it first.';
    ELSE
        RAISE NOTICE 'users table exists';
    END IF;
END $$;

