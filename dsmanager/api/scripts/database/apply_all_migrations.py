#!/usr/bin/env python3
"""
Apply all database migrations in order
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import errors as psycopg2_errors
from urllib.parse import urlparse, parse_qs
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def get_db_connection():
    """Get database connection from DATABASE_URL with port fix"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL not found in environment variables")
        sys.exit(1)
    
    try:
        # Parse DATABASE_URL and fix any port issues (same fix as in conversation_api.py)
        parsed = urlparse(database_url)
        
        # Check if port exists and is valid - if not, remove it
        netloc = parsed.netloc
        if ':' in netloc:
            # Split netloc into auth and host:port
            netloc_parts = netloc.split('@')
            if len(netloc_parts) == 2:
                auth, host_part = netloc_parts
                if ':' in host_part:
                    host, port_str = host_part.rsplit(':', 1)
                    # Try to validate port is a number
                    try:
                        port_num = int(port_str)
                        if port_num < 1 or port_num > 65535:
                            # Invalid port number, remove it
                            netloc = f"{auth}@{host}"
                            database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                            if parsed.query:
                                database_url += f"?{parsed.query}"
                            parsed = urlparse(database_url)
                    except (ValueError, TypeError):
                        # Port is not a valid integer (e.g., "airport" or other text)
                        # Remove port and use default
                        netloc = f"{auth}@{host}"
                        database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                        if parsed.query:
                            database_url += f"?{parsed.query}"
                        parsed = urlparse(database_url)
            else:
                # No auth, just host:port
                if ':' in netloc:
                    host, port_str = netloc.rsplit(':', 1)
                    try:
                        port_num = int(port_str)
                        if port_num < 1 or port_num > 65535:
                            netloc = host
                            database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                            if parsed.query:
                                database_url += f"?{parsed.query}"
                            parsed = urlparse(database_url)
                    except (ValueError, TypeError):
                        # Invalid port, remove it
                        netloc = host
                        database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                        if parsed.query:
                            database_url += f"?{parsed.query}"
                        parsed = urlparse(database_url)
        
        # Ensure sslmode is in the URL if not present
        query_params = parse_qs(parsed.query)
        if 'sslmode' not in query_params:
            # Default SSL mode: 'disable' for localhost, 'prefer' for remote (graceful fallback)
            hostname = parsed.hostname or 'localhost'
            is_local = hostname in ('localhost', '127.0.0.1', '::1')
            default_sslmode = 'disable' if is_local else 'prefer'
            separator = '&' if parsed.query else '?'
            database_url = f"{database_url}{separator}sslmode={default_sslmode}"
        
        return psycopg2.connect(
            database_url,
            cursor_factory=RealDictCursor
        )
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

def apply_migration(conn, migration_file, migration_name):
    """Apply a single migration file"""
    print(f"\n🚀 Applying {migration_name}...")
    
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up two levels: scripts/database -> scripts -> project_root
    project_root = os.path.dirname(os.path.dirname(script_dir))
    migration_path = os.path.join(project_root, 'database', migration_file)
    
    if not os.path.exists(migration_path):
        print(f"⚠️  Migration file not found: {migration_path}")
        print(f"   Skipping {migration_name}")
        return False
    
    try:
        with open(migration_path, 'r') as f:
            migration_sql = f.read()
        
        cursor = conn.cursor()
        
        # Execute the entire migration as one block
        # This handles DO blocks and multi-statement migrations properly
        try:
            cursor.execute(migration_sql)
            conn.commit()
            cursor.close()
            print(f"✅ {migration_name} applied successfully")
            return True
        except (psycopg2.errors.DuplicateTable, 
                psycopg2.errors.DuplicateObject,
                psycopg2.errors.DuplicateFunction) as e:
            # These are expected if objects already exist - rollback and continue
            conn.rollback()
            cursor.close()
            print(f"⚠️  {migration_name} - Some objects already exist (this is OK)")
            print(f"   Details: {str(e)[:150]}")
            return True
        except Exception as e:
            error_msg = str(e).lower()
            # Check if it's a harmless "already exists" error
            if any(keyword in error_msg for keyword in ['already exists', 'duplicate', 'is not unique']):
                conn.rollback()
                cursor.close()
                print(f"⚠️  {migration_name} - Some objects already exist (this is OK)")
                print(f"   Details: {str(e)[:150]}")
                return True
            # For other errors, rollback and fail
            conn.rollback()
            cursor.close()
            raise
            
    except Exception as e:
        error_msg = str(e)
        print(f"❌ {migration_name} failed: {e}")
        import traceback
        print(traceback.format_exc())
        return False

def main():
    """Apply all migrations in order"""
    print("=" * 60)
    print("DATABASE MIGRATION RUNNER")
    print("=" * 60)
    
    # Connect to database
    conn = get_db_connection()
    print("✅ Connected to database")
    
    # List of migrations in order
    migrations = [
        ('migration_001_memory_consciousness.sql', 'Memory Consciousness Migration'),
        ('migration_002_projects.sql', 'Projects Migration'),
        ('migration_003_conversations_metadata.sql', 'Conversations Metadata Migration'),
        ('migration_003_optimization_indexes.sql', 'Optimization Indexes Migration'),
        ('migration_004_milvus_integration.sql', 'Milvus Integration Migration'),
        ('migration_005_add_missing_columns.sql', 'Add Missing Columns Migration'),
    ]
    
    # Apply each migration
    results = []
    for migration_file, migration_name in migrations:
        success = apply_migration(conn, migration_file, migration_name)
        results.append((migration_name, success))
    
    # Close connection
    conn.close()
    
    # Summary
    print("\n" + "=" * 60)
    print("MIGRATION SUMMARY")
    print("=" * 60)
    for migration_name, success in results:
        status = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"{status}: {migration_name}")
    
    # Check if all migrations succeeded
    all_succeeded = all(success for _, success in results)
    if all_succeeded:
        print("\n✅ All migrations applied successfully!")
        return 0
    else:
        print("\n⚠️  Some migrations failed. Please check the errors above.")
        return 1

if __name__ == '__main__':
    sys.exit(main())

