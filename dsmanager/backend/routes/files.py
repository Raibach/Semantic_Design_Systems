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
# FILE OPERATIONS ENDPOINTS (for DocumentationQueryTool)
# ============================================

class FileReadRequest(BaseModel):
    path: str

class FileWriteRequest(BaseModel):
    path: str
    content: str

@router.get("/api/files/read")
async def read_file(
    path: str = Query(..., description="File path to read"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Read a documentation file - restricted to specific directories"""
    try:
        # Security: Only allow reading from specific directories
        allowed_dirs = [
            "frontend/src/storybook",
            "frontend/src/prompts",
            "phases-markdown",
            ".",  # Root level markdown files
        ]

        # Check if the path is within allowed directories
        is_allowed = False
        for allowed_dir in allowed_dirs:
            full_allowed_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", allowed_dir))
            full_requested_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", path))
            if full_requested_path.startswith(full_allowed_path):
                is_allowed = True
                break

        if not is_allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Path '{path}' is not in allowed directories"
            )

        # Construct the full path
        file_path = os.path.join(os.path.dirname(__file__), "..", path)

        # Check if file exists
        if not os.path.isfile(file_path):
            raise HTTPException(
                status_code=404,
                detail=f"File not found: {path}"
            )

        # Read the file
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        print(f"✅ [File API] Read file: {path} ({len(content)} bytes)")

        return {
            "path": path,
            "content": content,
            "size": len(content),
            "exists": True
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [File API] Error reading file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error reading file: {str(e)}"
        )

@router.post("/api/files/write")
async def write_file(
    request: FileWriteRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Write/update a documentation file - restricted to specific directories"""
    try:
        # Security: Only allow writing to specific directories
        allowed_dirs = [
            "frontend/src/storybook",
            "frontend/src/prompts",
            "phases-markdown",
            ".",  # Root level markdown files (only .md files)
        ]

        # Check if the path is within allowed directories
        is_allowed = False
        for allowed_dir in allowed_dirs:
            full_allowed_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", allowed_dir))
            full_requested_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", request.path))
            if full_requested_path.startswith(full_allowed_path):
                # Additional check: only allow .md, .mdx, and .stories.mdx files
                if request.path.endswith(('.md', '.mdx', '.stories.mdx')):
                    is_allowed = True
                break

        if not is_allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Cannot write to '{request.path}'"
            )

        # Construct the full path
        file_path = os.path.join(os.path.dirname(__file__), "..", request.path)

        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        # Backup existing file if it exists
        backup_path = None
        if os.path.isfile(file_path):
            backup_path = f"{file_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            with open(file_path, 'r', encoding='utf-8') as f:
                backup_content = f.read()
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(backup_content)

        # Write the new content
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(request.content)

        print(f"✅ [File API] Wrote file: {request.path} ({len(request.content)} bytes)")
        if backup_path:
            print(f"   Backup saved to: {os.path.basename(backup_path)}")

        return {
            "path": request.path,
            "success": True,
            "size": len(request.content),
            "backup": os.path.basename(backup_path) if backup_path else None
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ [File API] Error writing file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error writing file: {str(e)}"
        )

@router.get("/api/files/list")
async def list_files(
    directory: str = Query(".", description="Directory to list files from"),
    pattern: str = Query("*.md", description="File pattern to match"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """List documentation files in allowed directories"""
    try:
        import glob

        # Security: Only allow listing from specific directories
        allowed_dirs = [
            "frontend/src/storybook",
            "frontend/src/prompts",
            "phases-markdown",
            ".",  # Root level markdown files
        ]

        files = []
        for allowed_dir in allowed_dirs:
            dir_path = os.path.join(os.path.dirname(__file__), "..", allowed_dir)
            if os.path.isdir(dir_path):
                # Find all matching files
                search_pattern = os.path.join(dir_path, "**", pattern)
                matched_files = glob.glob(search_pattern, recursive=True)

                # Convert to relative paths
                for file_path in matched_files:
                    rel_path = os.path.relpath(file_path, os.path.join(os.path.dirname(__file__), ".."))
                    files.append(rel_path)

        print(f"✅ [File API] Listed {len(files)} files matching '{pattern}'")

        return {
            "files": sorted(files),
            "count": len(files),
            "pattern": pattern
        }

    except Exception as e:
        print(f"❌ [File API] Error listing files: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error listing files: {str(e)}"
        )


