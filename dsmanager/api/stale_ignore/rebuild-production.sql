-- ============================================================
-- PRODUCTION DATABASE REBUILD — July 17, 2026
-- Drops all tables, recreates from canonical schema, seeds minimum data.
-- Run against production PostgreSQL on SiteGround.
-- ============================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════
-- STEP 1: DROP ALL EXISTING OBJECTS
-- ═══════════════════════════════════════════════════════════

-- Drop functions first (no dependencies)
DROP FUNCTION IF EXISTS create_prompt_session(UUID, VARCHAR, TEXT) CASCADE;
DROP FUNCTION IF EXISTS save_prompt_version(UUID, UUID, TEXT, TEXT, TEXT, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS calculate_dignity_value() CASCADE;
DROP FUNCTION IF EXISTS can_promote_memory() CASCADE;
DROP FUNCTION IF EXISTS check_usage_quota() CASCADE;
DROP FUNCTION IF EXISTS get_grace_health() CASCADE;
DROP FUNCTION IF EXISTS is_student() CASCADE;
DROP FUNCTION IF EXISTS is_teacher() CASCADE;
DROP FUNCTION IF EXISTS log_memory_creation() CASCADE;
DROP FUNCTION IF EXISTS log_memory_promotion() CASCADE;
DROP FUNCTION IF EXISTS prevent_delete_unassigned_chats() CASCADE;
DROP FUNCTION IF EXISTS teacher_has_student() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop all tables (CASCADE handles FK dependencies)
DROP TABLE IF EXISTS 
    ai_suggestions,
    audit_logs,
    conversation_messages,
    conversation_tags,
    conversations,
    data_dignity_ledger,
    grace_context,
    grace_decisions,
    grace_health_metrics,
    invoices,
    memory_provenance,
    messages,
    payment_methods,
    projects,
    promotion_queue,
    prompt_artifacts,
    prompt_comments,
    prompt_feedback,
    prompt_history,
    prompt_permissions,
    prompt_ratings,
    prompt_sessions,
    prompt_shares,
    prompt_versions,
    quarantine_items,
    student_grades,
    student_profiles,
    subscription_plans,
    tag_definitions,
    teacher_students,
    training_data,
    usage_metrics,
    user_grace_settings,
    user_memories,
    user_memory_log,
    user_subscriptions,
    users
CASCADE;

-- ═══════════════════════════════════════════════════════════
-- STEP 2: CREATE CORE TABLES
-- ═══════════════════════════════════════════════════════════

-- Users (must exist first — everything references it)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects (depends on users)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NULL;

-- Conversations (depends on users)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    surface_state_json TEXT
);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_deleted_at ON conversations(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_metadata ON conversations USING GIN(metadata);

-- Conversation Messages (depends on conversations, users)
CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    type TEXT NOT NULL DEFAULT 'question',
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_conv ON conversation_messages(conversation_id);
CREATE INDEX idx_messages_user ON conversation_messages(user_id);
CREATE INDEX idx_messages_created ON conversation_messages(created_at);

-- Prompt Sessions (depends on conversations, users, projects)
CREATE TABLE prompt_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    title VARCHAR(255) DEFAULT 'Untitled',
    description TEXT DEFAULT '',
    left_column_content TEXT DEFAULT '',
    compiled_output TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    is_archived BOOLEAN DEFAULT FALSE,
    current_version INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    category TEXT,
    project_id UUID REFERENCES projects(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_prompt_sessions_user ON prompt_sessions(user_id);
CREATE INDEX idx_prompt_sessions_conversation ON prompt_sessions(conversation_id);
CREATE INDEX idx_prompt_sessions_category ON prompt_sessions(category);
CREATE INDEX idx_prompt_sessions_archived ON prompt_sessions(is_archived);

-- Prompt Versions (depends on prompt_sessions)
CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    left_column_content TEXT DEFAULT '',
    compiled_output TEXT DEFAULT '',
    change_description TEXT DEFAULT '',
    change_type VARCHAR(50) DEFAULT 'manual',
    created_by_user_id UUID REFERENCES users(id),
    overall_score DOUBLE PRECISION,
    score_breakdown JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, version_number)
);
CREATE INDEX idx_prompt_versions_session ON prompt_versions(session_id);

-- AI Suggestions (depends on prompt_sessions)
CREATE TABLE ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL,
    content TEXT NOT NULL,
    context TEXT,
    generated_by_model TEXT,
    confidence_score DOUBLE PRECISION DEFAULT 1.0,
    relevance_score DOUBLE PRECISION DEFAULT 1.0,
    used BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tag Definitions (no dependencies)
CREATE TABLE tag_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    display_name TEXT,
    color TEXT DEFAULT '#6b7280',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt Trace Activity (depends on prompt_sessions)
CREATE TABLE prompt_trace_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    tokens_used INTEGER,
    estimated_cost DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- STEP 3: RECREATE STORED PROCEDURES
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_prompt_session(
    p_user_id UUID,
    p_title VARCHAR DEFAULT 'Untitled Prompt Session',
    p_description TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_conversation_id UUID;
    v_session_id UUID;
BEGIN
    INSERT INTO conversations (user_id, title, message_count, metadata)
    VALUES (
        p_user_id,
        p_title || ' - Chat',
        0,
        jsonb_build_object(
            'session_type', 'prompt_engineering',
            'has_prompt_session', true
        )
    )
    RETURNING id INTO v_conversation_id;

    INSERT INTO prompt_sessions (
        user_id, conversation_id, title, description, metadata
    )
    VALUES (
        p_user_id,
        v_conversation_id,
        p_title,
        p_description,
        jsonb_build_object('initial_conversation_id', v_conversation_id)
    )
    RETURNING id INTO v_session_id;

    UPDATE conversations
    SET metadata = metadata || jsonb_build_object('prompt_session_id', v_session_id)
    WHERE id = v_conversation_id;

    RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_prompt_version(
    p_session_id UUID,
    p_user_id UUID,
    p_left_column_content TEXT,
    p_compiled_output TEXT DEFAULT NULL,
    p_change_description TEXT DEFAULT NULL,
    p_change_type VARCHAR DEFAULT 'manual'
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_next_version INTEGER;
    v_session_user_id UUID;
    v_actual_session_id UUID;
BEGIN
    SELECT user_id INTO v_session_user_id
    FROM prompt_sessions WHERE id = p_session_id;

    IF v_session_user_id IS NULL THEN
        SELECT id INTO v_actual_session_id
        FROM prompt_sessions WHERE conversation_id = p_session_id;

        IF v_actual_session_id IS NULL THEN
            INSERT INTO prompt_sessions (user_id, conversation_id, title, description)
            VALUES (p_user_id, p_session_id, 'Prompt Session', '')
            RETURNING id INTO v_actual_session_id;
        END IF;

        p_session_id := v_actual_session_id;
        v_session_user_id := p_user_id;
    END IF;

    IF v_session_user_id != p_user_id THEN
        RAISE EXCEPTION 'User does not own this session';
    END IF;

    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM prompt_versions WHERE session_id = p_session_id;

    INSERT INTO prompt_versions (
        session_id, version_number, left_column_content, compiled_output,
        change_description, change_type, created_by_user_id
    )
    VALUES (
        p_session_id, v_next_version, p_left_column_content, p_compiled_output,
        p_change_description, p_change_type, p_user_id
    );

    UPDATE prompt_sessions
    SET current_version = v_next_version,
        left_column_content = p_left_column_content,
        compiled_output = COALESCE(p_compiled_output, compiled_output),
        updated_at = NOW(),
        last_accessed_at = NOW()
    WHERE id = p_session_id;

    RETURN v_next_version;
END;
$$;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════
-- STEP 4: SEED MINIMUM DATA
-- ═══════════════════════════════════════════════════════════

-- Default dev user (required for RLS and all operations)
INSERT INTO users (id, email, full_name, role)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'dev@raibach.net',
    'Developer',
    'admin'
) ON CONFLICT (id) DO NOTHING;

-- Default project (required for project scoping)
INSERT INTO projects (id, user_id, name, description)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Default Project',
    'Default project for prompt organization'
) ON CONFLICT (id) DO NOTHING;

-- UI tab tags (required for right-column tab system)
INSERT INTO tag_definitions (name, display_name, color) VALUES
    ('chat', 'Chat', '#3b82f6'),
    ('trace', 'Trace', '#8b5cf6'),
    ('tools', 'Tools', '#10b981'),
    ('variables', 'Variables', '#f59e0b')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- Verify
SELECT 'rebuild complete' AS status;
SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';
SELECT count(*) AS user_count FROM users;
SELECT count(*) AS tag_count FROM tag_definitions;
