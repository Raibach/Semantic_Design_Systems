"""Auto-extracted route module from main.py — zero behavior change."""
import json
import os
import sys
import time
import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import services as state
from deps import (
    DEFAULT_USER_ID, REASONING_TRACE_PATH, A2UI_CATALOG_ID,
    a2ui_catalog, validate_a2ui_components, user_is_admin,
    get_user_id_from_header,
)
from grace_gui import (
    evaluate_source, query_llm, retrieve_memory_context, search_news,
    summarize_pdfs, milvus_save_version, milvus_get_versions,
)
from agent_rpc_handler import AgentRpcHandler
from figma_service import (
    get_file, get_file_versions, get_component, get_node,
    get_dev_resources, search_file,
)
from milvus_rest import MilvusREST

router = APIRouter()

# ============================================
# PROMPT SESSIONS ENDPOINTS
# ============================================


class CreatePromptSessionRequest(BaseModel):
    title: str = "Untitled Prompt Session"
    description: Optional[str] = None


class UpdatePromptSessionRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    left_column_content: Optional[str] = None
    compiled_output: Optional[str] = None
    conversation_id: Optional[str] = None
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None
    category: Optional[str] = None


class SavePromptVersionRequest(BaseModel):
    left_column_content: str
    compiled_output: Optional[str] = None
    change_description: Optional[str] = None
    change_type: str = "manual"


class CreateSuggestionRequest(BaseModel):
    suggestion_type: str
    content: str
    context: Optional[str] = None
    generated_by_model: Optional[str] = None
    confidence_score: float = 1.0
    relevance_score: float = 1.0
    metadata: Optional[Dict[str, Any]] = None


class AddContextEntryRequest(BaseModel):
    context_type: str
    content: str
    source: Optional[str] = None
    relevance_score: float = 1.0
    metadata: Optional[Dict[str, Any]] = None

@router.get("/api/prompts")
async def get_prompts(
    include_archived: bool = Query(False),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all prompt sessions formatted as prompts list (for ConsolePage)"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        sessions = state.prompt_sessions_api.get_sessions(
            user_id=uid, include_archived=include_archived, limit=limit, offset=offset
        )
        # Transform to format ConsolePage expects: { prompts: [...] }
        prompts = [
            {
                "id": s.get("id"),
                "title": s.get("title", "Untitled Agent"),
                "category": s.get("category", ""),
                "metadata": {
                    "author": (s.get("metadata") or {}).get("author", "You"),
                    "score": (s.get("metadata") or {}).get("score"),
                },
                "message_count": s.get("version_count", 1),
                "is_archived": s.get("is_archived", False),
                "updated_at": s.get("updated_at"),
                "created_at": s.get("created_at"),
            }
            for s in sessions
        ]
        return {"prompts": prompts, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompts: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompts error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompts: {str(e)}"
        )


@router.get("/api/prompt-sessions")
async def get_prompt_sessions(
    include_archived: bool = Query(False),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all prompt sessions for a user"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        sessions = state.prompt_sessions_api.get_sessions(
            user_id=uid, include_archived=include_archived, limit=limit, offset=offset
        )
        return {"sessions": sessions, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt sessions: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt sessions error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt sessions: {str(e)}"
        )


@router.get("/api/prompt-sessions/{session_id}")
async def get_prompt_session(
    session_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get a specific prompt session by ID"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        session = state.prompt_sessions_api.get_session(session_id, uid)
        if not session:
            raise HTTPException(status_code=404, detail="Prompt session not found")
        return {"session": session, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt session: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt session error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt session: {str(e)}"
        )


@router.post("/api/prompt-sessions")
async def create_prompt_session(
    request: CreatePromptSessionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Create a new prompt session"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        session = state.prompt_sessions_api.create_session(
            user_id=uid, title=request.title, description=request.description
        )
        return {"session": session, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error creating prompt session: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Create prompt session error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error creating prompt session: {str(e)}"
        )


@router.put("/api/prompt-sessions/{session_id}")
async def update_prompt_session(
    session_id: str,
    request: UpdatePromptSessionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Update a prompt session"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        session = state.prompt_sessions_api.update_session(
            session_id=session_id,
            user_id=uid,
            title=request.title,
            description=request.description,
            left_column_content=request.left_column_content,
            compiled_output=request.compiled_output,
            conversation_id=request.conversation_id,
            is_active=request.is_active,
            is_archived=request.is_archived,
            metadata=request.metadata,
            category=request.category,
        )
        return {"session": session, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error updating prompt session: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Update prompt session error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error updating prompt session: {str(e)}"
        )


@router.delete("/api/prompt-sessions/{session_id}")
async def delete_prompt_session(
    session_id: str,
    permanent: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Delete a prompt session (soft delete by archiving or permanent)"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = state.prompt_sessions_api.delete_session(
            session_id=session_id, user_id=uid, permanent=permanent
        )
        if not success:
            raise HTTPException(status_code=404, detail="Prompt session not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error deleting prompt session: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Delete prompt session error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting prompt session: {str(e)}"
        )


@router.post("/api/prompt-sessions/{session_id}/versions")
async def save_prompt_version(
    session_id: str,
    request: SavePromptVersionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Save a new version of a prompt"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        version = state.prompt_sessions_api.save_version(
            session_id=session_id,
            user_id=uid,
            left_column_content=request.left_column_content,
            compiled_output=request.compiled_output,
            change_description=request.change_description,
            change_type=request.change_type,
        )
        return {"version": version, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error saving prompt version: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Save prompt version error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error saving prompt version: {str(e)}"
        )


@router.get("/api/prompt-sessions/{session_id}/versions")
async def get_prompt_versions(
    session_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort: str = Query("version", regex="^(version|score)$"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all versions for a prompt session.

    sort=version (default): newest version first.
    sort=score: highest overall_score first (nulls last).
    """
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        versions = state.prompt_sessions_api.get_versions(
            session_id=session_id, user_id=uid, limit=limit, offset=offset
        )
        if sort == "score":
            versions = sorted(
                versions,
                key=lambda v: (v.get("overall_score") is None, -(v.get("overall_score") or 0)),
            )
        return {"versions": versions, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt versions: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt versions error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt versions: {str(e)}"
        )


class VersionScoreRequest(BaseModel):
    overall_score: float
    score_breakdown: Optional[dict] = None


@router.patch("/api/prompt-sessions/{session_id}/versions/{version_number}/score")
async def patch_version_score(
    session_id: str,
    version_number: int,
    request: VersionScoreRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Write or update the quality score for a specific prompt version."""
    if not state.prompt_sessions_api:
        raise HTTPException(status_code=503, detail="Database not available.")

    try:
        uid = get_user_id_from_header(x_user_id)
        with state.prompt_sessions_api.get_db_context() as conn:
            cursor = conn.cursor()
            cursor.execute(f"SET app.current_user_id = '{uid}'")
            cursor.execute(
                """
                UPDATE prompt_versions
                SET overall_score = %s, score_breakdown = %s
                WHERE session_id = %s AND version_number = %s
                RETURNING id, version_number, overall_score, score_breakdown
                """,
                (
                    request.overall_score,
                    json.dumps(request.score_breakdown) if request.score_breakdown else None,
                    session_id,
                    version_number,
                ),
            )
            row = cursor.fetchone()
            conn.commit()
            if not row:
                raise HTTPException(status_code=404, detail="Version not found")
            return {"success": True, "version": dict(row)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating score: {str(e)}")


@router.get("/api/prompt-sessions/{session_id}/versions/{version_number}")
async def get_prompt_version(
    session_id: str,
    version_number: int,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get a specific version of a prompt"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        version = state.prompt_sessions_api.get_version(
            session_id=session_id, version_number=version_number, user_id=uid
        )
        if not version:
            raise HTTPException(status_code=404, detail="Prompt version not found")
        return {"version": version, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt version: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt version error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt version: {str(e)}"
        )


@router.post("/api/prompt-sessions/{session_id}/versions/{version_number}/restore")
async def restore_prompt_version(
    session_id: str,
    version_number: int,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Restore a specific version as the current content"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        version = state.prompt_sessions_api.restore_version(
            session_id=session_id, version_number=version_number, user_id=uid
        )
        return {"version": version, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error restoring prompt version: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Restore prompt version error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error restoring prompt version: {str(e)}"
        )


@router.get("/api/prompt-sessions/{session_id}/context-for-ai")
async def get_prompt_context_for_ai(
    session_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get context for AI query (prompt history, suggestions, conversation)"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        context = state.prompt_sessions_api.get_context_for_ai(session_id, uid)
        return {"context": context, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt context for AI: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt context for AI error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt context for AI: {str(e)}"
        )


@router.post("/api/prompt-sessions/{session_id}/suggestions")
async def create_ai_suggestion(
    session_id: str,
    request: CreateSuggestionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Create an AI suggestion for a prompt session"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        suggestion = state.prompt_sessions_api.create_suggestion(
            session_id=session_id,
            user_id=uid,
            suggestion_type=request.suggestion_type,
            content=request.content,
            context=request.context,
            generated_by_model=request.generated_by_model,
            confidence_score=request.confidence_score,
            relevance_score=request.relevance_score,
            metadata=request.metadata,
        )
        return {"suggestion": suggestion, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error creating AI suggestion: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Create AI suggestion error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error creating AI suggestion: {str(e)}"
        )


class GrantPermissionRequest(BaseModel):
    user_id: str
    role: str  # 'owner' | 'editor' | 'viewer'


class TransferOwnershipRequest(BaseModel):
    new_owner_id: str


@router.get("/api/prompt-sessions/{session_id}/permissions")
async def get_session_permissions(
    session_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """List all contributors on a package (owner-only view)."""
    if not state.prompt_sessions_api:
        raise HTTPException(status_code=503, detail="Database not available")
    uid = get_user_id_from_header(x_user_id)
    conn = state.prompt_sessions_api.get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SET app.current_user_id = %s", (uid,))
        cursor.execute("SELECT user_id FROM prompt_sessions WHERE id = %s", (session_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        if str(row["user_id"]) != uid:
            raise HTTPException(status_code=403, detail="Only the owner can view permissions")
        cursor.execute(
            """
            SELECT user_id, role, granted_by, created_at
            FROM session_permissions WHERE session_id = %s
            ORDER BY created_at ASC
            """,
            (session_id,),
        )
        perms = [dict(r) for r in cursor.fetchall()]
        for p in perms:
            if p.get("created_at"):
                p["created_at"] = p["created_at"].isoformat()
        return {"permissions": perms, "owner_id": str(row["user_id"])}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/api/prompt-sessions/{session_id}/permissions")
async def grant_session_permission(
    session_id: str,
    request: GrantPermissionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Grant a user a contributor role on the package (owner-only)."""
    if request.role not in ("owner", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be owner, editor, or viewer")
    if not state.prompt_sessions_api:
        raise HTTPException(status_code=503, detail="Database not available")
    uid = get_user_id_from_header(x_user_id)
    conn = state.prompt_sessions_api.get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SET app.current_user_id = %s", (uid,))
        cursor.execute("SELECT user_id FROM prompt_sessions WHERE id = %s", (session_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        if str(row["user_id"]) != uid:
            raise HTTPException(status_code=403, detail="Only the owner can grant permissions")
        cursor.execute(
            """
            INSERT INTO session_permissions (session_id, user_id, role, granted_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (session_id, user_id) DO UPDATE SET role = EXCLUDED.role
            RETURNING id
            """,
            (session_id, request.user_id, request.role, uid),
        )
        granted = cursor.fetchone()
        conn.commit()
        return {"success": True, "permission_id": str(granted["id"]) if granted else None,
                "session_id": session_id, "user_id": request.user_id, "role": request.role}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/api/prompt-sessions/{session_id}/permissions/{target_user_id}")
async def revoke_session_permission(
    session_id: str,
    target_user_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Revoke a contributor's role on the package (owner-only; cannot revoke owner)."""
    if not state.prompt_sessions_api:
        raise HTTPException(status_code=503, detail="Database not available")
    uid = get_user_id_from_header(x_user_id)
    conn = state.prompt_sessions_api.get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SET app.current_user_id = %s", (uid,))
        cursor.execute("SELECT user_id FROM prompt_sessions WHERE id = %s", (session_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        if str(row["user_id"]) != uid:
            raise HTTPException(status_code=403, detail="Only the owner can revoke permissions")
        if target_user_id == uid:
            raise HTTPException(status_code=400, detail="Cannot revoke the owner's role — transfer ownership first")
        cursor.execute(
            """
            DELETE FROM session_permissions
            WHERE session_id = %s AND user_id = %s AND role != 'owner'
            RETURNING id
            """,
            (session_id, target_user_id),
        )
        deleted = cursor.fetchone()
        conn.commit()
        if not deleted:
            raise HTTPException(status_code=404, detail="Permission not found")
        return {"success": True, "session_id": session_id, "revoked_user_id": target_user_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/api/prompt-sessions/{session_id}/transfer")
async def transfer_session_ownership(
    session_id: str,
    request: TransferOwnershipRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Transfer package ownership to another user (owner-only). Previous owner keeps 'editor'."""
    if not state.prompt_sessions_api:
        raise HTTPException(status_code=503, detail="Database not available")
    uid = get_user_id_from_header(x_user_id)
    conn = state.prompt_sessions_api.get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SET app.current_user_id = %s", (uid,))
        cursor.execute("SELECT user_id FROM prompt_sessions WHERE id = %s", (session_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        if str(row["user_id"]) != uid:
            raise HTTPException(status_code=403, detail="Only the owner can transfer ownership")
        # New owner takes over the row + gets owner permission
        cursor.execute(
            "UPDATE prompt_sessions SET user_id = %s, updated_at = NOW() WHERE id = %s",
            (request.new_owner_id, session_id),
        )
        cursor.execute(
            """
            INSERT INTO session_permissions (session_id, user_id, role, granted_by)
            VALUES (%s, %s, 'owner', %s)
            ON CONFLICT (session_id, user_id) DO UPDATE SET role = 'owner'
            """,
            (session_id, request.new_owner_id, uid),
        )
        # Previous owner drops to editor
        cursor.execute(
            """
            UPDATE session_permissions SET role = 'editor'
            WHERE session_id = %s AND user_id = %s
            """,
            (session_id, uid),
        )
        conn.commit()
        return {"success": True, "session_id": session_id,
                "previous_owner_id": uid, "new_owner_id": request.new_owner_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/api/prompt-sessions/{session_id}/conversations")
async def get_session_conversations(
    session_id: str,
    tab: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all conversations linked to a prompt session."""
    if not state.conversation_api:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        uid = get_user_id_from_header(x_user_id)
        conversations = state.conversation_api.get_conversations_by_session(session_id, uid)
        return {"conversations": conversations}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/prompt-sessions/{session_id}/suggestions")
async def get_ai_suggestions(
    session_id: str,
    used: Optional[bool] = Query(None),
    suggestion_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get AI suggestions for a prompt session"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        suggestions = state.prompt_sessions_api.get_suggestions(
            session_id=session_id,
            user_id=uid,
            used=used,
            suggestion_type=suggestion_type,
            limit=limit,
            offset=offset,
        )
        return {"suggestions": suggestions, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting AI suggestions: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get AI suggestions error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting AI suggestions: {str(e)}"
        )


@router.post("/api/prompt-sessions/suggestions/{suggestion_id}/use")
async def mark_suggestion_used(
    suggestion_id: str,
    inserted_position: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Mark an AI suggestion as used"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        suggestion = state.prompt_sessions_api.mark_suggestion_used(
            suggestion_id=suggestion_id,
            user_id=uid,
            inserted_position=inserted_position,
        )
        return {"suggestion": suggestion, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error marking suggestion as used: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Mark suggestion used error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error marking suggestion as used: {str(e)}"
        )


@router.get("/api/prompt-sessions/{session_id}/context-entries")
async def get_context_entries(
    session_id: str,
    context_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get context entries for a prompt session"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        entries = state.prompt_sessions_api.get_context_entries(
            session_id=session_id,
            user_id=uid,
            context_type=context_type,
            limit=limit,
            offset=offset,
        )
        return {"entries": entries, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting context entries: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get context entries error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting context entries: {str(e)}"
        )


@router.post("/api/prompt-sessions/{session_id}/context-entries")
async def add_context_entry(
    session_id: str,
    request: AddContextEntryRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Add a context entry for a prompt session"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        entry = state.prompt_sessions_api.add_context_entry(
            session_id=session_id,
            user_id=uid,
            context_type=request.context_type,
            content=request.content,
            source=request.source,
            relevance_score=request.relevance_score,
            metadata=request.metadata,
        )
        return {"entry": entry, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error adding context entry: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Add context entry error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error adding context entry: {str(e)}"
        )


@router.delete("/api/prompt-sessions/context-entries/{context_id}")
async def delete_context_entry(
    context_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Delete a context entry"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = state.prompt_sessions_api.delete_context_entry(context_id, uid)
        if not success:
            raise HTTPException(status_code=404, detail="Context entry not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error deleting context entry: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Delete context entry error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting context entry: {str(e)}"
        )


@router.get("/api/prompt-sessions/stats")
async def get_prompt_session_stats(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get statistics for user's prompt sessions"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        stats = state.prompt_sessions_api.get_session_stats(uid)
        return {"stats": stats, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt session stats: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt session stats error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt session stats: {str(e)}"
        )


@router.get("/api/prompt-sessions/search")
async def search_prompt_sessions(
    query: str = Query(..., min_length=1),
    include_content: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Search prompt sessions by title, description, or content"""
    if not state.prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        sessions = state.prompt_sessions_api.search_sessions(
            user_id=uid,
            query=query,
            include_content=include_content,
            limit=limit,
            offset=offset,
        )
        return {"sessions": sessions, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error searching prompt sessions: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Search prompt sessions error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error searching prompt sessions: {str(e)}"
        )


