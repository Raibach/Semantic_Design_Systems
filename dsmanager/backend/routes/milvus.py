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
# MILVUS VECTOR DATABASE ENDPOINTS
# ============================================

@router.get("/api/milvus/info")
async def api_milvus_info():
    """Get Zilliz Cloud cluster metadata and live collection stats."""
    from milvus_rest import MilvusREST
    rest = MilvusREST()
    collections = rest.list_collections()
    stats = []
    for name in collections:
        try:
            desc = rest.describe_collection(name)
            data = desc.get("data", desc) if isinstance(desc, dict) else {}
            stats.append({
                "name": name,
                "loaded": data.get("load", "unknown"),
                "indexes": [i.get("fieldName") for i in data.get("indexes", [])],
            })
        except Exception as e:
            stats.append({"name": name, "error": str(e)})
    return {
        "exists": True,
        "mode": "zilliz-cloud",
        "collection_count": len(collections),
        "collections": stats,
    }

@router.get("/api/milvus/collections")
async def api_milvus_collections():
    """List all collections in the Zilliz Cloud cluster (live)."""
    from milvus_rest import MilvusREST
    rest = MilvusREST()
    collections = rest.list_collections()
    stats = []
    for name in collections:
        try:
            desc = rest.describe_collection(name)
            data = desc.get("data", desc) if isinstance(desc, dict) else {}
            stats.append({
                "name": name,
                "loaded": data.get("load", "unknown"),
                "fields": [f.get("name") for f in data.get("fields", [])],
            })
        except Exception as e:
            stats.append({"name": name, "error": str(e)})
    return {"collections": collections, "stats": stats}

@router.get("/api/milvus/vectors/{collection}")
async def api_milvus_vectors(collection: str, limit: int = 50, offset: int = 0):
    """Retrieve entities from a specific Zilliz Cloud collection (live query)."""
    from milvus_rest import MilvusREST
    rest = MilvusREST()
    entities = rest.query(collection, limit=limit, offset=offset)
    return {
        "collection": collection,
        "count": len(entities),
        "vectors": entities,
    }


class MilvusSaveRequest(BaseModel):
    prompt_config: str = ""
    output: str = ""
    session_id: str = ""


@router.post("/api/milvus/save")
async def api_milvus_save(request: MilvusSaveRequest):
    """Save prompt configuration + output as a Milvus version snapshot.
    
    Uses the new A2UI schema (prompt_versions collection).
    Returns HTTP 500 on failure so the frontend Debug Panel catches it.
    """
    try:
        workspace = (
            "=== PROMPT CONFIGURATION ===\n"
            f"{request.prompt_config}\n\n"
            "=== OUTPUT ===\n"
            f"{request.output}"
        )
        result = milvus_save_version(
            prompt_id=request.session_id or "unknown",
            content=workspace,
        )
        return {"status": "ok", "version": result}
    except Exception as e:
        print(f"[Milvus save] Error: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/milvus/versions")
async def api_milvus_versions(prompt_id: Optional[str] = None):
    """Return saved Milvus workspace versions, optionally filtered by prompt."""
    try:
        versions = milvus_get_versions(prompt_id)
        return {"status": "ok", "versions": versions}
    except Exception as e:
        print(f"[Milvus versions] Error: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))


