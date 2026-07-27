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

# ============================================
# CONVERSATION ENDPOINTS
# ============================================


class CreateConversationRequest(BaseModel):
    project_id: Optional[str] = None
    title: Optional[str] = None
    metadata: Optional[dict] = None


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    message_count: Optional[int] = None


class AddMessageRequest(BaseModel):
    role: str
    content: str
    metadata: Optional[Dict[str, Any]] = None


@router.get("/api/conversations")
async def get_conversations(
    projectId: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all conversations for a user"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        conversations = api_core.conversation_api.get_all_conversations(
            uid,
            project_id=projectId,  # Use projectId from query param
            include_archived=include_archived,
        )
        return {"conversations": conversations}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error loading conversations: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Conversations API error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error loading conversations: {str(e)}"
        )


@router.get("/api/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get a specific conversation"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        conversation = api_core.conversation_api.get_conversation(conversation_id, uid)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error loading conversation: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Get conversation error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error loading conversation: {str(e)}"
        )


@router.post("/api/conversations")
async def create_conversation(
    request: CreateConversationRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Create a new conversation"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        conversation_id = api_core.conversation_api.create_conversation(
            uid,
            project_id=request.project_id,
            title=request.title,
            metadata=request.metadata,
        )
        return {"id": conversation_id, "success": True}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error creating conversation: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Create conversation error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error creating conversation: {str(e)}"
        )


@router.put("/api/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: UpdateConversationRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Update a conversation"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        success = api_core.conversation_api.update_conversation(
            conversation_id,
            uid,
            title=request.title,
            message_count=request.message_count,
        )
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error saving conversation: {str(e)}"
        )


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Delete a conversation"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        success = api_core.conversation_api.delete_conversation(conversation_id, uid)
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting conversation: {str(e)}"
        )


@router.post("/api/conversations/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    archived: bool = Query(True),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Archive or unarchive a conversation"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        success = api_core.conversation_api.archive_conversation(conversation_id, uid, archived)
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error archiving conversation: {str(e)}"
        )


@router.get("/api/conversations/archived")
async def get_archived_conversations(
    projectId: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get archived conversations"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        conversations = api_core.conversation_api.get_archived_conversations(uid, projectId)
        return {"conversations": conversations}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading archived conversations: {str(e)}"
        )


@router.get("/api/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    limit: Optional[int] = Query(None),
    offset: int = Query(0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get messages for a conversation"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        messages = api_core.conversation_api.get_messages(conversation_id, uid, limit, offset)
        return {"messages": messages}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading messages: {str(e)}")


@router.post("/api/conversations/{conversation_id}/messages")
async def add_message(
    conversation_id: str,
    request: AddMessageRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Add a message to a conversation"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        message_id = api_core.conversation_api.add_message(
            conversation_id, uid, request.role, request.content, request.metadata
        )
        return {"id": message_id, "success": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving message: {str(e)}")


@router.delete("/api/messages/{message_id}")
async def delete_message(
    message_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Delete a message"""
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        success = api_core.conversation_api.delete_message(message_id, uid)
        if not success:
            raise HTTPException(status_code=404, detail="Message not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting message: {str(e)}")


class ConfirmTagRequest(BaseModel):
    confirmed_tags: Optional[List[str]] = None
    detected_entities: Dict[str, Any]


@router.post("/api/conversation/confirm-tag")
async def confirm_tag(
    request: ConfirmTagRequest,
    conversation_id: str = Query(...),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Confirm and store literary tags for a conversation

    Input:
    - conversation_id: Conversation UUID
    - confirmed_tags: Optional list of confirmed tag paths
    - detected_entities: ContextDetector entities (characters, work_focus, literary_elements, topics)

    Returns confirmation with stored tag paths
    """
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)

        # Get conversation to verify ownership and get content
        conversation = api_core.conversation_api.get_conversation(conversation_id, uid)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Get conversation messages for content
        messages = api_core.conversation_api.get_messages(conversation_id, uid, limit=1000)
        conversation_content = "\n".join(
            [
                f"{msg.get('role', 'unknown')}: {msg.get('content', '')}"
                for msg in messages
            ]
        )

        # Get project_id from conversation metadata
        project_id = conversation.get("project_id") or conversation.get(
            "metadata", {}
        ).get("project_id")

        # Get Milvus client and embedder if available
        milvus_client = None
        memory_embedder = None
        try:
            from backend.memory_embedder import get_embedder
            from backend.milvus_client import get_milvus_client

            milvus_client = get_milvus_client()
            if milvus_client:
                milvus_client.connect()
            memory_embedder = get_embedder()
        except Exception as e:
            print(f"⚠️ Milvus/Memory embedder not available: {e}")

        # Store tags using store_literary_tags function
        result = api_core.conversation_api.store_literary_tags(
            conversation_id=conversation_id,
            user_id=uid,
            detected_entities=request.detected_entities,
            conversation_content=conversation_content,
            project_id=project_id,
            milvus_client=milvus_client,
            memory_embedder=memory_embedder,
        )

        return {
            "success": True,
            "tag_paths": result["tag_paths"],
            "tag_ids": result["tag_ids"],
            "milvus_inserted": result["milvus_inserted"],
        }

    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error confirming tags: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Confirm tag error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error confirming tags: {str(e)}")


@router.post("/api/conversation/track-tag-suggestion")
async def track_tag_suggestion(
    conversation_id: str = Query(...),
    suggested_tags: List[str] = Query(...),
    confirmed: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Track Grace's tag suggestions (for analytics and confirmation tracking)

    Input:
    - conversation_id: Conversation UUID
    - suggested_tags: List of suggested tag paths
    - confirmed: Whether user confirmed the suggestion

    Returns suggestion tracking ID
    """
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)

        # Get detected entities if available (optional)
        detected_entities = {}  # Can be enhanced to extract from conversation

        suggestion_id = api_core.conversation_api.track_tag_suggestion(
            conversation_id=conversation_id,
            user_id=uid,
            suggested_tags=suggested_tags,
            detected_entities=detected_entities,
            confirmed=confirmed,
        )

        return {"success": True, "suggestion_id": suggestion_id}

    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error tracking tag suggestion: {str(e)}"
        )


@router.get("/api/conversation/tag-suggestion-stats")
async def get_tag_suggestion_stats(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Get tag suggestion statistics for a user

    Returns:
    - total_suggestions: Total number of tag suggestions
    - confirmed_suggestions: Number of confirmed suggestions
    - confirmation_rate: Rate of confirmation (0.0 to 1.0)
    """
    if not api_core.conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        stats = api_core.conversation_api.get_tag_suggestion_stats(uid)
        return stats
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error getting tag suggestion stats: {str(e)}"
        )


