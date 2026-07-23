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
    if not api_core.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        projects = api_core.projects_api.get_all_projects(uid, include_archived=include_archived)
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
    if not api_core.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        project = api_core.projects_api.get_project(project_id, uid)
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
    if not api_core.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        project_id = api_core.projects_api.create_project(
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
    if not api_core.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        success = api_core.projects_api.update_project(
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
    if not api_core.projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = api_core.get_user_id_from_header(x_user_id)
        success = api_core.projects_api.delete_project(project_id, uid)
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


