"""
DEPRECATED — NOT USED BY THE LIVE APPLICATION.

This file implements memory storage using SQLite + Qdrant and is a legacy
prototype. The live memory system is backend/grace_memory_api.py
(GraceMemoryAPI), which uses PostgreSQL + Milvus instead. This file is not
imported anywhere in the running app. Do not import from this file — it is
kept only for historical reference and should not be extended.

Grace Persistent Memory System (legacy/unused)
- NEVER deletes memories (only archives)
- Per-user isolation (11 users supported)
- SQLite audit log + Qdrant vectors
- Automatic learning from conversations
"""

import sqlite3
import uuid
import hashlib
import json
from datetime import datetime
from typing import List, Dict, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
import openai  # or use sentence-transformers for local embeddings

DB_PATH = "grace.db"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333

class GraceMemory:
    """Grace's eternal memory - she never forgets"""

    def __init__(self):
        self.db_path = DB_PATH
        self.qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    def _get_db(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _generate_embedding(self, text: str) -> List[float]:
        """
        Generate vector embedding for text
        Options:
        1. OpenAI (costs $): response = openai.Embedding.create(input=text, model="text-embedding-ada-002")
        2. Local (free): Use sentence-transformers locally
        """
        # TODO: Replace with your embedding method
        # For now, using OpenAI (you can switch to local model)
        try:
            response = openai.Embedding.create(
                input=text,
                model="text-embedding-ada-002"
            )
            return response['data'][0]['embedding']
        except Exception as e:
            print(f"Warning: Embedding generation failed: {e}")
            # Return zero vector as fallback (not ideal, but prevents crashes)
            return [0.0] * 1536

    def store_memory(
        self,
        user_id: str,
        content: str,
        source_type: str = "conversation",
        source_id: Optional[str] = None,
        importance: float = 0.5,
        metadata: Optional[Dict] = None
    ) -> str:
        """
        Store a memory FOREVER
        Returns: memory_id
        """
        memory_id = str(uuid.uuid4())
        point_id = str(uuid.uuid4())
        collection_name = f"grace_memory_{user_id}"

        # Ensure user's collection exists
        self._ensure_collection_exists(collection_name)

        # Generate embedding
        embedding = self._generate_embedding(content)

        # Store in Qdrant (vector search)
        self.qdrant.upsert(
            collection_name=collection_name,
            points=[
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "content": content[:5000],  # Limit payload size
                        "source_type": source_type,
                        "importance": importance,
                        "timestamp": datetime.now().isoformat(),
                        "metadata": metadata or {}
                    }
                )
            ]
        )

        # Store audit log in SQLite (permanent record)
        conn = self._get_db()
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        conn.execute("""
            INSERT INTO user_memory_log
            (id, user_id, qdrant_point_id, qdrant_collection, content_preview,
             content_hash, source_type, source_id, importance_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            memory_id, user_id, point_id, collection_name,
            content[:500], content_hash, source_type, source_id, importance
        ))

        conn.commit()
        conn.close()

        print(f"✅ Memory stored: {memory_id} ({len(content)} chars)")
        return memory_id

    def recall_memories(
        self,
        user_id: str,
        query: str,
        limit: int = 10,
        min_score: float = 0.7
    ) -> List[Dict]:
        """
        Retrieve relevant memories for a query
        Returns: List of memories with scores
        """
        collection_name = f"grace_memory_{user_id}"

        # Ensure collection exists
        if not self._collection_exists(collection_name):
            return []

        # Generate query embedding
        query_embedding = self._generate_embedding(query)

        # Search Qdrant
        results = self.qdrant.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=limit * 2,  # Get more candidates for filtering
            with_payload=True
        )

        # Filter by score and update access tracking
        memories = []
        conn = self._get_db()

        for result in results:
            if result.score < min_score:
                continue

            # Update access count in SQLite
            conn.execute("""
                UPDATE user_memory_log
                SET access_count = access_count + 1,
                    last_accessed_at = datetime('now')
                WHERE qdrant_point_id = ?
            """, (result.id,))

            memories.append({
                "content": result.payload.get("content", ""),
                "score": result.score,
                "source_type": result.payload.get("source_type"),
                "importance": result.payload.get("importance"),
                "timestamp": result.payload.get("timestamp"),
                "metadata": result.payload.get("metadata", {})
            })

        conn.commit()
        conn.close()

        # Sort by combined score (relevance + importance + recency)
        memories = self._rerank_memories(memories)

        print(f"🧠 Recalled {len(memories)} memories for user {user_id}")
        return memories[:limit]

    def learn_from_conversation(
        self,
        user_id: str,
        conversation_id: str,
        messages: List[Dict[str, str]]
    ):
        """
        Extract and store learnings from a conversation
        Called after each conversation to build Grace's knowledge
        """
        # Store each exchange as a memory
        for i, msg in enumerate(messages):
            if msg['role'] == 'user':
                # Store user's question/input
                self.store_memory(
                    user_id=user_id,
                    content=msg['content'],
                    source_type="conversation",
                    source_id=conversation_id,
                    importance=0.6,  # User input is important
                    metadata={"role": "user", "index": i}
                )

            elif msg['role'] == 'assistant':
                # Store Grace's response (what she learned to say)
                self.store_memory(
                    user_id=user_id,
                    content=msg['content'],
                    source_type="conversation",
                    source_id=conversation_id,
                    importance=0.7,  # Grace's responses are learning data
                    metadata={"role": "assistant", "index": i}
                )

        # Extract key insights from conversation (optional)
        conversation_summary = self._summarize_conversation(messages)
        if conversation_summary:
            self.store_memory(
                user_id=user_id,
                content=conversation_summary,
                source_type="insight",
                source_id=conversation_id,
                importance=0.9,  # Insights are highly important
                metadata={"type": "conversation_summary"}
            )

        print(f"📚 Learned from conversation {conversation_id}: {len(messages)} messages stored")

    def get_user_memory_stats(self, user_id: str) -> Dict:
        """Get memory statistics for a user"""
        conn = self._get_db()

        cursor = conn.execute("""
            SELECT
                COUNT(*) as total_memories,
                SUM(access_count) as total_accesses,
                AVG(importance_score) as avg_importance,
                MIN(created_at) as oldest_memory,
                MAX(created_at) as newest_memory
            FROM user_memory_log
            WHERE user_id = ? AND is_archived = 0
        """, (user_id,))

        stats = cursor.fetchone()
        conn.close()

        return {
            "total_memories": stats['total_memories'] or 0,
            "total_accesses": stats['total_accesses'] or 0,
            "avg_importance": round(stats['avg_importance'] or 0, 2),
            "oldest_memory": stats['oldest_memory'],
            "newest_memory": stats['newest_memory']
        }

    def _ensure_collection_exists(self, collection_name: str):
        """Create Qdrant collection if it doesn't exist"""
        try:
            self.qdrant.get_collection(collection_name)
        except:
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
            )
            print(f"Created memory collection: {collection_name}")

    def _collection_exists(self, collection_name: str) -> bool:
        """Check if collection exists"""
        try:
            self.qdrant.get_collection(collection_name)
            return True
        except:
            return False

    def _rerank_memories(self, memories: List[Dict]) -> List[Dict]:
        """
        Rerank memories by combining multiple factors:
        - Semantic similarity (score)
        - Importance
        - Recency
        """
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)

        for memory in memories:
            # Parse timestamp
            try:
                timestamp = datetime.fromisoformat(memory['timestamp'].replace('Z', '+00:00'))
                days_old = (now - timestamp).days
            except:
                days_old = 365  # Default to old if can't parse

            # Temporal decay: newer memories get boost
            recency_score = 1.0 / (1.0 + (days_old / 30))  # Half-life ~30 days

            # Combined score
            memory['combined_score'] = (
                memory['score'] * 0.6 +  # Semantic similarity
                memory['importance'] * 0.3 +  # Importance
                recency_score * 0.1  # Recency
            )

        # Sort by combined score
        memories.sort(key=lambda m: m['combined_score'], reverse=True)
        return memories

    def _summarize_conversation(self, messages: List[Dict]) -> Optional[str]:
        """
        Extract key insights from conversation
        TODO: Use LLM to generate summary
        """
        # Simple implementation: combine user questions
        user_messages = [msg['content'] for msg in messages if msg['role'] == 'user']

        if len(user_messages) < 2:
            return None

        # Could call LLM here to generate summary
        # For now, just concatenate
        summary = "Conversation about: " + " | ".join(user_messages[:3])
        return summary

    def archive_old_memories(
        self,
        user_id: str,
        days_old: int = 365,
        max_access_count: int = 3
    ):
        """
        Archive rarely-accessed old memories (move to cold storage)
        NEVER delete - just mark as archived
        """
        conn = self._get_db()

        cursor = conn.execute("""
            SELECT id, qdrant_point_id, qdrant_collection
            FROM user_memory_log
            WHERE user_id = ?
              AND is_archived = 0
              AND julianday('now') - julianday(created_at) > ?
              AND access_count <= ?
        """, (user_id, days_old, max_access_count))

        memories_to_archive = cursor.fetchall()

        for memory in memories_to_archive:
            # Mark as archived in SQLite
            conn.execute("""
                UPDATE user_memory_log
                SET is_archived = 1,
                    archived_at = datetime('now'),
                    archive_location = 'qdrant_cold'
                WHERE id = ?
            """, (memory['id'],))

            # Optionally: Remove from hot Qdrant storage
            # (Keep in Qdrant for now for simplicity)

        conn.commit()
        conn.close()

        print(f"📦 Archived {len(memories_to_archive)} old memories for user {user_id}")
        return len(memories_to_archive)


# ============================================
# Quick Test
# ============================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("""
Grace Memory Test

Commands:
  store <user_id> <text>     - Store a memory
  recall <user_id> <query>   - Recall memories
  stats <user_id>            - Show memory stats

Example:
  python grace_memory.py store user-123 "I love Python programming"
  python grace_memory.py recall user-123 "programming languages"
        """)
        sys.exit(1)

    memory = GraceMemory()
    command = sys.argv[1]

    if command == "store":
        user_id = sys.argv[2]
        text = " ".join(sys.argv[3:])
        memory.store_memory(user_id, text)

    elif command == "recall":
        user_id = sys.argv[2]
        query = " ".join(sys.argv[3:])
        results = memory.recall_memories(user_id, query)

        print(f"\n🔍 Found {len(results)} memories:")
        for i, result in enumerate(results, 1):
            print(f"\n{i}. Score: {result['score']:.3f}")
            print(f"   {result['content'][:200]}...")

    elif command == "stats":
        user_id = sys.argv[2]
        stats = memory.get_user_memory_stats(user_id)

        print(f"\n📊 Memory Stats for {user_id}:")
        print(f"   Total memories: {stats['total_memories']}")
        print(f"   Total accesses: {stats['total_accesses']}")
        print(f"   Avg importance: {stats['avg_importance']}")
        print(f"   Oldest: {stats['oldest_memory']}")
        print(f"   Newest: {stats['newest_memory']}")
