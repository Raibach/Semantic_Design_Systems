-- ============================================
-- Migration 009: Enhanced RLS Policies
-- Strengthens Row-Level Security for student data isolation
-- ============================================

-- Enable RLS on all relevant tables (if not already enabled)
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to recreate with enhanced rules)
DROP POLICY IF EXISTS teacher_students_teacher_policy ON teacher_students;
DROP POLICY IF EXISTS teacher_students_student_policy ON teacher_students;
DROP POLICY IF EXISTS student_grades_teacher_policy ON student_grades;
DROP POLICY IF EXISTS student_grades_student_policy ON student_grades;
DROP POLICY IF EXISTS student_profiles_teacher_policy ON student_profiles;
DROP POLICY IF EXISTS student_profiles_student_policy ON student_profiles;
DROP POLICY IF EXISTS user_memories_teacher_access ON user_memories;
DROP POLICY IF EXISTS user_memories_student_access ON user_memories;

-- Enhanced teacher_students policies
-- Teachers can only see their own student relationships
CREATE POLICY teacher_students_teacher_policy ON teacher_students
    FOR ALL
    USING (
        teacher_id = current_setting('app.current_user_id', true)::uuid
        AND deleted_at IS NULL
    )
    WITH CHECK (
        teacher_id = current_setting('app.current_user_id', true)::uuid
        AND deleted_at IS NULL
    );

-- Students can see their own relationships (read-only)
CREATE POLICY teacher_students_student_policy ON teacher_students
    FOR SELECT
    USING (
        student_id = current_setting('app.current_user_id', true)::uuid
        AND deleted_at IS NULL
    );

-- Enhanced student_grades policies
-- Teachers can only access grades for their students
CREATE POLICY student_grades_teacher_policy ON student_grades
    FOR ALL
    USING (
        teacher_id = current_setting('app.current_user_id', true)::uuid
        AND EXISTS (
            SELECT 1 FROM teacher_students ts
            WHERE ts.teacher_id = current_setting('app.current_user_id', true)::uuid
            AND ts.student_id = student_grades.student_id
            AND ts.deleted_at IS NULL
        )
        AND deleted_at IS NULL
    )
    WITH CHECK (
        teacher_id = current_setting('app.current_user_id', true)::uuid
        AND EXISTS (
            SELECT 1 FROM teacher_students ts
            WHERE ts.teacher_id = current_setting('app.current_user_id', true)::uuid
            AND ts.student_id = student_grades.student_id
            AND ts.deleted_at IS NULL
        )
        AND deleted_at IS NULL
    );

-- Students can only see their own grades (read-only)
CREATE POLICY student_grades_student_policy ON student_grades
    FOR SELECT
    USING (
        student_id = current_setting('app.current_user_id', true)::uuid
        AND deleted_at IS NULL
    );

-- Enhanced student_profiles policies
-- Teachers can only access profiles for their students
CREATE POLICY student_profiles_teacher_policy ON student_profiles
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM teacher_students ts
            WHERE ts.teacher_id = current_setting('app.current_user_id', true)::uuid
            AND ts.student_id = student_profiles.student_id
            AND ts.deleted_at IS NULL
        )
        AND deleted_at IS NULL
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM teacher_students ts
            WHERE ts.teacher_id = current_setting('app.current_user_id', true)::uuid
            AND ts.student_id = student_profiles.student_id
            AND ts.deleted_at IS NULL
        )
        AND deleted_at IS NULL
    );

-- Students can only see their own profile
CREATE POLICY student_profiles_student_policy ON student_profiles
    FOR SELECT
    USING (
        student_id = current_setting('app.current_user_id', true)::uuid
        AND deleted_at IS NULL
    );

-- Enhanced user_memories policies
-- Teachers can access memories for their students only
CREATE POLICY user_memories_teacher_access ON user_memories
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM teacher_students ts
            WHERE ts.teacher_id = current_setting('app.current_user_id', true)::uuid
            AND ts.student_id = user_memories.user_id
            AND ts.deleted_at IS NULL
        )
        AND (is_archived IS NULL OR is_archived = FALSE)
    );

-- Students can only access their own memories
CREATE POLICY user_memories_student_access ON user_memories
    FOR ALL
    USING (
        user_id = current_setting('app.current_user_id', true)::uuid
        AND (is_archived IS NULL OR is_archived = FALSE)
    )
    WITH CHECK (
        user_id = current_setting('app.current_user_id', true)::uuid
        AND (is_archived IS NULL OR is_archived = FALSE)
    );

-- Add comment
COMMENT ON POLICY teacher_students_teacher_policy ON teacher_students IS 
'Enhanced RLS: Teachers can only manage their own student relationships';

COMMENT ON POLICY student_grades_teacher_policy ON student_grades IS 
'Enhanced RLS: Teachers can only access grades for students in their roster';

COMMENT ON POLICY user_memories_teacher_access ON user_memories IS 
'Enhanced RLS: Teachers can only view memories for their students';


