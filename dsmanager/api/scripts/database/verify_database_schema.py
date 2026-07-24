#!/usr/bin/env python3
"""
Verify database schema matches production expectations
Compares current database state with expected schema
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL not found in environment")
    print("Please add DATABASE_URL to .env file")
    sys.exit(1)

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

def get_table_columns(cursor, table_name):
    """Get all columns for a table"""
    cursor.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = %s
        ORDER BY ordinal_position
    """, (table_name,))
    return cursor.fetchall()

def verify_schema():
    """Verify database schema matches expected structure"""
    
    print("🔍 VERIFYING DATABASE SCHEMA")
    print("=" * 60)
    print()
    
    try:
        # Parse sslmode from DATABASE_URL or default to 'require'
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(DATABASE_URL)
        query_params = parse_qs(parsed.query)
        sslmode = query_params.get('sslmode', ['require'])[0]
        
        conn = psycopg2.connect(DATABASE_URL.split('?')[0], sslmode=sslmode)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        print("✅ Connected to PostgreSQL")
        print()
        
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
        
        print("📊 Checking tables...")
        print()
        
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
            print()
            print("Missing tables:")
            for table in missing_tables:
                print(f"   - {table}")
            print()
            
            # Check if it's the memory migration that's missing
            memory_missing = [t for t in missing_tables if t in memory_migration_tables]
            if memory_missing:
                print("⚠️  MEMORY MIGRATION NOT APPLIED")
                print("   The following memory system tables are missing:")
                for table in memory_missing:
                    print(f"      - {table}")
                print()
                print("To apply the migration, run:")
                print("   python3 migrate_memory_system.py")
                print()
                print("Or manually:")
                print(f"   psql \"$DATABASE_URL\" < database/migration_001_memory_consciousness.sql")
        
        # Check user_memories table structure if it exists
        if check_table_exists(cursor, 'user_memories'):
            print()
            print("📋 Checking user_memories table structure...")
            columns = get_table_columns(cursor, 'user_memories')
            
            expected_columns = [
                'id', 'user_id', 'content', 'content_hash', 'content_type', 'title',
                'source_type', 'source_url', 'source_metadata',
                'quarantine_status', 'quarantine_score', 'quarantine_details', 'quarantine_reviewed_at',
                'vector_id', 'embedding_model',
                'importance_score', 'quality_score',
                'view_count', 'last_viewed_at',
                'promoted_to_grace', 'promoted_at', 'promoted_by',
                'is_archived', 'archived_at',
                'created_at', 'updated_at'
            ]
            
            existing_column_names = [col['column_name'] for col in columns]
            
            print(f"   Columns found: {len(existing_column_names)}")
            for col in columns:
                print(f"      - {col['column_name']} ({col['data_type']})")
            
            missing_columns = [col for col in expected_columns if col not in existing_column_names]
            if missing_columns:
                print()
                print("   ❌ Missing columns:")
                for col in missing_columns:
                    print(f"      - {col}")
            else:
                print()
                print("   ✅ All expected columns present")
            
            # Check quarantine fields specifically
            quarantine_fields = ['quarantine_status', 'quarantine_score', 'quarantine_details', 'quarantine_reviewed_at']
            has_quarantine = all(col in existing_column_names for col in quarantine_fields)
            if has_quarantine:
                print()
                print("   ✅ Quarantine fields present:")
                for field in quarantine_fields:
                    col = next((c for c in columns if c['column_name'] == field), None)
                    if col:
                        print(f"      - {field}: {col['data_type']}")
        
        # Check Row-Level Security
        print()
        print("🔒 Checking Row-Level Security...")
        cursor.execute("""
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename IN %s
        """, (tuple(all_expected_tables),))
        
        tables_with_rls = []
        for table in all_expected_tables:
            if check_table_exists(cursor, table):
                cursor.execute(f"""
                    SELECT relname, relrowsecurity 
                    FROM pg_class 
                    WHERE relname = %s
                """, (table,))
                result = cursor.fetchone()
                if result and result.get('relrowsecurity'):
                    tables_with_rls.append(table)
        
        print(f"   Tables with RLS enabled: {len(tables_with_rls)}/{len(existing_tables)}")
        
        cursor.close()
        conn.close()
        
        print()
        print("=" * 60)
        if missing_tables:
            print("❌ SCHEMA INCOMPLETE")
            print("=" * 60)
            return False
        else:
            print("✅ SCHEMA VERIFICATION COMPLETE")
            print("=" * 60)
            return True
            
    except Exception as e:
        print(f"❌ Verification failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = verify_schema()
    sys.exit(0 if success else 1)

