-- Migration 015: Prompt Engineering Tables
-- Adds tables for prompt engineering functionality
-- conversation_messages = discussions about the prompt (right column chat area)
-- prompt_sessions = individual prompt building sessions
-- prompt_versions = version control for prompts
-- ai_suggestions = AI-generated prompt suggestions

-- ============================================
-- PROMPT SESSIONS TABLE
-- ============================================
-- Each session represents a prompt building workspace
-- Links to conversations for chat history
CREATE TABLE IF NOT EXISTS prompt_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who owns this session
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Associated conversation for chat history
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

    -- Session metadata
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled Prompt Session',
    description TEXT,

    -- Prompt workspace content (left column)
    left_column_content TEXT DEFAULT '',

    -- Compiled prompt output (third column)
    compiled_output TEXT DEFAULT '',

    -- Session state
    is_active BOOLEAN DEFAULT TRUE,
    is_archived BOOLEAN DEFAULT FALSE,

    -- Version tracking
    current_version INTEGER DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_accessed_at TIMESTAMP DEFAULT NOW(),

    -- Metadata for search and organization
    metadata JSONB DEFAULT '{}'
);

-- Indexes for prompt_sessions
CREATE INDEX IF NOT EXISTS idx_prompt_sessions_user_id ON prompt_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_sessions_conversation_id ON prompt_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_sessions_is_active ON prompt_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_prompt_sessions_is_archived ON prompt_sessions(is_archived) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_prompt_sessions_created_at ON prompt_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_sessions_metadata ON prompt_sessions USING GIN(metadata);

-- ============================================
-- PROMPT VERSIONS TABLE
-- ============================================
-- Version control for prompt content
-- Each time user saves/updates the prompt, create a new version
CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which session this version belongs to
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,

    -- Version number (sequential per session)
    version_number INTEGER NOT NULL,

    -- Prompt content at this version
    left_column_content TEXT NOT NULL,
    compiled_output TEXT,

    -- Change metadata
    change_description TEXT,
    change_type VARCHAR(50) DEFAULT 'manual', -- 'manual', 'ai_suggestion', 'auto_save'

    -- User who made this change
    created_by_user_id UUID NOT NULL REFERENCES users(id),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),

    -- Ensure unique version numbers per session
    UNIQUE(session_id, version_number)
);

-- Indexes for prompt_versions
CREATE INDEX IF NOT EXISTS idx_prompt_versions_session_id ON prompt_versions(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_version_number ON prompt_versions(session_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_created_at ON prompt_versions(created_at DESC);

-- ============================================
-- AI SUGGESTIONS TABLE
-- ============================================
-- Store AI-generated prompt suggestions for drag-and-drop
CREATE TABLE IF NOT EXISTS ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which session this suggestion is for
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,

    -- Which conversation message generated this suggestion
    source_message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL,

    -- Suggestion type for categorization
    suggestion_type VARCHAR(50) NOT NULL DEFAULT 'system', -- 'system', 'user', 'assistant', 'tool', 'variable', 'example'
    suggestion_label VARCHAR(255), -- Human-readable label

    -- The actual suggestion content
    content TEXT NOT NULL,

    -- Context about why this suggestion was generated
    context TEXT,

    -- AI model that generated this suggestion
    generated_by_model VARCHAR(255),

    -- Usage tracking
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,
    inserted_position INTEGER, -- Where in the prompt it was inserted

    -- Quality/confidence metrics
    confidence_score DECIMAL(3,2) DEFAULT 1.0, -- 0.0-1.0
    relevance_score DECIMAL(3,2) DEFAULT 1.0, -- 0.0-1.0

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Metadata for filtering and search
    metadata JSONB DEFAULT '{}'
);

-- Indexes for ai_suggestions
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_session_id ON ai_suggestions(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_suggestion_type ON ai_suggestions(suggestion_type);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_used ON ai_suggestions(used) WHERE used = FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_created_at ON ai_suggestions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_metadata ON ai_suggestions USING GIN(metadata);

-- ============================================
-- PROMPT CONTEXT TABLE
-- ============================================
-- Store context information for AI to reference
-- Helps AI be aware of the entire page content
CREATE TABLE IF NOT EXISTS prompt_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which session this context belongs to
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,

    -- Context type
    context_type VARCHAR(50) NOT NULL DEFAULT 'workspace', -- 'workspace', 'history', 'similar_prompts', 'user_preferences'

    -- The context content
    content TEXT NOT NULL,

    -- When this context was captured
    captured_at TIMESTAMP DEFAULT NOW(),

    -- How relevant this context is (for sorting)
    relevance_score DECIMAL(3,2) DEFAULT 1.0,

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- Indexes for prompt_context
CREATE INDEX IF NOT EXISTS idx_prompt_context_session_id ON prompt_context(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_context_context_type ON prompt_context(context_type);
CREATE INDEX IF NOT EXISTS idx_prompt_context_captured_at ON prompt_context(captured_at DESC);

-- ============================================
-- UPDATE CONVERSATIONS METADATA
-- ============================================
-- Add prompt_session_id to conversations metadata for linking
-- This allows conversations to be associated with prompt sessions
DO $$
BEGIN
    -- Check if metadata column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'conversations' AND column_name = 'metadata') THEN
        -- Update existing conversations to have prompt_session_id in metadata if not present
        UPDATE conversations
        SET metadata = metadata || '{"has_prompt_session": false}'::jsonb
        WHERE metadata->>'has_prompt_session' IS NULL;
    END IF;
END $$;

-- ============================================
-- CREATE FUNCTIONS
-- ============================================

-- Function to create a new prompt session with a conversation
CREATE OR REPLACE FUNCTION create_prompt_session(
    p_user_id UUID,
    p_title VARCHAR(255) DEFAULT 'Untitled Prompt Session',
    p_description TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_conversation_id UUID;
    v_session_id UUID;
BEGIN
    -- Create a conversation for this session
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

    -- Create the prompt session
    INSERT INTO prompt_sessions (
        user_id,
        conversation_id,
        title,
        description,
        metadata
    )
    VALUES (
        p_user_id,
        v_conversation_id,
        p_title,
        p_description,
        jsonb_build_object(
            'initial_conversation_id', v_conversation_id
        )
    )
    RETURNING id INTO v_session_id;

    -- Update conversation with session ID
    UPDATE conversations
    SET metadata = metadata || jsonb_build_object('prompt_session_id', v_session_id)
    WHERE id = v_conversation_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to save a new prompt version
CREATE OR REPLACE FUNCTION save_prompt_version(
    p_session_id UUID,
    p_user_id UUID,
    p_left_column_content TEXT,
    p_compiled_output TEXT DEFAULT NULL,
    p_change_description TEXT DEFAULT NULL,
    p_change_type VARCHAR(50) DEFAULT 'manual'
) RETURNS INTEGER AS $$
DECLARE
    v_next_version INTEGER;
    v_session_user_id UUID;
BEGIN
    -- Verify session belongs to user
    SELECT user_id INTO v_session_user_id
    FROM prompt_sessions
    WHERE id = p_session_id;

    IF v_session_user_id != p_user_id THEN
        RAISE EXCEPTION 'User does not own this session';
    END IF;

    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM prompt_versions
    WHERE session_id = p_session_id;

    -- Create new version
    INSERT INTO prompt_versions (
        session_id,
        version_number,
        left_column_content,
        compiled_output,
        change_description,
        change_type,
        created_by_user_id
    )
    VALUES (
        p_session_id,
        v_next_version,
        p_left_column_content,
        p_compiled_output,
        p_change_description,
        p_change_type,
        p_user_id
    );

    -- Update session's current version and content
    UPDATE prompt_sessions
    SET
        current_version = v_next_version,
        left_column_content = p_left_column_content,
        compiled_output = COALESCE(p_compiled_output, compiled_output),
        updated_at = NOW(),
        last_accessed_at = NOW()
    WHERE id = p_session_id;

    RETURN v_next_version;
END;
$$ LANGUAGE plpgsql;

-- Function to get context for AI query
CREATE OR REPLACE FUNCTION get_prompt_context_for_ai(
    p_session_id UUID,
    p_limit_contexts INTEGER DEFAULT 10
) RETURNS TEXT AS $$
DECLARE
    v_context TEXT := '';
    v_session_title VARCHAR(255);
    v_left_column_content TEXT;
    v_compiled_output TEXT;
    v_recent_versions TEXT;
    v_ai_suggestions TEXT;
    v_conversation_context TEXT;
BEGIN
    -- Get session basic info
    SELECT title, left_column_content, compiled_output
    INTO v_session_title, v_left_column_content, v_compiled_output
    FROM prompt_sessions
    WHERE id = p_session_id;

    -- Build context string
    v_context := v_context || 'PROMPT SESSION: ' || v_session_title || E'\n\n';

    -- Add current left column content
    IF v_left_column_content IS NOT NULL AND v_left_column_content != '' THEN
        v_context := v_context || 'CURRENT PROMPT WORKSPACE (left column):' || E'\n';
        v_context := v_context || v_left_column_content || E'\n\n';
    END IF;

    -- Add compiled output if exists
    IF v_compiled_output IS NOT NULL AND v_compiled_output != '' THEN
        v_context := v_context || 'COMPILED PROMPT OUTPUT (third column):' || E'\n';
        v_context := v_context || v_compiled_output || E'\n\n';
    END IF;

    -- Get recent versions
    SELECT string_agg(
        'Version ' || version_number || ' (' || change_type || '): ' ||
        COALESCE(change_description, 'No description') || E'\n' ||
        'Content preview: ' || LEFT(left_column_content, 200) || '...',
        E'\n---\n'
    ) INTO v_recent_versions
    FROM prompt_versions
    WHERE session_id = p_session_id
    ORDER BY version_number DESC
    LIMIT 3;

    IF v_recent_versions IS NOT NULL THEN
        v_context := v_context || 'RECENT PROMPT VERSIONS:' || E'\n';
        v_context := v_context || v_recent_versions || E'\n\n';
    END IF;

    -- Get unused AI suggestions
    SELECT string_agg(
        '[' || suggestion_type || '] ' ||
        COALESCE(suggestion_label, 'Suggestion') || ':' || E'\n' ||
        content,
        E'\n---\n'
    ) INTO v_ai_suggestions
    FROM ai_suggestions
    WHERE session_id = p_session_id
    AND used = FALSE
    ORDER BY created_at DESC
    LIMIT 5;

    IF v_ai_suggestions IS NOT NULL THEN
        v_context := v_context || 'AVAILABLE AI SUGGESTIONS (drag-and-drop):' || E'\n';
        v_context := v_context || v_ai_suggestions || E'\n\n';
    END IF;

    -- Get recent conversation context
    SELECT string_agg(
        '[' || role || ']: ' || content,
        E'\n'
    ) INTO v_conversation_context
    FROM conversation_messages cm
    JOIN conversations c ON cm.conversation_id = c.id
    JOIN prompt_sessions ps ON c.id = ps.conversation_id
    WHERE ps.id = p_session_id
    ORDER BY cm.created_at DESC
    LIMIT 10;

    IF v_conversation_context IS NOT NULL THEN
        v_context := v_context || 'RECENT CONVERSATION (right column chat):' || E'\n';
        v_context := v_context || v_conversation_context || E'\n\n';
    END IF;

    RETURN v_context;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CREATE TRIGGERS
-- ============================================

-- Trigger to update updated_at timestamp on prompt_sessions
CREATE OR REPLACE FUNCTION update_prompt_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prompt_sessions_updated_at
    BEFORE UPDATE ON prompt_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_prompt_sessions_updated_at();

-- Trigger to update last_accessed_at when session is queried
CREATE OR REPLACE FUNCTION update_prompt_sessions_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prompt_sessions_last_accessed
    BEFORE UPDATE OF left_column_content, compiled_output, current_version ON prompt_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_prompt_sessions_last_accessed();

-- ============================================
-- VERIFY MIGRATION
-- ============================================

DO $$
DECLARE
    tables_created INTEGER;
BEGIN
    -- Count new tables
    SELECT COUNT(*) INTO tables_created
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('prompt_sessions', 'prompt_versions', 'ai_suggestions', 'prompt_context');

    RAISE NOTICE 'Migration 015: Created % prompt engineering tables', tables_created;

    -- Verify functions were created
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_prompt_session') THEN
        RAISE NOTICE '✓ Function create_prompt_session created';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_prompt_version') THEN
        RAISE NOTICE '✓ Function save_prompt_version created';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_prompt_context_for_ai') THEN
        RAISE NOTICE '✓ Function get_prompt_context_for_ai created';
    END IF;
END $$;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
