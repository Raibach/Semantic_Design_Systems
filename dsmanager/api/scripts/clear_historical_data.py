#!/usr/bin/env python3
"""
Clear all historical conversation data from the database
while preserving the database structure and required system projects.

This script will:
- Delete all conversations and messages
- Delete all user memories
- Archive all projects except "Archived Unassigned Chats" and "Default Project"
- Keep the database schema intact
- Preserve required system projects
"""

import psycopg2
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv('.env')

DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("❌ DATABASE_URL not found in .env file")
    exit(1)

def clear_historical_data():
    """Clear all historical data while preserving structure"""
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # Set user context (using default user)
        user_id = '00000000-0000-0000-0000-000000000001'
        cursor.execute(f"SET app.current_user_id = '{user_id}'")
        
        print("=" * 80)
        print("🧹 CLEARING HISTORICAL DATA")
        print("=" * 80)
        print(f"User ID: {user_id}")
        print(f"Timestamp: {datetime.now().isoformat()}")
        print()
        
        # 1. Count current data
        print("📊 Counting current data...")
        cursor.execute("SELECT COUNT(*) FROM conversations WHERE user_id = %s", (user_id,))
        conv_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM conversation_messages WHERE user_id = %s", (user_id,))
        msg_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM user_memory_log WHERE user_id = %s", (user_id,))
        memory_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM projects WHERE user_id = %s", (user_id,))
        project_count = cursor.fetchone()[0]
        
        print(f"   Conversations: {conv_count}")
        print(f"   Messages: {msg_count}")
        print(f"   Memories: {memory_count}")
        print(f"   Projects: {project_count}")
        print()
        
        # 2. Delete all conversation messages
        print("🗑️  Deleting all conversation messages...")
        cursor.execute("DELETE FROM conversation_messages WHERE user_id = %s", (user_id,))
        deleted_messages = cursor.rowcount
        print(f"   ✅ Deleted {deleted_messages} messages")
        
        # 3. Delete all conversations
        print("🗑️  Deleting all conversations...")
        cursor.execute("DELETE FROM conversations WHERE user_id = %s", (user_id,))
        deleted_conversations = cursor.rowcount
        print(f"   ✅ Deleted {deleted_conversations} conversations")
        
        # 4. Delete all user memories
        print("🗑️  Deleting all user memories...")
        cursor.execute("DELETE FROM user_memory_log WHERE user_id = %s", (user_id,))
        deleted_memories = cursor.rowcount
        print(f"   ✅ Deleted {deleted_memories} memories")
        
        # 5. Archive all projects except required system projects
        print("🗑️  Archiving non-system projects...")
        cursor.execute("""
            UPDATE projects 
            SET is_archived = TRUE, updated_at = NOW()
            WHERE user_id = %s 
            AND name NOT IN ('Archived Unassigned Chats', 'Default Project')
        """, (user_id,))
        archived_projects = cursor.rowcount
        print(f"   ✅ Archived {archived_projects} projects")
        
        # 6. Ensure required system projects exist and are active
        print("✅ Ensuring required system projects exist...")
        
        # Check for "Archived Unassigned Chats"
        cursor.execute("""
            SELECT id FROM projects 
            WHERE user_id = %s AND name = 'Archived Unassigned Chats'
            AND (is_archived IS NULL OR is_archived = FALSE)
            LIMIT 1
        """, (user_id,))
        unassigned_project = cursor.fetchone()
        
        if not unassigned_project:
            # Create "Archived Unassigned Chats" if it doesn't exist
            cursor.execute("""
                INSERT INTO projects (user_id, name, description, is_archived)
                VALUES (%s, 'Archived Unassigned Chats', 'System project for unassigned chats', FALSE)
                ON CONFLICT DO NOTHING
                RETURNING id
            """, (user_id,))
            result = cursor.fetchone()
            if result:
                print(f"   ✅ Created 'Archived Unassigned Chats' project: {result[0]}")
            else:
                # Check if it exists but is archived
                cursor.execute("""
                    SELECT id FROM projects 
                    WHERE user_id = %s AND name = 'Archived Unassigned Chats'
                    LIMIT 1
                """, (user_id,))
                existing = cursor.fetchone()
                if existing:
                    cursor.execute("""
                        UPDATE projects 
                        SET is_archived = FALSE, updated_at = NOW()
                        WHERE id = %s
                    """, (existing[0],))
                    print(f"   ✅ Unarchived 'Archived Unassigned Chats' project: {existing[0]}")
        else:
            print(f"   ✅ 'Archived Unassigned Chats' project exists: {unassigned_project[0]}")
        
        # Check for "Default Project"
        cursor.execute("""
            SELECT id FROM projects 
            WHERE user_id = %s AND name = 'Default Project'
            AND (is_archived IS NULL OR is_archived = FALSE)
            LIMIT 1
        """, (user_id,))
        default_project = cursor.fetchone()
        
        if not default_project:
            # Create "Default Project" if it doesn't exist
            cursor.execute("""
                INSERT INTO projects (user_id, name, description, is_archived)
                VALUES (%s, 'Default Project', 'Default system project', FALSE)
                ON CONFLICT DO NOTHING
                RETURNING id
            """, (user_id,))
            result = cursor.fetchone()
            if result:
                print(f"   ✅ Created 'Default Project': {result[0]}")
            else:
                # Check if it exists but is archived
                cursor.execute("""
                    SELECT id FROM projects 
                    WHERE user_id = %s AND name = 'Default Project'
                    LIMIT 1
                """, (user_id,))
                existing = cursor.fetchone()
                if existing:
                    cursor.execute("""
                        UPDATE projects 
                        SET is_archived = FALSE, updated_at = NOW()
                        WHERE id = %s
                    """, (existing[0],))
                    print(f"   ✅ Unarchived 'Default Project': {existing[0]}")
        else:
            print(f"   ✅ 'Default Project' exists: {default_project[0]}")
        
        # 7. Commit all changes
        conn.commit()
        
        print()
        print("=" * 80)
        print("✅ CLEANUP COMPLETE")
        print("=" * 80)
        print(f"Deleted {deleted_conversations} conversations")
        print(f"Deleted {deleted_messages} messages")
        print(f"Deleted {deleted_memories} memories")
        print(f"Archived {archived_projects} projects")
        print()
        print("✅ Database structure preserved")
        print("✅ Required system projects maintained")
        print("✅ Ready for fresh start!")
        print("=" * 80)
        
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    # Confirm before proceeding
    print("=" * 80)
    print("⚠️  WARNING: This will delete ALL historical data!")
    print("=" * 80)
    print("This script will:")
    print("  - Delete ALL conversations and messages")
    print("  - Delete ALL user memories")
    print("  - Archive ALL projects (except system projects)")
    print("  - Preserve database structure")
    print("  - Keep required system projects active")
    print()
    response = input("Type 'YES' to confirm: ")
    
    if response == "YES":
        clear_historical_data()
    else:
        print("❌ Cancelled. No data was deleted.")

