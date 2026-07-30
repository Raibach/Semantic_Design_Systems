"""Auto-extracted route module from main.py — zero behavior change."""
import json
import os
import sentry_sdk
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
# TEACHER MODEL ENDPOINTS
# ============================================


class TeacherQueryRequest(BaseModel):
    question: str
    context: Optional[str] = None
    conversation_id: Optional[str] = None
    project_id: Optional[str] = None
    reasoning: bool = False
    reasoning_style: str = "chain_of_thought"
    include_memory: bool = False
    temperature: float = 0.45
    self_reflection: bool = False
    editorial: Optional[Dict[str, Any]] = None
    mode: str = "chat"
    metadata: Optional[Dict[str, Any]] = None


class EnsureModelRequest(BaseModel):
    model_type: str = "grace"  # "grace" or "karen"


@router.post("/api/teacher/query")
async def api_teacher_query(request: TeacherQueryRequest):
    """Main AI query endpoint — context-aware with conversation persistence"""
    try:
        from grace_gui import query_llm

        query_start = time.time()
        uid = get_user_id_from_header()
        conv_id = request.conversation_id

        # ── Sentry AI monitoring: tag span with conversation + user ──
        sentry_sdk.set_user({"id": uid})
        if conv_id:
            sentry_sdk.set_tag("gen_ai.conversation.id", conv_id)
        sentry_sdk.set_tag("ai.model", "nvidia/nemotron-3-ultra-550b-a55b")
        sentry_sdk.set_tag("ai.mode", request.mode)
        sentry_sdk.set_tag("ai.temperature", str(request.temperature))
        if request.project_id:
            sentry_sdk.set_tag("project.id", request.project_id)
        if request.reasoning:
            sentry_sdk.set_tag("ai.reasoning_style", request.reasoning_style)

        # ── Persistent conversation ──────────────────────────────────
        # Ensure a conversation exists in PostgreSQL (auto-create if needed)
        if state.conversation_api and not conv_id:
            try:
                pid = request.project_id
                title = request.question[:80] if request.question else "New Chat"
                conv_id = state.conversation_api.create_conversation(uid, pid, title)
            except Exception as e:
                print(f"⚠️  Failed to create conversation: {e}")

        # Save user message to PostgreSQL
        if state.conversation_api and conv_id:
            try:
                state.conversation_api.add_message(conv_id, uid, "user", request.question)
            except Exception as e:
                print(f"⚠️  Failed to save user message: {e}")

        # ── Conversation context retrieval ──────────────────────────
        conversation_context = ""
        if state.conversation_api and conv_id:
            try:
                msgs = state.conversation_api.get_messages(conv_id, uid, limit=20)
                if msgs:
                    lines = []
                    for m in msgs:
                        role = "User" if m.get("type") == "question" else "Assistant"
                        lines.append(f"{role}: {m.get('content', '')}")
                    conversation_context = "\n".join(lines)
            except Exception as e:
                print(f"⚠️  Failed to retrieve conversation history: {e}")

        # ── Memory context ──────────────────────────────────────────
        memory_context = ""
        if request.include_memory:
            memory_context = retrieve_memory_context(request.question)

        # ── Full context assembly ───────────────────────────────────
        full_context = request.context or ""
        if conversation_context:
            full_context = (
                "=== CONVERSATION HISTORY ===\n"
                + conversation_context
                + "\n\n=== CURRENT WORKSPACE ===\n"
                + full_context
            )

        # ── Mode detection ──────────────────────────────────────────
        source = (request.metadata or {}).get("source", "")
        prompt_output_sources = {"ResponsivePromptBuilder", "prompt_builder", "PromptBuilder"}
        mode = "prompt_output" if (request.mode == "prompt_output" or source in prompt_output_sources) else "chat"

        # ── Call the LLM ────────────────────────────────────────────
        result = query_llm(
            context=full_context,
            question=request.question,
            reasoning=request.reasoning,
            reasoning_style=request.reasoning_style,
            memory_context=memory_context,
            temperature=request.temperature,
            self_reflection=request.self_reflection,
            editorial=request.editorial,
            mode=mode,
            model="nvidia/nemotron-3-ultra-550b-a55b",
        )

        # ── Audit logging (fire-and-forget) ──────────────────────────
        try:
            if state.conversation_api:
                latency_ms = int((time.time() - query_start) * 1000)
                conn = state.conversation_api.get_db()
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata) VALUES (%s, %s, %s, %s, %s)",
                    (uid, "teacher_query", "conversation", conv_id, json.dumps({
                        "model": "nvidia/nemotron-3-ultra-550b-a55b",
                        "temperature": request.temperature,
                        "mode": mode,
                        "latency_ms": latency_ms,
                        "response_chars": len(result),
                    }))
                )
                conn.commit()
                cursor.close()
                conn.close()
        except Exception as e:
            print(f"⚠️  Audit log write failed (non-blocking): {e}")

        # ── Save assistant response to PostgreSQL ────────────────────
        if state.conversation_api and conv_id:
            try:
                state.conversation_api.add_message(conv_id, uid, "assistant", result)
            except Exception as e:
                print(f"⚠️  Failed to save assistant response: {e}")

        return {"content": result, "error": None, "conversation_id": conv_id}

    except Exception as e:
        import traceback
        error_detail = f"Error processing teacher query: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Teacher query error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")


@router.post("/api/teacher/ensure-model")
async def api_ensure_model(request: EnsureModelRequest):
    """Ensure the specified model server is running (on-demand startup)"""
    try:
        # Import model_server_manager
        from model_server_manager import (
            ensure_grace_server,
            ensure_karen_server,
        )

        success = False
        if request.model_type.lower() == "grace":
            success = ensure_grace_server()
            model_name = "Grace"
        elif request.model_type.lower() == "karen":
            success = ensure_karen_server()
            model_name = "Karen"
        else:
            raise HTTPException(
                status_code=400, detail=f"Unknown model type: {request.model_type}"
            )

        if success:
            return {
                "success": True,
                "message": f"{model_name} model server is running",
                "model_type": request.model_type,
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start {model_name} model server. Check model server logs.",
            )

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_detail = (
            f"Error ensuring model server: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Ensure model error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error ensuring model server: {str(e)}"
        )


# ============================================
# WHISPER TRANSCRIPTION ENDPOINT
# ============================================

# Whisper is optional — only used for the /api/transcribe endpoint.
# If whisper is not installed, the endpoint will return a 501 Not Implemented.

@router.post("/api/transcribe")
async def transcribe_audio(audio_file: UploadFile = File(...)):
    """
    Transcribe audio file using local Whisper model.
    Accepts WAV, MP3, WebM, and other audio formats supported by Whisper.
    """
    raise HTTPException(status_code=501, detail="Whisper not installed on this server")

