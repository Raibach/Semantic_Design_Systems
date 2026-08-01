"""Auto-extracted route module from main.py — zero behavior change."""
import json
import os
import sys
import time
import traceback
from datetime import datetime
from typing import Any, Dict, List, Optional

from config import is_development

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
    get_dev_resources, search_file, extract_node_spec,
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


# ============================================
# FIGMA → LIT CATALOG FEED
# Extracted design specs, cached in PostgreSQL (figma_specs).
# Figma authors the design; the API extracts and caches it; the Lit
# components and A2UI catalog consume it. Cache-first; ?refresh=true
# re-pulls from Figma and re-caches.
# ============================================

def _spec_db():
    import psycopg2
    from psycopg2.extras import RealDictCursor
    return psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=RealDictCursor)


@router.get("/api/figma/spec/{file_key}/{node_id:path}")
async def api_figma_spec(file_key: str, node_id: str, refresh: bool = Query(False)):
    """
    Serve the extracted design spec for a Figma node.

    Cache-first from figma_specs (PostgreSQL). On miss — or with
    refresh=true — pulls the node from the Figma API, extracts the full
    style spec (fills, strokes, effects, fonts, layout, bounds), upserts
    the cache row, and returns the spec.
    """
    node_id = node_id.replace("-", ":")

    # ── Cache read ──
    # DEV MODE: never read the PostgreSQL figma_specs cache.
    # Every request forces a fresh pull from Figma + re-extract.
    # Use ?refresh=true in any mode to force a re-pull.
    if not refresh and not is_development():
        try:
            conn = _spec_db()
            cur = conn.cursor()
            cur.execute(
                "SELECT file_key, node_id, name, spec, synced_at FROM figma_specs "
                "WHERE file_key = %s AND node_id = %s",
                (file_key, node_id),
            )
            row = cur.fetchone()
            cur.close()
            conn.close()
            if row:
                return {
                    "source": "cache",
                    "file_key": row["file_key"],
                    "node_id": row["node_id"],
                    "name": row["name"],
                    "synced_at": str(row["synced_at"]),
                    "spec": row["spec"],
                }
        except Exception as e:
            print(f"⚠️ figma_specs cache read failed (falling through to Figma): {e}")

    # ── Figma fetch + extract ──
    data = get_node(file_key, node_id)
    if not data or "error" in data:
        raise HTTPException(
            status_code=502,
            detail=(data or {}).get("error", "Figma node fetch failed"),
        )
    document = data.get("document")
    if not document:
        raise HTTPException(status_code=404, detail="Node has no document")

    spec = extract_node_spec(document)

    # ── Cache upsert (best-effort — a cache failure never blocks the spec) ──
    try:
        conn = _spec_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO figma_specs (file_key, node_id, name, spec, synced_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (file_key, node_id)
            DO UPDATE SET name = EXCLUDED.name, spec = EXCLUDED.spec, synced_at = NOW()
            """,
            (file_key, node_id, document.get("name"), json.dumps(spec)),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"⚠️ figma_specs cache upsert failed (spec still returned): {e}")

    return {
        "source": "figma",
        "file_key": file_key,
        "node_id": node_id,
        "name": document.get("name"),
        "spec": spec,
    }

