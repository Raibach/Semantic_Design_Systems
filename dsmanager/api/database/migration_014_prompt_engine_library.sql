-- ============================================
-- PROMPT ENGINE LIBRARY - Phase 1
-- Migration 014: Repurpose Core Structures for Prompt Management
-- ============================================

-- ============================================
-- 1. ADD PROMPT LIFECYCLE COLUMNS TO CONVERSATIONS
-- ============================================

-- Add prompt lifecycle columns to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS prompt_status VARCHAR(20) DEFAULT 'draft' 
  CHECK (prompt_status IN ('draft', 'review', 'published', 'archived')),
ADD COLUMN IF NOT EXISTS curator_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS prompt_version INTEGER DEFAULT 1;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_prompt_status 
  ON conversations(prompt_status);
CREATE INDEX IF NOT EXISTS idx_conversations_curator 
  ON conversations(curator_id);

-- ============================================
-- 2. CREATE TAG_DEFINITIONS TABLE IF NOT EXISTS
-- ============================================

CREATE TABLE IF NOT EXISTS tag_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_name VARCHAR(255) NOT NULL,
    tag_level INTEGER NOT NULL CHECK (tag_level >= 1 AND tag_level <= 4),
    parent_tag_id UUID REFERENCES tag_definitions(id) ON DELETE CASCADE,
    tag_path VARCHAR(500) NOT NULL,
    description TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, tag_path)
);

CREATE INDEX IF NOT EXISTS idx_tag_definitions_parent ON tag_definitions(parent_tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_definitions_user ON tag_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_tag_definitions_path ON tag_definitions(tag_path);

-- ============================================
-- 3. UPDATE TAG_DEFINITIONS WITH PROMPT TAXONOMY
-- ============================================

-- Insert Level 1: Prompt Types (Utility Company Focus)
INSERT INTO tag_definitions (tag_name, tag_level, parent_tag_id, tag_path, description, user_id)
VALUES
  ('Prompt for Field Operations', 1, NULL, 'Prompt for Field Operations', 'Prompts for field service, maintenance, and operations', NULL),
  ('Prompt for Customer Service', 1, NULL, 'Prompt for Customer Service', 'Prompts for customer interactions and support', NULL),
  ('Prompt for Engineering', 1, NULL, 'Prompt for Engineering', 'Prompts for engineering design, planning, and technical work', NULL),
  ('Prompt for Safety & Compliance', 1, NULL, 'Prompt for Safety & Compliance', 'Prompts for safety protocols and regulatory compliance', NULL),
  ('Prompt for Asset Management', 1, NULL, 'Prompt for Asset Management', 'Prompts for asset tracking, maintenance, and lifecycle management', NULL),
  ('Prompt for Billing & Metering', 1, NULL, 'Prompt for Billing & Metering', 'Prompts for billing, meter reading, and payment processing', NULL),
  ('Prompt for Outage Management', 1, NULL, 'Prompt for Outage Management', 'Prompts for outage response, restoration, and communication', NULL),
  ('Prompt for Reporting & Analytics', 1, NULL, 'Prompt for Reporting & Analytics', 'Prompts for reports, dashboards, and data analysis', NULL)
ON CONFLICT (user_id, tag_path) DO NOTHING;

-- Insert Level 2: Use Cases (cross-join with Level 1 parents)
INSERT INTO tag_definitions (tag_name, tag_level, parent_tag_id, tag_path, description, user_id)
SELECT 
  use_cases.tag_name,
  2,
  parent.id,
  parent.tag_path || ' > ' || use_cases.tag_name,
  use_cases.description,
  NULL
FROM (
  VALUES
    -- Field Operations use cases
    ('Work Order Management', 'Creating and managing field work orders'),
    ('Equipment Inspection', 'Inspecting and documenting equipment condition'),
    ('Maintenance Scheduling', 'Scheduling preventive and corrective maintenance'),
    ('Route Optimization', 'Optimizing field service routes'),
    ('Field Reporting', 'Generating field service reports'),
    ('Equipment Troubleshooting', 'Diagnosing and resolving equipment issues'),
    -- Customer Service use cases
    ('Account Inquiry', 'Handling customer account questions'),
    ('Service Request', 'Processing new service requests'),
    ('Billing Inquiry', 'Answering billing and payment questions'),
    ('Complaint Resolution', 'Resolving customer complaints'),
    ('Service Disconnection', 'Processing service disconnections'),
    ('Service Restoration', 'Restoring interrupted service'),
    -- Engineering use cases
    ('System Design', 'Designing utility systems and infrastructure'),
    ('Load Analysis', 'Analyzing electrical load requirements'),
    ('Protection Coordination', 'Designing protection systems'),
    ('Substation Design', 'Designing substation layouts'),
    ('Line Design', 'Designing transmission and distribution lines'),
    ('Project Planning', 'Planning engineering projects'),
    -- Safety & Compliance use cases
    ('Safety Protocol', 'Creating safety procedures and protocols'),
    ('Compliance Reporting', 'Generating regulatory compliance reports'),
    ('Incident Investigation', 'Investigating safety incidents'),
    ('Training Documentation', 'Creating safety training materials'),
    ('Audit Preparation', 'Preparing for safety and compliance audits'),
    -- Asset Management use cases
    ('Asset Inventory', 'Tracking utility assets and equipment'),
    ('Maintenance Planning', 'Planning asset maintenance schedules'),
    ('Lifecycle Management', 'Managing asset lifecycle and replacement'),
    ('Condition Assessment', 'Assessing asset condition and health'),
    ('Cost Analysis', 'Analyzing asset costs and ROI'),
    -- Billing & Metering use cases
    ('Meter Reading', 'Processing meter readings'),
    ('Billing Generation', 'Generating customer bills'),
    ('Payment Processing', 'Processing customer payments'),
    ('Rate Calculation', 'Calculating utility rates and charges'),
    ('Meter Installation', 'Scheduling and documenting meter installations'),
    -- Outage Management use cases
    ('Outage Reporting', 'Reporting and documenting outages'),
    ('Restoration Coordination', 'Coordinating outage restoration efforts'),
    ('Customer Communication', 'Communicating outage status to customers'),
    ('Root Cause Analysis', 'Analyzing outage root causes'),
    ('Prevention Planning', 'Planning outage prevention measures'),
    -- Reporting & Analytics use cases
    ('Performance Dashboards', 'Creating operational performance dashboards'),
    ('Trend Analysis', 'Analyzing operational trends'),
    ('Forecasting', 'Creating demand and usage forecasts'),
    ('Regulatory Reports', 'Generating regulatory compliance reports'),
    ('Executive Summaries', 'Creating executive summary reports')
) AS use_cases(tag_name, description)
CROSS JOIN tag_definitions parent
WHERE parent.tag_level = 1 
  AND (
    -- Field Operations use cases
    (parent.tag_path = 'Prompt for Field Operations' AND use_cases.tag_name IN ('Work Order Management', 'Equipment Inspection', 'Maintenance Scheduling', 'Route Optimization', 'Field Reporting', 'Equipment Troubleshooting'))
    OR
    -- Customer Service use cases
    (parent.tag_path = 'Prompt for Customer Service' AND use_cases.tag_name IN ('Account Inquiry', 'Service Request', 'Billing Inquiry', 'Complaint Resolution', 'Service Disconnection', 'Service Restoration'))
    OR
    -- Engineering use cases
    (parent.tag_path = 'Prompt for Engineering' AND use_cases.tag_name IN ('System Design', 'Load Analysis', 'Protection Coordination', 'Substation Design', 'Line Design', 'Project Planning'))
    OR
    -- Safety & Compliance use cases
    (parent.tag_path = 'Prompt for Safety & Compliance' AND use_cases.tag_name IN ('Safety Protocol', 'Compliance Reporting', 'Incident Investigation', 'Training Documentation', 'Audit Preparation'))
    OR
    -- Asset Management use cases
    (parent.tag_path = 'Prompt for Asset Management' AND use_cases.tag_name IN ('Asset Inventory', 'Maintenance Planning', 'Lifecycle Management', 'Condition Assessment', 'Cost Analysis'))
    OR
    -- Billing & Metering use cases
    (parent.tag_path = 'Prompt for Billing & Metering' AND use_cases.tag_name IN ('Meter Reading', 'Billing Generation', 'Payment Processing', 'Rate Calculation', 'Meter Installation'))
    OR
    -- Outage Management use cases
    (parent.tag_path = 'Prompt for Outage Management' AND use_cases.tag_name IN ('Outage Reporting', 'Restoration Coordination', 'Customer Communication', 'Root Cause Analysis', 'Prevention Planning'))
    OR
    -- Reporting & Analytics use cases
    (parent.tag_path = 'Prompt for Reporting & Analytics' AND use_cases.tag_name IN ('Performance Dashboards', 'Trend Analysis', 'Forecasting', 'Regulatory Reports', 'Executive Summaries'))
  )
ON CONFLICT (user_id, tag_path) DO NOTHING;

-- Insert Level 4: Output Types (can be used across all prompt types)
INSERT INTO tag_definitions (tag_name, tag_level, parent_tag_id, tag_path, description, user_id)
SELECT 
  output_types.tag_name,
  4,
  parent.id,
  parent.tag_path || ' > ' || output_types.tag_name,
  output_types.description,
  NULL
FROM (
  VALUES
    ('Work Order', 'Field work order document'),
    ('Inspection Report', 'Equipment inspection report'),
    ('Service Ticket', 'Customer service ticket'),
    ('Technical Drawing', 'Engineering drawing or schematic'),
    ('Dashboard', 'Operational dashboard or visualization'),
    ('Form', 'Data collection form'),
    ('Report', 'Analytical or summary report'),
    ('Procedure Document', 'Standard operating procedure'),
    ('Checklist', 'Safety or compliance checklist'),
    ('Email Template', 'Customer communication template')
) AS output_types(tag_name, description)
CROSS JOIN tag_definitions parent
WHERE parent.tag_level = 2  -- Attach to Level 2 (Use Cases)
ON CONFLICT (user_id, tag_path) DO NOTHING;

-- Note: Tag hierarchy is maintained via parent_tag_id in tag_definitions table
-- No separate tag_hierarchy table needed - relationships are implicit

-- ============================================
-- 3. VERIFY MIGRATION
-- ============================================

-- Verify columns were added
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'prompt_status'
    ) THEN
        RAISE EXCEPTION 'Failed to add prompt_status column to conversations table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'curator_id'
    ) THEN
        RAISE EXCEPTION 'Failed to add curator_id column to conversations table';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'prompt_version'
    ) THEN
        RAISE EXCEPTION 'Failed to add prompt_version column to conversations table';
    END IF;
END $$;

-- Verify prompt taxonomy tags were inserted
DO $$
DECLARE
    prompt_type_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO prompt_type_count
    FROM tag_definitions
    WHERE tag_path LIKE 'Prompt for%' AND tag_level = 1;
    
    IF prompt_type_count < 8 THEN
        RAISE EXCEPTION 'Expected at least 8 prompt type tags, found %', prompt_type_count;
    END IF;
    
    -- Verify utility-specific prompt types exist
    IF NOT EXISTS (SELECT 1 FROM tag_definitions WHERE tag_path = 'Prompt for Field Operations') THEN
        RAISE EXCEPTION 'Prompt for Field Operations not found';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM tag_definitions WHERE tag_path = 'Prompt for Customer Service') THEN
        RAISE EXCEPTION 'Prompt for Customer Service not found';
    END IF;
END $$;

-- ============================================
-- 4. CREATE CONVERSATION_TAGS TABLE IF NOT EXISTS
-- ============================================

CREATE TABLE IF NOT EXISTS conversation_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tag_definitions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(conversation_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation ON conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag ON conversation_tags(tag_id);

-- ============================================
-- 5. CREATE PROMPT FEEDBACK TABLE (Phase 3)
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feedback_type VARCHAR(50) NOT NULL CHECK (feedback_type IN ('bug', 'improvement', 'question', 'praise', 'other')),
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'resolved')),
    curator_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_feedback_conversation 
    ON prompt_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_feedback_user 
    ON prompt_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_feedback_status 
    ON prompt_feedback(status);
CREATE INDEX IF NOT EXISTS idx_prompt_feedback_created 
    ON prompt_feedback(created_at DESC);

-- ============================================
-- 6. CREATE PROMPT RATINGS TABLE (Phase 4)
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_prompt_ratings_conversation 
    ON prompt_ratings(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_ratings_user 
    ON prompt_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_ratings_rating 
    ON prompt_ratings(rating);

-- ============================================
-- 7. CREATE PROMPT COMMENTS TABLE (Phase 4)
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES prompt_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_comments_conversation 
    ON prompt_comments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_comments_user 
    ON prompt_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_comments_parent 
    ON prompt_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_prompt_comments_created 
    ON prompt_comments(created_at DESC);

-- ============================================
-- 8. CREATE PROMPT SHARES TABLE (Phase 4)
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    shared_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_level VARCHAR(20) DEFAULT 'read' CHECK (permission_level IN ('read', 'write', 'admin')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(conversation_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_prompt_shares_conversation 
    ON prompt_shares(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_shares_shared_by 
    ON prompt_shares(shared_by);
CREATE INDEX IF NOT EXISTS idx_prompt_shares_shared_with 
    ON prompt_shares(shared_with);

-- ============================================
-- 9. CREATE PROMPT HISTORY TABLE (Phase 5)
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    changes JSONB,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_history_conversation 
    ON prompt_history(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_user 
    ON prompt_history(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_timestamp 
    ON prompt_history(timestamp DESC);

-- ============================================
-- 10. CREATE PROMPT PERMISSIONS TABLE (Phase 6)
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(20) NOT NULL CHECK (permission IN ('read', 'write', 'admin')),
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_prompt_permissions_conversation 
    ON prompt_permissions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_permissions_user 
    ON prompt_permissions(user_id);

-- ============================================
-- 11. CREATE PROMPT ARTIFACTS TABLE (Phase 7)
-- ============================================

CREATE TABLE IF NOT EXISTS prompt_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    artifact_type VARCHAR(50) NOT NULL,
    artifact_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_artifacts_conversation 
    ON prompt_artifacts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_prompt_artifacts_project 
    ON prompt_artifacts(project_id);

-- ============================================
-- 12. ADD PROMPT_ROLE COLUMN TO USERS (Phase 6)
-- ============================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS prompt_role VARCHAR(20) DEFAULT 'viewer'
  CHECK (prompt_role IN ('contributor', 'curator', 'viewer', 'admin'));

