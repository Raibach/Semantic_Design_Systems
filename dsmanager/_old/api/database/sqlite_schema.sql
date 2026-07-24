-- ============================================
-- GRACE SQLITE SCHEMA - Small Team Edition (11 users)
-- Simpler than PostgreSQL, zero maintenance
-- ============================================

PRAGMA foreign_keys = ON;

-- ============================================
-- USERS
-- ============================================

CREATE TABLE users (
  id TEXT PRIMARY KEY, -- UUID as text
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  email_verified INTEGER DEFAULT 0, -- SQLite uses 0/1 for boolean

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- USER SETTINGS (Grace configuration per user)
-- ============================================

CREATE TABLE user_grace_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Core settings as JSON (SQLite's native approach)
  settings_json TEXT DEFAULT '{
    "temperature": 0.45,
    "reasoningStyle": "chain_of_thought",
    "selfReflection": true,
    "secondOrderReasoning": false,
    "memoryIntegration": true,
    "trainingMode": "balanced",
    "confidenceThreshold": "medium",
    "learningFocus": {
      "writingStyle": true,
      "topicKnowledge": true,
      "feedbackPatterns": true,
      "errorCorrections": true
    },
    "autoQNA": true,
    "editorial": {
      "enabled": true,
      "detectChatGPTPatterns": true,
      "stance": "collaborative",
      "voicePreservationPriority": "high",
      "structuralCritique": false,
      "askObjectiveFirst": true
    }
  }',

  updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- CONVERSATIONS
-- ============================================

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  message_count INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_conversations_user ON conversations(user_id);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_conversation ON conversation_messages(conversation_id);

-- ============================================
-- MEMORY LOG (links to Qdrant vectors)
-- ============================================

CREATE TABLE user_memory_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Qdrant reference
  qdrant_point_id TEXT NOT NULL,
  qdrant_collection TEXT NOT NULL,

  -- Content preview
  content_preview TEXT,
  content_hash TEXT,

  -- Source
  source_type TEXT NOT NULL,
  source_id TEXT,

  -- Scoring
  importance_score REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TEXT,

  -- Archive (never delete!)
  is_archived INTEGER DEFAULT 0,
  archived_at TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_memory_user ON user_memory_log(user_id);
CREATE INDEX idx_memory_hash ON user_memory_log(user_id, content_hash);

-- ============================================
-- QUARANTINE SYSTEM
-- ============================================

CREATE TABLE quarantine_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  source_type TEXT NOT NULL,
  source_id TEXT,
  url TEXT,
  title TEXT,
  content_preview TEXT,

  threat_level TEXT NOT NULL CHECK (threat_level IN ('CRITICAL', 'HIGH', 'MODERATE', 'SAFE')),
  threat_category TEXT,

  status TEXT DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'quarantined')),
  reviewed_at TEXT,
  reviewer_notes TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_quarantine_user ON quarantine_items(user_id, status);

-- ============================================
-- TRAINING DATA
-- ============================================

CREATE TABLE training_data (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  reasoning_trace TEXT,

  confidence_score REAL,
  quality_score REAL,

  source_type TEXT,
  metadata_json TEXT DEFAULT '{}',

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_training_user ON training_data(user_id);

-- ============================================
-- USAGE TRACKING (for quota management)
-- ============================================

CREATE TABLE usage_metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  period_month TEXT NOT NULL, -- 'YYYY-MM-01'
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_usage_user_period ON usage_metrics(user_id, period_month, metric_type);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);

-- ============================================
-- SEED DATA - Add yourself as first user
-- ============================================

-- You'll add your user account via Python script
