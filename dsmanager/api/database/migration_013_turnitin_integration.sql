-- ============================================
-- Migration 013: Turnitin Integration
-- Adds Turnitin LTI integration for plagiarism detection and feedback
-- ============================================

-- Create turnitin_configurations table
CREATE TABLE IF NOT EXISTS turnitin_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Turnitin LTI Configuration
    tool_name VARCHAR(255) DEFAULT 'Turnitin',
    tool_url TEXT,  -- Turnitin LTI launch URL
    consumer_key VARCHAR(255),  -- LTI consumer key
    shared_secret TEXT,  -- LTI shared secret (encrypted)
    
    -- Integration Settings
    enabled BOOLEAN DEFAULT FALSE,
    allow_late_submissions BOOLEAN DEFAULT TRUE,
    enable_peer_review BOOLEAN DEFAULT FALSE,
    enable_ai_detection BOOLEAN DEFAULT TRUE,
    enable_feedback_studio BOOLEAN DEFAULT TRUE,
    
    -- Similarity Report Settings
    similarity_threshold INTEGER DEFAULT 25,  -- Percentage threshold for flagging
    exclude_quotes BOOLEAN DEFAULT FALSE,
    exclude_bibliography BOOLEAN DEFAULT FALSE,
    exclude_small_matches INTEGER DEFAULT 0,  -- Minimum word count for matches
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    
    -- Ensure one configuration per teacher
    UNIQUE(teacher_id)
);

-- Create indexes
CREATE INDEX idx_turnitin_config_teacher ON turnitin_configurations(teacher_id, enabled) WHERE deleted_at IS NULL;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_turnitin_config_updated_at 
BEFORE UPDATE ON turnitin_configurations
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Create turnitin_submissions table
CREATE TABLE IF NOT EXISTS turnitin_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES student_grades(id) ON DELETE SET NULL,
    
    -- Submission Information
    submission_title VARCHAR(255) NOT NULL,
    submission_content TEXT NOT NULL,
    submission_type VARCHAR(50) DEFAULT 'text' CHECK (submission_type IN ('text', 'file', 'external_tool')),
    
    -- Turnitin Response Data
    turnitin_submission_id VARCHAR(255),  -- Turnitin's submission ID
    turnitin_url TEXT,  -- URL to view submission in Turnitin
    similarity_report_url TEXT,  -- URL to view similarity report
    similarity_score DECIMAL(5,2),  -- Overall similarity percentage
    ai_score DECIMAL(5,2),  -- AI writing detection score (0-100)
    
    -- Report Status
    report_status VARCHAR(50) DEFAULT 'pending' CHECK (report_status IN ('pending', 'processing', 'complete', 'error')),
    report_generated_at TIMESTAMP,
    
    -- Similarity Details (JSONB for flexibility)
    similarity_details JSONB DEFAULT '{}',  -- Stores match sources, percentages, etc.
    ai_detection_details JSONB DEFAULT '{}',  -- Stores AI detection breakdown
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_turnitin_submissions_teacher ON turnitin_submissions(teacher_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_turnitin_submissions_student ON turnitin_submissions(student_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_turnitin_submissions_assignment ON turnitin_submissions(assignment_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_turnitin_submissions_status ON turnitin_submissions(report_status) WHERE deleted_at IS NULL;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_turnitin_submissions_updated_at 
BEFORE UPDATE ON turnitin_submissions
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE turnitin_configurations IS 
'Stores Turnitin LTI integration configuration for each teacher. Includes API keys, settings, and feature flags.';

COMMENT ON TABLE turnitin_submissions IS 
'Stores student submissions sent to Turnitin for similarity checking and AI detection. Links to assignments and stores report data.';


