"""
Prompt Sessions API - PostgreSQL service for prompt engineering sessions
Handles prompt sessions, versions, and AI suggestions
"""

import json
import os
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import psycopg2
from psycopg2 import InterfaceError, OperationalError
from psycopg2.extras import RealDictCursor

from database_pool import DatabasePoolManager


class PromptSessionsAPI:
    """PostgreSQL service for prompt engineering sessions"""

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
        Use with: with self.get_db() as conn:
        """
        return self.pool_manager.get_connection()

    def create_session(
        self,
        user_id: str,
        title: str = "Untitled Prompt Session",
        description: str = None,
    ) -> Dict[str, Any]:
        """
        Create a new prompt session with associated conversation
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                # Direct insert — the legacy create_prompt_session() SQL function
                # belonged to the old architecture (session → conversation pointer,
                # auto-created "- Chat" conversation) and references dropped
                # columns. Conversations are now package-owned and created on
                # first message, not at package creation.
                cursor.execute(
                    """
                    INSERT INTO prompt_sessions (user_id, title, description)
                    VALUES (%s, %s, %s)
                    RETURNING id as session_id
                """,
                    (user_id, title, description),
                )

                session_id = cursor.fetchone()["session_id"]

                # Get the created session
                cursor.execute(
                    """
                    SELECT
                        ps.id, ps.user_id, ps.title, ps.description,
                        ps.left_column_content, ps.compiled_output, ps.is_active,
                        ps.is_archived, ps.current_version, ps.created_at, ps.updated_at,
                        ps.last_accessed_at, ps.metadata
                    FROM prompt_sessions ps
                    WHERE ps.id = %s
                """,
                    (session_id,),
                )

                session = cursor.fetchone()
                conn.commit()

                return dict(session) if session else None

            except Exception as e:
                conn.rollback()
                raise e

    def get_sessions(
        self,
        user_id: str,
        include_archived: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get all prompt sessions for a user
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            # Validate user_id is a proper UUID before any DB operations
            try:
                user_uuid = uuid.UUID(user_id)
            except (ValueError, AttributeError):
                return []

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (str(user_uuid),))

                query = """
                    SELECT
                        ps.id, ps.user_id, ps.title, ps.description,
                        COALESCE(NULLIF(ps.left_column_content, ''), pv_content.left_column_content) as left_column_content,
                        COALESCE(NULLIF(ps.compiled_output, ''), pv_content.compiled_output) as compiled_output,
                        ps.is_active, ps.is_archived, ps.current_version,
                        ps.created_at, ps.updated_at, ps.last_accessed_at, ps.metadata, ps.category,
                        COUNT(pv.id) as version_count,
                        COUNT(DISTINCT CASE WHEN asug.used = FALSE THEN asug.id END) as unused_suggestions_count
                    FROM prompt_sessions ps
                    LEFT JOIN prompt_versions pv ON ps.id = pv.session_id
                    LEFT JOIN prompt_versions pv_content ON pv_content.session_id = ps.id
                        AND pv_content.version_number = ps.current_version
                    LEFT JOIN ai_suggestions asug ON ps.id = asug.session_id
                    WHERE ps.user_id = %s
                """

                params = [user_uuid]

                if not include_archived:
                    query += " AND ps.is_archived = FALSE"

                query += """
                    GROUP BY ps.id, ps.user_id, ps.title, ps.description,
                             pv_content.left_column_content, pv_content.compiled_output,
                             ps.is_active, ps.is_archived, ps.current_version,
                             ps.created_at, ps.updated_at, ps.last_accessed_at, ps.metadata
                    ORDER BY ps.last_accessed_at DESC
                    LIMIT %s OFFSET %s
                """

                params.extend([limit, offset])

                cursor.execute(query, params)
                sessions = cursor.fetchall()

                return [dict(session) for session in sessions]

            except Exception as e:
                raise e

    def _log_prompt_modification_to_milvus(
        self, suggestion: Dict[str, Any], user_id: str, inserted_position: str = None
    ) -> bool:
        """
        Log prompt modification to Milvus as a [modified] event with timestamp
        
        Args:
            suggestion: The suggestion dictionary with all details
            user_id: User ID who inserted the suggestion
            inserted_position: Optional position where suggestion was inserted
        
        Returns:
            True if logged successfully, False otherwise
        """
        try:
            # Import Milvus client and embedder
            from milvus_client import get_milvus_client
            from memory_embedder import get_embedder
            from config import get_collection_name
            
            # Get Milvus client and embedder
            milvus_client = get_milvus_client()
            memory_embedder = get_embedder()
            
            if not milvus_client or not memory_embedder:
                print("⚠️ Milvus client or embedder not available, skipping logging")
                return False
            
            # Connect to Milvus
            milvus_client.connect()
            if not milvus_client.client:
                print("⚠️ Failed to connect to Milvus, skipping logging")
                return False
            
            # Prepare the modification content for embedding
            session_id = suggestion.get('session_id')
            suggestion_type = suggestion.get('suggestion_type', 'unknown')
            content = suggestion.get('content', '')
            label = suggestion.get('metadata', {}).get('label', '') if isinstance(suggestion.get('metadata'), dict) else ''
            
            # Create modification description
            modification_content = f"[modified] AI prompt suggestion inserted: {suggestion_type} - {label}"
            if content:
                # Truncate content for embedding
                truncated_content = content[:500] + "..." if len(content) > 500 else content
                modification_content += f"\nContent: {truncated_content}"
            
            # Add timestamp
            from datetime import datetime
            timestamp = datetime.now().isoformat()
            modification_content += f"\nTimestamp: {timestamp}"
            modification_content += f"\nInserted by user: {user_id}"
            modification_content += f"\nSession ID: {session_id}"
            
            if inserted_position:
                modification_content += f"\nInserted position: {inserted_position}"
            
            # Generate embedding for the modification
            embedding = memory_embedder.generate_embedding(modification_content)
            
            # Prepare metadata for Milvus
            metadata = {
                'user_id': user_id,
                'session_id': session_id,
                'suggestion_id': suggestion.get('id'),
                'suggestion_type': suggestion_type,
                'content': content[:1000],  # Truncate for metadata
                'label': label,
                'inserted_position': inserted_position or '',
                'event_type': 'prompt_modification',
                'modification_type': 'ai_suggestion_inserted',
                'description': f"AI {suggestion_type} suggestion inserted into prompt",
                'timestamp': timestamp,
                'source': 'prompt_composer',
                'change_category': 'ai_assisted',
                'confidence_score': suggestion.get('confidence_score', 1.0),
                'relevance_score': suggestion.get('relevance_score', 1.0),
            }
            
            # Determine collection name based on suggestion type
            collection_name = get_collection_name("general")  # Use general collection for prompt modifications
            
            # Insert into Milvus
            milvus_client.insert(
                collection_name=collection_name,
                vectors=[embedding],
                metadata=[metadata]
            )
            
            print(f"✅ [Milvus] Logged prompt modification: {suggestion_type} suggestion inserted by {user_id}")
            return True
            
        except Exception as e:
            print(f"⚠️ Failed to log prompt modification to Milvus: {e}")
            import traceback
            traceback.print_exc()
            return False

    def get_session(self, session_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific prompt session by ID
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                cursor.execute(
                    """
                    SELECT
                        ps.id, ps.user_id, ps.title, ps.description,
                        COALESCE(NULLIF(ps.left_column_content, ''), pv.left_column_content) as left_column_content,
                        COALESCE(NULLIF(ps.compiled_output, ''), pv.compiled_output) as compiled_output,
                        ps.is_active, ps.is_archived, ps.current_version,
                        ps.created_at, ps.updated_at, ps.last_accessed_at, ps.metadata
                    FROM prompt_sessions ps
                    LEFT JOIN prompt_versions pv ON pv.session_id = ps.id
                        AND pv.version_number = ps.current_version
                    WHERE ps.id = %s
                """,
                    (session_id,),
                )

                session = cursor.fetchone()

                if not session:
                    return None

                # Conversations are package-owned (conversations.session_id → this session)
                # and load COLLAPSED — the user picks one from the dropdown, so no
                # messages are auto-loaded here.
                return dict(session)

            except Exception as e:
                raise e

    def update_session(
        self,
        session_id: str,
        user_id: str,
        title: str = None,
        description: str = None,
        left_column_content: str = None,
        compiled_output: str = None,
        is_active: bool = None,
        is_archived: bool = None,
        metadata: Dict = None,
        category: str = None,
    ) -> Dict[str, Any]:
        """
        Update a prompt session
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                # Build dynamic update query
                updates = []
                params = []

                if title is not None:
                    updates.append("title = %s")
                    params.append(title)
                if description is not None:
                    updates.append("description = %s")
                    params.append(description)
                if left_column_content is not None:
                    updates.append("left_column_content = %s")
                    params.append(left_column_content)
                if compiled_output is not None:
                    updates.append("compiled_output = %s")
                    params.append(compiled_output)
                if is_active is not None:
                    updates.append("is_active = %s")
                    params.append(is_active)
                if is_archived is not None:
                    updates.append("is_archived = %s")
                    params.append(is_archived)
                if metadata is not None:
                    updates.append("metadata = %s")
                    params.append(json.dumps(metadata))
                if category is not None:
                    updates.append("category = %s")
                    params.append(category)

                if not updates:
                    # No updates to make
                    return self.get_session(session_id, user_id)

                updates.append("updated_at = NOW()")
                updates.append("last_accessed_at = NOW()")

                query = f"""
                    UPDATE prompt_sessions
                    SET {", ".join(updates)}
                    WHERE id = %s AND user_id = %s
                    RETURNING id
                """
                params.extend([session_id, user_id])

                cursor.execute(query, params)
                result = cursor.fetchone()

                if not result:
                    raise ValueError(
                        f"Session {session_id} not found or not owned by user {user_id}"
                    )

                conn.commit()

                # Return updated session
                return self.get_session(session_id, user_id)

            except Exception as e:
                conn.rollback()
                raise e

    def delete_session(
        self, session_id: str, user_id: str, permanent: bool = False
    ) -> bool:
        """
        Delete a prompt session (soft delete by archiving or permanent)
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                if permanent:
                    # Permanent deletion
                    cursor.execute(
                        """
                        DELETE FROM prompt_sessions
                        WHERE id = %s AND user_id = %s
                        RETURNING id
                    """,
                        (session_id, user_id),
                    )
                else:
                    # Soft delete (archive)
                    cursor.execute(
                        """
                        UPDATE prompt_sessions
                        SET is_archived = TRUE, updated_at = NOW()
                        WHERE id = %s AND user_id = %s
                        RETURNING id
                    """,
                        (session_id, user_id),
                    )

                result = cursor.fetchone()
                conn.commit()

                return result is not None

            except Exception as e:
                conn.rollback()
                raise e

    def save_version(
        self,
        session_id: str,
        user_id: str,
        left_column_content: str,
        compiled_output: str = None,
        change_description: str = None,
        change_type: str = "manual",
    ) -> Dict[str, Any]:
        """
        Save a new version of a prompt
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                # Call the database function to save version
                cursor.execute(
                    """
                    SELECT save_prompt_version(%s, %s, %s, %s, %s, %s) as version_number
                """,
                    (
                        session_id,
                        user_id,
                        left_column_content,
                        compiled_output,
                        change_description,
                        change_type,
                    ),
                )

                version_number = cursor.fetchone()["version_number"]

                # Get the saved version
                cursor.execute(
                    """
                    SELECT
                        pv.id, pv.session_id, pv.version_number, pv.left_column_content,
                        pv.compiled_output, pv.change_description, pv.change_type,
                        pv.created_by_user_id, pv.created_at,
                        u.email as created_by_email, u.full_name as created_by_name
                    FROM prompt_versions pv
                    LEFT JOIN users u ON pv.created_by_user_id = u.id
                    WHERE pv.session_id = %s AND pv.version_number = %s
                """,
                    (session_id, version_number),
                )

                version = cursor.fetchone()
                conn.commit()

                return dict(version) if version else None

            except Exception as e:
                conn.rollback()
                raise e

    def get_versions(
        self, session_id: str, user_id: str, limit: int = 20, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get all versions for a prompt session
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                cursor.execute(
                    """
                    SELECT
                        pv.id, pv.session_id, pv.version_number, pv.left_column_content,
                        pv.compiled_output, pv.change_description, pv.change_type,
                        pv.created_by_user_id, pv.created_at,
                        pv.overall_score, pv.score_breakdown,
                        u.email as created_by_email, u.full_name as created_by_name
                    FROM prompt_versions pv
                    LEFT JOIN users u ON pv.created_by_user_id = u.id
                    WHERE pv.session_id = %s
                    ORDER BY pv.version_number DESC
                    LIMIT %s OFFSET %s
                """,
                    (session_id, limit, offset),
                )

                versions = cursor.fetchall()

                return [dict(version) for version in versions]

            except Exception as e:
                raise e

    def get_version(
        self, session_id: str, version_number: int, user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific version of a prompt
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                cursor.execute(
                    """
                    SELECT
                        pv.id, pv.session_id, pv.version_number, pv.left_column_content,
                        pv.compiled_output, pv.change_description, pv.change_type,
                        pv.created_by_user_id, pv.created_at,
                        u.email as created_by_email, u.full_name as created_by_name
                    FROM prompt_versions pv
                    LEFT JOIN users u ON pv.created_by_user_id = u.id
                    WHERE pv.session_id = %s AND pv.version_number = %s
                """,
                    (session_id, version_number),
                )

                version = cursor.fetchone()

                return dict(version) if version else None

            except Exception as e:
                raise e

    def restore_version(
        self, session_id: str, version_number: int, user_id: str
    ) -> Dict[str, Any]:
        """
        Restore a specific version as the current content
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                # Get the version content
                cursor.execute(
                    """
                    SELECT left_column_content, compiled_output
                    FROM prompt_versions
                    WHERE session_id = %s AND version_number = %s
                """,
                    (session_id, version_number),
                )

                version = cursor.fetchone()
                if not version:
                    raise ValueError(
                        f"Version {version_number} not found for session {session_id}"
                    )

                # Update the session with this version's content
                cursor.execute(
                    """
                    UPDATE prompt_sessions
                    SET left_column_content = %s,
                        compiled_output = %s,
                        updated_at = NOW(),
                        last_accessed_at = NOW()
                    WHERE id = %s AND user_id = %s
                    RETURNING id
                """,
                    (
                        version["left_column_content"],
                        version["compiled_output"],
                        session_id,
                        user_id,
                    ),
                )

                result = cursor.fetchone()
                if not result:
                    raise ValueError(
                        f"Session {session_id} not found or not owned by user {user_id}"
                    )

                # Save this as a new version with restoration note
                cursor.execute(
                    """
                    SELECT save_prompt_version(%s, %s, %s, %s, %s, %s) as new_version_number
                """,
                    (
                        session_id,
                        user_id,
                        version["left_column_content"],
                        version["compiled_output"],
                        f"Restored from version {version_number}",
                        "restore",
                    ),
                )

                new_version_number = cursor.fetchone()["new_version_number"]
                conn.commit()

                # Return the restored version
                return self.get_version(session_id, new_version_number, user_id)

            except Exception as e:
                conn.rollback()
                raise e

    def get_context_for_ai(self, session_id: str, user_id: str) -> str:
        """
        Get context for AI query (prompt history, suggestions, conversation)
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                cursor.execute(
                    """
                    SELECT get_prompt_context_for_ai(%s, 10) as context
                """,
                    (session_id,),
                )

                result = cursor.fetchone()

                return result["context"] if result else ""

            except Exception as e:
                raise e

    def create_suggestion(
        self,
        session_id: str,
        user_id: str,
        suggestion_type: str,
        content: str,
        context: str = None,
        generated_by_model: str = None,
        confidence_score: float = 1.0,
        relevance_score: float = 1.0,
        metadata: Dict = None,
    ) -> Dict[str, Any]:
        """
        Create an AI suggestion for a prompt session
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                suggestion_id = str(uuid.uuid4())
                metadata_json = json.dumps(metadata or {})

                cursor.execute(
                    """
                    INSERT INTO ai_suggestions (
                        id, session_id, suggestion_type, content, context,
                        generated_by_model, confidence_score, relevance_score,
                        metadata
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """,
                    (
                        suggestion_id,
                        session_id,
                        suggestion_type,
                        content,
                        context,
                        generated_by_model,
                        confidence_score,
                        relevance_score,
                        metadata_json,
                    ),
                )

                suggestion_id = cursor.fetchone()["id"]

                # Get the created suggestion
                cursor.execute(
                    """
                    SELECT
                        id, session_id, suggestion_type, content, context,
                        generated_by_model, confidence_score, relevance_score,
                        used, used_at, inserted_position, created_at, updated_at,
                        metadata
                    FROM ai_suggestions
                    WHERE id = %s
                """,
                    (suggestion_id,),
                )

                suggestion = cursor.fetchone()
                conn.commit()

                return dict(suggestion) if suggestion else None

            except Exception as e:
                conn.rollback()
                raise e

    def get_suggestions(
        self,
        session_id: str,
        user_id: str,
        used: bool = None,
        suggestion_type: str = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get AI suggestions for a prompt session
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                query = """
                    SELECT
                        id, session_id, suggestion_type, content, context,
                        generated_by_model, confidence_score, relevance_score,
                        used, used_at, inserted_position, created_at, updated_at,
                        metadata
                    FROM ai_suggestions
                    WHERE session_id = %s
                """
                params = [session_id]

                if used is not None:
                    query += " AND used = %s"
                    params.append(used)

                if suggestion_type is not None:
                    query += " AND suggestion_type = %s"
                    params.append(suggestion_type)

                query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
                params.extend([limit, offset])

                cursor.execute(query, params)
                suggestions = cursor.fetchall()

                return [dict(suggestion) for suggestion in suggestions]

            except Exception as e:
                raise e

    def mark_suggestion_used(
        self, suggestion_id: str, user_id: str, inserted_position: str = None
    ) -> Dict[str, Any]:
        """
        Mark an AI suggestion as used and log to Milvus as a prompt modification
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                # First get the suggestion details before updating
                cursor.execute(
                    """
                    SELECT
                        id, session_id, suggestion_type, content, context,
                        generated_by_model, confidence_score, relevance_score,
                        used, used_at, inserted_position, created_at, updated_at,
                        metadata
                    FROM ai_suggestions
                    WHERE id = %s AND EXISTS (
                        SELECT 1 FROM prompt_sessions ps
                        WHERE ps.id = ai_suggestions.session_id
                        AND ps.user_id = %s
                    )
                """,
                    (suggestion_id, user_id),
                )

                suggestion = cursor.fetchone()
                if not suggestion:
                    raise ValueError(
                        f"Suggestion {suggestion_id} not found or not accessible"
                    )

                suggestion_dict = dict(suggestion)

                # Update the suggestion as used
                cursor.execute(
                    """
                    UPDATE ai_suggestions
                    SET used = TRUE,
                        used_at = NOW(),
                        inserted_position = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    RETURNING id
                """,
                    (inserted_position, suggestion_id),
                )

                result = cursor.fetchone()
                conn.commit()

                if not result:
                    raise ValueError(
                        f"Suggestion {suggestion_id} not found or not accessible"
                    )

                # Log to Milvus as a prompt modification
                try:
                    self._log_prompt_modification_to_milvus(
                        suggestion_dict, user_id, inserted_position
                    )
                except Exception as milvus_error:
                    # Don't fail the operation if Milvus logging fails
                    print(f"⚠️ Failed to log to Milvus (non-blocking): {milvus_error}")

                return suggestion_dict

            except Exception as e:
                conn.rollback()
                raise e

    def get_context_entries(
        self,
        session_id: str,
        user_id: str,
        context_type: str = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Get context entries for a prompt session
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                query = """
                    SELECT
                        id, session_id, context_type, content, source,
                        relevance_score, created_at, updated_at, metadata
                    FROM prompt_context
                    WHERE session_id = %s
                """
                params = [session_id]

                if context_type is not None:
                    query += " AND context_type = %s"
                    params.append(context_type)

                query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
                params.extend([limit, offset])

                cursor.execute(query, params)
                entries = cursor.fetchall()

                return [dict(entry) for entry in entries]

            except Exception as e:
                raise e

    def add_context_entry(
        self,
        session_id: str,
        user_id: str,
        context_type: str,
        content: str,
        source: str = None,
        relevance_score: float = 1.0,
        metadata: Dict = None,
    ) -> Dict[str, Any]:
        """
        Add a context entry for a prompt session
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                context_id = str(uuid.uuid4())
                metadata_json = json.dumps(metadata or {})

                cursor.execute(
                    """
                    INSERT INTO prompt_context (
                        id, session_id, context_type, content, source,
                        relevance_score, metadata
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """,
                    (
                        context_id,
                        session_id,
                        context_type,
                        content,
                        source,
                        relevance_score,
                        metadata_json,
                    ),
                )

                context_id = cursor.fetchone()["id"]

                # Get the created context entry
                cursor.execute(
                    """
                    SELECT
                        id, session_id, context_type, content, source,
                        relevance_score, created_at, updated_at, metadata
                    FROM prompt_context
                    WHERE id = %s
                """,
                    (context_id,),
                )

                entry = cursor.fetchone()
                conn.commit()

                return dict(entry) if entry else None

            except Exception as e:
                conn.rollback()
                raise e

    def delete_context_entry(self, context_id: str, user_id: str) -> bool:
        """
        Delete a context entry
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                cursor.execute(
                    """
                    DELETE FROM prompt_context
                    WHERE id = %s AND EXISTS (
                        SELECT 1 FROM prompt_sessions ps
                        WHERE ps.id = prompt_context.session_id
                        AND ps.user_id = %s
                    )
                    RETURNING id
                """,
                    (context_id, user_id),
                )

                result = cursor.fetchone()
                conn.commit()

                return result is not None

            except Exception as e:
                conn.rollback()
                raise e

    def get_session_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get statistics for user's prompt sessions
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                cursor.execute(
                    """
                    SELECT
                        COUNT(*) as total_sessions,
                        COUNT(CASE WHEN is_archived = FALSE THEN 1 END) as active_sessions,
                        COUNT(CASE WHEN is_archived = TRUE THEN 1 END) as archived_sessions,
                        COALESCE(SUM(version_count), 0) as total_versions,
                        COALESCE(SUM(suggestion_count), 0) as total_suggestions,
                        COALESCE(SUM(used_suggestion_count), 0) as used_suggestions
                    FROM (
                        SELECT
                            ps.id,
                            COUNT(DISTINCT pv.id) as version_count,
                            COUNT(DISTINCT asug.id) as suggestion_count,
                            COUNT(DISTINCT CASE WHEN asug.used = TRUE THEN asug.id END) as used_suggestion_count
                        FROM prompt_sessions ps
                        LEFT JOIN prompt_versions pv ON ps.id = pv.session_id
                        LEFT JOIN ai_suggestions asug ON ps.id = asug.session_id
                        WHERE ps.user_id = %s
                        GROUP BY ps.id
                    ) session_stats
                """,
                    (user_id,),
                )

                stats = cursor.fetchone()

                return (
                    dict(stats)
                    if stats
                    else {
                        "total_sessions": 0,
                        "active_sessions": 0,
                        "archived_sessions": 0,
                        "total_versions": 0,
                        "total_suggestions": 0,
                        "used_suggestions": 0,
                    }
                )

            except Exception as e:
                raise e

    def search_sessions(
        self,
        user_id: str,
        query: str,
        include_content: bool = False,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """
        Search prompt sessions by title, description, or content
        """
        with self.get_db() as conn:
            cursor = conn.cursor()

            try:
                # Set user context for RLS
                cursor.execute("SET app.current_user_id = %s", (user_id,))

                search_query = f"%{query}%"

                if include_content:
                    cursor.execute(
                        """
                        SELECT DISTINCT
                            ps.id, ps.user_id, ps.title, ps.description,
                            ps.left_column_content, ps.compiled_output, ps.is_active,
                            ps.is_archived, ps.current_version, ps.created_at, ps.updated_at,
                            ps.last_accessed_at, ps.metadata
                        FROM prompt_sessions ps
                        LEFT JOIN prompt_versions pv ON ps.id = pv.session_id
                        WHERE ps.user_id = %s
                        AND (
                            ps.title ILIKE %s
                            OR ps.description ILIKE %s
                            OR ps.left_column_content ILIKE %s
                            OR pv.left_column_content ILIKE %s
                        )
                        ORDER BY ps.last_accessed_at DESC
                        LIMIT %s OFFSET %s
                    """,
                        (
                            user_id,
                            search_query,
                            search_query,
                            search_query,
                            search_query,
                            limit,
                            offset,
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        SELECT
                            ps.id, ps.user_id, ps.title, ps.description,
                            ps.left_column_content, ps.compiled_output, ps.is_active,
                            ps.is_archived, ps.current_version, ps.created_at, ps.updated_at,
                            ps.last_accessed_at, ps.metadata
                        FROM prompt_sessions ps
                        WHERE ps.user_id = %s
                        AND (
                            ps.title ILIKE %s
                            OR ps.description ILIKE %s
                        )
                        ORDER BY ps.last_accessed_at DESC
                        LIMIT %s OFFSET %s
                    """,
                        (user_id, search_query, search_query, limit, offset),
                    )

                sessions = cursor.fetchall()

                return [dict(session) for session in sessions]

            except Exception as e:
                raise e
