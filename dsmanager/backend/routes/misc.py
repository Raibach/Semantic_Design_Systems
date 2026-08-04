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


# Models for request/response
class NewsQuery(BaseModel):
    query: str
    reasoning: bool = False
    include_memory: bool = True


class MemoryQuery(BaseModel):
    query: str
    reasoning: bool = True


class SourceEvalRequest(BaseModel):
    url: str
    title: Optional[str] = None
    content: Optional[str] = None

@router.get("/api/health")
async def api_health():
    """Health check — reports honest status. If critical services are down, status reflects it."""
    health_data = {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "checks": {}
    }
    critical_failures = []

    # ── Database check ──
    db_ok = state.prompt_sessions_api is not None
    health_data["checks"]["database"] = "connected" if db_ok else "DISCONNECTED"
    if not db_ok:
        critical_failures.append("database")

    # ── Milvus check (REST first, pymilvus fallback) ──
    milvus_ok = False
    milvus_error = None
    try:
        from milvus_rest import MilvusREST
        rest = MilvusREST()
        milvus_ok = rest.connected()
    except Exception as e:
        milvus_error = f"REST: {str(e)[:80]}"
    
    if not milvus_ok:
        try:
            from memory_embedder import get_embedder
            from milvus_client import get_milvus_client
            from config import get_all_collections
            milvus_client = get_milvus_client()
            embedder = get_embedder()
            if milvus_client and milvus_client.client:
                milvus_ok = True
        except Exception as e:
            if milvus_error:
                milvus_error += f"; pymilvus: {str(e)[:80]}"
            else:
                milvus_error = f"pymilvus: {str(e)[:80]}"
    
    if milvus_error and not milvus_ok:
        health_data["checks"]["milvus"] = milvus_error

    health_data["checks"]["milvus"] = "connected" if milvus_ok else "DISCONNECTED"
    if not milvus_ok:
        critical_failures.append("milvus")

    # ── Z.ai GLM-4.7 check (primary + fallback) ──
    zai_ok = False
    zai_error = None
    zai_fallback_ok = False
    try:
        import os
        from model_server_manager import test_model_connection
        zai_key = os.getenv("ZAI_API_KEY")
        if zai_key:
            result = test_model_connection("zai")
            zai_ok = result.get("status") == "success"
            if not zai_ok:
                zai_error = result.get("message", "unknown error")
        else:
            zai_error = "ZAI_API_KEY not set"
        # Check fallback endpoint
        if os.getenv("ZAI_FALLBACK_API_KEY"):
            fb = test_model_connection("zai_fallback")
            zai_fallback_ok = fb.get("status") == "success"
    except Exception as e:
        zai_error = str(e)[:80]
    health_data["checks"]["zai"] = "connected" if zai_ok else ("fallback" if zai_fallback_ok else "DISCONNECTED")
    if zai_error and not zai_ok:
        health_data["checks"]["zai_detail"] = zai_error
    if not zai_ok and not zai_fallback_ok:
        critical_failures.append("zai")

    # ── Figma: DISABLED ──
    # Was pinging api.figma.com/v1/me on EVERY /api/health call — a live
    # network round-trip on every page load. Figma is not needed for A2UI
    # surface assembly (removed from render-composer on 2026-08-04).
    # Reporting it as "disabled" so the health endpoint stays fast.
    health_data["checks"]["figma"] = "disabled"

    # ── Overall status ──
    if critical_failures:
        health_data["status"] = "degraded"
        health_data["degraded_services"] = critical_failures
        # Also send to Sentry so we know
        try:
            import sentry_sdk
            sentry_sdk.capture_message(
                f"Health check degraded: {', '.join(critical_failures)}",
                level="warning"
            )
        except Exception:
            pass

    return health_data



@router.post("/api/news/search")
async def api_search_news(query: NewsQuery):
    memory = retrieve_memory_context(query.query) if query.include_memory else ""
    result = search_news(query.query, query.reasoning, memory)
    return {"result": result}


@router.post("/api/pdf/summarize")
async def api_summarize_pdfs(
    files: List[UploadFile] = File(...), reasoning: bool = False
):
    # Save uploaded files temporarily
    temp_files = []
    for file in files:
        temp_path = f"/tmp/{file.filename}"
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)
        temp_files.append(temp_path)

    # Process PDFs
    try:
        from types import SimpleNamespace

        wrapped_files = [SimpleNamespace(name=path) for path in temp_files]
    except Exception:

        class _F:  # minimal object with name attr
            def __init__(self, name):
                self.name = name

        wrapped_files = [_F(path) for path in temp_files]
    result = summarize_pdfs(wrapped_files, reasoning)

    # Clean up temp files
    for path in temp_files:
        try:
            os.remove(path)
        except Exception:
            pass

    return {"result": result}


@router.post("/api/memory/recall")
async def api_memory_recall(query: MemoryQuery):
    memory_context = retrieve_memory_context(query.query)
    result = query_llm("", query.query, query.reasoning, "reflexion", memory_context)
    return {"result": result}


@router.get("/api/reasoning/trace")
async def api_reasoning_trace():
    try:
        if not os.path.exists(REASONING_TRACE_PATH):
            return {"latest": None, "all": []}
        with open(REASONING_TRACE_PATH, "r") as f:
            data = json.load(f)
        latest = data[-1] if data else None
        return {"latest": latest, "all": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/source/evaluate")
async def api_source_evaluate(req: SourceEvalRequest):
    try:
        result = evaluate_source(req.url, req.title or "", req.content)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TrainPayload(BaseModel):
    data: Any


@router.post("/api/train")
async def api_train(payload: TrainPayload):
    try:
        os.makedirs("logs", exist_ok=True)
        with open("logs/training_data.jsonl", "a") as f:
            f.write(json.dumps(payload.data) + "\n")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


