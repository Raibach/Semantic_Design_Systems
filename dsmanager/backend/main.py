import json
import os
import time
import sys
import traceback
from dotenv import load_dotenv
load_dotenv()
import tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN", ""),
    environment=os.getenv("ENVIRONMENT", "production"),
    traces_sample_rate=0.3,
    enable_tracing=True,
    integrations=[
        StarletteIntegration(transaction_style="url"),
        FastApiIntegration(transaction_style="url"),
    ],
)

from fastapi import FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from grace_gui import (
    evaluate_source,
    load_logs_to_vectorstore,
    query_llm,
    retrieve_memory_context,
    search_news,
    summarize_pdfs,
    milvus_save_version,
    milvus_get_versions,
    milvus_audit_action,
    milvus_store_memory,
)
from conversation_api import ConversationAPI
from projects_api import ProjectsAPI
from grace_memory_api import GraceMemoryAPI
from prompt_sessions_api import PromptSessionsAPI
from tag_extractor import TagExtractor
from agent_rpc_handler import AgentRpcHandler
from figma_service import (
    get_file, get_file_versions, get_component, get_node,
    get_dev_resources, search_file,
)



app = FastAPI(title="Grace AI API", description="Backend API for Grace AI assistant")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Local frontend dev
        "http://localhost:5001",  # Local backend dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    load_logs_to_vectorstore()

    import os as _os
    database_url = _os.getenv("DATABASE_URL")
    if not database_url:
        print("⚠️  DATABASE_URL not found — Database APIs disabled", file=sys.stderr)
        return
    import services
    services.init_services(database_url)


# ── Route modules (extracted during modularization) ─────────────────
from routes import (
    misc, conversations, projects, teacher, memory,
    prompt_sessions, ai, figma, milvus, agent_rpc, files,
)

for _m in (misc, conversations, projects, teacher, memory,
           prompt_sessions, ai, figma, milvus, agent_rpc, files):
    app.include_router(_m.router)


# ── Serve production frontend (SPA) ────────────────────────────────────
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    # DEV PHASE: hard no-cache everywhere — index, hashed assets, API, manifest.
    # Long loads are expected; stale bytes are never acceptable.
    @app.middleware("http")
    async def no_cache_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    # Serve index.html for root and SPA fallback via a catch-all that runs AFTER all API routes.
    # Using a middleware approach: if a non-API GET request would 404, serve index.html instead.
    @app.middleware("http")
    async def spa_fallback(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if response.status_code == 404 and request.method == "GET" and not path.startswith("/api/"):
            index_path = os.path.join(frontend_dist, "index.html")
            if os.path.isfile(index_path):
                return FileResponse(
                    index_path,
                    headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
                )
        return response


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
