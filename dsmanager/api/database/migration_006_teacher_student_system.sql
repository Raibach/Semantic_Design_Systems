-- ============================================
-- Migration 006: Teacher/Student System
-- Adds role-based access control for teachers and students
-- Teachers can manage students, grades, and view student embeddings
-- ============================================

-- Add role column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'student' 
CHECK (role IN ('teacher', 'student', 'admin'));

-- Create index for role queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE deleted_at IS NULL;

-- Update existing admin user to have admin role
UPDATE users 
SET role = 'admin' 
WHERE email = 'admin@grace.coop' AND role IS NULL;

-- ============================================
-- TEACHER-STUDENT RELATIONSHIPS
-- ============================================

CREATE TABLE IF NOT EXISTS teacher_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Relationship metadata
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  enrollment_date TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  
  -- Ensure unique teacher-student pairs
  UNIQUE(teacher_id, student_id)
);

CREATE INDEX idx_teacher_students_teacher ON teacher_students(teacher_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_teacher_students_student ON teacher_students(student_id, status) WHERE deleted_at IS NULL;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_teacher_students_updated_at 
BEFORE UPDATE ON teacher_students
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STUDENT GRADES
-- ============================================

CREATE TABLE IF NOT EXISTS student_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Grade information
  assignment_name VARCHAR(255) NOT NULL,
  assignment_type VARCHAR(50) DEFAULT 'general' CHECK (assignment_type IN ('essay', 'project', 'quiz', 'participation', 'general')),
  grade DECIMAL(5,2) CHECK (grade >= 0 AND grade <= 100),
  max_points DECIMAL(5,2),
  letter_grade VARCHAR(5),
  
  -- Feedback and notes
  feedback TEXT,
  rubric_data JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  
  -- Dates
  due_date TIMESTAMP,
  submitted_at TIMESTAMP,
  graded_at TIMESTAMP DEFAULT NOW(),
  
  -- Status
  status VARCHAR(20) DEFAULT 'graded' CHECK (status IN ('pending', 'submitted', 'graded', 'returned')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_grades_teacher ON student_grades(teacher_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_grades_student ON student_grades(student_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_grades_assignment ON student_grades(assignment_name, assignment_type) WHERE deleted_at IS NULL;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_student_grades_updated_at 
BEFORE UPDATE ON student_grades
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STUDENT PROFILES (Extended information)
-- ============================================

CREATE TABLE IF NOT EXISTS student_profiles (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  -- Profile information
  student_number VARCHAR(50) UNIQUE,
  enrollment_date TIMESTAMP DEFAULT NOW(),
  graduation_date TIMESTAMP,
  
  -- Academic information
  gpa DECIMAL(4,2),
  total_credits INTEGER DEFAULT 0,
  academic_level VARCHAR(50) CHECK (academic_level IN ('freshman', 'sophomore', 'junior', 'senior', 'graduate', 'other')),
  
  -- Contact and emergency info
  parent_email VARCHAR(255),
  parent_phone VARCHAR(50),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  
  -- Notes and metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_student_profiles_student_number ON student_profiles(student_number) WHERE student_number IS NOT NULL;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_student_profiles_updated_at 
BEFORE UPDATE ON student_profiles
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW-LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE teacher_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

-- Teachers can see their own student relationships
CREATE POLICY teacher_students_teacher_access ON teacher_students
  USING (
    teacher_id = current_setting('app.current_user_id', true)::UUID
    OR student_id = current_setting('app.current_user_id', true)::UUID
  );

-- Teachers can manage grades for their students
CREATE POLICY student_grades_teacher_access ON student_grades
  USING (
    teacher_id = current_setting('app.current_user_id', true)::UUID
    OR student_id = current_setting('app.current_user_id', true)::UUID
  );

-- Students can view their own profiles
CREATE POLICY student_profiles_access ON student_profiles
  USING (
    student_id = current_setting('app.current_user_id', true)::UUID
    OR EXISTS (
      SELECT 1 FROM teacher_students ts
      WHERE ts.teacher_id = current_setting('app.current_user_id', true)::UUID
      AND ts.student_id = student_profiles.student_id
      AND ts.status = 'active'
      AND ts.deleted_at IS NULL
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to check if a user is a teacher
CREATE OR REPLACE FUNCTION is_teacher(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_user_id 
    AND role = 'teacher' 
    AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check if a user is a student
CREATE OR REPLACE FUNCTION is_student(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = p_user_id 
    AND role = 'student' 
    AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check if teacher has access to student
CREATE OR REPLACE FUNCTION teacher_has_student(p_teacher_id UUID, p_student_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teacher_students
    WHERE teacher_id = p_teacher_id
    AND student_id = p_student_id
    AND status = 'active'
    AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE teacher_students IS 'Many-to-many relationship between teachers and students';
COMMENT ON TABLE student_grades IS 'Grades assigned by teachers to students';
COMMENT ON TABLE student_profiles IS 'Extended profile information for students';
COMMENT ON COLUMN users.role IS 'User role: teacher, student, or admin';
COMMENT ON COLUMN student_grades.grade IS 'Numeric grade (0-100)';
COMMENT ON COLUMN student_grades.letter_grade IS 'Letter grade (A, B, C, D, F, etc.)';
COMMENT ON COLUMN student_profiles.student_number IS 'Unique student identifier';

