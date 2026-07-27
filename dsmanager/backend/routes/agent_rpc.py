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

# ── JSON-RPC 2.0 Agent Integration ─────────────────────────────────────
# Enables AI agents to create projects, fetch data, etc. via standardized RPC calls.

@router.post("/api/agent/rpc")
async def agent_rpc(
    request_body: dict,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    JSON-RPC 2.0 endpoint for agent method calls.
    
    Supported methods:
    - create_project: Create a new project with name and description
    - get_project: Retrieve a project by ID
    - list_projects: Get all projects for the user
    
    Example request:
    {
      "jsonrpc": "2.0",
      "method": "create_project",
      "params": {
        "name": "My Project",
        "description": "Project description"
      },
      "id": "request-123"
    }
    """
    try:
        # Get or validate user ID
        user_id = x_user_id or DEFAULT_USER_ID
        
        # Validate UUID format
        import re
        uuid_regex = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        if not re.match(uuid_regex, user_id, re.IGNORECASE):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid user ID format: {user_id}"
            )
        
        # Initialize RPC handler with projects API
        rpc_handler = AgentRpcHandler(projects_api=state.projects_api)
        
        # Process the RPC request
        response = rpc_handler.handle_request(request_body, user_id)
        
        return response
        
    except ValueError as e:
        print(f"❌ [Agent RPC] Validation error: {str(e)}", file=sys.stderr)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ [Agent RPC] Error: {str(e)}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))


