#!/usr/bin/env python3
"""
Manually cleanup duplicate "Default Project" entries in the database
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
        
        conn = psycopg2.connect(DATABASE_URL.split('?')[0], sslmode=sslmode, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        sys.exit(1)

def cleanup_duplicate_default_projects(user_id: str, project_name: str = 'Archived Unassigned Chats'):
    """Clean up duplicate project entries for a user (default: 'Archived Unassigned Chats')"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Set user context for RLS (if enabled)
        try:
            cursor.execute(f"SET app.current_user_id = '{user_id}'")
        except:
            pass  # RLS might not be enabled
        
        # Check if project_id column exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'conversations' AND column_name = 'project_id'
        """)
        has_project_id_column = cursor.fetchone() is not None
        
        # Find all entries for this project name
        if has_project_id_column:
            cursor.execute("""
                SELECT id, created_at, is_archived,
                       (SELECT COUNT(*) FROM conversations WHERE project_id = projects.id) as conversation_count
                FROM projects 
                WHERE user_id = %s 
                AND name = %s
                ORDER BY created_at ASC
            """, (user_id, project_name))
        else:
            cursor.execute("""
                SELECT id, created_at, is_archived,
                       (SELECT COUNT(*) FROM conversations 
                        WHERE metadata->>'project_id' = projects.id::text) as conversation_count
                FROM projects 
                WHERE user_id = %s 
                AND name = %s
                ORDER BY created_at ASC
            """, (user_id, project_name))
        
        projects = cursor.fetchall()
        
        if len(projects) <= 1:
            print(f"✅ No duplicates found for user {user_id}")
            return
        
        print(f"Found {len(projects)} '{project_name}' entries for user {user_id}")
        
        # Separate active and archived
        active_projects = [p for p in projects if not p['is_archived']]
        archived_projects = [p for p in projects if p['is_archived']]
        
        print(f"  - Active: {len(active_projects)}")
        print(f"  - Archived: {len(archived_projects)}")
        
        if len(active_projects) <= 1:
            print(f"✅ Only one active '{project_name}', no cleanup needed")
            if len(archived_projects) > 0:
                print(f"   (There are {len(archived_projects)} archived entries, but those are fine)")
            return
        
        # Keep the oldest active one
        kept_project = active_projects[0]
        duplicate_projects = active_projects[1:]
        
        kept_id = str(kept_project['id'])
        archived_ids = []
        conversations_moved = 0
        
        print(f"\n📌 Keeping oldest active project: {kept_id} (created: {kept_project['created_at']})")
        print(f"🗑️  Will archive {len(duplicate_projects)} duplicate active project(s)")
        
        # Move conversations from duplicates to kept project
        for dup in duplicate_projects:
            dup_id = str(dup['id'])
            
            # Move conversations
            if has_project_id_column:
                cursor.execute("""
                    UPDATE conversations 
                    SET project_id = %s, updated_at = NOW()
                    WHERE project_id = %s AND user_id = %s
                """, (kept_id, dup_id, user_id))
            else:
                # Use metadata JSONB - need to properly format UUID as JSON string
                cursor.execute("""
                    UPDATE conversations 
                    SET metadata = jsonb_set(
                        COALESCE(metadata, '{}'::jsonb),
                        '{project_id}',
                        to_jsonb(%s::text)
                    ),
                    updated_at = NOW()
                    WHERE metadata->>'project_id' = %s AND user_id = %s
                """, (kept_id, dup_id, user_id))
            
            moved_count = cursor.rowcount
            conversations_moved += moved_count
            
            # Archive the duplicate project
            cursor.execute("""
                UPDATE projects 
                SET is_archived = TRUE, updated_at = NOW()
                WHERE id = %s AND user_id = %s
            """, (dup_id, user_id))
            
            archived_ids.append(dup_id)
            
            if moved_count > 0:
                print(f"  ✅ Moved {moved_count} conversations from {dup_id} to {kept_id}")
        
        conn.commit()
        
        print(f"\n✅ Cleanup complete!")
        print(f"   - Kept: {kept_id}")
        print(f"   - Archived: {len(archived_ids)} duplicate project(s)")
        print(f"   - Conversations moved: {conversations_moved}")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error during cleanup: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    # Default user ID (local development)
    user_id = "00000000-0000-0000-0000-000000000001"
    project_name = "Archived Unassigned Chats"
    
    if len(sys.argv) > 1:
        user_id = sys.argv[1]
    if len(sys.argv) > 2:
        project_name = sys.argv[2]
    
    print(f"Cleaning up duplicate '{project_name}' entries for user: {user_id}\n")
    cleanup_duplicate_default_projects(user_id, project_name)

