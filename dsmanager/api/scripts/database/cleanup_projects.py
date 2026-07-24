#!/usr/bin/env python3
"""
Database cleanup script to remove all projects except Default Project
This is a one-time cleanup for erroneous projects created during setup
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL') or os.getenv('DATABASE_PUBLIC_URL')

if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL not found in environment")
    print("Please set DATABASE_URL or DATABASE_PUBLIC_URL in .env file")
    sys.exit(1)

def get_db_connection():
    """Get database connection"""
    try:
        # Parse sslmode from DATABASE_URL or default based on host
        parsed = urlparse(DATABASE_URL)
        query_params = parse_qs(parsed.query)
        
        # Default SSL mode: 'disable' for localhost, 'require' for remote
        hostname = parsed.hostname or 'localhost'
        is_local = hostname in ('localhost', '127.0.0.1', '::1')
        default_sslmode = 'disable' if is_local else 'require'
        
        sslmode = query_params.get('sslmode', [default_sslmode])[0]
        
        conn = psycopg2.connect(DATABASE_URL.split('?')[0], sslmode=sslmode)
        return conn
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        sys.exit(1)

def cleanup_projects():
    """Remove all projects except Default Project"""
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        print("🔍 Finding all projects...")
        
        # Get all projects
        cursor.execute("""
            SELECT id, name, user_id 
            FROM projects 
            WHERE deleted_at IS NULL
            ORDER BY created_at
        """)
        
        all_projects = cursor.fetchall()
        print(f"📦 Found {len(all_projects)} projects")
        
        if len(all_projects) == 0:
            print("✅ No projects found. Nothing to clean up.")
            return
        
        # Group projects by user_id
        projects_by_user = {}
        for project in all_projects:
            user_id = str(project['user_id'])
            if user_id not in projects_by_user:
                projects_by_user[user_id] = []
            projects_by_user[user_id].append(project)
        
        total_deleted = 0
        total_moved = 0
        
        for user_id, user_projects in projects_by_user.items():
            print(f"\n👤 Processing user {user_id[:8]}... ({len(user_projects)} projects)")
            
            # Find all Default Projects for this user (there might be duplicates)
            default_projects = [p for p in user_projects if p['name'] == 'Default Project']
            
            if len(default_projects) == 0:
                print(f"  ⚠️  No Default Project found for user {user_id[:8]}...")
                print(f"  ✅ Creating Default Project...")
                cursor.execute("""
                    INSERT INTO projects (user_id, name, description)
                    VALUES (%s, %s, %s)
                    RETURNING id
                """, (user_id, 'Default Project', 'Default project for organizing conversations'))
                default_project_id = str(cursor.fetchone()['id'])
                conn.commit()
                print(f"  ✅ Created Default Project: {default_project_id}")
            elif len(default_projects) == 1:
                default_project_id = str(default_projects[0]['id'])
                print(f"  ✅ Found Default Project: {default_project_id}")
            else:
                # Multiple default projects - keep the oldest one, delete the rest
                print(f"  ⚠️  Found {len(default_projects)} Default Projects - keeping the oldest one")
                # Sort by created_at (oldest first)
                default_projects_sorted = sorted(default_projects, key=lambda p: p.get('created_at', ''))
                default_project_id = str(default_projects_sorted[0]['id'])
                print(f"  ✅ Keeping Default Project: {default_project_id}")
                
                # Delete duplicate default projects
                for dup_project in default_projects_sorted[1:]:
                    dup_id = str(dup_project['id'])
                    # Move conversations from duplicate to the kept one
                    cursor.execute("""
                        UPDATE conversations
                        SET project_id = %s,
                            updated_at = NOW()
                        WHERE project_id = %s
                    """, (default_project_id, dup_id))
                    moved = cursor.rowcount
                    if moved > 0:
                        print(f"    📦 Moved {moved} conversations from duplicate Default Project to kept one")
                    
                    # Delete the duplicate
                    cursor.execute("""
                        UPDATE projects
                        SET deleted_at = NOW(),
                            updated_at = NOW()
                        WHERE id = %s
                    """, (dup_id,))
                    print(f"    ✅ Deleted duplicate Default Project: {dup_id[:8]}...")
                    conn.commit()
            
            # Get projects to delete (all except Default Project)
            projects_to_delete = [p for p in user_projects if str(p['id']) != default_project_id]
            
            if len(projects_to_delete) == 0:
                print(f"  ✅ No projects to delete for this user")
                continue
            
            print(f"  🗑️  Will delete {len(projects_to_delete)} projects")
            
            # Move all conversations from projects to delete to Default Project
            for project in projects_to_delete:
                project_id = str(project['id'])
                project_name = project['name']
                
                # Count conversations in this project
                cursor.execute("""
                    SELECT COUNT(*) as count
                    FROM conversations
                    WHERE project_id = %s
                """, (project_id,))
                conv_count = cursor.fetchone()['count']
                
                if conv_count > 0:
                    # Move conversations to Default Project
                    cursor.execute("""
                        UPDATE conversations
                        SET project_id = %s,
                            updated_at = NOW()
                        WHERE project_id = %s
                    """, (default_project_id, project_id))
                    moved = cursor.rowcount
                    total_moved += moved
                    print(f"    📦 Moved {moved} conversations from '{project_name}' to Default Project")
                
                # Delete the project (soft delete by setting deleted_at)
                cursor.execute("""
                    UPDATE projects
                    SET deleted_at = NOW(),
                        updated_at = NOW()
                    WHERE id = %s
                """, (project_id,))
                
                total_deleted += 1
                print(f"    ✅ Deleted project: '{project_name}' ({project_id[:8]}...)")
            
            conn.commit()
        
        print(f"\n✅ Cleanup complete!")
        print(f"   - Deleted {total_deleted} projects")
        print(f"   - Moved {total_moved} conversations to Default Project")
        print(f"   - Kept Default Project for each user")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error during cleanup: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    print("🧹 Project Cleanup Script")
    print("=" * 60)
    print("This will remove ALL projects except 'Default Project'")
    print("All conversations will be moved to Default Project")
    print("=" * 60)
    
    response = input("\n⚠️  Are you sure you want to continue? (yes/no): ")
    if response.lower() not in ['yes', 'y']:
        print("❌ Cleanup cancelled")
        sys.exit(0)
    
    cleanup_projects()
    print("\n✅ Done!")

