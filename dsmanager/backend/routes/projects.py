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
# PROJECTS ENDPOINTS
# ============================================


class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None


class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_archived: Optional[bool] = None


@router.get("/api/projects")
async def get_projects(
    include_archived: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all projects for a user"""
    if not state.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        projects = state.projects_api.get_all_projects(uid, include_archived=include_archived)
        return {"projects": projects}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error loading projects: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Projects API error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error loading projects: {str(e)}")


@router.get("/api/projects/{project_id}")
async def get_project(
    project_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get a specific project by ID"""
    if not state.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        project = state.projects_api.get_project(project_id, uid)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error loading project: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Project API error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error loading project: {str(e)}")


@router.post("/api/projects")
async def create_project(
    request: CreateProjectRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Create a new project"""
    if not state.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        project_id = state.projects_api.create_project(
            uid, name=request.name, description=request.description
        )
        return {"id": project_id, "success": True}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error creating project: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Create project error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error creating project: {str(e)}")


@router.put("/api/projects/{project_id}")
async def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Update a project"""
    if not state.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = state.projects_api.update_project(
            project_id,
            uid,
            name=request.name,
            description=request.description,
            is_archived=request.is_archived,
        )
        if not success:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error updating project: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Update project error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error updating project: {str(e)}")


@router.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Delete a project (soft delete by archiving)"""
    if not state.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = state.projects_api.delete_project(project_id, uid)
        if not success:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error deleting project: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Delete project error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error deleting project: {str(e)}")


