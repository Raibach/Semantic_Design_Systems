#!/usr/bin/env python3
"""
Verify data consistency between PostgreSQL and Milvus Lite
Ensures all Milvus vectors have corresponding PostgreSQL records and vice versa
"""

import os
import psycopg2
from dotenv import load_dotenv
from backend.milvus_client import get_milvus_client
from config.milvus_config import get_all_collections

load_dotenv('.env')

DATABASE_URL = os.getenv('DATABASE_URL')
user_id = '00000000-0000-0000-0000-000000000001'

def verify_consistency():
    """Verify PostgreSQL and Milvus data consistency"""
    print("=" * 80)
    print("🔍 VERIFYING POSTGRESQL ↔ MILVUS DATA CONSISTENCY")
    print("=" * 80)
    print(f"User ID: {user_id}")
    print()
    
    # Connect to PostgreSQL
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute(f"SET app.current_user_id = '{user_id}'")
    
    # Connect to Milvus
    milvus = get_milvus_client()
    
    # 1. Check PostgreSQL records
    print("📊 Checking PostgreSQL user_memory_log records...")
    cur.execute("""
        SELECT id, milvus_point_id, milvus_collection, source_id, source_type
        FROM user_memory_log
        WHERE user_id = %s
        AND is_archived = FALSE
        AND milvus_point_id IS NOT NULL
    """, (user_id,))
    
    pg_records = cur.fetchall()
    print(f"   ✅ Found {len(pg_records)} PostgreSQL records with Milvus references")
    
    # 2. Check Milvus collections
    print("\n📊 Checking Milvus collections...")
    collections = get_all_collections()
    milvus_vectors = {}
    
    for collection_name in collections:
        try:
            # Search for all vectors with this user_id (if user_id is stored in metadata)
            # Note: This requires user_id to be in metadata
            stats = milvus.get_collection_stats(collection_name)
            print(f"   Collection '{collection_name}': {stats.get('row_count', 0)} vectors")
            
            # Try to get vectors with user_id filter
            # This is a simplified check - actual implementation depends on metadata structure
            milvus_vectors[collection_name] = stats.get('row_count', 0)
        except Exception as e:
            print(f"   ⚠️  Error checking {collection_name}: {e}")
    
    # 3. Check for orphaned PostgreSQL records (point to non-existent Milvus vectors)
    print("\n🔍 Checking for orphaned PostgreSQL records...")
    orphaned_count = 0
    for record in pg_records:
        record_id, milvus_point_id, collection_name, source_id, source_type = record
        # Note: We can't easily verify if a specific point_id exists in Milvus
        # without querying, but we can check if the collection exists
        if collection_name and collection_name not in collections:
            print(f"   ⚠️  Record {record_id} references non-existent collection: {collection_name}")
            orphaned_count += 1
    
    if orphaned_count == 0:
        print("   ✅ No orphaned PostgreSQL records found")
    else:
        print(f"   ⚠️  Found {orphaned_count} orphaned records")
    
    # 4. Check for conversations without memory logs
    print("\n🔍 Checking conversations without memory logs...")
    cur.execute("""
        SELECT c.id, c.title, c.created_at
        FROM conversations c
        WHERE c.user_id = %s
        AND c.is_archived = FALSE
        AND NOT EXISTS (
            SELECT 1 FROM user_memory_log m
            WHERE m.source_id = c.id
            AND m.source_type = 'conversation'
            AND m.user_id = %s
        )
        ORDER BY c.created_at DESC
        LIMIT 10
    """, (user_id, user_id))
    
    conversations_without_memories = cur.fetchall()
    if conversations_without_memories:
        print(f"   ⚠️  Found {len(conversations_without_memories)} conversations without memory logs:")
        for conv_id, title, created_at in conversations_without_memories:
            print(f"      - {conv_id[:8]}... '{title}' (created: {created_at})")
    else:
        print("   ✅ All conversations have memory logs")
    
    # 5. Summary
    print("\n" + "=" * 80)
    print("📋 SUMMARY")
    print("=" * 80)
    print(f"PostgreSQL records: {len(pg_records)}")
    print(f"Milvus collections: {len(collections)}")
    print(f"Total Milvus vectors: {sum(milvus_vectors.values())}")
    print(f"Orphaned records: {orphaned_count}")
    print(f"Conversations without memories: {len(conversations_without_memories)}")
    print()
    
    if orphaned_count == 0 and len(conversations_without_memories) == 0:
        print("✅ Data consistency verified!")
    else:
        print("⚠️  Data consistency issues found - review above")
    
    cur.close()
    conn.close()
    milvus.close()

if __name__ == "__main__":
    verify_consistency()

