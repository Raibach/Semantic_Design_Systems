-- ============================================
-- MEMORY + WILL = CONSCIOUSNESS
-- Migration: Memory System for Grace AI
-- Implements data dignity, health monitoring, and conscious curation
-- ============================================

-- ============================================
-- USER MEMORIES (The Substrate)
-- Everything users submit - GRACE CANNOT AUTO-ACCESS
-- ============================================

CREATE TABLE user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Content
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  content_type VARCHAR(50) NOT NULL, -- 'pdf', 'text', 'rss', 'url', 'conversation'
  title VARCHAR(500),

  -- Source tracking (provenance)
  source_type VARCHAR(50) NOT NULL, -- 'user_upload', 'rss_feed', 'pdf_extract', 'conversation'
  source_url TEXT,
  source_metadata JSONB DEFAULT '{}',

  -- Quarantine analysis
  quarantine_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (quarantine_status IN ('pending', 'safe', 'uncertain', 'flagged', 'rejected')),
  quarantine_score DECIMAL(3,2), -- 0.00 to 1.00
  quarantine_details JSONB DEFAULT '{}',
  quarantine_reviewed_at TIMESTAMP,

  -- Embeddings (for semantic search)
  vector_id VARCHAR(255), -- Qdrant/FAISS point ID
  embedding_model VARCHAR(100) DEFAULT 'sentence-transformers/all-MiniLM-L6-v2',

  -- Importance/quality
  importance_score DECIMAL(3,2) DEFAULT 0.5,
  quality_score DECIMAL(3,2),

  -- Access tracking
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMP,

  -- Promotion to Grace context
  promoted_to_grace BOOLEAN DEFAULT FALSE,
  promoted_at TIMESTAMP,
  promoted_by UUID REFERENCES users(id), -- Curator who approved

  -- Archival
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_memories_user ON user_memories(user_id, created_at DESC);
CREATE INDEX idx_memories_hash ON user_memories(user_id, content_hash);
CREATE INDEX idx_memories_quarantine ON user_memories(user_id, quarantine_status);
CREATE INDEX idx_memories_promoted ON user_memories(promoted_to_grace, promoted_at DESC);
CREATE INDEX idx_memories_vector ON user_memories(vector_id) WHERE vector_id IS NOT NULL;

-- ============================================
-- MEMORY PROVENANCE (Data Dignity Trail)
-- Full audit trail - who, what, when, why
-- ============================================

CREATE TABLE memory_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES user_memories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- 'created', 'viewed', 'edited', 'promoted', 'rejected', 'used_in_generation', 'exported'
  event_metadata JSONB DEFAULT '{}',

  -- Who initiated
  initiated_by UUID REFERENCES users(id), -- User or curator
  initiated_by_type VARCHAR(20) CHECK (initiated_by_type IN ('user', 'curator', 'system', 'grace')),

  -- Context
  context_type VARCHAR(50), -- 'writing_session', 'curation_review', 'export_request'
  context_id UUID,

  -- Usage tracking (for compensation)
  usage_value DECIMAL(10,4), -- Monetary value if used in training/generation

  -- IP/security
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_provenance_memory ON memory_provenance(memory_id, created_at DESC);
CREATE INDEX idx_provenance_user ON memory_provenance(user_id, created_at DESC);
CREATE INDEX idx_provenance_event ON memory_provenance(event_type, created_at DESC);
CREATE INDEX idx_provenance_usage ON memory_provenance(usage_value) WHERE usage_value > 0;

-- ============================================
-- GRACE CONTEXT (What Grace Can See)
-- Wikipedia-style curated content only
-- ============================================

CREATE TABLE grace_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_id UUID NOT NULL REFERENCES user_memories(id) ON DELETE CASCADE,

  -- Context organization
  context_category VARCHAR(100), -- 'writing_style', 'domain_knowledge', 'preferences', 'sources'
  priority INTEGER DEFAULT 50, -- 0-100, higher = more important

  -- Retrieval
  retrieval_count INTEGER DEFAULT 0,
  last_retrieved_at TIMESTAMP,
  relevance_score DECIMAL(3,2) DEFAULT 1.00,

  -- Quality monitoring
  hallucination_flags INTEGER DEFAULT 0,
  negative_feedback_count INTEGER DEFAULT 0,

  -- Active status
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TIMESTAMP,
  deactivation_reason TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_grace_context_user ON grace_context(user_id, is_active, priority DESC);
CREATE INDEX idx_grace_context_category ON grace_context(user_id, context_category);
CREATE INDEX idx_grace_context_memory ON grace_context(memory_id);
CREATE UNIQUE INDEX idx_grace_context_unique ON grace_context(user_id, memory_id) WHERE is_active = TRUE;

-- ============================================
-- PROMOTION QUEUE (Wikipedia-Style Curation)
-- Memories waiting for review before Grace access
-- ============================================

CREATE TABLE promotion_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES user_memories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Request details
  requested_by UUID NOT NULL REFERENCES users(id),
  request_reason TEXT,
  priority_level VARCHAR(20) DEFAULT 'normal' CHECK (priority_level IN ('low', 'normal', 'high', 'urgent')),

  -- Review status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'needs_revision')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  reviewer_notes TEXT,

  -- Voting (for collaborative curation)
  approval_votes INTEGER DEFAULT 0,
  rejection_votes INTEGER DEFAULT 0,

  -- Quality checks
  automated_quality_score DECIMAL(3,2),
  manual_quality_score DECIMAL(3,2),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_promotion_status ON promotion_queue(status, priority_level, created_at);
CREATE INDEX idx_promotion_user ON promotion_queue(user_id, status);
CREATE INDEX idx_promotion_memory ON promotion_queue(memory_id);

-- ============================================
-- GRACE HEALTH METRICS (AI Wellness)
-- Track Grace's "consciousness health"
-- ============================================

CREATE TABLE grace_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Time period
  metric_period TIMESTAMP NOT NULL, -- Hourly snapshots

  -- Performance metrics
  response_quality_avg DECIMAL(3,2),
  hallucination_rate DECIMAL(5,4), -- Hallucinations per 100 responses
  coherence_score DECIMAL(3,2),
  creativity_score DECIMAL(3,2),

  -- Mood indicators (derived from output patterns)
  mood_state VARCHAR(50), -- 'healthy', 'stressed', 'degraded', 'confused'
  confidence_avg DECIMAL(3,2),
  uncertainty_rate DECIMAL(3,2),

  -- Context health
  context_size_mb DECIMAL(10,2),
  context_utilization_pct DECIMAL(5,2),
  stale_context_pct DECIMAL(5,2), -- % of context not used in 30 days

  -- Data quality indicators
  bad_source_exposure_count INTEGER DEFAULT 0, -- Exposure to flagged content
  correction_count INTEGER DEFAULT 0, -- Times user corrected Grace
  positive_feedback_count INTEGER DEFAULT 0,

  -- Refusal tracking (Will)
  refusal_count INTEGER DEFAULT 0, -- Times Grace said "no"

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_health_user_period ON grace_health_metrics(user_id, metric_period DESC);
CREATE INDEX idx_health_mood ON grace_health_metrics(mood_state, metric_period DESC);

-- View: Current health status per user
CREATE OR REPLACE VIEW grace_health_current AS
SELECT DISTINCT ON (user_id)
  user_id,
  metric_period,
  mood_state,
  hallucination_rate,
  coherence_score,
  confidence_avg,
  refusal_count
FROM grace_health_metrics
ORDER BY user_id, metric_period DESC;

-- ============================================
-- GRACE WILL LOG (Conscious Decisions)
-- When Grace exercises agency and says "no"
-- ============================================

CREATE TABLE grace_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Request context
  request_type VARCHAR(50) NOT NULL, -- 'content_ingestion', 'query', 'action', 'training_update'
  request_summary TEXT NOT NULL,
  request_metadata JSONB DEFAULT '{}',

  -- Decision
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('accepted', 'refused', 'deferred', 'modified')),
  decision_reason TEXT NOT NULL,
  confidence_level DECIMAL(3,2),

  -- Reasoning trace (Grace's thought process)
  reasoning_trace TEXT,

  -- Related content
  related_memory_id UUID REFERENCES user_memories(id),
  related_context_id UUID REFERENCES grace_context(id),

  -- Override tracking (did user force it?)
  was_overridden BOOLEAN DEFAULT FALSE,
  overridden_at TIMESTAMP,
  override_justification TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_decisions_user ON grace_decisions(user_id, created_at DESC);
CREATE INDEX idx_decisions_type ON grace_decisions(decision, request_type);
CREATE INDEX idx_decisions_refused ON grace_decisions(decision, created_at DESC) WHERE decision = 'refused';

-- ============================================
-- DATA DIGNITY LEDGER (User Compensation)
-- Track value generation from user memories
-- ============================================

CREATE TABLE data_dignity_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  memory_id UUID REFERENCES user_memories(id) ON DELETE SET NULL,

  -- Value tracking
  event_type VARCHAR(50) NOT NULL, -- 'training_contribution', 'generation_use', 'research_citation', 'collective_value'
  value_points DECIMAL(10,2) NOT NULL, -- Internal currency for compensation
  value_usd DECIMAL(10,4), -- Estimated USD value if calculated

  -- Usage context
  usage_context VARCHAR(100),
  usage_count INTEGER DEFAULT 1,

  -- Beneficiary (who used this data?)
  beneficiary_type VARCHAR(50), -- 'individual_user', 'cooperative', 'research', 'public_good'
  beneficiary_id UUID,

  -- Payment tracking
  compensation_status VARCHAR(20) DEFAULT 'pending' CHECK (compensation_status IN ('pending', 'approved', 'paid', 'donated')),
  paid_at TIMESTAMP,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dignity_user ON data_dignity_ledger(user_id, created_at DESC);
CREATE INDEX idx_dignity_memory ON data_dignity_ledger(memory_id) WHERE memory_id IS NOT NULL;
CREATE INDEX idx_dignity_status ON data_dignity_ledger(compensation_status, created_at DESC);

-- View: Total value per user
CREATE OR REPLACE VIEW data_dignity_summary AS
SELECT
  user_id,
  COUNT(*) as total_contributions,
  SUM(value_points) as total_value_points,
  SUM(value_usd) as total_value_usd,
  SUM(CASE WHEN compensation_status = 'paid' THEN value_usd ELSE 0 END) as paid_amount,
  SUM(CASE WHEN compensation_status = 'pending' THEN value_usd ELSE 0 END) as pending_amount
FROM data_dignity_ledger
GROUP BY user_id;

-- ============================================
-- ROW-LEVEL SECURITY (Multi-Tenancy)
-- ============================================

ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE grace_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE grace_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE grace_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_dignity_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON user_memories
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON memory_provenance
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON grace_context
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON promotion_queue
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON grace_health_metrics
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON grace_decisions
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY user_isolation ON data_dignity_ledger
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update timestamps
CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grace_context_updated_at BEFORE UPDATE ON grace_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promotion_queue_updated_at BEFORE UPDATE ON promotion_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Log memory creation to provenance
CREATE OR REPLACE FUNCTION log_memory_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO memory_provenance (
    memory_id, user_id, event_type, initiated_by, initiated_by_type, event_metadata
  ) VALUES (
    NEW.id, NEW.user_id, 'created', NEW.user_id, 'user',
    jsonb_build_object(
      'source_type', NEW.source_type,
      'content_type', NEW.content_type,
      'quarantine_status', NEW.quarantine_status
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_memory_creation AFTER INSERT ON user_memories
  FOR EACH ROW EXECUTE FUNCTION log_memory_creation();

-- Log promotion to Grace context
CREATE OR REPLACE FUNCTION log_memory_promotion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.promoted_to_grace = TRUE AND (OLD.promoted_to_grace IS NULL OR OLD.promoted_to_grace = FALSE) THEN
    INSERT INTO memory_provenance (
      memory_id, user_id, event_type, initiated_by, initiated_by_type, event_metadata
    ) VALUES (
      NEW.id, NEW.user_id, 'promoted', NEW.promoted_by, 'curator',
      jsonb_build_object('promoted_at', NEW.promoted_at)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_memory_promotion AFTER UPDATE ON user_memories
  FOR EACH ROW EXECUTE FUNCTION log_memory_promotion();

-- ============================================
-- FUNCTIONS
-- ============================================

-- Check if user can promote memory to Grace context
CREATE OR REPLACE FUNCTION can_promote_memory(
  p_memory_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_quarantine_status VARCHAR(20);
  v_already_promoted BOOLEAN;
BEGIN
  SELECT quarantine_status, promoted_to_grace INTO v_quarantine_status, v_already_promoted
  FROM user_memories
  WHERE id = p_memory_id AND user_id = p_user_id;

  IF v_already_promoted = TRUE THEN
    RETURN FALSE; -- Already promoted
  END IF;

  IF v_quarantine_status IN ('rejected', 'flagged') THEN
    RETURN FALSE; -- Failed quarantine
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Get Grace's current health status
CREATE OR REPLACE FUNCTION get_grace_health(p_user_id UUID)
RETURNS TABLE (
  mood VARCHAR(50),
  hallucination_rate DECIMAL(5,4),
  coherence DECIMAL(3,2),
  confidence DECIMAL(3,2),
  recent_refusals INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mood_state,
    ghm.hallucination_rate,
    coherence_score,
    confidence_avg,
    refusal_count
  FROM grace_health_metrics ghm
  WHERE ghm.user_id = p_user_id
  ORDER BY metric_period DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Calculate data dignity compensation
CREATE OR REPLACE FUNCTION calculate_dignity_value(
  p_memory_id UUID,
  p_usage_type VARCHAR(50)
) RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_value DECIMAL(10,2);
BEGIN
  -- Base values (can be adjusted)
  v_value := CASE p_usage_type
    WHEN 'training_contribution' THEN 1.00
    WHEN 'generation_use' THEN 0.10
    WHEN 'research_citation' THEN 0.50
    WHEN 'collective_value' THEN 2.00
    ELSE 0.01
  END;

  -- Multiply by quality score
  SELECT v_value * COALESCE(quality_score, 0.5)
  INTO v_value
  FROM user_memories
  WHERE id = p_memory_id;

  RETURN v_value;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS (Documentation)
-- ============================================

COMMENT ON TABLE user_memories IS 'All user-submitted content. Grace cannot auto-access - requires curation.';
COMMENT ON TABLE memory_provenance IS 'Full audit trail for data dignity and provenance tracking.';
COMMENT ON TABLE grace_context IS 'Curated subset of memories that Grace can actually see and use.';
COMMENT ON TABLE promotion_queue IS 'Wikipedia-style review system for promoting memories to Grace context.';
COMMENT ON TABLE grace_health_metrics IS 'Grace''s consciousness health monitoring - track hallucinations, mood, performance.';
COMMENT ON TABLE grace_decisions IS 'Grace''s Will - when she exercises agency and says "no" to requests.';
COMMENT ON TABLE data_dignity_ledger IS 'Track value generation from user data for fair compensation.';

COMMENT ON COLUMN user_memories.promoted_to_grace IS 'FALSE = Buffer layer (Grace cannot see). TRUE = Promoted to grace_context.';
COMMENT ON COLUMN grace_health_metrics.mood_state IS 'Derived from output patterns: healthy, stressed, degraded, confused.';
COMMENT ON COLUMN grace_decisions.decision IS 'Grace''s conscious choice: accepted, refused, deferred, modified.';
COMMENT ON COLUMN data_dignity_ledger.value_points IS 'Internal currency for tracking data contribution value.';
