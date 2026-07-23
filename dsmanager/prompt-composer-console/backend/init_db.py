#!/usr/bin/env python3
"""
Database Initialization Script
Creates core tables if they don't exist, and safely adds missing columns.
NEVER drops existing tables - uses migrations only.
"""
import os
import sys
import psycopg2

# Tables to create if they don't exist
TABLE_DEFINITIONS = {
    'users': """
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(255),
            status VARCHAR(20) DEFAULT 'active',
            email_verified BOOLEAN DEFAULT FALSE,
            email_verification_token VARCHAR(255),
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP,
            last_login_at TIMESTAMP,
            last_login_ip INET,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            deleted_at TIMESTAMP
        )
    """,
    'projects': """
        CREATE TABLE IF NOT EXISTS projects (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            is_archived BOOLEAN DEFAULT FALSE,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'conversations': """
        CREATE TABLE IF NOT EXISTS conversations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            tab VARCHAR(20) NOT NULL DEFAULT 'chat',
            title VARCHAR(255),
            summary TEXT,
            message_count INTEGER DEFAULT 0,
            metadata JSONB DEFAULT '{}',
            surface_state_json TEXT,
            surface_updated_at TIMESTAMP,
            is_archived BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'session_permissions': """
        CREATE TABLE IF NOT EXISTS session_permissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(20) NOT NULL DEFAULT 'owner',
            granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(session_id, user_id)
        )
    """,
    'conversation_messages': """
        CREATE TABLE IF NOT EXISTS conversation_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            role VARCHAR(20) NOT NULL,
            content TEXT NOT NULL,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'user_memories': """
        CREATE TABLE IF NOT EXISTS user_memories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            content_hash VARCHAR(64) NOT NULL,
            content_preview TEXT,
            content_type VARCHAR(50),
            source_type VARCHAR(50) NOT NULL,
            source_id UUID,
            milvus_collection VARCHAR(100),
            milvus_vector_id VARCHAR(255),
            embedding_dimension INTEGER,
            importance_score DECIMAL(3,2) DEFAULT 0.5,
            memory_category VARCHAR(100),
            memory_category_confidence DECIMAL(3,2),
            access_count INTEGER DEFAULT 0,
            last_accessed_at TIMESTAMP,
            metadata JSONB DEFAULT '{}',
            tags TEXT[] DEFAULT '{}',
            is_archived BOOLEAN DEFAULT FALSE,
            archived_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'prompt_sessions': """
        CREATE TABLE IF NOT EXISTS prompt_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
            title VARCHAR(255),
            description TEXT,
            left_column_content TEXT,
            compiled_output TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            is_archived BOOLEAN DEFAULT FALSE,
            current_version INTEGER DEFAULT 0,
            category VARCHAR(100),
            last_accessed_at TIMESTAMP,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'prompt_versions': """
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            left_column_content TEXT,
            compiled_output TEXT,
            change_description TEXT,
            change_type VARCHAR(50),
            created_by_user_id UUID REFERENCES users(id),
            overall_score DECIMAL(5,2),
            score_breakdown JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'ai_suggestions': """
        CREATE TABLE IF NOT EXISTS ai_suggestions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            suggestion_type VARCHAR(50),
            suggestion_content TEXT,
            content TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            used BOOLEAN DEFAULT FALSE,
            used_at TIMESTAMP,
            inserted_position INTEGER,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'tags': """
        CREATE TABLE IF NOT EXISTS tags (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(20),
            created_at TIMESTAMP DEFAULT NOW()
        )
    """,
    'prompt_context': """
        CREATE TABLE IF NOT EXISTS prompt_context (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,
            context_type VARCHAR(50) NOT NULL DEFAULT 'workspace',
            content TEXT NOT NULL,
            source VARCHAR(255),
            captured_at TIMESTAMP DEFAULT NOW(),
            relevance_score DECIMAL(3,2) DEFAULT 1.0,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """
}

# Safe column migrations - adds column if missing, never drops
COLUMN_MIGRATIONS = [
    # conversations table
    ("conversations", "surface_state_json", "TEXT"),
    ("conversations", "surface_updated_at", "TIMESTAMP"),
    ("conversations", "is_archived", "BOOLEAN DEFAULT FALSE"),
    # projects table
    ("projects", "is_archived", "BOOLEAN DEFAULT FALSE"),
    # prompt_sessions table
    ("prompt_sessions", "left_column_content", "TEXT"),
    ("prompt_sessions", "conversation_id", "UUID REFERENCES conversations(id) ON DELETE SET NULL"),
    # prompt_versions table
    ("prompt_versions", "version_number", "INTEGER NOT NULL DEFAULT 0"),
    # ai_suggestions table
    ("ai_suggestions", "used", "BOOLEAN DEFAULT FALSE"),
    ("ai_suggestions", "used_at", "TIMESTAMP"),
    ("ai_suggestions", "inserted_position", "INTEGER"),
    ("ai_suggestions", "content", "TEXT"),
]

# Indexes to create if they don't exist
INDEX_DEFINITIONS = [
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL",
    "CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages(conversation_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_user_memories_user ON user_memories(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_sessions_user ON prompt_sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_versions_session ON prompt_versions(session_id, version_number)",
    "CREATE INDEX IF NOT EXISTS idx_ai_suggestions_session ON ai_suggestions(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_context_session ON prompt_context(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_prompt_context_type ON prompt_context(context_type)",
]

# Default user that the frontend expects
DEFAULT_USER_SQL = """
INSERT INTO users (id, email, password_hash, full_name, status, email_verified)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default@system.local',
    '$2b$12$defaulthashnotforlogin000000000000000000000000000',
    'Default User',
    'active',
    TRUE
)
ON CONFLICT (id) DO NOTHING;
"""

# Stored procedure for creating prompt sessions
CREATE_PROMPT_SESSION_FUNCTION = """
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
"""

# Function to save prompt versions
SAVE_PROMPT_VERSION_FUNCTION = """
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
"""

# Function to get context for AI query
GET_PROMPT_CONTEXT_FOR_AI_FUNCTION = """
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
    v_context := v_context || 'PROMPT SESSION: ' || COALESCE(v_session_title, 'Untitled') || E'\\n\\n';

    -- Add current left column content
    IF v_left_column_content IS NOT NULL AND v_left_column_content != '' THEN
        v_context := v_context || 'CURRENT PROMPT WORKSPACE (left column):' || E'\\n';
        v_context := v_context || v_left_column_content || E'\\n\\n';
    END IF;

    -- Add compiled output if exists
    IF v_compiled_output IS NOT NULL AND v_compiled_output != '' THEN
        v_context := v_context || 'COMPILED PROMPT OUTPUT (third column):' || E'\\n';
        v_context := v_context || v_compiled_output || E'\\n\\n';
    END IF;

    -- Get recent versions
    SELECT string_agg(
        'Version ' || version_number || ' (' || COALESCE(change_type, 'unknown') || '): ' ||
        COALESCE(change_description, 'No description') || E'\\n' ||
        'Content preview: ' || LEFT(COALESCE(left_column_content, ''), 200) || '...',
        E'\\n---\\n'
    ) INTO v_recent_versions
    FROM prompt_versions
    WHERE session_id = p_session_id
    ORDER BY version_number DESC
    LIMIT 3;

    IF v_recent_versions IS NOT NULL THEN
        v_context := v_context || 'RECENT PROMPT VERSIONS:' || E'\\n';
        v_context := v_context || v_recent_versions || E'\\n\\n';
    END IF;

    -- Get unused AI suggestions
    SELECT string_agg(
        '[' || COALESCE(suggestion_type, 'unknown') || '] ' || E'\\n' ||
        COALESCE(content, ''),
        E'\\n---\\n'
    ) INTO v_ai_suggestions
    FROM ai_suggestions
    WHERE session_id = p_session_id
    AND used = FALSE
    ORDER BY created_at DESC
    LIMIT 5;

    IF v_ai_suggestions IS NOT NULL THEN
        v_context := v_context || 'AVAILABLE AI SUGGESTIONS (drag-and-drop):' || E'\\n';
        v_context := v_context || v_ai_suggestions || E'\\n\\n';
    END IF;

    -- Get recent conversation context
    SELECT string_agg(
        '[' || role || ']: ' || content,
        E'\\n'
    ) INTO v_conversation_context
    FROM conversation_messages cm
    JOIN conversations c ON cm.conversation_id = c.id
    JOIN prompt_sessions ps ON c.id = ps.conversation_id
    WHERE ps.id = p_session_id
    ORDER BY cm.created_at DESC
    LIMIT 10;

    IF v_conversation_context IS NOT NULL THEN
        v_context := v_context || 'RECENT CONVERSATION (right column chat):' || E'\\n';
        v_context := v_context || v_conversation_context || E'\\n\\n';
    END IF;

    RETURN v_context;
END;
$$ LANGUAGE plpgsql;
"""

def column_exists(cur, table_name, column_name):
    """Check if a column exists in a table."""
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
    """, (table_name, column_name))
    return cur.fetchone()[0] > 0

def table_exists(cur, table_name):
    """Check if a table exists."""
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_name = %s AND table_schema = 'public'
    """, (table_name,))
    return cur.fetchone()[0] > 0

def init_database():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set, skipping init")
        return

    print("Initializing database (safe migrations)...")

    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cur = conn.cursor()

        # Step 1: Create tables if they don't exist (order matters for foreign keys)
        table_order = [
            'users', 'projects', 'conversations', 'conversation_messages',
            'user_memories', 'prompt_sessions', 'prompt_versions', 'ai_suggestions', 'tags',
            'prompt_context'
        ]

        for table_name in table_order:
            if table_name in TABLE_DEFINITIONS:
                if not table_exists(cur, table_name):
                    print(f"  Creating table: {table_name}")
                    cur.execute(TABLE_DEFINITIONS[table_name])
                else:
                    print(f"  Table exists: {table_name}")

        # Step 2: Add missing columns (safe migrations)
        print("Applying column migrations...")
        for table_name, column_name, column_type in COLUMN_MIGRATIONS:
            if table_exists(cur, table_name) and not column_exists(cur, table_name, column_name):
                print(f"  Adding column: {table_name}.{column_name}")
                try:
                    cur.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
                except Exception as e:
                    print(f"  Warning: Could not add {table_name}.{column_name}: {e}")

        # Step 3: Create indexes
        print("Creating indexes...")
        for index_sql in INDEX_DEFINITIONS:
            try:
                cur.execute(index_sql)
            except Exception as e:
                # Index might already exist
                pass

        # Step 4: Create stored procedures
        print("Creating stored procedures...")
        try:
            cur.execute(CREATE_PROMPT_SESSION_FUNCTION)
            print("  Created function: create_prompt_session")
        except Exception as e:
            print(f"  Warning: Could not create create_prompt_session: {e}")

        try:
            cur.execute(SAVE_PROMPT_VERSION_FUNCTION)
            print("  Created function: save_prompt_version")
        except Exception as e:
            print(f"  Warning: Could not create save_prompt_version: {e}")

        try:
            cur.execute(GET_PROMPT_CONTEXT_FOR_AI_FUNCTION)
            print("  Created function: get_prompt_context_for_ai")
        except Exception as e:
            print(f"  Warning: Could not create get_prompt_context_for_ai: {e}")

        # Step 5: Create default user
        print("Creating default user...")
        try:
            cur.execute(DEFAULT_USER_SQL)
            print("  Default user created or already exists")
        except Exception as e:
            print(f"  Warning: Could not create default user: {e}")

        cur.close()
        conn.close()
        print("Database initialization complete (no data lost)")

    except Exception as e:
        print(f"Database init error: {e}")
        import traceback
        traceback.print_exc()
        # Don't exit - let app try to provide better error info

if __name__ == "__main__":
    init_database()
