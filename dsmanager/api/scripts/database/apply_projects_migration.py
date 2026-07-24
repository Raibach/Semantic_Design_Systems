#!/usr/bin/env python3
"""
Apply projects migration to PostgreSQL database
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def get_db_connection():
    """Get database connection from DATABASE_URL"""
    database_url = os.getenv('DATABASE_URL')

    if not database_url:
        print("❌ DATABASE_URL not set. Set it in your environment or .env file.")
        sys.exit(1)
    
    try:
        # Parse sslmode from DATABASE_URL or default to 'require'
        parsed = urlparse(database_url)
        query_params = parse_qs(parsed.query)
        sslmode = query_params.get('sslmode', ['require'])[0]
        
        # Remove query params from connection string
        conn_string = database_url.split('?')[0]
        
        return psycopg2.connect(
            conn_string,
            sslmode=sslmode,
            cursor_factory=RealDictCursor
        )
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        sys.exit(1)

def apply_migration():
    """Apply all required migrations"""
    print("🚀 Applying Grace Storage migrations...")

    # List of migrations to apply
    migrations = [
        {
            'name': 'Projects Table',
            'file': 'migration_002_projects.sql',
            'description': 'Creates projects table with RLS'
        },
        {
            'name': 'Conversations Metadata',
            'file': 'migration_003_conversations_metadata.sql',
            'description': 'Adds metadata column to conversations table'
        }
    ]

    # Connect to database
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        for migration in migrations:
            print(f"\n🔄 Applying {migration['name']} migration...")
            print(f"   {migration['description']}")

            # Read migration file
            migration_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                'database',
                migration['file']
            )

            if not os.path.exists(migration_path):
                print(f"❌ Migration file not found: {migration_path}")
                continue

            with open(migration_path, 'r', encoding='utf-8') as f:
                migration_sql = f.read()

            # Apply migration
            try:
                cursor.execute(migration_sql)
                print(f"✅ {migration['name']} migration applied successfully")
            except Exception as e:
                print(f"⚠️  {migration['name']} migration may have already been applied: {e}")
                # Continue with other migrations

        conn.commit()
        print("\n🎉 All migrations applied!")

        # Verify schema
        print("\n🔍 Verifying schema...")

        # Check projects table
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'projects'
        """)

        if cursor.fetchone():
            print("✅ Projects table exists")
        else:
            print("❌ Projects table not found")

        # Check conversations metadata column
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'conversations'
            AND column_name = 'metadata'
        """)

        if cursor.fetchone():
            print("✅ Conversations table has metadata column")
        else:
            print("❌ Conversations table missing metadata column")

        # Check messages table
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'messages'
        """)

        if cursor.fetchone():
            print("✅ Messages table exists")
        else:
            print("⚠️  Messages table not found (may not be needed yet)")

        print("\n🎉 Schema verification complete!")
        print("\nNext steps:")
        print("1. Restart your Railway app")
        print("2. Clear browser localStorage")
        print("3. Refresh page and log in again")
        print("4. Test creating projects and conversations")

    except Exception as e:
        conn.rollback()
        print(f"❌ Migration process failed: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    apply_migration()

