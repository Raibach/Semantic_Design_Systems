"""
Batch Embedding Script
Generates embeddings for existing conversations and stores them in Milvus
"""

import os
import sys
import argparse
from typing import List, Dict, Optional

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.conversation_api import ConversationAPI
from backend.milvus_client import get_milvus_client
from backend.memory_embedder import get_embedder
from grace_memory_api import GraceMemoryAPI
from config.milvus_config import get_collection_name, EMBEDDING_MODEL_VERSION


def batch_embed_conversations(
    database_url: str,
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    batch_size: int = 100,
    limit: Optional[int] = None
):
    """
    Batch embed existing conversations
    
    Args:
        database_url: PostgreSQL connection URL
        user_id: Optional user ID to filter conversations
        project_id: Optional project ID to filter conversations
        batch_size: Number of conversations to process per batch
        limit: Maximum number of conversations to process (None for all)
    """
    print("🚀 Starting batch embedding process...")
    
    # Initialize APIs
    conversation_api = ConversationAPI(database_url)
    memory_api = GraceMemoryAPI(database_url)
    embedder = get_embedder()
    milvus_client = get_milvus_client()
    
    # Get conversations
    print("📋 Fetching conversations...")
    conversations = conversation_api.get_all_conversations(
        user_id=user_id or "all",
        project_id=project_id,
        include_archived=False
    )
    
    if limit:
        conversations = conversations[:limit]
    
    print(f"📊 Found {len(conversations)} conversations to process")
    
    # Process in batches
    total_processed = 0
    total_embeddings = 0
    
    for i in range(0, len(conversations), batch_size):
        batch = conversations[i:i + batch_size]
        print(f"\n📦 Processing batch {i // batch_size + 1} ({len(batch)} conversations)...")
        
        for conv in batch:
            try:
                # Get conversation messages
                messages = conversation_api.get_messages(
                    conversation_id=conv['id'],
                    user_id=conv['user_id']
                )
                
                if not messages:
                    continue
                
                # Combine messages into text
                conversation_text = "\n\n".join([
                    f"{msg['role']}: {msg['content']}"
                    for msg in messages
                ])
                
                # Get tags for context type determination
                context_type = "general"
                tag_path = ""
                
                try:
                    conn = conversation_api.get_db()
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT array_agg(td.tag_path ORDER BY td.tag_path) as tag_paths
                        FROM conversations c
                        LEFT JOIN conversation_tags ct ON c.id = ct.conversation_id
                        LEFT JOIN tag_definitions td ON ct.tag_id = td.id
                        WHERE c.id = %s
                        GROUP BY c.id
                    """, (conv['id'],))
                    result = cursor.fetchone()
                    if result and result.get('tag_paths'):
                        tag_paths = [tp for tp in result['tag_paths'] if tp]
                        if tag_paths:
                            tag_path = " > ".join(tag_paths[:3])
                            if any("Character" in tp for tp in tag_paths):
                                context_type = "character"
                            elif any("Plot" in tp or "Structure" in tp for tp in tag_paths):
                                context_type = "plot"
                    cursor.close()
                    conn.close()
                except Exception as e:
                    print(f"⚠️ Failed to get tags for {conv['id']}: {e}")
                
                # Generate embeddings
                embeddings_data = embedder.embed_conversation(conversation_text, chunk=True)
                
                if not embeddings_data:
                    continue
                
                # Prepare data for Milvus
                collection_name = get_collection_name(context_type)
                vectors = []
                metadata_list = []
                ids = []
                
                import uuid
                for j, (embedding, chunk_meta) in enumerate(embeddings_data):
                    point_id = int(uuid.uuid4().int % (10**18))
                    ids.append(point_id)
                    vectors.append(embedding)
                    
                    metadata = {
                        "memory_id": str(conv.get('memory_id', conv['id'])),
                        "user_id": conv['user_id'],
                        "conversation_id": str(conv['id']),
                        "project_id": project_id or conv.get('project_id', ''),
                        "tag_path": tag_path,
                        "context_type": context_type,
                        "chunk_index": chunk_meta.get('chunk_index', 0),
                        "total_chunks": chunk_meta.get('total_chunks', 1),
                        "embedding_model_version": EMBEDDING_MODEL_VERSION
                    }
                    metadata_list.append(metadata)
                
                # Insert into Milvus
                milvus_client.insert(
                    collection_name=collection_name,
                    vectors=vectors,
                    metadata=metadata_list,
                    ids=ids
                )
                
                total_embeddings += len(embeddings_data)
                total_processed += 1
                
                if total_processed % 10 == 0:
                    print(f"  ✅ Processed {total_processed} conversations, {total_embeddings} embeddings")
                
            except Exception as e:
                print(f"  ❌ Failed to process conversation {conv.get('id', 'unknown')}: {e}")
                import traceback
                traceback.print_exc()
                continue
        
        print(f"✅ Batch complete. Total: {total_processed} conversations, {total_embeddings} embeddings")
    
    print(f"\n🎉 Batch embedding complete!")
    print(f"   Processed: {total_processed} conversations")
    print(f"   Generated: {total_embeddings} embeddings")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch embed existing conversations")
    parser.add_argument("--database-url", required=True, help="PostgreSQL connection URL")
    parser.add_argument("--user-id", help="User ID to filter conversations")
    parser.add_argument("--project-id", help="Project ID to filter conversations")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size (default: 100)")
    parser.add_argument("--limit", type=int, help="Maximum number of conversations to process")
    
    args = parser.parse_args()
    
    batch_embed_conversations(
        database_url=args.database_url,
        user_id=args.user_id,
        project_id=args.project_id,
        batch_size=args.batch_size,
        limit=args.limit
    )

