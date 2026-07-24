-- ============================================
-- Migration 012: Rubric Templates
-- Adds rubric templates table for NY Regents ELA and other grading rubrics
-- ============================================

-- Create rubric_templates table
CREATE TABLE IF NOT EXISTS rubric_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Template information
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_type VARCHAR(50) NOT NULL DEFAULT 'custom' 
        CHECK (template_type IN ('ny_regents_argument', 'ny_regents_text_analysis', 'custom')),
    
    -- Rubric structure (JSONB for flexibility)
    rubric_structure JSONB NOT NULL DEFAULT '{}',
    
    -- Scoring configuration
    max_score DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    scoring_scale INTEGER NOT NULL DEFAULT 6,  -- 6-point or 4-point scale
    
    -- Metadata
    is_default BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,  -- Allow sharing with other teachers
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_rubric_templates_teacher ON rubric_templates(teacher_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_rubric_templates_type ON rubric_templates(template_type, is_public) WHERE deleted_at IS NULL;
CREATE INDEX idx_rubric_templates_default ON rubric_templates(teacher_id, is_default) WHERE deleted_at IS NULL AND is_default = TRUE;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_rubric_templates_updated_at 
BEFORE UPDATE ON rubric_templates
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Insert default NY Regents ELA templates
INSERT INTO rubric_templates (teacher_id, name, description, template_type, rubric_structure, max_score, scoring_scale, is_default, is_public)
SELECT 
    u.id,
    'NY Regents ELA - Argument (Part 2)',
    'New York State Regents Examination rubric for Writing from Sources - Argument. Evaluates Content and Analysis, Command of Evidence, Coherence/Organization/Style, and Control of Conventions.',
    'ny_regents_argument',
    '{
        "domains": [
            {
                "name": "Content and Analysis",
                "description": "Assesses how effectively the response conveys complex ideas, evaluates the strength and clarity of claims or central ideas, and considers depth of analysis and textual understanding.",
                "max_points": 2,
                "criteria": [
                    {
                        "level": 2,
                        "description": "Clearly introduces a precise claim, demonstrates a thoughtful analysis of the texts, and establishes a valid interpretation of the task"
                    },
                    {
                        "level": 1,
                        "description": "Introduces a claim and demonstrates some analysis of the texts, but the claim may be imprecise or the analysis may be superficial"
                    },
                    {
                        "level": 0,
                        "description": "Fails to introduce a claim or demonstrate analysis of the texts"
                    }
                ]
            },
            {
                "name": "Command of Evidence",
                "description": "Examines use of specific and relevant evidence from texts, evaluates proper citation and integration of sources, and assesses support for analysis and claims.",
                "max_points": 2,
                "criteria": [
                    {
                        "level": 2,
                        "description": "Develops the claim(s) with relevant, well-chosen facts, definitions, concrete details, quotations, or other information and examples from the text(s)"
                    },
                    {
                        "level": 1,
                        "description": "Develops the claim(s) with some relevant facts, definitions, details, quotations, or other information and examples from the text(s)"
                    },
                    {
                        "level": 0,
                        "description": "Fails to develop the claim(s) with relevant facts, definitions, details, quotations, or other information and examples from the text(s)"
                    }
                ]
            },
            {
                "name": "Coherence, Organization, and Style",
                "description": "Evaluates logical organization of ideas, assesses maintenance of formal style, and considers precision and sophistication of language.",
                "max_points": 1,
                "criteria": [
                    {
                        "level": 1,
                        "description": "Uses appropriate and varied transitions and syntax to link the major sections of the text, create cohesion, and clarify the relationships among complex ideas and concepts"
                    },
                    {
                        "level": 0,
                        "description": "Fails to use appropriate transitions or syntax to link sections of the text or clarify relationships"
                    }
                ]
            },
            {
                "name": "Control of Conventions",
                "description": "Examines command of standard English grammar and usage, evaluates spelling, punctuation, and capitalization, and considers overall writing mechanics.",
                "max_points": 1,
                "criteria": [
                    {
                        "level": 1,
                        "description": "Demonstrates command of the conventions of standard English grammar, usage, capitalization, punctuation, and spelling with no significant errors"
                    },
                    {
                        "level": 0,
                        "description": "Demonstrates a lack of command of conventions, with frequent errors that meaning may be unclear"
                    }
                ]
            }
        ],
        "notes": [
            "Essays addressing fewer texts than required can score no higher than a 3",
            "Personal responses with minimal text reference score no higher than a 1",
            "Completely copied responses receive a 0",
            "Responses unrelated to task or illegible receive a 0"
        ],
        "total_max_points": 6
    }'::jsonb,
    6.0,
    6,
    TRUE,
    TRUE
FROM users u
WHERE u.role = 'teacher'
ON CONFLICT DO NOTHING;

INSERT INTO rubric_templates (teacher_id, name, description, template_type, rubric_structure, max_score, scoring_scale, is_default, is_public)
SELECT 
    u.id,
    'NY Regents ELA - Text Analysis (Part 3)',
    'New York State Regents Examination rubric for Text Analysis Response. Evaluates Content and Analysis, Command of Evidence, Coherence/Organization/Style, and Control of Conventions.',
    'ny_regents_text_analysis',
    '{
        "domains": [
            {
                "name": "Content and Analysis",
                "description": "Assesses how effectively the response conveys complex ideas, evaluates the strength and clarity of claims or central ideas, and considers depth of analysis and textual understanding.",
                "max_points": 1,
                "criteria": [
                    {
                        "level": 1,
                        "description": "Clearly introduces a text and establishes a valid interpretation of the task"
                    },
                    {
                        "level": 0,
                        "description": "Fails to introduce a text or establish a valid interpretation of the task"
                    }
                ]
            },
            {
                "name": "Command of Evidence",
                "description": "Examines use of specific and relevant evidence from texts, evaluates proper citation and integration of sources, and assesses support for analysis and claims.",
                "max_points": 1,
                "criteria": [
                    {
                        "level": 1,
                        "description": "Develops the response with relevant and sufficient evidence from the text"
                    },
                    {
                        "level": 0,
                        "description": "Fails to develop the response with relevant and sufficient evidence from the text"
                    }
                ]
            },
            {
                "name": "Coherence, Organization, and Style",
                "description": "Evaluates logical organization of ideas, assesses maintenance of formal style, and considers precision and sophistication of language.",
                "max_points": 1,
                "criteria": [
                    {
                        "level": 1,
                        "description": "Uses appropriate and varied transitions and syntax to link the major sections of the text, create cohesion, and clarify the relationships among complex ideas and concepts"
                    },
                    {
                        "level": 0,
                        "description": "Fails to use appropriate transitions or syntax to link sections of the text or clarify relationships"
                    }
                ]
            },
            {
                "name": "Control of Conventions",
                "description": "Examines command of standard English grammar and usage, evaluates spelling, punctuation, and capitalization, and considers overall writing mechanics.",
                "max_points": 1,
                "criteria": [
                    {
                        "level": 1,
                        "description": "Demonstrates command of the conventions of standard English grammar, usage, capitalization, punctuation, and spelling with no significant errors"
                    },
                    {
                        "level": 0,
                        "description": "Demonstrates a lack of command of conventions, with frequent errors that meaning may be unclear"
                    }
                ]
            }
        ],
        "notes": [
            "Personal responses with minimal text reference score no higher than a 1",
            "Completely copied responses receive a 0",
            "Responses unrelated to task or illegible receive a 0"
        ],
        "total_max_points": 4
    }'::jsonb,
    4.0,
    4,
    TRUE,
    TRUE
FROM users u
WHERE u.role = 'teacher'
ON CONFLICT DO NOTHING;

-- Add comment
COMMENT ON TABLE rubric_templates IS 
'Stores rubric templates for grading student work. Includes default NY Regents ELA templates and custom teacher-created rubrics.';

