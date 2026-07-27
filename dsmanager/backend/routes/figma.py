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
# FIGMA API ENDPOINTS
# ============================================

class FigmaQueryRequest(BaseModel):
    file_key: str
    query: Optional[str] = None
    node_id: Optional[str] = None
    component_id: Optional[str] = None

@router.post("/api/figma/file")
async def api_figma_file(request: FigmaQueryRequest):
    """Get Figma file metadata and structure."""
    try:
        data = get_file(request.file_key)
        return data or {"error": "No data returned"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/figma/versions/{file_key}")
async def api_figma_versions(file_key: str):
    """Get version history for a Figma file."""
    try:
        data = get_file_versions(file_key)
        return data or {"error": "No data returned"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/figma/component/{file_key}/{component_id}")
async def api_figma_component(file_key: str, component_id: str):
    """Get a specific Figma component."""
    try:
        data = get_component(file_key, component_id)
        return data or {"error": "Component not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/figma/node/{file_key}/{node_id:path}")
async def api_figma_node(file_key: str, node_id: str):
    """Get a specific Figma node (frame, component instance, etc.)."""
    try:
        data = get_node(file_key, node_id)
        return data or {"error": "Node not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/figma/dev-resources/{file_key}")
async def api_figma_dev_resources(file_key: str, node_id: str = None):
    """Get dev resources (Code Connect annotations) from a Figma file."""
    try:
        data = get_dev_resources(file_key, node_id)
        return data or {"error": "No dev resources found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/figma/search")
async def api_figma_search(request: FigmaQueryRequest):
    """Search for nodes by name within a Figma file."""
    try:
        data = search_file(request.file_key, request.query or "")
        return data or {"error": "Search returned no results"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/figma/config")
async def api_figma_config():
    """Return non-secret Figma configuration the frontend needs at startup."""
    return {
        "default_file_key": os.getenv("FIGMA_DEFAULT_FILE_KEY", ""),
        "connected": bool(os.getenv("FIGMA_TOKEN", "")),
    }

