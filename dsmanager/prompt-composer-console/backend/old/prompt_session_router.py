"""Prompt Sessions API router for FastAPI backend."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import asyncpg
import os
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/prompt-sessions", tags=["prompt-sessions"])

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost:5432/railway")

class PromptSessionCreate(BaseModel):
    title: str
    description: Optional[str] = None
    leftColumnContent: Optional[str] = None
    compiledOutput: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class PromptSessionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    leftColumnContent: Optional[str] = None
    compiledOutput: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class PromptSessionResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    leftColumnContent: Optional[str] = None
    compiledOutput: Optional[str] = None
    currentVersion: int = 1
    createdAt: str
    updatedAt: str

async def get_db():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        yield conn
    finally:
        await conn.close()

@router.get("")
async def list_sessions(includeArchived: bool = False):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        rows = await conn.fetch(
            "SELECT id, title, description, left_column_content, compiled_output, current_version, created_at, updated_at FROM prompt_sessions WHERE is_archived = $1 ORDER BY updated_at DESC",
            includeArchived
        )
        return [
            {
                "id": str(r["id"]),
                "title": r["title"],
                "description": r["description"],
                "leftColumnContent": r["left_column_content"],
                "compiledOutput": r["compiled_output"],
                "currentVersion": r["current_version"],
                "createdAt": r["created_at"].isoformat() if r["created_at"] else "",
                "updatedAt": r["updated_at"].isoformat() if r["updated_at"] else "",
            }
            for r in rows
        ]
    finally:
        await conn.close()

@router.post("")
async def create_session(body: PromptSessionCreate):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        session_id = str(uuid.uuid4())
        now = datetime.utcnow()
        await conn.execute(
            """INSERT INTO prompt_sessions (id, title, description, left_column_content, compiled_output, current_version, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, 1, $6, $7)""",
            session_id, body.title, body.description, body.leftColumnContent, body.compiledOutput, now, now
        )
        return {
            "id": session_id,
            "title": body.title,
            "description": body.description,
            "leftColumnContent": body.leftColumnContent,
            "compiledOutput": body.compiledOutput,
            "currentVersion": 1,
            "createdAt": now.isoformat(),
            "updatedAt": now.isoformat(),
        }
    finally:
        await conn.close()

@router.get("/{session_id}")
async def get_session(session_id: str):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        r = await conn.fetchrow(
            "SELECT id, title, description, left_column_content, compiled_output, current_version, created_at, updated_at FROM prompt_sessions WHERE id = $1",
            session_id
        )
        if not r:
            raise HTTPException(status_code=404, detail="Session not found")
        return {
            "id": str(r["id"]),
            "title": r["title"],
            "description": r["description"],
            "leftColumnContent": r["left_column_content"],
            "compiledOutput": r["compiled_output"],
            "currentVersion": r["current_version"],
            "createdAt": r["created_at"].isoformat() if r["created_at"] else "",
            "updatedAt": r["updated_at"].isoformat() if r["updated_at"] else "",
        }
    finally:
        await conn.close()

@router.put("/{session_id}")
async def update_session(session_id: str, body: PromptSessionUpdate):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        now = datetime.utcnow()
        await conn.execute(
            """UPDATE prompt_sessions SET title = COALESCE($2, title), description = COALESCE($3, description),
               left_column_content = COALESCE($4, left_column_content), compiled_output = COALESCE($5, compiled_output),
               updated_at = $6 WHERE id = $1""",
            session_id, body.title, body.description, body.leftColumnContent, body.compiledOutput, now
        )
        r = await conn.fetchrow("SELECT * FROM prompt_sessions WHERE id = $1", session_id)
        if not r:
            raise HTTPException(status_code=404, detail="Session not found")
        return {
            "id": str(r["id"]),
            "title": r["title"],
            "description": r["description"],
            "leftColumnContent": r["left_column_content"],
            "compiledOutput": r["compiled_output"],
            "currentVersion": r["current_version"],
            "createdAt": r["created_at"].isoformat() if r["created_at"] else "",
            "updatedAt": r["updated_at"].isoformat() if r["updated_at"] else "",
        }
    finally:
        await conn.close()
