#!/usr/bin/env python3
"""
Clear ALL data from the database while preserving schema structure.

This script will:
- Delete ALL conversations and messages
- Delete ALL projects (including system projects)
- Delete ALL user memories
- Delete ALL quarantine items
- Keep the database schema intact (tables, columns, indexes)
- Keep the database structure for fresh start
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

def clear_all_data():
    """Clear ALL data while preserving structure"""
    conn = None
    cursor = None
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # Set user context (using default user)
        user_id = '00000000-0000-0000-0000-000000000001'
        cursor.execute(f"SET app.current_user_id = '{user_id}'")
        
        print("=" * 80)
        print("🧹 CLEARING ALL DATABASE DATA")
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
        
        cursor.execute("SELECT COUNT(*) FROM quarantine_items WHERE user_id = %s", (user_id,))
        quarantine_count = cursor.fetchone()[0]
        
        print(f"   Conversations: {conv_count}")
        print(f"   Messages: {msg_count}")
        print(f"   Memories: {memory_count}")
        print(f"   Projects: {project_count}")
        print(f"   Quarantine items: {quarantine_count}")
        print()
        
        # 2. Delete all conversation messages (must delete first due to foreign keys)
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
        
        # 5. Delete all quarantine items
        print("🗑️  Deleting all quarantine items...")
        cursor.execute("DELETE FROM quarantine_items WHERE user_id = %s", (user_id,))
        deleted_quarantine = cursor.rowcount
        print(f"   ✅ Deleted {deleted_quarantine} quarantine items")
        
        # 6. Delete projects (EXCEPT "Archived Unassigned Chats" - it's protected and required)
        print("🗑️  Deleting projects (protecting 'Archived Unassigned Chats')...")
        cursor.execute("""
            DELETE FROM projects 
            WHERE user_id = %s 
            AND name != 'Archived Unassigned Chats'
        """, (user_id,))
        deleted_projects = cursor.rowcount
        
        # Check if "Archived Unassigned Chats" exists, create if missing
        cursor.execute("""
            SELECT id FROM projects 
            WHERE user_id = %s 
            AND name = 'Archived Unassigned Chats'
            LIMIT 1
        """, (user_id,))
        unassigned_exists = cursor.fetchone()
        
        if not unassigned_exists:
            # Create "Archived Unassigned Chats" if it doesn't exist (required system project)
            import uuid
            project_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO projects (id, user_id, name, description, is_archived, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
            """, (project_id, user_id, 'Archived Unassigned Chats', 'System project for unassigned chats', False))
            print(f"   ✅ Created required 'Archived Unassigned Chats' project: {project_id}")
        else:
            print(f"   ✅ Protected 'Archived Unassigned Chats' project (not deleted)")
        
        print(f"   ✅ Deleted {deleted_projects} projects")
        
        # 7. Commit all changes
        conn.commit()
        
        print()
        print("=" * 80)
        print("✅ DATABASE CLEARED")
        print("=" * 80)
        print(f"Deleted {deleted_conversations} conversations")
        print(f"Deleted {deleted_messages} messages")
        print(f"Deleted {deleted_memories} memories")
        print(f"Deleted {deleted_projects} projects")
        print(f"Deleted {deleted_quarantine} quarantine items")
        print()
        print("✅ Database schema preserved (tables, columns, indexes intact)")
        print("✅ All data removed - ready for fresh start!")
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
    import sys
    
    # Allow non-interactive execution with --yes flag
    auto_confirm = "--yes" in sys.argv or "-y" in sys.argv
    
    if not auto_confirm:
        # Confirm before proceeding
        print("=" * 80)
        print("⚠️  WARNING: This will delete ALL DATA from the database!")
        print("=" * 80)
        print("This script will:")
        print("  - Delete ALL conversations and messages")
        print("  - Delete ALL projects (including system projects)")
        print("  - Delete ALL user memories")
        print("  - Delete ALL quarantine items")
        print("  - PRESERVE database schema (tables, columns, indexes)")
        print()
        print("⚠️  This action CANNOT be undone!")
        print()
        response = input("Type 'DELETE ALL DATA' to confirm: ")
        
        if response == "DELETE ALL DATA":
            clear_all_data()
        else:
            print("❌ Cancelled. No data was deleted.")
    else:
        # Non-interactive mode - proceed directly
        clear_all_data()

