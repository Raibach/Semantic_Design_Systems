-- Migration 016: Extended Prompt Engineering Tables
-- Adds tables for approval queue, variables management, and trace activity
-- Completes the database architecture for production-ready Prompt Composer Console

-- ============================================
-- PROMPT APPROVAL QUEUE TABLE
-- ============================================
-- Tracks pending prompt reviews and approvals in right column menu
-- Each approval request represents a prompt that needs review
CREATE TABLE IF NOT EXISTS prompt_approval_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which prompt session this approval is for
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,

    -- Which specific version is being reviewed
    version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    version_number INTEGER NOT NULL,

    -- User who requested approval
    requested_by_user_id UUID NOT NULL REFERENCES users(id),

    -- User(s) who should review (can be multiple)
    assigned_to_user_ids UUID[] DEFAULT '{}',

    -- Approval state
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'in_review', 'approved', 'rejected', 'changes_requested'
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'critical'

    -- Review metadata
    review_notes TEXT,
    requested_changes TEXT,
    approval_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    submitted_for_review_at TIMESTAMP,
    review_started_at TIMESTAMP,
    review_completed_at TIMESTAMP,

    -- SLA tracking
    sla_due_at TIMESTAMP,
    sla_breached_at TIMESTAMP,

    -- Metadata for workflow
    metadata JSONB DEFAULT '{}',

    -- Ensure only one pending approval per session/version
    UNIQUE(session_id, version_number, status)
);

-- Indexes for prompt_approval_queue
CREATE INDEX IF NOT EXISTS idx_prompt_approval_queue_session_id ON prompt_approval_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_approval_queue_requested_by_user_id ON prompt_approval_queue(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_approval_queue_status ON prompt_approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_prompt_approval_queue_priority ON prompt_approval_queue(priority);
CREATE INDEX IF NOT EXISTS idx_prompt_approval_queue_created_at ON prompt_approval_queue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_approval_queue_sla_due_at ON prompt_approval_queue(sla_due_at) WHERE sla_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prompt_approval_queue_metadata ON prompt_approval_queue USING GIN(metadata);

-- ============================================
-- PROMPT VARIABLES TABLE
-- ============================================
-- Manages prompt variables for dynamic prompt generation
-- Variables can be used across multiple prompt sessions
CREATE TABLE IF NOT EXISTS prompt_variables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who owns this variable
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Variable metadata
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,

    -- Variable type and constraints
    variable_type VARCHAR(50) NOT NULL DEFAULT 'text', -- 'text', 'number', 'boolean', 'select', 'list', 'object'
    data_type VARCHAR(50) DEFAULT 'string', -- 'string', 'integer', 'float', 'boolean', 'array', 'json'
    default_value TEXT,
    validation_rules JSONB DEFAULT '{}',

    -- Options for select/list types
    options JSONB DEFAULT '[]',

    -- Scope and visibility
    scope VARCHAR(50) DEFAULT 'private', -- 'private', 'team', 'public'
    is_required BOOLEAN DEFAULT FALSE,
    is_system_variable BOOLEAN DEFAULT FALSE,

    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Ensure unique variable names per user
    UNIQUE(user_id, name)
);

-- Indexes for prompt_variables
CREATE INDEX IF NOT EXISTS idx_prompt_variables_user_id ON prompt_variables(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_variables_name ON prompt_variables(name);
CREATE INDEX IF NOT EXISTS idx_prompt_variables_variable_type ON prompt_variables(variable_type);
CREATE INDEX IF NOT EXISTS idx_prompt_variables_scope ON prompt_variables(scope);
CREATE INDEX IF NOT EXISTS idx_prompt_variables_is_system_variable ON prompt_variables(is_system_variable) WHERE is_system_variable = TRUE;
CREATE INDEX IF NOT EXISTS idx_prompt_variables_created_at ON prompt_variables(created_at DESC);

-- ============================================
-- PROMPT VARIABLE VALUES TABLE
-- ============================================
-- Stores actual values for variables in specific prompt sessions
CREATE TABLE IF NOT EXISTS prompt_variable_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which variable this value is for
    variable_id UUID NOT NULL REFERENCES prompt_variables(id) ON DELETE CASCADE,

    -- Which prompt session this value belongs to
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,

    -- The actual value
    value TEXT NOT NULL,

    -- Value metadata
    value_type VARCHAR(50) DEFAULT 'manual', -- 'manual', 'ai_generated', 'calculated', 'imported'
    confidence_score DECIMAL(3,2) DEFAULT 1.0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,

    -- Ensure one value per variable per session (unless versioned)
    UNIQUE(variable_id, session_id)
);

-- Indexes for prompt_variable_values
CREATE INDEX IF NOT EXISTS idx_prompt_variable_values_variable_id ON prompt_variable_values(variable_id);
CREATE INDEX IF NOT EXISTS idx_prompt_variable_values_session_id ON prompt_variable_values(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_variable_values_created_at ON prompt_variable_values(created_at DESC);

-- ============================================
-- PROMPT TRACE ACTIVITY TABLE
-- ============================================
-- Tracks prompt performance, usage, and governance
-- Used for analytics, monitoring, and compliance
CREATE TABLE IF NOT EXISTS prompt_trace_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which prompt session this trace is for
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,

    -- Which specific version was used
    version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
    version_number INTEGER,

    -- Activity metadata
    activity_type VARCHAR(100) NOT NULL, -- 'prompt_execution', 'model_query', 'variable_substitution', 'validation', 'approval', 'export', 'import'
    activity_subtype VARCHAR(100), -- More specific activity type

    -- User who performed the activity
    performed_by_user_id UUID REFERENCES users(id),

    -- Performance metrics
    execution_time_ms INTEGER,
    token_count INTEGER,
    cost_estimate DECIMAL(10,6),

    -- Success/failure tracking
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    error_code VARCHAR(100),

    -- Input/output tracking
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',

    -- Model information (if applicable)
    model_name VARCHAR(255),
    model_provider VARCHAR(100),
    model_parameters JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),

    -- Index-friendly timestamp for partitioning
    activity_timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for prompt_trace_activity
CREATE INDEX IF NOT EXISTS idx_prompt_trace_activity_session_id ON prompt_trace_activity(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_activity_version_id ON prompt_trace_activity(version_id);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_activity_activity_type ON prompt_trace_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_activity_performed_by_user_id ON prompt_trace_activity(performed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_activity_success ON prompt_trace_activity(success);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_activity_created_at ON prompt_trace_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_activity_activity_timestamp ON prompt_trace_activity(activity_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_activity_metadata ON prompt_trace_activity USING GIN(metadata);

-- ============================================
-- PROMPT TEMPLATES TABLE
-- ============================================
-- Stores reusable prompt templates
CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who owns this template
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Template metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),

    -- Template content
    template_content TEXT NOT NULL,
    variables_schema JSONB DEFAULT '{}', -- JSON schema for variables

    -- Template configuration
    is_public BOOLEAN DEFAULT FALSE,
    is_system_template BOOLEAN DEFAULT FALSE,
    version VARCHAR(50) DEFAULT '1.0.0',

    -- Usage statistics
    usage_count INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2),
    rating_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,

    -- Ensure unique template names per user
    UNIQUE(user_id, name)
);

-- Indexes for prompt_templates
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id ON prompt_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_name ON prompt_templates(name);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_is_public ON prompt_templates(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_prompt_templates_created_at ON prompt_templates(created_at DESC);

-- ============================================
-- PROMPT TEMPLATE INSTANCES TABLE
-- ============================================
-- Links prompt sessions to templates
CREATE TABLE IF NOT EXISTS prompt_template_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which template was used
    template_id UUID NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,

    -- Which prompt session was created from this template
    session_id UUID NOT NULL REFERENCES prompt_sessions(id) ON DELETE CASCADE,

    -- Variable values used in this instance
    variable_values JSONB DEFAULT '{}',

    -- Instance metadata
    instance_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Ensure one instance per session per template
    UNIQUE(template_id, session_id)
);

-- Indexes for prompt_template_instances
CREATE INDEX IF NOT EXISTS idx_prompt_template_instances_template_id ON prompt_template_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_prompt_template_instances_session_id ON prompt_template_instances(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_template_instances_created_at ON prompt_template_instances(created_at DESC);

-- ============================================
-- CREATE FUNCTIONS
-- ============================================

-- Function to submit a prompt for approval
CREATE OR REPLACE FUNCTION submit_prompt_for_approval(
    p_session_id UUID,
    p_version_number INTEGER,
    p_requested_by_user_id UUID,
    p_priority VARCHAR(20) DEFAULT 'normal',
    p_assigned_to_user_ids UUID[] DEFAULT '{}',
    p_review_notes TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_approval_id UUID;
    v_version_id UUID;
    v_sla_due_at TIMESTAMP;
BEGIN
    -- Get the version ID
    SELECT id INTO v_version_id
    FROM prompt_versions
    WHERE session_id = p_session_id AND version_number = p_version_number;

    -- Calculate SLA due date (48 hours from now for normal priority)
    v_sla_due_at := CASE p_priority
        WHEN 'critical' THEN NOW() + INTERVAL '4 hours'
        WHEN 'high' THEN NOW() + INTERVAL '24 hours'
        WHEN 'normal' THEN NOW() + INTERVAL '48 hours'
        WHEN 'low' THEN NOW() + INTERVAL '7 days'
        ELSE NOW() + INTERVAL '48 hours'
    END;

    -- Create approval request
    INSERT INTO prompt_approval_queue (
        session_id,
        version_id,
        version_number,
        requested_by_user_id,
        assigned_to_user_ids,
        priority,
        review_notes,
        sla_due_at,
        metadata,
        submitted_for_review_at
    )
    VALUES (
        p_session_id,
        v_version_id,
        p_version_number,
        p_requested_by_user_id,
        p_assigned_to_user_ids,
        p_priority,
        p_review_notes,
        v_sla_due_at,
        p_metadata,
        NOW()
    )
    RETURNING id INTO v_approval_id;

    -- Update session metadata to indicate approval pending
    UPDATE prompt_sessions
    SET metadata = metadata || jsonb_build_object(
        'pending_approval_id', v_approval_id,
        'pending_approval_version', p_version_number,
        'pending_approval_at', NOW()
    )
    WHERE id = p_session_id;

    RETURN v_approval_id;
END;
$$ LANGUAGE plpgsql;

-- Function to process approval decision
CREATE OR REPLACE FUNCTION process_prompt_approval(
    p_approval_id UUID,
    p_processed_by_user_id UUID,
    p_decision VARCHAR(50), -- 'approved', 'rejected', 'changes_requested'
    p_approval_notes TEXT DEFAULT NULL,
    p_requested_changes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_session_id UUID;
    v_version_number INTEGER;
    v_current_status VARCHAR(50);
BEGIN
    -- Get current status and session info
    SELECT session_id, version_number, status
    INTO v_session_id, v_version_number, v_current_status
    FROM prompt_approval_queue
    WHERE id = p_approval_id;

    -- Check if approval exists and is in reviewable state
    IF v_session_id IS NULL THEN
        RAISE EXCEPTION 'Approval request not found';
    END IF;

    IF v_current_status NOT IN ('pending', 'in_review') THEN
        RAISE EXCEPTION 'Approval request is not in a reviewable state';
    END IF;

    -- Update approval request
    UPDATE prompt_approval_queue
    SET
        status = p_decision,
        approval_notes = p_approval_notes,
        requested_changes = p_requested_changes,
        review_completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_approval_id;

    -- Update session metadata based on decision
    IF p_decision = 'approved' THEN
        UPDATE prompt_sessions
        SET metadata = metadata || jsonb_build_object(
            'last_approved_version', v_version_number,
            'last_approved_at', NOW(),
            'last_approved_by', p_processed_by_user_id,
            'pending_approval_id', NULL,
            'pending_approval_version', NULL
        )
        WHERE id = v_session_id;
    ELSIF p_decision = 'rejected' THEN
        UPDATE prompt_sessions
        SET metadata = metadata || jsonb_build_object(
            'last_rejected_version', v_version_number,
            'last_rejected_at', NOW(),
            'last_rejected_by', p_processed_by_user_id,
            'pending_approval_id', NULL,
            'pending_approval_version', NULL
        )
        WHERE id = v_session_id;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to log prompt trace activity
CREATE OR REPLACE FUNCTION log_prompt_trace_activity(
    p_session_id UUID,
    p_activity_type VARCHAR(100),
    p_performed_by_user_id UUID DEFAULT NULL,
    p_version_number INTEGER DEFAULT NULL,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL,
    p_execution_time_ms INTEGER DEFAULT NULL,
    p_token_count INTEGER DEFAULT NULL,
    p_cost_estimate DECIMAL(10,6) DEFAULT NULL,
    p_model_name VARCHAR(255) DEFAULT NULL,
    p_model_provider VARCHAR(100) DEFAULT NULL,
    p_input_data JSONB DEFAULT '{}',
    p_output_data JSONB DEFAULT '{}',
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_trace_id UUID;
    v_version_id UUID;
BEGIN
    -- Get version ID if version number is provided
    IF p_version_number IS NOT NULL THEN
        SELECT id INTO v_version_id
        FROM prompt_versions
        WHERE session_id = p_session_id AND version_number = p_version_number;
    END IF;

    -- Create trace activity record
    INSERT INTO prompt_trace_activity (
        session_id,
        version_id,
        version_number,
        activity_type,
        performed_by_user_id,
        success,
        error_message,
        execution_time_ms,
        token_count,
        cost_estimate,
        model_name,
        model_provider,
        input_data,
        output_data,
        metadata
    )
    VALUES (
        p_session_id,
        v_version_id,
        p_version_number,
        p_activity_type,
        p_performed_by_user_id,
        p_success,
        p_error_message,
        p_execution_time_ms,
        p_token_count,
        p_cost_estimate,
        p_model_name,
        p_model_provider,
        p_input_data,
        p_output_data,
        p_metadata
    )
    RETURNING id INTO v_trace_id;

    -- Update session last accessed time
    UPDATE prompt_sessions
    SET last_accessed_at = NOW()
    WHERE id = p_session_id;

    RETURN v_trace_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create prompt from template
CREATE OR REPLACE FUNCTION create_prompt_from_template(
    p_template_id UUID,
    p_user_id UUID,
    p_session_title VARCHAR(255) DEFAULT NULL,
    p_variable_values JSONB DEFAULT '{}',
    p_instance_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_template_content TEXT;
    v_variables_schema JSONB;
    v_template_name VARCHAR(255);
    v_session_id UUID;
    v_instance_id UUID;
BEGIN
    -- Get template content and schema
    SELECT template_content, variables_schema, name
    INTO v_template_content, v_variables_schema, v_template_name
    FROM prompt_templates
    WHERE id = p_template_id AND (user_id = p_user_id OR is_public = TRUE);

    IF v_template_content IS NULL THEN
        RAISE EXCEPTION 'Template not found or not accessible';
    END IF;

    -- Create a new prompt session
    v_session_id := create_prompt_session(
        p_user_id,
        COALESCE(p_session_title, v_template_name || ' - Instance'),
        'Created from template: ' || v_template_name
    );

    -- Set the template content as initial left column content
    UPDATE prompt_sessions
    SET left_column_content = v_template_content
    WHERE id = v_session_id;

    -- Save initial version
    PERFORM save_prompt_version(
        v_session_id,
        p_user_id,
        v_template_content,
        NULL,
        'Initial version created from template: ' || v_template_name,
        'template'
    );

    -- Create template instance record
    INSERT INTO prompt_template_instances (
        template_id,
        session_id,
        variable_values,
        instance_notes
    )
    VALUES (
        p_template_id,
        v_session_id,
        p_variable_values,
        p_instance_notes
    )
    RETURNING id INTO v_instance_id;

    -- Update template usage statistics
    UPDATE prompt_templates
    SET
        usage_count = usage_count + 1,
        last_used_at = NOW()
    WHERE id = p_template_id;

    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get approval queue statistics
CREATE OR REPLACE FUNCTION get_approval_queue_stats(
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_pending', COUNT(*) FILTER (WHERE status IN ('pending', 'in_review')),
        'pending_critical', COUNT(*) FILTER (WHERE status IN ('pending', 'in_review') AND priority = 'critical'),
        'pending_high', COUNT(*) FILTER (WHERE status IN ('pending', 'in_review') AND priority = 'high'),
        'pending_normal', COUNT(*) FILTER (WHERE status IN ('pending', 'in_review') AND priority = 'normal'),
        'pending_low', COUNT(*) FILTER (WHERE status IN ('pending', 'in_review') AND priority = 'low'),
        'assigned_to_me', COUNT(*) FILTER (WHERE p_user_id = ANY(assigned_to_user_ids) AND status IN ('pending', 'in_review')),
        'requested_by_me', COUNT(*) FILTER (WHERE requested_by_user_id = p_user_id AND status IN ('pending', 'in_review')),
        'sla_breached', COUNT(*) FILTER (WHERE sla_breached_at IS NOT NULL AND status IN ('pending', 'in_review')),
        'sla_due_soon', COUNT(*) FILTER (WHERE sla_due_at < NOW() + INTERVAL '24 hours' AND sla_due_at > NOW() AND status IN ('pending', 'in_review'))
    ) INTO v_stats
    FROM prompt_approval_queue;

    RETURN COALESCE(v_stats, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Function to get prompt performance metrics
CREATE OR REPLACE FUNCTION get_prompt_performance_metrics(
    p_session_id UUID,
    p_days_back INTEGER DEFAULT 30
) RETURNS JSONB AS $$
DECLARE
    v_metrics JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_executions', COUNT(*),
        'success_rate', ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) * 100, 2),
        'avg_execution_time_ms', ROUND(AVG(execution_time_ms), 2),
        'total_tokens', SUM(token_count),
        'estimated_cost', ROUND(SUM(cost_estimate), 6),
        'top_models', (
            SELECT jsonb_agg(jsonb_build_object(
                'model_name', model_name,
                'count', model_count
            ))
            FROM (
                SELECT model_name, COUNT(*) as model_count
                FROM prompt_trace_activity
                WHERE session_id = p_session_id
                AND activity_timestamp >= NOW() - (p_days_back || ' days')::INTERVAL
                AND model_name IS NOT NULL
                GROUP BY model_name
                ORDER BY model_count DESC
                LIMIT 5
            ) model_stats
        ),
        'error_breakdown', (
            SELECT jsonb_agg(jsonb_build_object(
                'error_code', error_code,
                'count', error_count
            ))
            FROM (
                SELECT error_code, COUNT(*) as error_count
                FROM prompt_trace_activity
                WHERE session_id = p_session_id
                AND activity_timestamp >= NOW() - (p_days_back || ' days')::INTERVAL
                AND success = FALSE
                AND error_code IS NOT NULL
                GROUP BY error_code
                ORDER BY error_count DESC
                LIMIT 10
            ) error_stats
        )
    ) INTO v_metrics
    FROM prompt_trace_activity
    WHERE session_id = p_session_id
    AND activity_timestamp >= NOW() - (p_days_back || ' days')::INTERVAL;

    RETURN COALESCE(v_metrics, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Function to get variable usage statistics
CREATE OR REPLACE FUNCTION get_variable_usage_stats(
    p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_variables', COUNT(*),
        'system_variables', COUNT(*) FILTER (WHERE is_system_variable = TRUE),
        'custom_variables', COUNT(*) FILTER (WHERE is_system_variable = FALSE),
        'most_used_variables', (
            SELECT jsonb_agg(jsonb_build_object(
                'variable_id', variable_id,
                'variable_name', name,
                'usage_count', usage_count
            ))
            FROM (
                SELECT pv.id as variable_id, pv.name, pv.usage_count
                FROM prompt_variables pv
                WHERE pv.user_id = p_user_id
                ORDER BY pv.usage_count DESC
                LIMIT 10
            ) usage_stats
        ),
        'recently_used_variables', (
            SELECT jsonb_agg(jsonb_build_object(
                'variable_id', variable_id,
                'variable_name', name,
                'last_used_at', last_used_at
            ))
            FROM (
                SELECT pv.id as variable_id, pv.name, pv.last_used_at
                FROM prompt_variables pv
                WHERE pv.user_id = p_user_id
                AND pv.last_used_at IS NOT NULL
                ORDER BY pv.last_used_at DESC
                LIMIT 10
            ) recent_stats
        ),
        'variable_types_breakdown', (
            SELECT jsonb_object_agg(variable_type, type_count)
            FROM (
                SELECT variable_type, COUNT(*) as type_count
                FROM prompt_variables
                WHERE user_id = p_user_id
                GROUP BY variable_type
            ) type_stats
        )
    ) INTO v_stats
    FROM prompt_variables
    WHERE user_id = p_user_id;

    RETURN COALESCE(v_stats, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CREATE TRIGGERS
-- ============================================

-- Trigger to update updated_at timestamp on prompt_approval_queue
CREATE OR REPLACE FUNCTION update_prompt_approval_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prompt_approval_queue_updated_at
    BEFORE UPDATE ON prompt_approval_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_prompt_approval_queue_updated_at();

-- Trigger to update SLA breached status
CREATE OR REPLACE FUNCTION check_prompt_approval_sla()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark as breached if due date passed and still pending/in_review
    IF NEW.sla_due_at IS NOT NULL
       AND NEW.sla_due_at < NOW()
       AND NEW.status IN ('pending', 'in_review')
       AND NEW.sla_breached_at IS NULL THEN
        NEW.sla_breached_at = NOW();
    END IF;

    -- Clear breached status if no longer pending/in_review
    IF NEW.status NOT IN ('pending', 'in_review') THEN
        NEW.sla_breached_at = NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_prompt_approval_sla
    BEFORE INSERT OR UPDATE ON prompt_approval_queue
    FOR EACH ROW
    EXECUTE FUNCTION check_prompt_approval_sla();

-- Trigger to update prompt_variables usage tracking
CREATE OR REPLACE FUNCTION update_prompt_variable_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- Update usage count and last_used_at when variable value is created/updated
    UPDATE prompt_variables
    SET
        usage_count = usage_count + 1,
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.variable_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prompt_variable_usage
    AFTER INSERT OR UPDATE ON prompt_variable_values
    FOR EACH ROW
    EXECUTE FUNCTION update_prompt_variable_usage();

-- Trigger to update prompt_templates usage tracking
CREATE OR REPLACE FUNCTION update_prompt_template_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- Update usage count and last_used_at when template instance is created
    UPDATE prompt_templates
    SET
        usage_count = usage_count + 1,
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.template_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prompt_template_usage
    AFTER INSERT ON prompt_template_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_prompt_template_usage();

-- ============================================
-- CREATE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE prompt_approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_variable_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_trace_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_instances ENABLE ROW LEVEL SECURITY;

-- Prompt approval queue policies
CREATE POLICY prompt_approval_queue_select_policy ON prompt_approval_queue
    FOR SELECT USING (
        -- Users can see approvals they requested, are assigned to, or own the session
        requested_by_user_id = current_setting('app.current_user_id')::UUID
        OR current_setting('app.current_user_id')::UUID = ANY(assigned_to_user_ids)
        OR EXISTS (
            SELECT 1 FROM prompt_sessions ps
            WHERE ps.id = prompt_approval_queue.session_id
            AND ps.user_id = current_setting('app.current_user_id')::UUID
        )
    );

CREATE POLICY prompt_approval_queue_insert_policy ON prompt_approval_queue
    FOR INSERT WITH CHECK (
        -- Users can only create approvals for their own sessions
        EXISTS (
            SELECT 1 FROM prompt_sessions ps
            WHERE ps.id = prompt_approval_queue.session_id
            AND ps.user_id = current_setting('app.current_user_id')::UUID
        )
    );

CREATE POLICY prompt_approval_queue_update_policy ON prompt_approval_queue
    FOR UPDATE USING (
        -- Users can update approvals they are assigned to or requested
        requested_by_user_id = current_setting('app.current_user_id')::UUID
        OR current_setting('app.current_user_id')::UUID = ANY(assigned_to_user_ids)
    );

-- Prompt variables policies
CREATE POLICY prompt_variables_policy ON prompt_variables
    FOR ALL USING (
        user_id = current_setting('app.current_user_id')::UUID
        OR (scope = 'public' AND is_system_variable = TRUE)
    );

-- Prompt variable values policies
CREATE POLICY prompt_variable_values_policy ON prompt_variable_values
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM prompt_sessions ps
            WHERE ps.id = prompt_variable_values.session_id
            AND ps.user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- Prompt trace activity policies
CREATE POLICY prompt_trace_activity_policy ON prompt_trace_activity
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM prompt_sessions ps
            WHERE ps.id = prompt_trace_activity.session_id
            AND ps.user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- Prompt templates policies
CREATE POLICY prompt_templates_select_policy ON prompt_templates
    FOR SELECT USING (
        user_id = current_setting('app.current_user_id')::UUID
        OR is_public = TRUE
    );

CREATE POLICY prompt_templates_modify_policy ON prompt_templates
    FOR ALL USING (
        user_id = current_setting('app.current_user_id')::UUID
    );

-- Prompt template instances policies
CREATE POLICY prompt_template_instances_policy ON prompt_template_instances
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM prompt_sessions ps
            WHERE ps.id = prompt_template_instances.session_id
            AND ps.user_id = current_setting('app.current_user_id')::UUID
        )
    );

-- ============================================
-- VERIFY MIGRATION
-- ============================================

DO $$
DECLARE
    tables_created INTEGER;
    functions_created INTEGER;
BEGIN
    -- Count new tables
    SELECT COUNT(*) INTO tables_created
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'prompt_approval_queue',
        'prompt_variables',
        'prompt_variable_values',
        'prompt_trace_activity',
        'prompt_templates',
        'prompt_template_instances'
    );

    RAISE NOTICE 'Migration 016: Created % extended prompt engineering tables', tables_created;

    -- Count new functions
    SELECT COUNT(*) INTO functions_created
    FROM pg_proc
    WHERE proname IN (
        'submit_prompt_for_approval',
        'process_prompt_approval',
        'log_prompt_trace_activity',
        'create_prompt_from_template',
        'get_approval_queue_stats',
        'get_prompt_performance_metrics',
        'get_variable_usage_stats'
    );

    RAISE NOTICE 'Migration 016: Created % extended prompt engineering functions', functions_created;

    -- Verify RLS policies
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'prompt_approval_queue'
        AND policyname = 'prompt_approval_queue_select_policy'
    ) THEN
        RAISE NOTICE '✓ RLS policies created for prompt_approval_queue';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'prompt_variables'
        AND policyname = 'prompt_variables_policy'
    ) THEN
        RAISE NOTICE '✓ RLS policies created for prompt_variables';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'prompt_templates'
        AND policyname = 'prompt_templates_select_policy'
    ) THEN
        RAISE NOTICE '✓ RLS policies created for prompt_templates';
    END IF;
END $$;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
