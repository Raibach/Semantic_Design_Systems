CREATE TABLE IF NOT EXISTS prompt_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    title VARCHAR(255) DEFAULT 'Untitled',
    description TEXT DEFAULT '',
    left_column_content TEXT DEFAULT '',
    compiled_output TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    is_archived BOOLEAN DEFAULT FALSE,
    current_version INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES prompt_sessions(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    left_column_content TEXT DEFAULT '',
    compiled_output TEXT DEFAULT '',
    change_description TEXT DEFAULT '',
    change_type VARCHAR(50) DEFAULT 'manual',
    created_by_user_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, version_number)
);
