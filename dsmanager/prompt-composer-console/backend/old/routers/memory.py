from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import os
import json
import sys
import traceback
from datetime import datetime

# Import shared API instances from api_core (no circular dependency)
import api_core

router = APIRouter()

# MEMORY STORAGE ENDPOINTS
# ============================================


class StoreDictationRequest(BaseModel):
    user_id: str
    content: str
    project_id: Optional[str] = None
    title: Optional[str] = None
    memory_id: Optional[str] = (
        None  # If provided, update existing memory instead of creating new
    )


@router.post("/api/memory/store-dictation")
async def store_dictation_memory(
    request: StoreDictationRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Store dictation content in memory system with historical context tags.
    Content is embedded and stored in Milvus for semantic search.
    """
    if not api_core.memory_api:
        raise HTTPException(
            status_code=503,
            detail="Memory API not available. Please check your database connection.",
        )

    try:
        user_id = api_core.get_user_id_from_header(x_user_id) or request.user_id

        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        if not request.content or not request.content.strip():
            raise HTTPException(status_code=400, detail="Content cannot be empty")

        print(f"📝 Storing dictation content: {len(request.content)} characters")

        # Extract historical context tags using TagExtractor
        historical_tags = {"periods": [], "movements": [], "events": []}

        try:
            # Initialize tag extractor with query_llm function
            global tag_extractor
            if tag_extractor is None:
                # Import query_llm from grace_gui (already imported at top)
                from grace_gui import query_llm

                tag_extractor = TagExtractor(query_llm)

            # Extract historical context
            historical_tags = tag_extractor.extract_historical_context_tags(
                request.content
            )
            print(f"🏛️  Extracted historical context: {historical_tags}")
        except Exception as tag_error:
            print(f"⚠️  Failed to extract historical tags (non-blocking): {tag_error}")
            # Continue without tags - don't fail the storage

        # Prepare source metadata with historical context
        # Note: Both 'historical_context' dict and direct fields for compatibility
        source_metadata = {
            "project_id": request.project_id,
            "source": "editor_content",  # Changed from 'dictation' to be more general
            "input_method": "editor",  # Can be dictation, paste, or typing
            "historical_context": historical_tags,  # Nested structure
            "periods": historical_tags.get(
                "periods", []
            ),  # Direct fields for easy access
            "movements": historical_tags.get("movements", []),
            "events": historical_tags.get("events", []),
            "stored_at": datetime.now().isoformat(),
        }

        # Store or update in memory system
        if request.memory_id:
            # Update existing memory
            print(f"📝 Updating existing memory: {request.memory_id}")
            memory_id = api_core.memory_api.update_memory(
                memory_id=request.memory_id,
                user_id=user_id,
                content=request.content,
                title=request.title
                or f"Dictation - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                source_metadata=source_metadata,
                generate_embedding=True,  # Regenerate embeddings for updated content
            )
            print(f"✅ Memory updated: {memory_id}")
        else:
            # Determine if embedding should be generated based on rules
            try:
                from config.embedding_rules import should_embed_automatically

                generate_embedding = should_embed_automatically(
                    content_type="text",
                    source_type="dictation",
                    metadata=source_metadata,
                    content_length=len(request.content),
                    project_id=request.project_id,
                    quarantine_status="safe",
                )
            except Exception as rule_error:
                # If rules fail, default to True for dictation (user-initiated save)
                print(f"⚠️  Failed to check embedding rules: {rule_error}")
                generate_embedding = True  # User explicitly saved - embed by default

            # Create new memory
            memory_id = api_core.memory_api.create_memory(
                user_id=user_id,
                content=request.content,
                content_type="text",
                source_type="dictation",
                title=request.title
                or f"Dictation - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                source_metadata=source_metadata,
                quarantine_score=0.9,  # Dictation is generally safe
                quarantine_status="safe",
                generate_embedding=generate_embedding,  # Use embedding rules to determine
            )
            print(f"✅ Dictation stored in memory: {memory_id}")

        return {
            "memory_id": memory_id,
            "success": True,
            "historical_context": historical_tags,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_detail = (
            f"Error storing dictation memory: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Store dictation error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error storing dictation memory: {str(e)}"
        )


class UpdateMemoryRequest(BaseModel):
    title: Optional[str] = None
    project_id: Optional[str] = None
    pattern_summary: Optional[str] = None


@router.put("/api/memory/{memory_id}")
async def update_memory(
    memory_id: str,
    request: UpdateMemoryRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Update a memory's title, project, or summary.
    """
    if not api_core.memory_api:
        raise HTTPException(
            status_code=503,
            detail="Memory API not available. Please check your database connection.",
        )

    try:
        user_id = api_core.get_user_id_from_header(x_user_id) or "default-user"

        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        # Get existing memory to update
        conn = api_core.memory_api.get_db()
        cursor = conn.cursor()
        api_core.memory_api.set_user_context(cursor, user_id)

        # Check if memory exists and belongs to user
        cursor.execute(
            """
            SELECT id, source_metadata FROM user_memories
            WHERE id = %s AND user_id = %s
        """,
            (memory_id, user_id),
        )

        existing = cursor.fetchone()
        if not existing:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Memory not found")

        # Update source_metadata with new project_id if provided
        source_metadata = existing.get("source_metadata") or {}
        if isinstance(source_metadata, str):
            import json

            source_metadata = json.loads(source_metadata)

        if request.project_id:
            source_metadata["project_id"] = request.project_id

        # Update memory
        update_fields = []
        update_values = []

        if request.title is not None:
            update_fields.append("title = %s")
            update_values.append(request.title)

        if request.project_id is not None:
            update_fields.append("project_id = %s")
            update_values.append(request.project_id)

        if request.pattern_summary is not None:
            # Store pattern_summary in source_metadata
            source_metadata["pattern_summary"] = request.pattern_summary

        if source_metadata:
            update_fields.append("source_metadata = %s")
            update_values.append(json.dumps(source_metadata))

        update_fields.append("updated_at = NOW()")

        if not update_fields:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="No fields to update")

        update_values.extend([memory_id, user_id])

        cursor.execute(
            f"""
            UPDATE user_memories
            SET {", ".join(update_fields)}
            WHERE id = %s AND user_id = %s
            RETURNING id
        """,
            update_values,
        )

        updated = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        if not updated:
            raise HTTPException(status_code=404, detail="Memory not found")

        print(f"✅ Memory updated: {memory_id}")
        return {"memory_id": memory_id, "success": True}

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_detail = f"Error updating memory: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Update memory error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error updating memory: {str(e)}")


@router.delete("/api/memory/{memory_id}")
async def delete_memory(
    memory_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """
    Delete a memory.
    """
    if not api_core.memory_api:
        raise HTTPException(
            status_code=503,
            detail="Memory API not available. Please check your database connection.",
        )

    conn = None
    cursor = None
    try:
        user_id = api_core.get_user_id_from_header(x_user_id) or "default-user"

        print(
            f"🗑️ [DELETE MEMORY] Attempting to delete memory_id={memory_id}, user_id={user_id}"
        )

        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        # Validate memory_id format (should be UUID)
        try:
            import uuid

            uuid.UUID(memory_id)  # Validate UUID format
        except ValueError as ve:
            print(f"❌ [DELETE MEMORY] Invalid UUID format: {memory_id}, error: {ve}")
            raise HTTPException(
                status_code=400, detail=f"Invalid memory ID format: {memory_id}"
            )

        # Delete memory
        print(f"🗑️ [DELETE MEMORY] Getting database connection...")
        conn = api_core.memory_api.get_db()
        if not conn:
            raise HTTPException(
                status_code=503, detail="Failed to get database connection"
            )

        cursor = None
        try:
            # Use RealDictCursor to match api_core.memory_api pattern (it uses dict access like cursor.fetchone()['id'])
            from psycopg2.extras import RealDictCursor

            cursor = conn.cursor(cursor_factory=RealDictCursor)
            api_core.memory_api.set_user_context(cursor, user_id)
            print(
                f"🗑️ [DELETE MEMORY] Database connection established, checking if memory exists..."
            )

            # First check if memory exists and belongs to user
            cursor.execute(
                """
                SELECT id FROM user_memories
                WHERE id = %s AND user_id = %s
            """,
                (memory_id, user_id),
            )

            existing = cursor.fetchone()
            if not existing:
                print(
                    f"❌ [DELETE MEMORY] Memory not found: memory_id={memory_id}, user_id={user_id}"
                )
                cursor.close()
                conn.close()
                raise HTTPException(status_code=404, detail="Memory not found")

            print(f"✅ [DELETE MEMORY] Memory found, proceeding with deletion...")

            # Delete memory from database
            # Note: Foreign key constraints with ON DELETE CASCADE will handle related records
            cursor.execute(
                """
                DELETE FROM user_memories
                WHERE id = %s AND user_id = %s
                RETURNING id
            """,
                (memory_id, user_id),
            )

            deleted = cursor.fetchone()
            cursor.close()  # Close cursor before commit

            if not deleted:
                print(
                    f"❌ [DELETE MEMORY] Deletion returned no rows: memory_id={memory_id}, user_id={user_id}"
                )
                conn.rollback()
                conn.close()
                raise HTTPException(
                    status_code=404, detail="Memory not found or already deleted"
                )

            # Commit the deletion
            print(f"✅ [DELETE MEMORY] Deletion successful, committing transaction...")
            conn.commit()
            print(f"✅ [DELETE MEMORY] Transaction committed successfully")

        except HTTPException:
            # Re-raise HTTP exceptions (they're already properly formatted)
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
                try:
                    conn.close()
                except:
                    pass
            raise
        except Exception as db_error:
            # Catch any database errors
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            import traceback

            error_trace = traceback.format_exc()
            error_msg = str(db_error)
            print(f"❌ [DELETE MEMORY] Database error: {error_msg}")
            print(f"❌ [DELETE MEMORY] Traceback: {error_trace}")
            # Return more specific error message to help debug
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete memory: {error_msg}. Check backend logs for details.",
            )
        finally:
            # Ensure cursor is closed
            if cursor:
                try:
                    cursor.close()
                except:
                    pass
            # Connection will be returned to pool by close()
            if conn:
                try:
                    conn.close()
                except:
                    pass

        # Try to delete embeddings from Milvus (non-blocking)
        # This happens AFTER database deletion is committed, so it won't affect the main operation
        try:
            from backend.milvus_client import get_milvus_client

            milvus_client = get_milvus_client()
            if (
                milvus_client
                and hasattr(milvus_client, "client")
                and milvus_client.client
            ):
                # Delete from all possible collections using memory_id filter
                collections = [
                    "grace_memory_character",
                    "grace_memory_plot",
                    "grace_memory_general",
                ]
                for collection_name in collections:
                    try:
                        # Use the wrapper method which handles errors better
                        milvus_client.delete_by_filter(
                            collection_name=collection_name,
                            filter_expr=f'memory_id == "{memory_id}"',
                        )
                        print(
                            f"✅ Deleted embeddings from Milvus collection {collection_name} for memory {memory_id}"
                        )
                    except Exception as milvus_error:
                        # Non-blocking - log but don't fail
                        print(
                            f"⚠️ Failed to delete from Milvus collection {collection_name}: {milvus_error}"
                        )
        except Exception as milvus_error:
            # Non-blocking - log but don't fail the deletion
            print(f"⚠️ Milvus cleanup failed (non-blocking): {milvus_error}")

        print(f"✅ Memory deleted: {memory_id}")
        return {"memory_id": memory_id, "success": True}

    except HTTPException:
        # HTTP exceptions are already properly formatted - re-raise them
        if conn:
            try:
                conn.rollback()
            except:
                pass
        raise
    except Exception as e:
        import traceback

        error_detail = f"Error deleting memory: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ [DELETE MEMORY] Unexpected error: {error_detail}")
        if conn:
            try:
                conn.rollback()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Error deleting memory: {str(e)}")
    finally:
        # Connection will be returned to pool automatically when close() is called
        # Only close if it wasn't already closed in the inner finally block
        if conn:
            try:
                # Check if connection is still open before closing
                if not conn.closed:
                    conn.close()
            except:
                pass


# ============================================
