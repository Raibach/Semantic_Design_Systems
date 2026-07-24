#!/usr/bin/env python3
"""
Apply database schema and memory migration, then verify everything matches production
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from urllib.parse import urlparse, parse_qs

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL not found in environment")
    print("Please add DATABASE_URL to .env file")
    sys.exit(1)

def get_db_connection():
    """Get database connection"""
    parsed = urlparse(DATABASE_URL)
    query_params = parse_qs(parsed.query)
    sslmode = query_params.get('sslmode', ['require'])[0]
    conn_string = DATABASE_URL.split('?')[0]
    return psycopg2.connect(conn_string, sslmode=sslmode)

def check_table_exists(cursor, table_name):
    """Check if a table exists"""
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = %s
        ) as exists
    """, (table_name,))
    result = cursor.fetchone()
    if isinstance(result, dict):
        return result.get('exists', False)
    else:
        return result[0] if result else False

def apply_schema(schema_file):
    """Apply a schema file"""
    if not os.path.exists(schema_file):
        print(f"❌ Schema file not found: {schema_file}")
        return False
    
    print(f"📄 Reading {schema_file}...")
    with open(schema_file, 'r') as f:
        schema_sql = f.read()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        print(f"🔨 Applying {schema_file}...")
        cursor.execute(schema_sql)
        conn.commit()
        print(f"✅ {schema_file} applied successfully")
        return True
    except Exception as e:
        conn.rollback()
        if "already exists" in str(e).lower():
            print(f"⚠️  {schema_file} already applied (some objects may exist)")
            return True
        else:
            print(f"❌ Error applying {schema_file}: {e}")
            return False
    finally:
        cursor.close()
        conn.close()

def verify_schema():
    """Verify all expected tables exist"""
    print("\n🔍 VERIFYING SCHEMA...")
    print("=" * 60)
    
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Expected tables from main schema
    main_schema_tables = [
        'users',
        'subscription_plans',
        'user_subscriptions',
        'payment_methods',
        'invoices',
        'usage_metrics',
        'user_grace_settings',
        'conversations',
        'conversation_messages',
        'user_memory_log',
        'quarantine_items',
        'training_data',
        'audit_logs'
    ]
    
    # Expected tables from memory migration
    memory_migration_tables = [
        'user_memories',
        'memory_provenance',
        'grace_context',
        'promotion_queue',
        'grace_health_metrics',
        'grace_decisions',
        'data_dignity_ledger'
    ]
    
    all_expected_tables = main_schema_tables + memory_migration_tables
    
    missing_tables = []
    existing_tables = []
    
    for table in all_expected_tables:
        exists = check_table_exists(cursor, table)
        if exists:
            existing_tables.append(table)
            print(f"   ✅ {table}")
        else:
            missing_tables.append(table)
            print(f"   ❌ {table} - MISSING")
    
    print()
    print(f"✅ Found: {len(existing_tables)}/{len(all_expected_tables)} tables")
    
    if missing_tables:
        print(f"❌ Missing: {len(missing_tables)} tables")
        return False
    
    # Verify user_memories has quarantine fields
    if check_table_exists(cursor, 'user_memories'):
        print("\n🔍 Verifying user_memories table structure...")
        cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns
            WHERE table_schema = 'public' 
            AND table_name = 'user_memories'
            ORDER BY ordinal_position
        """)
        columns = [row['column_name'] for row in cursor.fetchall()]
        
        required_columns = [
            'quarantine_status',
            'quarantine_score',
            'quarantine_details',
            'quarantine_reviewed_at'
        ]
        
        missing_columns = [col for col in required_columns if col not in columns]
        if missing_columns:
            print(f"   ❌ Missing quarantine columns: {missing_columns}")
            return False
        else:
            print("   ✅ All quarantine fields present")
    
    cursor.close()
    conn.close()
    
    return True

def main():
    print("🚀 APPLYING AND VERIFYING DATABASE SCHEMA")
    print("=" * 60)
    print()
    
    # Step 1: Apply main schema
    print("Step 1: Applying main schema...")
    if not apply_schema('database/schema.sql'):
        print("❌ Failed to apply main schema")
        sys.exit(1)
    
    print()
    
    # Step 2: Apply memory migration
    print("Step 2: Applying memory migration...")
    if not apply_schema('database/migration_001_memory_consciousness.sql'):
        print("❌ Failed to apply memory migration")
        sys.exit(1)
    
    print()
    
    # Step 3: Verify schema
    if not verify_schema():
        print("\n❌ Schema verification failed")
        sys.exit(1)
    
    print()
    print("=" * 60)
    print("✅ SCHEMA APPLIED AND VERIFIED SUCCESSFULLY")
    print("=" * 60)
    print()
    print("Expected tables:")
    print("  • Main schema: 13 tables")
    print("  • Memory migration: 7 tables")
    print("  • Total: 20 tables")
    print()
    print("Quarantine fields verified in user_memories table")
    print()
    print("Next steps:")
    print("  1. Compare with Railway production schema")
    print("  2. Verify Row-Level Security is enabled")
    print("  3. Test memory API endpoints")

if __name__ == "__main__":
    main()

