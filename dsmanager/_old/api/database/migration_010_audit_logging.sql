-- ============================================
-- Migration 010: Audit Logging for Data Access
-- Tracks all data access events for security and compliance
-- ============================================

-- Create data_access_audit table
CREATE TABLE IF NOT EXISTS data_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Access Information
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accessed_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Student whose data was accessed
    access_type VARCHAR(50) NOT NULL CHECK (access_type IN (
        'teacher_view_student', 'teacher_view_grade', 'teacher_view_memory',
        'teacher_view_profile', 'teacher_create_grade', 'teacher_update_grade',
        'student_view_own', 'admin_access'
    )),
    
    -- Resource Information
    resource_type VARCHAR(50) NOT NULL,  -- 'student', 'grade', 'memory', 'profile', etc.
    resource_id UUID,  -- ID of the accessed resource
    
    -- Request Information
    endpoint VARCHAR(255),  -- API endpoint accessed
    ip_address INET,
    user_agent TEXT,
    
    -- Access Details
    access_details JSONB DEFAULT '{}',  -- Additional context about the access
    
    -- Timestamp
    accessed_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_audit_user ON data_access_audit(user_id, accessed_at DESC);
CREATE INDEX idx_audit_accessed_user ON data_access_audit(accessed_user_id, accessed_at DESC);
CREATE INDEX idx_audit_type ON data_access_audit(access_type, accessed_at DESC);
CREATE INDEX idx_audit_resource ON data_access_audit(resource_type, resource_id);
CREATE INDEX idx_audit_timestamp ON data_access_audit(accessed_at DESC);

-- Add comment
COMMENT ON TABLE data_access_audit IS 
'Audit log for all data access events. Tracks teacher access to student data, student access to own data, and admin access.';

-- Create function to log access (can be called from application code)
CREATE OR REPLACE FUNCTION log_data_access(
    p_user_id UUID,
    p_accessed_user_id UUID,
    p_access_type VARCHAR(50),
    p_resource_type VARCHAR(50),
    p_resource_id UUID DEFAULT NULL,
    p_endpoint VARCHAR(255) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_access_details JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO data_access_audit (
        user_id, accessed_user_id, access_type, resource_type,
        resource_id, endpoint, ip_address, user_agent, access_details
    ) VALUES (
        p_user_id, p_accessed_user_id, p_access_type, p_resource_type,
        p_resource_id, p_endpoint, p_ip_address, p_user_agent, p_access_details
    ) RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION log_data_access IS 
'Function to log data access events. Called from application code when data is accessed.';


