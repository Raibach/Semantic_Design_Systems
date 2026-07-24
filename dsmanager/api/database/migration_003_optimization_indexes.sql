-- Migration 003: Optimization Indexes
-- Creates composite indexes for improved query performance
-- These indexes support queries on user_id alone (leftmost prefix) and combined queries

-- Projects: Support queries by user_id and is_archived (active/archived filtering)
-- Note: projects table uses is_archived (boolean), not status
CREATE INDEX IF NOT EXISTS idx_projects_user_status 
ON projects(user_id, is_archived);

-- Conversations: Support queries by user_id and project_id (project-specific conversations)
-- Note: project_id is stored in metadata JSONB, so we create a functional index
-- The existing GIN index on metadata handles JSONB queries efficiently
-- This functional index supports (user_id, metadata->>'project_id') queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_project 
ON conversations(user_id, (metadata->>'project_id'));

-- User Memory Log: Support queries by user_id and created_at (already exists in schema.sql)
-- Note: user_memory_log doesn't have project_id column, so we skip that index
-- The existing idx_memory_user index covers user_id queries

-- Additional indexes for common query patterns

-- Conversations: Support queries by user_id and updated_at (recent conversations)
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated 
ON conversations(user_id, updated_at DESC);

-- Conversation Messages: Support queries by conversation_id and created_at (chronological messages)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
ON conversation_messages(conversation_id, created_at);

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

