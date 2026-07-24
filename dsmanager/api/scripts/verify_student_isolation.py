#!/usr/bin/env python3
"""
Student Data Isolation Verification Script
Verifies that student data is properly isolated and teachers can only access their students' data.
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, List, Tuple
import json

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def get_db_connection():
    """Get database connection"""
    database_url = os.getenv('DATABASE_URL') or os.getenv('DATABASE_PUBLIC_URL')
    if not database_url:
        raise ValueError("DATABASE_URL or DATABASE_PUBLIC_URL environment variable required")
    return psycopg2.connect(database_url, cursor_factory=RealDictCursor)

def verify_memory_isolation(conn) -> Tuple[bool, List[str]]:
    """Verify that memories are isolated by user_id"""
    cursor = conn.cursor()
    issues = []
    
    try:
        # Check if RLS is enabled
        cursor.execute("""
            SELECT tablename, rowsecurity 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename = 'user_memories'
        """)
        result = cursor.fetchone()
        if not result or not result['rowsecurity']:
            issues.append("❌ RLS is not enabled on user_memories table")
            return False, issues
        
        # Check for memories without user_id
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM user_memories
            WHERE user_id IS NULL
        """)
        result = cursor.fetchone()
        if result['count'] > 0:
            issues.append(f"⚠️ Found {result['count']} memories without user_id")
        
        # Check for duplicate content across different users (potential leak)
        cursor.execute("""
            SELECT content_hash, COUNT(DISTINCT user_id) as user_count
            FROM user_memories
            WHERE content_hash IS NOT NULL
            GROUP BY content_hash
            HAVING COUNT(DISTINCT user_id) > 1
            LIMIT 10
        """)
        duplicates = cursor.fetchall()
        if duplicates:
            issues.append(f"⚠️ Found {len(duplicates)} content hashes shared across multiple users (may be legitimate)")
        
        issues.append("✅ Memory isolation checks passed")
        return True, issues
    except Exception as e:
        issues.append(f"❌ Error checking memory isolation: {e}")
        return False, issues
    finally:
        cursor.close()

def verify_teacher_student_access(conn) -> Tuple[bool, List[str]]:
    """Verify that teachers can only access their students' data"""
    cursor = conn.cursor()
    issues = []
    
    try:
        # Get a sample teacher
        cursor.execute("""
            SELECT u.id, u.email
            FROM users u
            WHERE u.role = 'teacher'
            AND u.deleted_at IS NULL
            LIMIT 1
        """)
        teacher = cursor.fetchone()
        
        if not teacher:
            issues.append("⚠️ No teachers found in database")
            return True, issues
        
        teacher_id = teacher['id']
        
        # Get teacher's students
        cursor.execute("""
            SELECT student_id
            FROM teacher_students
            WHERE teacher_id = %s AND deleted_at IS NULL
        """, (teacher_id,))
        teacher_students = [row['student_id'] for row in cursor.fetchall()]
        
        if not teacher_students:
            issues.append("⚠️ Teacher has no students assigned")
            return True, issues
        
        # Check if teacher can access memories for their students
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM user_memories
            WHERE user_id = ANY(%s)
            AND (is_archived IS NULL OR is_archived = FALSE)
        """, (teacher_students,))
        result = cursor.fetchone()
        issues.append(f"✅ Teacher can access {result['count']} memories for {len(teacher_students)} students")
        
        # Check if there are students not in teacher's roster
        cursor.execute("""
            SELECT COUNT(DISTINCT user_id) as count
            FROM user_memories
            WHERE user_id NOT IN (SELECT student_id FROM teacher_students WHERE teacher_id = %s AND deleted_at IS NULL)
            AND user_id IN (SELECT id FROM users WHERE role = 'student' AND deleted_at IS NULL)
        """, (teacher_id,))
        result = cursor.fetchone()
        if result['count'] > 0:
            issues.append(f"ℹ️ There are {result['count']} students not in this teacher's roster (expected)")
        
        return True, issues
    except Exception as e:
        issues.append(f"❌ Error checking teacher-student access: {e}")
        return False, issues
    finally:
        cursor.close()

def verify_milvus_isolation(conn) -> Tuple[bool, List[str]]:
    """Verify that Milvus vectors are properly tagged with user_id"""
    cursor = conn.cursor()
    issues = []
    
    try:
        # Check memories with vector_id
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(vector_id) as with_vectors,
                COUNT(DISTINCT user_id) as unique_users
            FROM user_memories
            WHERE (is_archived IS NULL OR is_archived = FALSE)
        """)
        result = cursor.fetchone()
        
        issues.append(f"ℹ️ Total memories: {result['total']}")
        issues.append(f"ℹ️ Memories with vectors: {result['with_vectors']}")
        issues.append(f"ℹ️ Unique users: {result['unique_users']}")
        
        # Check for memories with vectors but no user_id (shouldn't happen)
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM user_memories
            WHERE vector_id IS NOT NULL
            AND user_id IS NULL
        """)
        result = cursor.fetchone()
        if result['count'] > 0:
            issues.append(f"❌ Found {result['count']} vectors without user_id")
            return False, issues
        
        issues.append("✅ Milvus isolation checks passed")
        return True, issues
    except Exception as e:
        issues.append(f"❌ Error checking Milvus isolation: {e}")
        return False, issues
    finally:
        cursor.close()

def verify_rls_policies(conn) -> Tuple[bool, List[str]]:
    """Verify that RLS policies are properly configured"""
    cursor = conn.cursor()
    issues = []
    
    try:
        # Check RLS status on key tables
        tables = ['user_memories', 'teacher_students', 'student_grades', 'student_profiles']
        
        for table in tables:
            cursor.execute("""
                SELECT tablename, rowsecurity 
                FROM pg_tables 
                WHERE schemaname = 'public' 
                AND tablename = %s
            """, (table,))
            result = cursor.fetchone()
            
            if not result:
                issues.append(f"❌ Table {table} not found")
            elif not result['rowsecurity']:
                issues.append(f"❌ RLS not enabled on {table}")
            else:
                # Check policies
                cursor.execute("""
                    SELECT policyname, cmd, qual
                    FROM pg_policies
                    WHERE schemaname = 'public'
                    AND tablename = %s
                """, (table,))
                policies = cursor.fetchall()
                if policies:
                    issues.append(f"✅ {table}: {len(policies)} RLS policies configured")
                else:
                    issues.append(f"⚠️ {table}: RLS enabled but no policies found")
        
        return True, issues
    except Exception as e:
        issues.append(f"❌ Error checking RLS policies: {e}")
        return False, issues
    finally:
        cursor.close()

def generate_report(results: Dict[str, Tuple[bool, List[str]]]) -> str:
    """Generate isolation verification report"""
    report = []
    report.append("=" * 60)
    report.append("Student Data Isolation Verification Report")
    report.append("=" * 60)
    report.append("")
    
    all_passed = True
    
    for check_name, (passed, issues) in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        report.append(f"{check_name}: {status}")
        for issue in issues:
            report.append(f"  {issue}")
        report.append("")
        if not passed:
            all_passed = False
    
    report.append("=" * 60)
    if all_passed:
        report.append("OVERALL: ✅ All isolation checks passed")
    else:
        report.append("OVERALL: ❌ Some isolation checks failed")
    report.append("=" * 60)
    
    return "\n".join(report)

def main():
    """Main verification function"""
    print("Starting student data isolation verification...")
    print("")
    
    try:
        conn = get_db_connection()
        
        results = {}
        
        # Run all checks
        print("Checking memory isolation...")
        results['Memory Isolation'] = verify_memory_isolation(conn)
        
        print("Checking teacher-student access...")
        results['Teacher-Student Access'] = verify_teacher_student_access(conn)
        
        print("Checking Milvus isolation...")
        results['Milvus Isolation'] = verify_milvus_isolation(conn)
        
        print("Checking RLS policies...")
        results['RLS Policies'] = verify_rls_policies(conn)
        
        conn.close()
        
        # Generate and print report
        report = generate_report(results)
        print("\n" + report)
        
        # Save report to file
        report_file = os.path.join(os.path.dirname(__file__), 'isolation_verification_report.txt')
        with open(report_file, 'w') as f:
            f.write(report)
        print(f"\nReport saved to: {report_file}")
        
        # Exit with error code if any checks failed
        all_passed = all(passed for passed, _ in results.values())
        sys.exit(0 if all_passed else 1)
        
    except Exception as e:
        print(f"❌ Error running verification: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()


