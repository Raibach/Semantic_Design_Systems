#!/usr/bin/env python3
"""
Reassign all unassigned conversations to "Archived Unassigned Chats" project
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

def reassign_unassigned_chats(user_id: str):
    """Reassign all unassigned conversations to 'Archived Unassigned Chats' project"""
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
        
        # Get or create "Archived Unassigned Chats" project
        cursor.execute("""
            SELECT id FROM projects 
            WHERE user_id = %s 
            AND name = 'Archived Unassigned Chats' 
            AND (is_archived IS NULL OR is_archived = FALSE)
            LIMIT 1
        """, (user_id,))
        
        unassigned_project = cursor.fetchone()
        
        if not unassigned_project:
            # Create "Archived Unassigned Chats" project
            print("📁 Creating 'Archived Unassigned Chats' project...")
            cursor.execute("""
                INSERT INTO projects (user_id, name, description)
                VALUES (%s, %s, %s)
                RETURNING id
            """, (user_id, 'Archived Unassigned Chats', 'Default project for unassigned chats'))
            unassigned_project = cursor.fetchone()
            conn.commit()
            print(f"✅ Created 'Archived Unassigned Chats' project: {unassigned_project['id']}")
        else:
            print(f"✅ Found 'Archived Unassigned Chats' project: {unassigned_project['id']}")
        
        unassigned_project_id = str(unassigned_project['id'])
        
        # Find unassigned conversations
        if has_project_id_column:
            # Check for conversations with NULL project_id or invalid project_id
            cursor.execute("""
                SELECT c.id, c.title, c.project_id
                FROM conversations c
                WHERE c.user_id = %s
                AND (
                    c.project_id IS NULL 
                    OR c.project_id NOT IN (SELECT id FROM projects WHERE user_id = %s AND (is_archived IS NULL OR is_archived = FALSE))
                )
            """, (user_id, user_id))
        else:
            # Check for conversations with no project_id in metadata or invalid project_id
            cursor.execute("""
                SELECT c.id, c.title, c.metadata->>'project_id' as project_id
                FROM conversations c
                WHERE c.user_id = %s
                AND (
                    c.metadata->>'project_id' IS NULL 
                    OR c.metadata->>'project_id' = ''
                    OR c.metadata->>'project_id' NOT IN (SELECT id::text FROM projects WHERE user_id = %s AND (is_archived IS NULL OR is_archived = FALSE))
                )
            """, (user_id, user_id))
        
        unassigned_conversations = cursor.fetchall()
        
        if len(unassigned_conversations) == 0:
            print("✅ No unassigned conversations found")
            return
        
        print(f"\n📋 Found {len(unassigned_conversations)} unassigned conversation(s)")
        
        # Reassign conversations to "Archived Unassigned Chats"
        reassigned_count = 0
        for conv in unassigned_conversations:
            conv_id = str(conv['id'])
            conv_title = conv.get('title', 'Untitled')
            
            if has_project_id_column:
                cursor.execute("""
                    UPDATE conversations 
                    SET project_id = %s, updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                """, (unassigned_project_id, conv_id, user_id))
            else:
                cursor.execute("""
                    UPDATE conversations 
                    SET metadata = jsonb_set(
                        COALESCE(metadata, '{}'::jsonb),
                        '{project_id}',
                        to_jsonb(%s::text)
                    ),
                    updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                """, (unassigned_project_id, conv_id, user_id))
            
            if cursor.rowcount > 0:
                reassigned_count += 1
                print(f"  ✅ Reassigned: {conv_title[:50]} ({conv_id[:8]}...)")
        
        conn.commit()
        
        print(f"\n✅ Reassignment complete!")
        print(f"   - Reassigned {reassigned_count} conversation(s) to 'Archived Unassigned Chats'")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error during reassignment: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    # Default user ID (local development)
    user_id = "00000000-0000-0000-0000-000000000001"
    
    if len(sys.argv) > 1:
        user_id = sys.argv[1]
    
    print(f"Reassigning unassigned conversations to 'Archived Unassigned Chats' for user: {user_id}\n")
    reassign_unassigned_chats(user_id)

