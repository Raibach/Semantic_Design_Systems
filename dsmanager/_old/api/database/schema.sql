-- ============================================
-- GRACE SAAS - PRODUCTION DATABASE SCHEMA
-- PostgreSQL 15+ Required
-- NO AWS - Works with Railway, DigitalOcean, Hetzner, etc.
-- ============================================

-- No extensions required (gen_random_uuid() is built-in in PostgreSQL 13+)

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),

  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  email_verified BOOLEAN DEFAULT FALSE,
  email_verification_token VARCHAR(255),

  -- Security
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  last_login_at TIMESTAMP,
  last_login_ip INET,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users(status);

-- ============================================
-- SUBSCRIPTION PLANS
-- ============================================

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,

  -- Pricing
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_yearly VARCHAR(255),

  -- Quotas
  queries_per_month INTEGER,
  pdf_uploads_per_month INTEGER,
  memory_storage_mb INTEGER,
  max_file_size_mb INTEGER DEFAULT 10,

  -- Features
  features JSONB DEFAULT '{}',

  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed plans
INSERT INTO subscription_plans (name, slug, price_monthly, price_yearly, queries_per_month, pdf_uploads_per_month, memory_storage_mb, features) VALUES
('Free', 'free', 0.00, 0.00, 50, 5, 100, '{"editorial_framework": true, "news_search": false, "source_evaluation": false, "priority_support": false}'),
('Pro', 'pro', 29.99, 299.00, 1000, 100, 5000, '{"editorial_framework": true, "news_search": true, "source_evaluation": true, "reasoning_trace": true, "priority_support": false}'),
('Enterprise', 'enterprise', 99.99, 999.00, NULL, NULL, 50000, '{"editorial_framework": true, "news_search": true, "source_evaluation": true, "reasoning_trace": true, "priority_support": true, "api_access": true}');

-- ============================================
-- USER SUBSCRIPTIONS
-- ============================================

CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),

  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')),
  billing_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),

  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  trial_end TIMESTAMP,

  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMP,
  cancellation_reason TEXT,

  -- Stripe
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255) UNIQUE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON user_subscriptions(status);

-- ============================================
-- PAYMENT & INVOICES
-- ============================================

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_method_id VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  brand VARCHAR(50),
  last4 VARCHAR(4),
  exp_month INTEGER,
  exp_year INTEGER,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subscription_id UUID REFERENCES user_subscriptions(id),

  stripe_invoice_id VARCHAR(255) UNIQUE,
  amount_due INTEGER NOT NULL,
  amount_paid INTEGER,
  currency VARCHAR(3) DEFAULT 'USD',

  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),

  invoice_pdf_url TEXT,
  due_date TIMESTAMP,
  paid_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invoices_user ON invoices(user_id, created_at DESC);

-- ============================================
-- USAGE TRACKING
-- ============================================

CREATE TABLE usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,
  count INTEGER DEFAULT 1,
  period_month DATE NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usage_user_period ON usage_metrics(user_id, period_month, metric_type);

-- Current month usage view
CREATE OR REPLACE VIEW current_month_usage AS
SELECT
  user_id,
  metric_type,
  SUM(count) as total_count
FROM usage_metrics
WHERE period_month = DATE_TRUNC('month', NOW())
GROUP BY user_id, metric_type;

-- ============================================
-- GRACE SETTINGS
-- ============================================

CREATE TABLE user_grace_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  temperature DECIMAL(3,2) DEFAULT 0.45,
  reasoning_style VARCHAR(50) DEFAULT 'chain_of_thought',
  self_reflection BOOLEAN DEFAULT TRUE,
  second_order_reasoning BOOLEAN DEFAULT FALSE,
  memory_integration BOOLEAN DEFAULT TRUE,

  training_mode VARCHAR(50) DEFAULT 'balanced',
  confidence_threshold VARCHAR(50) DEFAULT 'medium',
  learning_focus JSONB DEFAULT '{"writingStyle": true, "topicKnowledge": true, "feedbackPatterns": true, "errorCorrections": true}',
  auto_qna BOOLEAN DEFAULT TRUE,

  editorial JSONB DEFAULT '{"enabled": true, "detectChatGPTPatterns": true, "stance": "collaborative", "voicePreservationPriority": "high", "structuralCritique": false, "askObjectiveFirst": true}',

  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CONVERSATIONS & MEMORY
-- ============================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  message_count INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON conversation_messages(conversation_id, created_at);

-- Memory audit log (links to Milvus)
CREATE TABLE user_memory_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  milvus_point_id VARCHAR(255),
  milvus_collection VARCHAR(255),

  content_preview TEXT,
  content_hash VARCHAR(64),

  source_type VARCHAR(50) NOT NULL,
  source_id UUID,

  importance_score DECIMAL(3,2) DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP,

  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP,
  archive_location TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_memory_user ON user_memory_log(user_id, created_at DESC);
CREATE INDEX idx_memory_hash ON user_memory_log(user_id, content_hash);

-- ============================================
-- QUARANTINE SYSTEM
-- ============================================

CREATE TABLE quarantine_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  source_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(255),
  url TEXT,
  title TEXT,
  content_preview TEXT,

  threat_level VARCHAR(20) NOT NULL CHECK (threat_level IN ('CRITICAL', 'HIGH', 'MODERATE', 'SAFE')),
  threat_category VARCHAR(100),
  threat_details JSONB,

  status VARCHAR(20) DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'quarantined')),
  reviewed_at TIMESTAMP,
  reviewer_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_quarantine_user ON quarantine_items(user_id, status);

-- ============================================
-- USER MEMORIES (Vector Storage Reference)
-- ============================================

CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  content_preview TEXT,

  source_type VARCHAR(50) NOT NULL,
  source_id UUID,

  -- Vector database references
  milvus_collection VARCHAR(100),
  milvus_vector_id VARCHAR(255),
  embedding_dimension INTEGER,

  importance_score DECIMAL(3,2) DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP,

  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_memories_user ON user_memories(user_id, created_at DESC);
CREATE INDEX idx_user_memories_hash ON user_memories(user_id, content_hash);
CREATE INDEX idx_user_memories_source ON user_memories(user_id, source_type, source_id);
CREATE INDEX idx_user_memories_tags ON user_memories USING gin(tags);

-- ============================================
-- TRAINING DATA
-- ============================================

CREATE TABLE training_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  reasoning_trace TEXT,

  confidence_score DECIMAL(3,2),
  quality_score DECIMAL(3,2),

  source_type VARCHAR(50),
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_training_user ON training_data(user_id, quality_score DESC);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

-- ============================================
-- PROMPT EMBEDDINGS METADATA
-- ============================================

CREATE TABLE prompt_embeddings_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Reference to prompt content
  prompt_session_id UUID REFERENCES prompt_sessions(id),
  prompt_version_id UUID REFERENCES prompt_versions(id),
  prompt_template_id UUID REFERENCES prompt_templates(id),

  -- Embedding information
  embedding_model VARCHAR(100) NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  embedding_hash VARCHAR(64) NOT NULL,

  -- Vector database references
  milvus_collection VARCHAR(100) NOT NULL,
  milvus_vector_id VARCHAR(255) NOT NULL,

  -- Content for reference
  content_preview TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL,

  -- Usage statistics
  similarity_searches INTEGER DEFAULT 0,
  last_similarity_search TIMESTAMP,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_prompt_embeddings_user ON prompt_embeddings_metadata(user_id, created_at DESC);
CREATE INDEX idx_prompt_embeddings_session ON prompt_embeddings_metadata(prompt_session_id);
CREATE INDEX idx_prompt_embeddings_hash ON prompt_embeddings_metadata(embedding_hash);
CREATE INDEX idx_prompt_embeddings_milvus ON prompt_embeddings_metadata(milvus_collection, milvus_vector_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update last_accessed_at for user_memories
CREATE OR REPLACE FUNCTION update_memory_access_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_accessed_at = NOW();
  NEW.access_count = COALESCE(OLD.access_count, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate content hash for deduplication
CREATE OR REPLACE FUNCTION generate_content_hash(content TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
  RETURN encode(digest(content, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Check if memory already exists for user
CREATE OR REPLACE FUNCTION check_duplicate_memory(
  p_user_id UUID,
  p_content TEXT
) RETURNS UUID AS $$
DECLARE
  v_content_hash VARCHAR(64);
  v_existing_id UUID;
BEGIN
  v_content_hash := generate_content_hash(p_content);

  SELECT id INTO v_existing_id
  FROM user_memories
  WHERE user_id = p_user_id AND content_hash = v_content_hash
  LIMIT 1;

  RETURN v_existing_id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_memories_updated_at BEFORE UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prompt_embeddings_updated_at BEFORE UPDATE ON prompt_embeddings_metadata
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memory_access BEFORE UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION update_memory_access_timestamp();

-- Usage quota check
CREATE OR REPLACE FUNCTION check_usage_quota(
  p_user_id UUID,
  p_metric_type VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
  v_plan_limit INTEGER;
  v_current_usage INTEGER;
BEGIN
  SELECT
    CASE p_metric_type
      WHEN 'query' THEN sp.queries_per_month
      WHEN 'pdf_upload' THEN sp.pdf_uploads_per_month
      ELSE NULL
    END INTO v_plan_limit
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id AND us.status = 'active';

  IF v_plan_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT COALESCE(SUM(count), 0) INTO v_current_usage
  FROM usage_metrics
  WHERE user_id = p_user_id
    AND metric_type = p_metric_type
    AND period_month = DATE_TRUNC('month', NOW());

  RETURN v_current_usage < v_plan_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW-LEVEL SECURITY (Multi-Tenancy)
-- ============================================

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_grace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memory_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarantine_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_embeddings_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON user_subscriptions
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON usage_metrics
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON user_grace_settings
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON conversations
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON conversation_messages
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON user_memory_log
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON quarantine_items
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON training_data
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON user_memories
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON prompt_embeddings_metadata
  USING (user_id = current_setting('app.current_user_id', true)::UUID);
