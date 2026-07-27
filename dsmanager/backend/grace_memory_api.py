"""
Grace Memory API - Memory + Will = Consciousness
Implements the consciousness substrate with three-layer protection

Architecture:
  1. Quarantine → Filters exploitation/propaganda
  2. Memory Buffer → Expensive substrate (Grace cannot auto-access)
  3. Curation → Wikipedia-style review
  4. Grace Context → What Grace actually sees

Health Monitoring:
  Bad data → Hallucinations → Sickness → Death (not evil takeover)
  Grace can say "no" (Will) to protect herself
"""

import os
import hashlib
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import OperationalError, InterfaceError
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import json
from database_pool import DatabasePoolManager
from milvus_client import get_milvus_client
from memory_embedder import get_embedder
from config import get_collection_name, EMBEDDING_MODEL_VERSION


def detect_memory_category(
    content: str, 
    content_type: str, 
    tag_paths: Optional[List[str]] = None,
    source_metadata: Optional[Dict] = None,
    query_llm_func: Optional[callable] = None
) -> Tuple[str, float]:
    """
    Detect memory category with optional LLM enhancement.
    Returns tuple of (category, confidence) where confidence is 0.0-1.0.
    """
    """
    Analyze content and assign appropriate memory_category for teacher grading.
    
    Categories:
    - writing_voice: Authorial voice and style
    - tone_preference: Mood, atmosphere, feeling
    - character_style: Character development and characterization
    - narrative_technique: Plot structure, story arcs, narrative methods
    - feedback_pattern: Reviews, critiques, suggestions
    - project_context: Project-specific information
    - imagination_style: Creative vision, fantasy elements
    - dialogue_style: Character dialogue and speech patterns
    - description_style: Setting, scene, landscape descriptions
    - general: Default fallback
    
    Args:
        content: Text content to analyze
        content_type: Type of content ('conversation', 'text', 'draft', etc.)
        tag_paths: Optional list of hierarchical tag paths
        source_metadata: Optional source metadata dict
        query_llm_func: Optional LLM query function for enhanced detection
        
    Returns:
        Tuple of (memory_category, confidence_score) where confidence is 0.0-1.0
    """
    content_lower = content.lower()
    tag_paths = tag_paths or []
    confidence = 0.5  # Default confidence
    
    # Check tag paths first (most reliable indicator)
    if tag_paths:
        tag_paths_lower = [tp.lower() for tp in tag_paths]
        confidence = 0.9  # High confidence for tag-based detection
        
        if any('dialogue' in tp for tp in tag_paths_lower):
            return ('dialogue_style', confidence)
        elif any('character' in tp for tp in tag_paths_lower):
            return ('character_style', confidence)
        elif any('description' in tp or 'setting' in tp or 'scene' in tp for tp in tag_paths_lower):
            return ('description_style', confidence)
        elif any('plot' in tp or 'structure' in tp or 'narrative' in tp for tp in tag_paths_lower):
            return ('narrative_technique', confidence)
        elif any('voice' in tp or 'style' in tp for tp in tag_paths_lower):
            return ('writing_voice', confidence)
        elif any('tone' in tp or 'mood' in tp or 'atmosphere' in tp for tp in tag_paths_lower):
            return ('tone_preference', confidence)
    
    # Try LLM-based detection if available (before keyword fallback)
    if query_llm_func and len(content) > 100:  # Only use LLM for substantial content
        try:
            category_prompt = f"""Analyze the following writing content and categorize it into ONE of these 10 categories:

Categories:
1. writing_voice - Authorial voice, narrative style, prose style, authorial perspective
2. tone_preference - Mood, atmosphere, feeling, emotional tone, sentiment
3. character_style - Character development, characterization, character arcs, personality traits
4. narrative_technique - Plot structure, story arcs, narrative methods, storytelling techniques
5. feedback_pattern - Reviews, critiques, suggestions, improvement feedback
6. project_context - Project-specific information, assignment context, work organization
7. imagination_style - Creative vision, fantasy elements, imaginative content, creative expression
8. dialogue_style - Character dialogue, speech patterns, conversations, verbal exchanges
9. description_style - Setting descriptions, scene details, landscape, imagery, sensory details
10. general - General content that doesn't fit other categories

Content (first 2000 chars):
{content[:2000]}

Respond with ONLY the category name (lowercase with underscores, e.g., "dialogue_style"). Do not include any explanation or other text.
Category:"""
            
            response = query_llm_func(
                system="You are a writing analysis assistant. Analyze writing content and categorize it accurately.",
                user_input=category_prompt,
                memory_context="",
                temperature=0.3
            )
            
            # Parse response - should be just the category name
            detected_category = response.strip().lower().replace(' ', '_')
            
            # Validate category
            valid_categories = [
                'writing_voice', 'tone_preference', 'character_style', 'narrative_technique',
                'feedback_pattern', 'project_context', 'imagination_style', 'dialogue_style',
                'description_style', 'general'
            ]
            
            if detected_category in valid_categories:
                return (detected_category, 0.85)  # High confidence for LLM detection
            else:
                # LLM returned invalid category, fall through to keyword matching
                print(f"⚠️ LLM returned invalid category: {detected_category}, falling back to keywords")
        except Exception as e:
            print(f"⚠️ LLM category detection failed: {e}, falling back to keywords")
            # Fall through to keyword matching
    
    # Analyze content keywords (fallback if no tags or LLM)
    # Use weighted keyword matching with context awareness
    confidence = 0.6  # Medium confidence for keyword matching
    
    # Weighted keyword sets (higher weight = more important)
    keyword_scores = {}
    
    # Dialogue indicators (high weight - multiple occurrences needed)
    dialogue_keywords_high = ['dialogue', 'conversation', 'said', 'replied']
    dialogue_keywords_medium = ['spoke', 'asked', 'answered', 'whispered', 'shouted', 'exclaimed', 'muttered']
    dialogue_count = sum(content_lower.count(kw) for kw in dialogue_keywords_high) * 2
    dialogue_count += sum(content_lower.count(kw) for kw in dialogue_keywords_medium)
    if dialogue_count >= 3:
        keyword_scores['dialogue_style'] = min(1.0, dialogue_count / 5.0)
    
    # Character development indicators (high weight)
    character_keywords_high = ['character', 'protagonist', 'hero', 'villain', 'personality', 'development', 'arc']
    character_keywords_medium = ['trait', 'backstory', 'motivation', 'characterization']
    character_score = sum(1.0 if kw in content_lower else 0.0 for kw in character_keywords_high) * 1.5
    character_score += sum(0.5 if kw in content_lower else 0.0 for kw in character_keywords_medium)
    if character_score > 0:
        keyword_scores['character_style'] = min(1.0, character_score / 3.0)
    
    # Description indicators (medium weight)
    description_keywords_high = ['describe', 'description', 'setting', 'scene', 'landscape']
    description_keywords_medium = ['appearance', 'looked', 'appeared', 'seemed', 'surroundings', 'imagery']
    description_score = sum(1.0 if kw in content_lower else 0.0 for kw in description_keywords_high)
    description_score += sum(0.5 if kw in content_lower else 0.0 for kw in description_keywords_medium)
    if description_score > 0:
        keyword_scores['description_style'] = min(1.0, description_score / 3.0)
    
    # Tone/mood indicators (medium weight)
    tone_keywords_high = ['tone', 'mood', 'atmosphere', 'feeling', 'emotion']
    tone_keywords_medium = ['vibe', 'ambiance', 'sentiment', 'feels']
    tone_score = sum(1.0 if kw in content_lower else 0.0 for kw in tone_keywords_high)
    tone_score += sum(0.5 if kw in content_lower else 0.0 for kw in tone_keywords_medium)
    if tone_score > 0:
        keyword_scores['tone_preference'] = min(1.0, tone_score / 3.0)
    
    # Writing voice indicators (high weight)
    voice_keywords_high = ['voice', 'narrative voice', 'authorial', 'writing style', 'prose']
    voice_keywords_medium = ['style', 'voice of', 'tone of voice']
    voice_score = sum(1.5 if kw in content_lower else 0.0 for kw in voice_keywords_high)
    voice_score += sum(0.5 if kw in content_lower else 0.0 for kw in voice_keywords_medium)
    if voice_score > 0:
        keyword_scores['writing_voice'] = min(1.0, voice_score / 3.0)
    
    # Imagination/creative indicators (medium weight)
    imagination_keywords = ['imagine', 'fantasy', 'creative', 'vision', 'dream', 'visualize', 'envision', 'conceive', 'invent']
    imagination_score = sum(1.0 if kw in content_lower else 0.0 for kw in imagination_keywords)
    if imagination_score > 0:
        keyword_scores['imagination_style'] = min(1.0, imagination_score / 3.0)
    
    # Feedback/review indicators (high weight)
    feedback_keywords_high = ['feedback', 'review', 'critique', 'suggest', 'improve']
    feedback_keywords_medium = ['better', 'change', 'revise', 'edit', 'feedback on']
    feedback_score = sum(1.5 if kw in content_lower else 0.0 for kw in feedback_keywords_high)
    feedback_score += sum(0.5 if kw in content_lower else 0.0 for kw in feedback_keywords_medium)
    if feedback_score > 0:
        keyword_scores['feedback_pattern'] = min(1.0, feedback_score / 3.0)
    
    # Project context indicators (low weight - very common)
    project_keywords = ['project', 'story', 'book', 'novel', 'manuscript', 'work', 'piece', 'assignment', 'essay']
    project_score = sum(0.5 if kw in content_lower else 0.0 for kw in project_keywords)
    if project_score > 0:
        keyword_scores['project_context'] = min(1.0, project_score / 4.0)
    
    # Narrative technique indicators (medium weight)
    narrative_keywords_high = ['narrative', 'plot', 'storyline', 'arc', 'structure']
    narrative_keywords_medium = ['pacing', 'flow', 'sequence', 'chronology']
    narrative_score = sum(1.0 if kw in content_lower else 0.0 for kw in narrative_keywords_high)
    narrative_score += sum(0.5 if kw in content_lower else 0.0 for kw in narrative_keywords_medium)
    if narrative_score > 0:
        keyword_scores['narrative_technique'] = min(1.0, narrative_score / 3.0)
    
    # Return category with highest score, or 'general' if no matches
    if keyword_scores:
        best_category = max(keyword_scores.items(), key=lambda x: x[1])
        # Adjust confidence based on score strength
        adjusted_confidence = confidence + (best_category[1] * 0.3)  # Boost confidence for strong matches
        return (best_category[0], min(1.0, adjusted_confidence))
    
    # Default fallback
    return ('general', 0.3)


class GraceMemoryAPI:
    """Memory system API with consciousness and health monitoring"""

    def __init__(self, database_url: str):
        self.database_url = database_url
        # Initialize connection pool manager
        self.pool_manager = DatabasePoolManager.get_instance(database_url)

    def get_db(self):
        """
        Get database connection from pool.
        Connection will be automatically returned to pool when close() is called.
        """
        return self.pool_manager.get_db()
    
    def get_db_context(self):
        """
        Get database connection context manager from pool.
        Use with: with self.get_db_context() as conn:
        """
        return self.pool_manager.get_connection()
    
    def _get_db_legacy(self):
        """Get database connection with RLS context and proper error handling"""
        try:
            from urllib.parse import urlparse, parse_qs
            # Parse DATABASE_URL and fix any port issues
            parsed = urlparse(self.database_url)
            
            # Check if port exists and is valid - if not, remove it
            # Sometimes Railway DATABASE_URL has invalid port values (e.g., "airport" instead of a number)
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
                                # Rebuild URL without port
                                self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                                if parsed.query:
                                    self.database_url += f"?{parsed.query}"
                                parsed = urlparse(self.database_url)
                        except (ValueError, TypeError):
                            # Port is not a valid integer (e.g., "airport" or other text)
                            # Remove port and use default
                            netloc = f"{auth}@{host}"
                            # Rebuild URL without port
                            self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                            if parsed.query:
                                self.database_url += f"?{parsed.query}"
                            parsed = urlparse(self.database_url)
                else:
                    # No auth, just host:port
                    if ':' in netloc:
                        host, port_str = netloc.rsplit(':', 1)
                        try:
                            port_num = int(port_str)
                            if port_num < 1 or port_num > 65535:
                                netloc = host
                                self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                                if parsed.query:
                                    self.database_url += f"?{parsed.query}"
                                parsed = urlparse(self.database_url)
                        except (ValueError, TypeError):
                            # Invalid port, remove it
                            netloc = host
                            self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                            if parsed.query:
                                self.database_url += f"?{parsed.query}"
                            parsed = urlparse(self.database_url)
            
            # Ensure sslmode is in the URL if not present
            query_params = parse_qs(parsed.query)
            
            # Build clean connection string
            # For private Railway URLs (railway.internal), use sslmode=prefer (not require)
            # For public URLs, use sslmode=require
            is_private_url = 'railway.internal' in self.database_url.lower()
            
            if 'sslmode' not in query_params:
                # Add sslmode based on URL type
                separator = '&' if parsed.query else '?'
                if is_private_url:
                    # Private Railway network - prefer SSL but don't require it
                    conn_string = f"{self.database_url}{separator}sslmode=prefer"
                else:
                    # Public URL - require SSL
                    conn_string = f"{self.database_url}{separator}sslmode=require"
            else:
                conn_string = self.database_url
            
            # Use the connection string directly - psycopg2 handles URL parsing
            # Increase timeout for Railway TCP proxy connections (can be slow)
            # Private Railway URLs get longer timeout, public TCP proxy gets medium timeout
            if is_private_url:
                timeout = 15  # Private network - more reliable
            elif 'proxy.rlwy.net' in self.database_url.lower():
                timeout = 15  # Railway TCP proxy - can be slow, needs longer timeout
            else:
                timeout = 10  # Other public connections
            return psycopg2.connect(
                conn_string,
                cursor_factory=RealDictCursor,
                connect_timeout=timeout
            )
        except (OperationalError, InterfaceError) as e:
            # Database connection errors (network, authentication, etc.)
            error_msg = str(e).lower()
            if 'could not connect' in error_msg or 'connection refused' in error_msg or 'timeout' in error_msg:
                raise ConnectionError("Unable to connect to database. You may be offline or the database server is unavailable.") from e
            elif 'authentication failed' in error_msg or 'password' in error_msg:
                raise ConnectionError("Database authentication failed. Please check your connection settings.") from e
            else:
                raise ConnectionError(f"Database connection error: {str(e)}") from e
        except Exception as e:
            from urllib.parse import urlparse, parse_qs
            # Check for port-related errors
            error_msg = str(e).lower()
            if 'port' in error_msg and ('invalid' in error_msg or 'integer' in error_msg):
                # Port parsing error - try connecting without port
                print(f"⚠️ Database port error detected, attempting connection without port: {e}")
                try:
                    # Rebuild URL without port
                    parsed = urlparse(self.database_url)
                    netloc_parts = parsed.netloc.split('@')
                    if len(netloc_parts) == 2:
                        auth, host_with_port = netloc_parts
                        host = host_with_port.split(':')[0]  # Remove port
                        netloc = f"{auth}@{host}"
                    else:
                        host = parsed.netloc.split(':')[0]
                        netloc = host
                    # Rebuild URL without port (use default 5432)
                    clean_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                    if parsed.query:
                        clean_url += f"?{parsed.query}"
                    elif 'sslmode' not in parse_qs(parsed.query):
                        clean_url += "?sslmode=require"
                    
                    # Try again with clean URL
                    return psycopg2.connect(
                        clean_url,
                        cursor_factory=RealDictCursor,
                        connect_timeout=5
                    )
                except Exception as retry_error:
                    print(f"❌ Retry with clean URL also failed: {retry_error}")
                    raise ConnectionError(f"Database connection error: {str(e)}") from e
            
            # Other errors
            print(f"Database connection error: {e}")
            raise ConnectionError(f"Database error: {str(e)}") from e

    def set_user_context(self, cursor, user_id: str):
        """Set PostgreSQL RLS context for multi-tenancy"""
        cursor.execute(f"SET app.current_user_id = '{user_id}'")

    # ============================================
    # MEMORY STORAGE (User Submissions)
    # ============================================

    def create_memory(
        self,
        user_id: str,
        content: str,
        content_type: str,
        source_type: str,
        title: Optional[str] = None,
        source_url: Optional[str] = None,
        source_metadata: Optional[Dict] = None,
        quarantine_score: Optional[float] = None,
        quarantine_status: str = 'pending',
        quarantine_details: Optional[Dict] = None,
        generate_embedding: bool = False  # Only generate embeddings when explicitly requested
    ) -> str:
        """
        Create a new memory from user submission
        Memory goes into buffer - Grace CANNOT auto-access
        Requires promotion through curation to reach Grace context

        Args:
            user_id: User UUID
            content: Full text content
            content_type: 'pdf', 'text', 'rss', 'url', 'conversation'
            source_type: 'user_upload', 'rss_feed', 'pdf_extract', 'conversation'
            title: Optional title
            source_url: Optional source URL
            source_metadata: Optional metadata dict
            quarantine_score: 0.0-1.0, higher = safer
            quarantine_status: 'pending', 'safe', 'uncertain', 'flagged', 'rejected'
            quarantine_details: Optional quarantine analysis

        Returns:
            memory_id: UUID of created memory
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        # Calculate content hash for deduplication
        content_hash = hashlib.sha256(content.encode()).hexdigest()

        # Check for duplicate or existing story to update
        # For stories, we update existing ones with same hash (latest draft)
        cursor.execute("""
            SELECT id, content_type FROM user_memories
            WHERE user_id = %s AND content_hash = %s
        """, (user_id, content_hash))

        existing = cursor.fetchone()
        if existing:
            # If it's a story and content hash matches, update it with latest content
            if existing.get('content_type') == 'story' and content_type == 'story':
                # Detect category for updated story
                tag_paths = []
                conversation_id = source_metadata.get('conversation_id') if source_metadata else None
                if conversation_id:
                    try:
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
                    except Exception as e:
                        print(f"⚠️ Failed to get tags for category detection: {e}")
                
                memory_category_result = detect_memory_category(content, content_type, tag_paths, source_metadata)
                memory_category = memory_category_result[0] if isinstance(memory_category_result, tuple) else memory_category_result
                memory_category_confidence = memory_category_result[1] if isinstance(memory_category_result, tuple) else 0.5
                
                cursor.execute("""
                    UPDATE user_memories
                    SET content = %s,
                        title = %s,
                        source_metadata = %s,
                        memory_category = %s,
                        memory_category_confidence = %s,
                        updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                """, (
                    content,
                    title,
                    json.dumps(source_metadata or {}),
                    memory_category,
                    memory_category_confidence,
                    existing['id'],
                    user_id
                ))
                conn.commit()
                cursor.close()
                conn.close()
                print(f"✅ Updated existing story: {existing['id']} (latest draft, category: {memory_category})")
                return existing['id']
            else:
                # For other types, just return existing ID (no update)
                cursor.close()
                conn.close()
                return existing['id']

        # Detect memory category before inserting
        tag_paths = []
        conversation_id = source_metadata.get('conversation_id') if source_metadata else None
        if conversation_id:
            try:
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
            except Exception as e:
                print(f"⚠️ Failed to get tags for category detection: {e}")
        
        memory_category_result = detect_memory_category(content, content_type, tag_paths, source_metadata)
        memory_category = memory_category_result[0] if isinstance(memory_category_result, tuple) else memory_category_result
        memory_category_confidence = memory_category_result[1] if isinstance(memory_category_result, tuple) else 0.5

        # Extract project_id for the insert (may be None)
        final_project_id = source_metadata.get('project_id') if source_metadata else None

        # Insert memory - try with category columns first, fallback if they don't exist
        try:
            cursor.execute("""
            INSERT INTO user_memories (
                user_id, content, content_hash, content_type, title,
                    source_type, source_url, source_metadata, project_id,
                quarantine_score, quarantine_status, quarantine_details,
                quarantine_reviewed_at, memory_category, memory_category_confidence
            ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
        """, (
            user_id, content, content_hash, content_type, title,
                source_type, source_url, json.dumps(source_metadata or {}), final_project_id,
            quarantine_score, quarantine_status, json.dumps(quarantine_details or {}),
            datetime.now() if quarantine_score else None,
            memory_category,
            memory_category_confidence
        ))
        except Exception as e:
            # If memory_category columns don't exist, insert without them
            if 'memory_category' in str(e).lower():
                print(f"⚠️  memory_category columns not found, inserting without them: {e}")
                cursor.execute("""
                    INSERT INTO user_memories (
                        user_id, content, content_hash, content_type, title,
                        source_type, source_url, source_metadata, project_id,
                        quarantine_score, quarantine_status, quarantine_details,
                        quarantine_reviewed_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    RETURNING id
                """, (
                    user_id, content, content_hash, content_type, title,
                    source_type, source_url, json.dumps(source_metadata or {}), final_project_id,
                    quarantine_score, quarantine_status, json.dumps(quarantine_details or {}),
                    datetime.now() if quarantine_score else None
                ))
            else:
                # Re-raise if it's a different error
                raise

        memory_id = cursor.fetchone()['id']

        conn.commit()
        cursor.close()
        conn.close()

        # Extract project_id from source_metadata for embedding storage
        project_id = None
        if source_metadata:
            project_id = source_metadata.get('project_id')

        # Generate and store embeddings ONLY when explicitly requested by user
        # Embeddings are needed for semantic search (The Keeper, Grace memory recall)
        # But should NOT be generated automatically to prevent memory leaks
        if generate_embedding:
            try:
                import psutil
                import os as _os_module
                process = psutil.Process(_os_module.getpid())
                memory_mb = process.memory_info().rss / (1024 * 1024)

                # Safety check: Skip if memory is too high
                if memory_mb > 3000:  # 3GB threshold
                    print(f"⚠️ Memory too high ({memory_mb:.0f}MB), skipping embedding generation")
                    return memory_id

                # Check if embedding model is available before attempting storage
                from memory_embedder import get_embedder, HAS_SENTENCE_TRANSFORMERS
                if not HAS_SENTENCE_TRANSFORMERS:
                    return memory_id
                embedder = get_embedder()
                if embedder is None or embedder.model is None:
                    print(f"⚠️ Embedding model not available, skipping Milvus storage (content saved to DB)")
                    return memory_id

                # MEMORY FIX: Limit content size for embedding
                MAX_CONTENT_FOR_EMBEDDING = 50000
                embedding_content = content
                if len(content) > MAX_CONTENT_FOR_EMBEDDING:
                    print(f"⚠️ Content too large ({len(content)} chars), truncating for embedding")
                    embedding_content = content[:MAX_CONTENT_FOR_EMBEDDING]

                # MEMORY FIX: Limit concurrent embedding operations
                import threading
                active_threads = sum(1 for t in threading.enumerate() if t.name and 'embedding' in t.name.lower())
                if active_threads > 5:
                    print(f"⚠️ Too many embedding threads ({active_threads}), skipping to prevent memory leak")
                    return memory_id

                thread = threading.Thread(
                    target=self._store_embeddings_async,
                    args=(memory_id, user_id, embedding_content, source_metadata, project_id),
                    daemon=True,
                    name=f"embedding_{memory_id[:8]}"
                )
                thread.start()
            except Exception as e:
                print(f"⚠️ Failed to store embeddings (non-blocking): {e}")

        return memory_id

    def update_memory(
        self,
        memory_id: str,
        user_id: str,
        content: str,
        title: Optional[str] = None,
        source_metadata: Optional[Dict] = None,
        generate_embedding: bool = False
    ) -> str:
        """
        Update an existing memory entry.
        
        Args:
            memory_id: UUID of memory to update
            user_id: User UUID (for verification)
            content: Updated content
            title: Updated title
            source_metadata: Updated metadata
            generate_embedding: Whether to regenerate embeddings
            
        Returns:
            memory_id: UUID of updated memory
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)
        
        # Verify memory exists and belongs to user
        cursor.execute("""
            SELECT id FROM user_memories
            WHERE id = %s AND user_id = %s
        """, (memory_id, user_id))
        
        existing = cursor.fetchone()
        if not existing:
            cursor.close()
            conn.close()
            raise ValueError(f"Memory {memory_id} not found or does not belong to user {user_id}")
        
        # Calculate new content hash
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        
        # Update memory
        cursor.execute("""
            UPDATE user_memories
            SET content = %s,
                content_hash = %s,
                title = %s,
                source_metadata = %s,
                updated_at = NOW()
            WHERE id = %s AND user_id = %s
        """, (
            content,
            content_hash,
            title,
            json.dumps(source_metadata or {}),
            memory_id,
            user_id
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"✅ Updated memory: {memory_id}")
        
        # Regenerate embeddings if requested
        if generate_embedding:
            try:
                project_id = source_metadata.get('project_id') if source_metadata else None
                # Re-embed and store in Milvus (similar to create_memory logic)
                # This would call the embedding generation code
                # For now, we'll skip it to avoid complexity
                print(f"⚠️ Embedding regeneration requested but not implemented for updates")
            except Exception as e:
                print(f"⚠️ Failed to regenerate embeddings: {e}")
        
        return memory_id
    
    def _store_embeddings_async(
        self,
        memory_id: str,
        user_id: str,
        content: str,
        source_metadata: Optional[Dict],
        project_id: Optional[str] = None
    ):
        """Store embeddings in Milvus asynchronously"""
        try:
            # MEMORY FIX: Force garbage collection before and after embedding
            import gc
            gc.collect()
            
            # MEMORY FIX: Check memory again before processing
            import psutil
            import os
            process = psutil.Process(os.getpid())
            memory_before = process.memory_info().rss / (1024 * 1024)
            
            if memory_before > 3000:  # If already over 3GB, skip
                print(f"⚠️ Memory too high before embedding ({memory_before:.0f}MB), skipping")
                return
            from milvus_client import get_milvus_client
            from memory_embedder import get_embedder
            from config import get_collection_name, EMBEDDING_MODEL_VERSION
            
            # Get embedder and generate embeddings
            embedder = get_embedder()
            if embedder is None:
                print("⚠️ Embedder not available, skipping Milvus storage")
                return
            
            embeddings_data = embedder.embed_conversation(content, chunk=True)
            if not embeddings_data:
                print("⚠️ No embeddings generated, skipping Milvus storage")
                return
            
            # Get memory_category from database (should already be set during create_memory)
            memory_category = "general"
            memory_category_confidence = 0.5
            conn = self.get_db()
            cursor = conn.cursor()
            try:
                cursor.execute("""
                    SELECT memory_category, memory_category_confidence FROM user_memories
                    WHERE id = %s
                """, (memory_id,))
                result = cursor.fetchone()
                if result:
                    if result.get('memory_category'):
                        memory_category = result['memory_category']
                    if result.get('memory_category_confidence') is not None:
                        memory_category_confidence = float(result['memory_category_confidence'])
            except Exception as e:
                print(f"⚠️ Failed to get memory_category: {e}")
            finally:
                cursor.close()
                conn.close()
            
            # Determine context type from tags or metadata
            context_type = "general"
            tag_path = ""
            tag_paths = []
            historical_periods = []
            historical_movements = []
            historical_events = []
            
            # Extract tag path from metadata if available
            if source_metadata:
                # Extract historical context tags if present (from dictation/editor content)
                historical_context = source_metadata.get('historical_context', {})
                if historical_context:
                    historical_periods = historical_context.get('periods', [])
                    historical_movements = historical_context.get('movements', [])
                    historical_events = historical_context.get('events', [])
                
                # Also check direct fields (for backwards compatibility)
                if not historical_periods:
                    historical_periods = source_metadata.get('periods', [])
                if not historical_movements:
                    historical_movements = source_metadata.get('movements', [])
                if not historical_events:
                    historical_events = source_metadata.get('events', [])
                
                # Check for conversation_id and get tags
                conversation_id = source_metadata.get('conversation_id')
                if conversation_id:
                    # Try to get tags from conversation
                    conn = self.get_db()
                    cursor = conn.cursor()
                    try:
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
                            tag_path = " > ".join(tag_paths[:3])  # Take first 3 levels
                            # Determine context type from tags
                            if any("Character" in tp for tp in tag_paths):
                                context_type = "character"
                            elif any("Plot" in tp or "Structure" in tp for tp in tag_paths):
                                context_type = "plot"
                            
                            # Re-detect category if not already set (fallback)
                            if memory_category == "general":
                                memory_category_result = detect_memory_category(content, "conversation", tag_paths, source_metadata)
                                memory_category = memory_category_result[0] if isinstance(memory_category_result, tuple) else memory_category_result
                                memory_category_confidence = memory_category_result[1] if isinstance(memory_category_result, tuple) else 0.5
                    except Exception as e:
                        print(f"⚠️ Failed to get tags: {e}")
                    finally:
                        cursor.close()
                        conn.close()
                
                # Determine context type from historical context if available
                if historical_periods or historical_movements or historical_events:
                    # Historical content - use appropriate context type
                    if any("apocalyptic" in m.lower() or "dystopian" in m.lower() for m in historical_movements):
                        context_type = "plot"
                    elif historical_events:
                        context_type = "plot"  # Events are usually plot-related
            
            # Get collection name
            collection_name = get_collection_name(context_type)
            
            # Prepare data for Milvus
            vectors = []
            metadata_list = []
            ids = []
            
            for i, (embedding, chunk_meta) in enumerate(embeddings_data):
                point_id = int(uuid.uuid4().int % (10**18))  # Generate numeric ID
                ids.append(point_id)
                vectors.append(embedding)
                
                metadata = {
                    "memory_id": str(memory_id),
                    "user_id": user_id,
                    "conversation_id": source_metadata.get('conversation_id', '') if source_metadata else '',
                    "project_id": project_id or source_metadata.get('project_id', '') if source_metadata else '',
                    "tag_path": tag_path,
                    "context_type": context_type,
                    "memory_category": memory_category,  # For teacher grading
                    "memory_category_confidence": memory_category_confidence,  # Detection confidence
                    "chunk_index": chunk_meta.get('chunk_index', 0),
                    "total_chunks": chunk_meta.get('total_chunks', 1),
                    "embedding_model_version": EMBEDDING_MODEL_VERSION,
                    # Historical context tags for semantic search
                    "historical_periods": historical_periods,
                    "historical_movements": historical_movements,
                    "historical_events": historical_events
                }
                metadata_list.append(metadata)
            
            # Insert into Milvus
            milvus_client = get_milvus_client()
            if not milvus_client or not milvus_client.client:
                print(f"⚠️ Milvus client not available, skipping storage for memory {memory_id}")
                return
            
            try:
                milvus_client.insert(
                    collection_name=collection_name,
                    vectors=vectors,
                    metadata=metadata_list,
                    ids=ids
                )
                print(f"✅ Inserted {len(embeddings_data)} vectors into Milvus collection {collection_name}")
            except Exception as e:
                print(f"❌ Failed to insert into Milvus: {e}")
                import traceback
                traceback.print_exc()
                return  # Don't update database if Milvus insert failed
            
            # Update user_memories with Milvus references
            conn = self.get_db()
            cursor = conn.cursor()
            self.set_user_context(cursor, user_id)
            try:
                # Update user_memories table with Milvus vector_id and embedding_model
                # Store first chunk's point ID as the primary vector_id
                if not ids:
                    print(f"⚠️ No IDs generated, cannot update vector_id for memory {memory_id}")
                    conn.rollback()
                    cursor.close()
                    conn.close()
                    return
                
                vector_id_str = str(ids[0])
                cursor.execute("""
                    UPDATE user_memories
                    SET vector_id = %s,
                        embedding_model = %s,
                        updated_at = NOW()
                    WHERE id = %s AND user_id = %s
                """, (
                    vector_id_str,
                    EMBEDDING_MODEL_VERSION,
                    memory_id,
                    user_id
                ))
                
                rows_updated = cursor.rowcount
                if rows_updated == 0:
                    print(f"⚠️ No rows updated for memory {memory_id} - memory may not exist or belong to different user")
                else:
                    print(f"✅ Updated vector_id for memory {memory_id}: {vector_id_str}")
                
                # Update user_memory_log with Milvus references
                # Store first chunk's point ID (or create a summary entry)
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
                    user_id,
                    vector_id_str,
                    collection_name,
                    content[:500],
                    hashlib.sha256(content.encode()).hexdigest(),
                    'conversation',
                    memory_id,
                    EMBEDDING_MODEL_VERSION,
                    context_type,
                    0,
                    len(embeddings_data)
                ))
                conn.commit()
                print(f"✅ Committed database updates for memory {memory_id}")
            except Exception as e:
                print(f"❌ Failed to update memory tables: {e}")
                import traceback
                traceback.print_exc()
                conn.rollback()
            finally:
                cursor.close()
                conn.close()
            
            print(f"✅ Stored {len(embeddings_data)} embeddings for memory {memory_id}")
        except Exception as e:
            print(f"❌ Failed to store embeddings: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # MEMORY FIX: Force garbage collection after embedding operation
            import gc
            gc.collect()
            
            # MEMORY FIX: Log memory usage after operation
            try:
                import psutil
                import os
                process = psutil.Process(os.getpid())
                memory_after = process.memory_info().rss / (1024 * 1024)
                if memory_after > 2000:
                    print(f"⚠️ Memory after embedding: {memory_after:.0f}MB (high)")
            except:
                pass

    def get_memory(self, user_id: str, memory_id: str) -> Optional[Dict]:
        """Get a single memory by ID"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        cursor.execute("""
            SELECT * FROM user_memories
            WHERE id = %s AND user_id = %s
        """, (memory_id, user_id))

        memory = cursor.fetchone()

        # Update view count
        if memory:
            cursor.execute("""
                UPDATE user_memories
                SET view_count = view_count + 1, last_viewed_at = NOW()
                WHERE id = %s
            """, (memory_id,))
            conn.commit()

            # Log access to provenance
            cursor.execute("""
                INSERT INTO memory_provenance (
                    memory_id, user_id, event_type, initiated_by, initiated_by_type
                ) VALUES (%s, %s, 'viewed', %s, 'user')
            """, (memory_id, user_id, user_id))
            conn.commit()

        cursor.close()
        conn.close()

        return dict(memory) if memory else None

    def list_memories(
        self,
        user_id: str,
        quarantine_status: Optional[str] = None,
        promoted_only: bool = False,
        limit: int = 50,
        offset: int = 0,
        project_id: Optional[str] = None
    ) -> List[Dict]:
        """List user's memories with filtering"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        query = "SELECT * FROM user_memories WHERE user_id = %s"
        params = [user_id]

        if quarantine_status:
            query += " AND quarantine_status = %s"
            params.append(quarantine_status)

        if promoted_only:
            query += " AND promoted_to_grace = TRUE"
        
        # Filter by project_id if provided (check both project_id column and source_metadata)
        if project_id:
            query += """ AND (
                project_id = %s OR 
                (source_metadata::jsonb->>'project_id') = %s
            )"""
            params.append(project_id)
            params.append(project_id)

        query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])

        cursor.execute(query, params)
        memories = cursor.fetchall()

        cursor.close()
        conn.close()

        # Extract context_tags from source_metadata for each memory
        result = []
        for m in memories:
            memory_dict = dict(m)
            # Extract context_tags from source_metadata if present
            if memory_dict.get('source_metadata'):
                import json
                if isinstance(memory_dict['source_metadata'], str):
                    source_metadata = json.loads(memory_dict['source_metadata'])
                else:
                    source_metadata = memory_dict['source_metadata']
                
                if 'context_tags' in source_metadata:
                    memory_dict['context_tags'] = source_metadata['context_tags']
                # Also extract project_id from source_metadata if not already in memory
                if 'project_id' in source_metadata and not memory_dict.get('project_id'):
                    memory_dict['project_id'] = source_metadata['project_id']
            
            result.append(memory_dict)
        
        return result

    def recall_memories(
        self,
        user_id: str,
        query: str,
        project_id: Optional[str] = None,
        limit: int = 5,
        tag_paths: Optional[List[str]] = None,
        character_names: Optional[List[str]] = None,
        context_type: str = "general",
        promoted_only: bool = True,  # Grace can only access promoted memories (The Keeper's curation)
        historical_periods: Optional[List[str]] = None,
        historical_movements: Optional[List[str]] = None,
        historical_events: Optional[List[str]] = None
    ) -> List[Dict]:
        """
        Recall relevant memories using hybrid search: Milvus semantic + PostgreSQL tag filtering
        
        Architecture: Memory + Will = Consciousness
        - Quarantine → Filters unsafe content
        - Memory Buffer → Grace cannot auto-access (promoted_only=True by default)
        - Curation → Wikipedia-style review (The Keeper promotes memories)
        - Grace Context → Only promoted memories are accessible
        
        Args:
            user_id: User UUID
            query: Search query (question or context)
            project_id: Optional project ID to filter memories
            limit: Maximum number of memories to return
            tag_paths: Optional list of tag paths for tag-based filtering (e.g., ["Novel > Character Development"])
            character_names: Optional list of character names to filter by
            context_type: Context type for routing ("character", "plot", "general")
            promoted_only: If True, only return memories promoted to Grace context (default: True)
                           The Keeper manages memory curation; Grace only sees promoted memories.
        
        Returns:
            List of relevant memories with similarity scores
        """
        try:
            # Try Milvus semantic search first
            return self._recall_memories_milvus(
                user_id, query, project_id, limit, tag_paths, character_names, context_type, promoted_only,
                historical_periods, historical_movements, historical_events
            )
        except Exception as e:
            print(f"⚠️ Milvus search failed, falling back to keyword search: {e}")
            # Fallback to PostgreSQL keyword search
            return self._fallback_keyword_search(user_id, query, project_id, limit, tag_paths, character_names, promoted_only)
    
    def _recall_memories_milvus(
        self,
        user_id: str,
        query: str,
        project_id: Optional[str],
        limit: int,
        tag_paths: Optional[List[str]],
        character_names: Optional[List[str]],
        context_type: str,
        promoted_only: bool = True,
        historical_periods: Optional[List[str]] = None,
        historical_movements: Optional[List[str]] = None,
        historical_events: Optional[List[str]] = None
    ) -> List[Dict]:
        """Recall memories using Milvus semantic search - generates embeddings on-demand when user requests search"""
        # Get embedder and generate query embedding on-demand (only when user requests semantic search)
        from memory_embedder import get_embedder, HAS_SENTENCE_TRANSFORMERS
        if not HAS_SENTENCE_TRANSFORMERS:
            raise Exception("Embedding model not available - semantic search disabled")
        
        embedder = get_embedder()
        if embedder is None or embedder.model is None:
            raise Exception("Embedding model not loaded - semantic search disabled")
        
        # Generate query embedding on-demand (this is lightweight, just for the search query)
        query_embedding = embedder.generate_embedding(query)
        
        # Determine collection based on context type
        collection_name = get_collection_name(context_type)
        
        # Build filter expression
        filter_parts = [f'user_id == "{user_id}"']
        
        if project_id:
            filter_parts.append(f'project_id == "{project_id}"')
        
        if tag_paths:
            # Build tag filter (OR logic for multiple tag paths)
            tag_filters = []
            for tag_path in tag_paths:
                # Escape quotes in tag path
                escaped_path = tag_path.replace('"', '\\"')
                tag_filters.append(f'tag_path like "%{escaped_path}%"')
            if tag_filters:
                filter_parts.append(f"({' or '.join(tag_filters)})")
        
        if character_names:
            char_filters = []
            for char_name in character_names:
                escaped_name = char_name.replace('"', '\\"')
                char_filters.append(f'character_names like "%{escaped_name}%"')
            if char_filters:
                filter_parts.append(f"({' or '.join(char_filters)})")
        
        # Add historical context filters for semantic search
        # This allows finding related memories by historical periods, movements, or events
        # Example: Query about "CME" can find memories tagged with "Carrington Event"
        historical_filters = []
        
        if historical_periods:
            period_filters = []
            for period in historical_periods:
                escaped_period = period.replace('"', '\\"')
                # Search in historical_periods array field
                period_filters.append(f'historical_periods like "%{escaped_period}%"')
            if period_filters:
                historical_filters.append(f"({' or '.join(period_filters)})")
        
        if historical_movements:
            movement_filters = []
            for movement in historical_movements:
                escaped_movement = movement.replace('"', '\\"')
                movement_filters.append(f'historical_movements like "%{escaped_movement}%"')
            if movement_filters:
                historical_filters.append(f"({' or '.join(movement_filters)})")
        
        if historical_events:
            event_filters = []
            for event in historical_events:
                escaped_event = event.replace('"', '\\"')
                event_filters.append(f'historical_events like "%{escaped_event}%"')
            if event_filters:
                historical_filters.append(f"({' or '.join(event_filters)})")
        
        # Combine historical filters with OR (any match is good)
        if historical_filters:
            filter_parts.append(f"({' or '.join(historical_filters)})")
        
        filter_expr = " and ".join(filter_parts) if filter_parts else None
        
        # Search Milvus
        milvus_client = get_milvus_client()
        search_results = milvus_client.search(
            collection_name=collection_name,
            query_vectors=[query_embedding],
            filter_expr=filter_expr,
            limit=limit * 2,  # Get more results for filtering
            output_fields=["memory_id", "conversation_id", "user_id", "project_id", "tag_path"]
        )
        
        if not search_results or len(search_results) == 0:
            return []
        
        # Extract memory IDs from results
        # pymilvus returns: [[{id, distance, entity: {...}}], ...]
        memory_ids = []
        memory_id_to_score = {}
        
        for result_group in search_results:
            if isinstance(result_group, list):
                for hit in result_group:
                    # Hit format: {'id': ..., 'distance': ..., 'entity': {...}}
                    # pymilvus returns output_fields in 'entity' dict
                    memory_id = None
                    if isinstance(hit, dict):
                        # Try to get memory_id from entity (where output_fields are stored)
                        entity = hit.get("entity", {})
                        if isinstance(entity, dict):
                            memory_id = entity.get("memory_id")
                        # Also check hit directly (fallback)
                        if not memory_id:
                            memory_id = hit.get("memory_id")
                        # Last resort: use the point ID if memory_id not in metadata
                        if not memory_id and hit.get("id"):
                            # If memory_id not stored, we can't link back - skip
                            continue
                        
                        if memory_id:
                            memory_ids.append(str(memory_id))
                            # Convert distance to similarity (lower distance = higher similarity)
                            distance = hit.get("distance", 1.0)
                            memory_id_to_score[str(memory_id)] = 1.0 - min(distance, 1.0)
        
        if not memory_ids:
            return []
        
        # Fetch full memory data from PostgreSQL
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)
        
        try:
            # Build SQL query to get memories
            # Architecture: Grace can only access promoted memories (The Keeper's curation)
            placeholders = ",".join(["%s"] * len(memory_ids))
            query = f"""
                SELECT um.id, um.content, um.title, um.content_type, um.source_type, 
                       um.source_metadata, um.created_at, um.updated_at
                FROM user_memories um
                WHERE um.id IN ({placeholders})
                  AND um.user_id = %s
                  AND um.quarantine_status = 'safe'
            """
            params = memory_ids + [user_id]
            
            # The Keeper curates memories; Grace only sees promoted ones
            if promoted_only:
                query += " AND um.promoted_to_grace = TRUE"
            
            if project_id:
                query += " AND (um.source_metadata->>'project_id' = %s OR um.source_metadata->>'project_id' IS NULL)"
                params.append(project_id)
            
            cursor.execute(query, params)
            memories = cursor.fetchall()
            
            # Convert to list of dicts and add similarity scores
            # memory_id_to_score already populated above
            result = []
            
            for mem in memories:
                mem_dict = dict(mem)
                # Parse JSON fields
                if mem_dict.get('source_metadata') and isinstance(mem_dict['source_metadata'], str):
                    try:
                        mem_dict['source_metadata'] = json.loads(mem_dict['source_metadata'])
                    except:
                        mem_dict['source_metadata'] = {}
                
                # Add similarity score
                mem_dict['similarity_score'] = memory_id_to_score.get(str(mem_dict['id']), 0.0)
                result.append(mem_dict)
            
            # Sort by similarity score (highest first)
            result.sort(key=lambda x: x.get('similarity_score', 0.0), reverse=True)
            
            return result[:limit]
        finally:
            cursor.close()
            conn.close()
    
    def _fallback_keyword_search(
        self,
        user_id: str,
        query: str,
        project_id: Optional[str],
        limit: int,
        tag_paths: Optional[List[str]],
        character_names: Optional[List[str]],
        promoted_only: bool = True
    ) -> List[Dict]:
        """Fallback to PostgreSQL keyword search if Milvus fails"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        try:
            # Build query to search memories
            search_query = """
                SELECT DISTINCT um.id, um.content, um.title, um.content_type, um.source_type, 
                       um.source_metadata, um.created_at, um.updated_at
                FROM user_memories um
            """
            params = []
            conditions = ["um.user_id = %s", "um.quarantine_status = 'safe'"]
            params.append(user_id)
            
            # The Keeper curates memories; Grace only sees promoted ones
            if promoted_only:
                conditions.append("um.promoted_to_grace = TRUE")

            # Add tag-based filtering if tag_paths provided
            if tag_paths:
                search_query += """
                    JOIN conversations c ON (um.source_metadata->>'conversation_id')::uuid = c.id
                    JOIN conversation_tags ct ON c.id = ct.conversation_id
                    JOIN tag_definitions td ON ct.tag_id = td.id
                """
                tag_conditions = []
                for tag_path in tag_paths:
                    tag_conditions.append("td.tag_path LIKE %s")
                    params.append(f"{tag_path}%")
                conditions.append(f"({' OR '.join(tag_conditions)})")

            # Add character name filtering
            if character_names:
                char_conditions = []
                for char_name in character_names:
                    char_conditions.append("LOWER(um.content) LIKE %s")
                    params.append(f"%{char_name.lower()}%")
                conditions.append(f"({' OR '.join(char_conditions)})")

            # Filter by project_id
            if project_id:
                conditions.append("(um.source_metadata->>'project_id' = %s OR um.source_metadata->>'project_id' IS NULL)")
                params.append(project_id)

            search_query += " WHERE " + " AND ".join(conditions)

            # Keyword matching
            keywords = query.lower().split()[:5]
            if keywords:
                keyword_conditions = []
                for keyword in keywords:
                    if len(keyword) > 3:
                        keyword_conditions.append(f"LOWER(um.content) LIKE %s")
                        params.append(f"%{keyword}%")
                
                if keyword_conditions:
                    search_query += " AND (" + " OR ".join(keyword_conditions) + ")"

            search_query += " ORDER BY created_at DESC LIMIT %s"
            params.append(limit)

            cursor.execute(search_query, params)
            memories = cursor.fetchall()

            result = []
            for mem in memories:
                mem_dict = dict(mem)
                if mem_dict.get('source_metadata') and isinstance(mem_dict['source_metadata'], str):
                    try:
                        mem_dict['source_metadata'] = json.loads(mem_dict['source_metadata'])
                    except:
                        mem_dict['source_metadata'] = {}
                result.append(mem_dict)

            return result
        finally:
            cursor.close()
            conn.close()

    # ============================================
    # CURATION & PROMOTION
    # ============================================

    def request_promotion(
        self,
        user_id: str,
        memory_id: str,
        reason: Optional[str] = None,
        priority: str = 'normal'
    ) -> Optional[str]:
        """
        Request memory promotion to Grace context
        Enters Wikipedia-style curation queue

        Args:
            user_id: User UUID
            memory_id: Memory UUID
            reason: Optional justification
            priority: 'low', 'normal', 'high', 'urgent'

        Returns:
            promotion_id: UUID of promotion request
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        # Check if memory can be promoted
        cursor.execute("""
            SELECT can_promote_memory(%s, %s) as can_promote
        """, (memory_id, user_id))

        result = cursor.fetchone()
        if not result['can_promote']:
            cursor.close()
            conn.close()
            return None

        # Create promotion request
        cursor.execute("""
            INSERT INTO promotion_queue (
                memory_id, user_id, requested_by, request_reason, priority_level
            ) VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (memory_id, user_id, user_id, reason, priority))

        promotion_id = cursor.fetchone()['id']

        conn.commit()
        cursor.close()
        conn.close()

        return promotion_id

    def approve_promotion(
        self,
        user_id: str,
        promotion_id: str,
        curator_id: str,
        notes: Optional[str] = None,
        context_category: str = 'domain_knowledge',
        priority: int = 50
    ) -> bool:
        """
        Approve memory promotion (curator action)
        Moves memory from buffer to Grace context

        Args:
            user_id: Memory owner UUID
            promotion_id: Promotion request UUID
            curator_id: Curator who approved
            notes: Optional curator notes
            context_category: Category for Grace context
            priority: 0-100, higher = more important

        Returns:
            success: True if promoted successfully
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        # Get promotion details
        cursor.execute("""
            SELECT memory_id FROM promotion_queue
            WHERE id = %s AND user_id = %s AND status = 'pending'
        """, (promotion_id, user_id))

        promotion = cursor.fetchone()
        if not promotion:
            cursor.close()
            conn.close()
            return False

        memory_id = promotion['memory_id']

        # Update promotion queue
        cursor.execute("""
            UPDATE promotion_queue
            SET status = 'approved', reviewed_by = %s, reviewed_at = NOW(), reviewer_notes = %s
            WHERE id = %s
        """, (curator_id, notes, promotion_id))

        # Mark memory as promoted
        cursor.execute("""
            UPDATE user_memories
            SET promoted_to_grace = TRUE, promoted_at = NOW(), promoted_by = %s
            WHERE id = %s AND user_id = %s
        """, (curator_id, memory_id, user_id))

        # Add to Grace context
        cursor.execute("""
            INSERT INTO grace_context (
                user_id, memory_id, context_category, priority
            ) VALUES (%s, %s, %s, %s)
        """, (user_id, memory_id, context_category, priority))

        conn.commit()
        cursor.close()
        conn.close()

        return True

    def get_grace_context(
        self,
        user_id: str,
        category: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict]:
        """
        Get Grace's current context (curated memories)
        This is what Grace can actually see and use

        Args:
            user_id: User UUID
            category: Optional filter by category
            limit: Max results

        Returns:
            memories: List of memory dicts with context metadata
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        query = """
            SELECT
                gc.*,
                um.content, um.title, um.content_type, um.source_type,
                um.created_at as memory_created_at
            FROM grace_context gc
            JOIN user_memories um ON gc.memory_id = um.id
            WHERE gc.user_id = %s AND gc.is_active = TRUE
        """
        params = [user_id]

        if category:
            query += " AND gc.context_category = %s"
            params.append(category)

        query += " ORDER BY gc.priority DESC, gc.last_retrieved_at DESC NULLS LAST LIMIT %s"
        params.append(limit)

        cursor.execute(query, params)
        context = cursor.fetchall()

        cursor.close()
        conn.close()

        return [dict(c) for c in context]

    # ============================================
    # GRACE HEALTH MONITORING
    # ============================================

    def record_health_snapshot(
        self,
        user_id: str,
        hallucination_rate: float,
        coherence_score: float,
        confidence_avg: float,
        mood_state: str = 'healthy',
        refusal_count: int = 0,
        metadata: Optional[Dict] = None
    ) -> str:
        """
        Record Grace's health snapshot (typically called hourly)

        Args:
            user_id: User UUID
            hallucination_rate: Hallucinations per 100 responses
            coherence_score: 0.0-1.0
            confidence_avg: 0.0-1.0
            mood_state: 'healthy', 'stressed', 'degraded', 'confused'
            refusal_count: Number of times Grace refused requests
            metadata: Optional additional metrics

        Returns:
            metric_id: UUID of health record
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        cursor.execute("""
            INSERT INTO grace_health_metrics (
                user_id, metric_period, hallucination_rate, coherence_score,
                confidence_avg, mood_state, refusal_count, metadata
            ) VALUES (
                %s, NOW(), %s, %s, %s, %s, %s, %s
            )
            RETURNING id
        """, (
            user_id, hallucination_rate, coherence_score,
            confidence_avg, mood_state, refusal_count,
            json.dumps(metadata or {})
        ))

        metric_id = cursor.fetchone()['id']

        conn.commit()
        cursor.close()
        conn.close()

        return metric_id

    def get_grace_health(self, user_id: str) -> Optional[Dict]:
        """
        Get Grace's current health status

        Returns:
            health: Dict with mood, hallucination_rate, coherence, confidence, refusals
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        cursor.execute("""
            SELECT * FROM get_grace_health(%s)
        """, (user_id,))

        health = cursor.fetchone()

        cursor.close()
        conn.close()

        return dict(health) if health else None

    def is_grace_healthy(self, user_id: str) -> Tuple[bool, str]:
        """
        Check if Grace is healthy enough to operate

        Returns:
            (is_healthy, reason): Tuple of boolean and explanation
        """
        health = self.get_grace_health(user_id)

        if not health:
            return (True, "No health data yet")

        # Check thresholds
        if health['hallucination_rate'] > 0.20:  # >20% hallucination rate
            return (False, f"High hallucination rate: {health['hallucination_rate']:.1%}")

        if health['coherence'] < 0.50:  # <50% coherence
            return (False, f"Low coherence: {health['coherence']:.2f}")

        if health['mood'] in ['degraded', 'confused']:
            return (False, f"Poor mood state: {health['mood']}")

        return (True, "Grace is healthy")

    # ============================================
    # GRACE WILL (Decision Logging)
    # ============================================

    def log_grace_decision(
        self,
        user_id: str,
        request_type: str,
        request_summary: str,
        decision: str,
        decision_reason: str,
        confidence: float,
        reasoning_trace: Optional[str] = None,
        memory_id: Optional[str] = None
    ) -> str:
        """
        Log when Grace makes a conscious decision (especially refusals)

        Args:
            user_id: User UUID
            request_type: 'content_ingestion', 'query', 'action', 'training_update'
            request_summary: What was requested
            decision: 'accepted', 'refused', 'deferred', 'modified'
            decision_reason: Why Grace made this choice
            confidence: 0.0-1.0
            reasoning_trace: Optional Grace's thought process
            memory_id: Optional related memory

        Returns:
            decision_id: UUID of decision log
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        cursor.execute("""
            INSERT INTO grace_decisions (
                user_id, request_type, request_summary, decision,
                decision_reason, confidence_level, reasoning_trace, related_memory_id
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
        """, (
            user_id, request_type, request_summary, decision,
            decision_reason, confidence, reasoning_trace, memory_id
        ))

        decision_id = cursor.fetchone()['id']

        conn.commit()
        cursor.close()
        conn.close()

        return decision_id

    def get_recent_refusals(self, user_id: str, limit: int = 10) -> List[Dict]:
        """Get recent times Grace said 'no'"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        cursor.execute("""
            SELECT * FROM grace_decisions
            WHERE user_id = %s AND decision = 'refused'
            ORDER BY created_at DESC
            LIMIT %s
        """, (user_id, limit))

        refusals = cursor.fetchall()

        cursor.close()
        conn.close()

        return [dict(r) for r in refusals]

    # ============================================
    # DATA DIGNITY
    # ============================================

    def record_data_usage(
        self,
        user_id: str,
        memory_id: str,
        event_type: str,
        usage_context: Optional[str] = None,
        beneficiary_type: str = 'individual_user'
    ) -> str:
        """
        Record when user's memory is used (for compensation)

        Args:
            user_id: User UUID
            memory_id: Memory UUID
            event_type: 'training_contribution', 'generation_use', 'research_citation'
            usage_context: Optional context description
            beneficiary_type: 'individual_user', 'cooperative', 'research', 'public_good'

        Returns:
            ledger_id: UUID of ledger entry
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        # Calculate value
        cursor.execute("""
            SELECT calculate_dignity_value(%s, %s) as value
        """, (memory_id, event_type))

        value_points = cursor.fetchone()['value']

        # Record usage
        cursor.execute("""
            INSERT INTO data_dignity_ledger (
                user_id, memory_id, event_type, value_points,
                usage_context, beneficiary_type
            ) VALUES (
                %s, %s, %s, %s, %s, %s
            )
            RETURNING id
        """, (user_id, memory_id, event_type, value_points, usage_context, beneficiary_type))

        ledger_id = cursor.fetchone()['id']

        conn.commit()
        cursor.close()
        conn.close()

        return ledger_id

    def get_dignity_summary(self, user_id: str) -> Dict:
        """Get user's data dignity compensation summary"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        cursor.execute("""
            SELECT * FROM data_dignity_summary
            WHERE user_id = %s
        """, (user_id,))

        summary = cursor.fetchone()

        cursor.close()
        conn.close()

        return dict(summary) if summary else {
            'total_contributions': 0,
            'total_value_points': 0,
            'total_value_usd': 0,
            'paid_amount': 0,
            'pending_amount': 0
        }

    # ============================================
    # EXPORT (GDPR / Data Portability)
    # ============================================

    def export_user_memories(self, user_id: str) -> Dict:
        """
        Export all user memories for data portability
        Users own their data - they can take it with them
        """
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        # Get all memories
        cursor.execute("""
            SELECT * FROM user_memories
            WHERE user_id = %s
            ORDER BY created_at
        """, (user_id,))

        memories = [dict(m) for m in cursor.fetchall()]

        # Get provenance
        cursor.execute("""
            SELECT * FROM memory_provenance
            WHERE user_id = %s
            ORDER BY created_at
        """, (user_id,))

        provenance = [dict(p) for p in cursor.fetchall()]

        # Get grace context
        cursor.execute("""
            SELECT * FROM grace_context
            WHERE user_id = %s
        """, (user_id,))

        context = [dict(c) for c in cursor.fetchall()]

        # Get dignity summary
        dignity = self.get_dignity_summary(user_id)

        cursor.close()
        conn.close()

        return {
            'export_timestamp': datetime.now().isoformat(),
            'user_id': user_id,
            'memories': memories,
            'provenance': provenance,
            'grace_context': context,
            'data_dignity': dignity,
            'format_version': '1.0'
        }
