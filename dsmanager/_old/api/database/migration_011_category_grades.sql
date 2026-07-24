-- ============================================
-- Migration 011: Category-Specific Grades
-- Adds category_grades JSONB field to student_grades table
-- ============================================

-- Add category_grades column to student_grades
ALTER TABLE student_grades
ADD COLUMN IF NOT EXISTS category_grades JSONB DEFAULT '{}';

-- Add index for querying category grades
CREATE INDEX IF NOT EXISTS idx_grades_category_grades 
ON student_grades USING GIN (category_grades) 
WHERE deleted_at IS NULL AND category_grades IS NOT NULL AND category_grades != '{}'::jsonb;

-- Add comment to document the column
COMMENT ON COLUMN student_grades.category_grades IS 
'JSONB object storing per-category grades. Format: {"writing_voice": 85, "dialogue_style": 90, ...}. 
Categories match memory_category values from user_memories table.';

-- Add rubric_template_id to link grades to rubric templates
ALTER TABLE student_grades
ADD COLUMN IF NOT EXISTS rubric_template_id UUID REFERENCES rubric_templates(id) ON DELETE SET NULL;

-- Add rubric_scores JSONB to store domain scores from rubric
ALTER TABLE student_grades
ADD COLUMN IF NOT EXISTS rubric_scores JSONB DEFAULT '{}';

-- Add index for rubric template queries
CREATE INDEX IF NOT EXISTS idx_grades_rubric_template 
ON student_grades(rubric_template_id) 
WHERE deleted_at IS NULL AND rubric_template_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN student_grades.rubric_template_id IS 
'Reference to the rubric template used for grading this assignment.';

COMMENT ON COLUMN student_grades.rubric_scores IS 
'JSONB object storing domain scores from rubric evaluation. Format: {"Content and Analysis": 2, "Command of Evidence": 2, ...}.';

