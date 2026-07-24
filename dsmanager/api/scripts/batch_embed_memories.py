"""
Batch Embedding Script for User Memories
Generates embeddings for existing user_memories that don't have vector_id set
and stores them in Milvus, then updates the PostgreSQL records with vector_id
"""

import os
import sys
import argparse
import uuid
from typing import List, Dict, Optional

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from grace_memory_api import GraceMemoryAPI
from backend.milvus_client import get_milvus_client
from backend.memory_embedder import get_embedder
from config.milvus_config import get_collection_name, EMBEDDING_MODEL_VERSION


def batch_embed_memories(
    database_url: str,
    user_id: Optional[str] = None,
    batch_size: int = 50,
    limit: Optional[int] = None,
    dry_run: bool = False
):
    """
    Batch embed existing user_memories that don't have vector_id
    
    Args:
        database_url: PostgreSQL connection URL
        user_id: Optional user ID to filter memories
        batch_size: Number of memories to process per batch
        limit: Maximum number of memories to process (None for all)
        dry_run: If True, only report what would be done without making changes
    """
    print("🚀 Starting batch embedding process for user_memories...")
    
    # Initialize APIs
    memory_api = GraceMemoryAPI(database_url)
    embedder = get_embedder()
    milvus_client = get_milvus_client()
    
    if not embedder or embedder.model is None:
        print("❌ Embedder not available. Cannot proceed.")
        return
    
    if not milvus_client or milvus_client.client is None:
        print("❌ Milvus client not available. Cannot proceed.")
        return
    
    # Get memories without vector_id
    print("📋 Fetching memories without embeddings...")
    conn = memory_api.get_db()
    cursor = conn.cursor()
    
    query = """
        SELECT id, user_id, content, content_type, source_type, source_metadata, project_id
        FROM user_memories
        WHERE vector_id IS NULL
    """
    params = []
    
    if user_id:
        query += " AND user_id = %s"
        params.append(user_id)
    
    query += " ORDER BY created_at DESC"
    
    if limit:
        query += " LIMIT %s"
        params.append(limit)
    
    cursor.execute(query, params)
    memories = cursor.fetchall()
    cursor.close()
    conn.close()
    
    print(f"📊 Found {len(memories)} memories without embeddings")
    
    if dry_run:
        print("🔍 DRY RUN MODE - No changes will be made")
        print(f"Would process {len(memories)} memories")
        return
    
    # Process in batches
    total_processed = 0
    total_embeddings = 0
    total_failed = 0
    
    for i in range(0, len(memories), batch_size):
        batch = memories[i:i + batch_size]
        print(f"\n📦 Processing batch {i // batch_size + 1} ({len(batch)} memories)...")
        
        for memory in batch:
            try:
                memory_id = str(memory['id'])
                user_id_mem = str(memory['user_id'])
                content = memory['content']
                source_metadata = memory.get('source_metadata') or {}
                project_id = str(memory['project_id']) if memory.get('project_id') else None
                
                # Skip if content is too large or empty
                if not content or len(content.strip()) == 0:
                    print(f"  ⚠️ Skipping {memory_id[:8]}... (empty content)")
                    continue
                
                if len(content) > 100000:  # Skip very large content
                    print(f"  ⚠️ Skipping {memory_id[:8]}... (content too large: {len(content)} chars)")
                    continue
                
                # Limit content size for embedding (prevent memory spikes)
                MAX_CONTENT_FOR_EMBEDDING = 50000
                content_for_embedding = content[:MAX_CONTENT_FOR_EMBEDDING] if len(content) > MAX_CONTENT_FOR_EMBEDDING else content
                
                # Generate embeddings
                embeddings_data = embedder.embed_conversation(content_for_embedding, chunk=True)
                
                if not embeddings_data:
                    print(f"  ⚠️ No embeddings generated for {memory_id[:8]}...")
                    total_failed += 1
                    continue
                
                # Determine context type from tags or metadata
                context_type = "general"
                tag_path = ""
                historical_periods = []
                historical_movements = []
                historical_events = []
                
                # Extract tag path from metadata if available
                if source_metadata:
                    historical_context = source_metadata.get('historical_context', {})
                    if historical_context:
                        historical_periods = historical_context.get('periods', [])
                        historical_movements = historical_context.get('movements', [])
                        historical_events = historical_context.get('events', [])
                    
                    # Check for conversation_id and get tags
                    conversation_id = source_metadata.get('conversation_id')
                    if conversation_id:
                        try:
                            conn = memory_api.get_db()
                            cursor = conn.cursor()
                            cursor.execute("""
                                SELECT array_agg(td.tag_path ORDER BY td.tag_path) as tag_paths
                                FROM conversations c
                                JOIN conversation_tags ct ON c.id = ct.conversation_id
                                JOIN tag_definitions td ON ct.tag_id = td.id
                                WHERE c.id = %s
                                GROUP BY c.id
                            """, (conversation_id,))
                            result = cursor.fetchone()
                            if result and result.get('tag_paths'):
                                tag_paths = result['tag_paths']
                                tag_path = " > ".join(tag_paths[:3])
                                if any("Character" in tp for tp in tag_paths):
                                    context_type = "character"
                                elif any("Plot" in tp or "Structure" in tp for tp in tag_paths):
                                    context_type = "plot"
                            cursor.close()
                            conn.close()
                        except Exception as e:
                            print(f"  ⚠️ Failed to get tags: {e}")
                
                # Get collection name
                collection_name = get_collection_name(context_type)
                
                # Prepare data for Milvus
                vectors = []
                metadata_list = []
                ids = []
                
                for j, (embedding, chunk_meta) in enumerate(embeddings_data):
                    point_id = int(uuid.uuid4().int % (10**18))
                    ids.append(point_id)
                    vectors.append(embedding)
                    
                    metadata = {
                        "memory_id": memory_id,
                        "user_id": user_id_mem,
                        "conversation_id": source_metadata.get('conversation_id', '') if source_metadata else '',
                        "project_id": project_id or source_metadata.get('project_id', '') if source_metadata else '',
                        "tag_path": tag_path,
                        "context_type": context_type,
                        "chunk_index": chunk_meta.get('chunk_index', 0),
                        "total_chunks": chunk_meta.get('total_chunks', 1),
                        "embedding_model_version": EMBEDDING_MODEL_VERSION,
                        "historical_periods": historical_periods,
                        "historical_movements": historical_movements,
                        "historical_events": historical_events
                    }
                    metadata_list.append(metadata)
                
                # Insert into Milvus
                milvus_client.insert(
                    collection_name=collection_name,
                    vectors=vectors,
                    metadata=metadata_list,
                    ids=ids
                )
                
                # Update user_memories with Milvus vector_id
                conn = memory_api.get_db()
                cursor = conn.cursor()
                memory_api.set_user_context(cursor, user_id_mem)
                
                try:
                    # Update user_memories table with Milvus vector_id and embedding_model
                    cursor.execute("""
                        UPDATE user_memories
                        SET vector_id = %s,
                            embedding_model = %s
                        WHERE id = %s AND user_id = %s
                    """, (
                        str(ids[0]) if ids else None,
                        EMBEDDING_MODEL_VERSION,
                        memory_id,
                        user_id_mem
                    ))
                    
                    # Update user_memory_log with Milvus references
                    import hashlib
                    cursor.execute("""
                        INSERT INTO user_memory_log (
                            id, user_id, milvus_point_id, milvus_collection,
                            content_preview, content_hash, source_type, source_id,
                            embedding_model_version, context_type, chunk_index, total_chunks
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        ON CONFLICT DO NOTHING
                    """, (
                        str(uuid.uuid4()),
                        user_id_mem,
                        str(ids[0]) if ids else None,
                        collection_name,
                        content[:500],
                        hashlib.sha256(content.encode()).hexdigest(),
                        memory.get('source_type', 'conversation'),
                        memory_id,
                        EMBEDDING_MODEL_VERSION,
                        context_type,
                        0,
                        len(embeddings_data)
                    ))
                    conn.commit()
                    cursor.close()
                    conn.close()
                    
                    total_embeddings += len(embeddings_data)
                    total_processed += 1
                    
                    if total_processed % 10 == 0:
                        print(f"  ✅ Processed {total_processed} memories, {total_embeddings} embeddings")
                
                except Exception as e:
                    print(f"  ❌ Failed to update database for {memory_id[:8]}...: {e}")
                    conn.rollback()
                    cursor.close()
                    conn.close()
                    total_failed += 1
                    continue
                
            except Exception as e:
                print(f"  ❌ Failed to process memory {memory.get('id', 'unknown')}: {e}")
                import traceback
                traceback.print_exc()
                total_failed += 1
                continue
        
        print(f"✅ Batch complete. Total: {total_processed} memories, {total_embeddings} embeddings, {total_failed} failed")
    
    print(f"\n🎉 Batch embedding complete!")
    print(f"   ✅ Processed: {total_processed} memories")
    print(f"   📊 Generated: {total_embeddings} embeddings")
    print(f"   ❌ Failed: {total_failed} memories")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch embed existing user_memories")
    parser.add_argument("--database-url", required=True, help="PostgreSQL connection URL")
    parser.add_argument("--user-id", help="User ID to filter memories")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size (default: 50)")
    parser.add_argument("--limit", type=int, help="Maximum number of memories to process")
    parser.add_argument("--dry-run", action="store_true", help="Dry run mode - don't make changes")
    
    args = parser.parse_args()
    
    batch_embed_memories(
        database_url=args.database_url,
        user_id=args.user_id,
        batch_size=args.batch_size,
        limit=args.limit,
        dry_run=args.dry_run
    )

