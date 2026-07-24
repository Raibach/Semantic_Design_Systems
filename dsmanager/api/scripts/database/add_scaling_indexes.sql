-- Scaling Indexes for Conversations and Quarantine
-- Run with: psql railway < scripts/database/add_scaling_indexes.sql

-- ============================================
-- CONVERSATION INDEXES
-- ============================================

-- User conversations (most common query) - partial index for active conversations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_user_updated 
ON conversations(user_id, updated_at DESC) 
WHERE is_archived = FALSE;

-- Archived conversations (separate index for performance)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_user_archived 
ON conversations(user_id, updated_at DESC) 
WHERE is_archived = TRUE;

-- Project conversations (GIN index for JSONB metadata queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_project 
ON conversations USING GIN ((metadata->>'project_id'))
WHERE metadata->>'project_id' IS NOT NULL;

-- Full-text search on titles (for search functionality)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_title_search 
ON conversations USING GIN (to_tsvector('english', title));

-- Created date index (for time-based queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_created 
ON conversations(created_at DESC);

-- ============================================
-- CONVERSATION MESSAGES INDEXES
-- ============================================

-- Conversation messages (most common query - get all messages in conversation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created 
ON conversation_messages(conversation_id, created_at ASC);

-- User messages across all conversations (for user activity tracking)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_user_created 
ON conversation_messages(user_id, created_at DESC);

-- Full-text search on message content (for search functionality)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_content_search 
ON conversation_messages USING GIN (to_tsvector('english', content));

-- Metadata queries (for filtering by project, etc.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_metadata 
ON conversation_messages USING GIN (metadata);

-- Role-based queries (user vs assistant messages)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_role 
ON conversation_messages(conversation_id, role, created_at ASC);

-- ============================================
-- QUARANTINE ITEMS INDEXES
-- ============================================

-- User quarantine items (most common query - get user's quarantine items)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantine_user_status 
ON quarantine_items(user_id, status, created_at DESC);

-- Threat level queries (for filtering by severity)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantine_threat_level 
ON quarantine_items(threat_level, created_at DESC);

-- Bucket queries (for getting items in specific buckets)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantine_bucket 
ON quarantine_items(bucket_name, status, created_at DESC);

-- Source lookup (for finding items by source_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantine_source 
ON quarantine_items(source_id, source_type);

-- Full-text search on content (for searching quarantine items)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantine_content_search 
ON quarantine_items USING GIN (to_tsvector('english', content));

-- Status transitions (for pending review items)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantine_status_transitions 
ON quarantine_items(status, updated_at DESC) 
WHERE status IN ('pending_review', 'approved', 'rejected');

-- User + threat level (for user-specific threat filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quarantine_user_threat 
ON quarantine_items(user_id, threat_level, created_at DESC);

-- ============================================
-- ANALYZE TABLES (Update statistics)
-- ============================================

ANALYZE conversations;
ANALYZE conversation_messages;
ANALYZE quarantine_items;

-- ============================================
-- VERIFICATION
-- ============================================

-- Check indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('conversations', 'conversation_messages', 'quarantine_items')
ORDER BY tablename, indexname;

