from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import os
import json
import sys
import traceback
from datetime import datetime

# Import Milvus functions from grace_gui
from backend.grace_gui import _milvus_save, _milvus_get_versions_json

router = APIRouter()

# MILVUS VECTOR DATABASE ENDPOINTS
# ============================================

@router.get("/api/milvus/info")
async def api_milvus_info():
    """Get Milvus database metadata and collection stats."""
    try:
        from backend.milvus_sqlite import get_db_info
        return get_db_info()
    except Exception as e:
        return {"error": str(e), "exists": False}

@router.get("/api/milvus/collections")
async def api_milvus_collections():
    """List all Milvus collections."""
    try:
        from backend.milvus_sqlite import list_collections, get_collection_stats
        return {
            "collections": list_collections(),
            "stats": get_collection_stats(),
        }
    except Exception as e:
        return {"error": str(e), "collections": []}

@router.get("/api/milvus/vectors/{collection}")
async def api_milvus_vectors(collection: str, limit: int = 50, offset: int = 0):
    """Retrieve vectors from a specific Milvus collection."""
    try:
        from backend.milvus_sqlite import search_vectors
        vectors = search_vectors(collection, limit=limit, offset=offset)
        return {
            "collection": collection,
            "count": len(vectors),
            "vectors": vectors,
        }
    except Exception as e:
        return {"error": str(e), "collection": collection, "vectors": []}


class MilvusSaveRequest(BaseModel):
    prompt_config: str = ""
    output: str = ""
    session_id: str = ""


@router.post("/api/milvus/save")
async def api_milvus_save(request: MilvusSaveRequest):
    """Save prompt configuration + output as a Milvus vector.

    Accepts prompt_config and output separately, assembles them into
    a single workspace context string, then delegates to grace_gui._milvus_save().
    """
    try:
        workspace = (
            "=== PROMPT CONFIGURATION ===\n"
            f"{request.prompt_config}\n\n"
            "=== OUTPUT ===\n"
            f"{request.output}"
        )
        msg = _milvus_save(workspace)
        return {"status": "ok", "message": msg}
    except Exception as e:
        print(f"[Milvus save route] Error: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/api/milvus/versions")
async def api_milvus_versions():
    """Return all saved Milvus workspace versions as JSON."""
    try:
        versions = _milvus_get_versions_json()
        return {"status": "ok", "versions": versions}
    except Exception as e:
        print(f"[Milvus versions route] Error: {e}")
        return {"status": "error", "versions": []}


