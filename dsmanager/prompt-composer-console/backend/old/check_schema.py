#!/usr/bin/env python3
"""
Schema inspection tool - compares remote database with expected schema
"""
import os
import psycopg2
import json

# Expected tables from init_db.py
EXPECTED_TABLES = [
    'users', 'projects', 'conversations', 'conversation_messages',
    'user_memories', 'prompt_sessions', 'prompt_versions', 'ai_suggestions', 'tags'
]

# Expected columns per table (key columns that must exist)
EXPECTED_COLUMNS = {
    'users': ['id', 'email', 'password_hash', 'full_name', 'status', 'created_at', 'updated_at'],
    'projects': ['id', 'user_id', 'name', 'is_archived', 'created_at'],
    'conversations': ['id', 'user_id', 'title', 'surface_state_json', 'is_archived', 'created_at'],
    'conversation_messages': ['id', 'conversation_id', 'user_id', 'role', 'content', 'created_at'],
    'user_memories': ['id', 'user_id', 'content', 'content_hash', 'created_at'],
    'prompt_sessions': ['id', 'user_id', 'title', 'left_column_content', 'is_archived', 'created_at'],
    'prompt_versions': ['id', 'session_id', 'version_number', 'created_at'],
    'ai_suggestions': ['id', 'session_id', 'user_id', 'used', 'used_at', 'content', 'created_at'],
    'tags': ['id', 'user_id', 'name', 'created_at']
}

def check_schema():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set")
        return

    print("=" * 60)
    print("DATABASE SCHEMA INSPECTION")
    print("=" * 60)

    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        # Get all tables
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """)
        actual_tables = [row[0] for row in cur.fetchall()]

        print("\n📋 TABLES IN REMOTE DATABASE:")
        for t in actual_tables:
            marker = "✅" if t in EXPECTED_TABLES else "❓"
            print(f"  {marker} {t}")

        # Check for missing expected tables
        missing_tables = [t for t in EXPECTED_TABLES if t not in actual_tables]
        if missing_tables:
            print(f"\n⚠️  MISSING TABLES: {missing_tables}")
        else:
            print("\n✅ All expected tables exist")

        # Check columns for each expected table
        print("\n📊 COLUMN ANALYSIS:")
        for table_name in EXPECTED_TABLES:
            if table_name not in actual_tables:
                print(f"\n  ❌ {table_name}: TABLE MISSING")
                continue

            cur.execute("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = %s
                ORDER BY ordinal_position
            """, (table_name,))
            actual_columns = {row[0]: {'type': row[1], 'nullable': row[2], 'default': row[3]} for row in cur.fetchall()}

            expected_cols = EXPECTED_COLUMNS.get(table_name, [])
            missing_cols = [c for c in expected_cols if c not in actual_columns]

            if missing_cols:
                print(f"\n  ⚠️  {table_name}: Missing columns: {missing_cols}")
            else:
                print(f"\n  ✅ {table_name}: All key columns present")

            print(f"      Columns: {list(actual_columns.keys())}")

        # Get row counts
        print("\n📈 ROW COUNTS:")
        for table_name in EXPECTED_TABLES:
            if table_name in actual_tables:
                cur.execute(f"SELECT COUNT(*) FROM {table_name}")
                count = cur.fetchone()[0]
                print(f"  {table_name}: {count} rows")

        cur.close()
        conn.close()
        print("\n" + "=" * 60)
        print("SCHEMA CHECK COMPLETE")
        print("=" * 60)

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_schema()
