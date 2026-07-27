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


# ── Role-based access stubs ────────────────────────────────────────────
# NOTE: Role-based access gated via user_is_admin() stub (dev mode allows all)
ADMIN_ROLES = os.getenv("ADMIN_USER_IDS", "").split(",") if os.getenv("ADMIN_USER_IDS") else []
DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "00000000-0000-0000-0000-000000000001")

# Path to the reasoning trace JSON log consumed by /api/reasoning/trace
REASONING_TRACE_PATH = os.getenv(
    "REASONING_TRACE_PATH",
    os.path.join(os.path.dirname(__file__), "logs", "reasoning_trace.json"),
)

# ── A2UI v0.9.1 Trusted Component Catalog ──────────────────────────────
# Zero-trust: every updateComponents payload emitted by this server is
# validated against the catalog BEFORE reaching the client. A component
# that is not in the catalog is a server bug and fails loud (503).
A2UI_CATALOG_ID = "https://raibach.net/a2ui/catalogs/prompt-composer/v0_9_1/catalog.json"
_A2UI_CATALOG_PATH = os.path.join(
    os.path.dirname(__file__), "..", "frontend", "src", "components", "A2UI", "component-catalog.json"
)
a2ui_catalog: Dict[str, Any] = {}
try:
    with open(_A2UI_CATALOG_PATH, "r") as _catalog_file:
        a2ui_catalog = json.load(_catalog_file)
    print(f"✅ A2UI Catalog loaded — {len(a2ui_catalog.get('components', {}))} trusted components")
except Exception as _catalog_error:
    print(
        f"❌ CRITICAL: A2UI component catalog failed to load from {_A2UI_CATALOG_PATH}: {_catalog_error}",
        file=sys.stderr,
    )
    sys.exit(1)


def validate_a2ui_components(components: List[Dict[str, Any]]) -> None:
    """
    Zero-trust validation of an updateComponents payload against the catalog.

    Implements the spec's prompt → generate → validate loop contract (SPECIFICATIONS.md
    §1 — Standard validation error format): any component whose type is not
    registered in the trusted catalog is rejected with VALIDATION_FAILED.
    Raises HTTPException(503) — never passes invalid UI to the client.
    """
    allowed = set(a2ui_catalog.get("components", {}).keys())
    for index, comp in enumerate(components):
        if not comp.get("id"):
            detail = {
                "error": {
                    "code": "VALIDATION_FAILED",
                    "surfaceId": "main",
                    "path": f"/components/{index}/id",
                    "message": "Component is missing the required 'id' field",
                }
            }
            print(f"❌ [A2UI VALIDATION FAILED] {detail}", file=sys.stderr)
            raise HTTPException(status_code=503, detail=detail)
        name = comp.get("component")
        if name not in allowed:
            detail = {
                "error": {
                    "code": "VALIDATION_FAILED",
                    "surfaceId": "main",
                    "path": f"/components/{index}/component",
                    "message": f"Component '{name}' is not in the trusted catalog",
                }
            }
            print(f"❌ [A2UI VALIDATION FAILED] {detail}", file=sys.stderr)
            raise HTTPException(status_code=503, detail=detail)

def user_is_admin(user_id: str) -> bool:
    """Stub: check if user has admin privileges. Replace with DB lookup."""
    if not ADMIN_ROLES:
        return True  # No roles configured — allow all (dev mode)
    return user_id in ADMIN_ROLES

app = FastAPI(title="Grace AI API", description="Backend API for Grace AI assistant")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Local frontend dev
        "http://localhost:5001",  # Local backend dev
    ],
    allow_origin_regex=r"https://.*\.ngrok-free\.dev|https://.*\.trycloudflare\.com|https://prompt-portal-prod\.raibach\.net|https://grace-editor-production\.up\.railway\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services

conversation_api = None
projects_api = None
memory_api = None
tag_extractor = None
prompt_sessions_api = None


@app.on_event("startup")
async def startup_event():
    load_logs_to_vectorstore()

    # Initialize APIs if DATABASE_URL is available
    global \
        conversation_api, \
        projects_api, \
        memory_api, \
        tag_extractor, \
        prompt_sessions_api
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("⚠️  DATABASE_URL not found — Database APIs disabled", file=sys.stderr)
        return

    # ── Conversation API ──────────────────────────────────────────────────
    try:
        conversation_api = ConversationAPI(database_url)
        # Immediate validation — prove it works before claiming success
        _test = conversation_api.get_all_conversations(
            user_id="00000000-0000-0000-0000-000000000000"
        )
        print("✅ Conversation API initialized and verified")
    except Exception as e:
        print(
            "\n❌ CRITICAL: Conversation API failed to initialize during startup!",
            file=sys.stderr,
        )
        print("--- FULL STACK TRACE ---", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print("-------------------------\n", file=sys.stderr)
        sys.exit(1)

    # ── Projects API ──────────────────────────────────────────────────────
    try:
        projects_api = ProjectsAPI(database_url)
        _test = projects_api.get_all_projects(
            user_id="00000000-0000-0000-0000-000000000000"
        )
        print("✅ Projects API initialized and verified")
    except Exception as e:
        print(
            "\n❌ CRITICAL: Projects API failed to initialize during startup!",
            file=sys.stderr,
        )
        print("--- FULL STACK TRACE ---", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print("-------------------------\n", file=sys.stderr)
        sys.exit(1)

    # ── Memory API ────────────────────────────────────────────────────────
    try:
        memory_api = GraceMemoryAPI(database_url)
        _test = memory_api.list_memories(
            user_id="00000000-0000-0000-0000-000000000000", limit=1
        )
        print("✅ Memory API initialized and verified")
    except Exception as e:
        print(
            "\n❌ CRITICAL: Memory API failed to initialize during startup!",
            file=sys.stderr,
        )
        print("--- FULL STACK TRACE ---", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print("-------------------------\n", file=sys.stderr)
        sys.exit(1)

    # ── Prompt Sessions API ───────────────────────────────────────────────
    try:
        prompt_sessions_api = PromptSessionsAPI(database_url)
        # Validate with a real query — this catches lazy connection failures
        _test = prompt_sessions_api.get_sessions(
            user_id="00000000-0000-0000-0000-000000000000", limit=1
        )
        print("✅ Prompt Sessions API initialized and verified")
    except Exception as e:
        print(
            "\n❌ CRITICAL: Prompt Sessions API failed to initialize during startup!",
            file=sys.stderr,
        )
        print("--- FULL STACK TRACE ---", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print("-------------------------\n", file=sys.stderr)
        sys.exit(1)

    # ── Tag extractor (non-critical — lazy init is fine) ──────────────────
    try:
        tag_extractor = None  # Initialized on first use with query_llm
        print("✅ Tag extractor ready (will initialize on first use)")
    except Exception as e:
        print(
            f"⚠️  Failed to initialize Tag Extractor: {e}", file=sys.stderr
        )
        tag_extractor = None


# Helper function to get user_id (placeholder for now)
def get_user_id_from_header(x_user_id: Optional[str] = None) -> str:
    """Get user ID from header or use default placeholder"""
    # NOTE: Auth uses X-User-ID header; falls back to DEFAULT_USER_ID env var
    if x_user_id:
        return x_user_id
    # For now, use a default user ID (will be replaced with real auth)
    return os.getenv("DEFAULT_USER_ID", "00000000-0000-0000-0000-000000000001")


# Models for request/response
class NewsQuery(BaseModel):
    query: str
    reasoning: bool = False
    include_memory: bool = True


class MemoryQuery(BaseModel):
    query: str
    reasoning: bool = True


class SourceEvalRequest(BaseModel):
    url: str
    title: Optional[str] = None
    content: Optional[str] = None


# Endpoints
@app.get("/api/health")
async def api_health():
    """Health check — reports honest status. If critical services are down, status reflects it."""
    health_data = {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "checks": {}
    }
    critical_failures = []

    # ── Database check ──
    db_ok = prompt_sessions_api is not None
    health_data["checks"]["database"] = "connected" if db_ok else "DISCONNECTED"
    if not db_ok:
        critical_failures.append("database")

    # ── Milvus check (REST first, pymilvus fallback) ──
    milvus_ok = False
    milvus_error = None
    try:
        from milvus_rest import MilvusREST
        rest = MilvusREST()
        milvus_ok = rest.connected()
    except Exception as e:
        milvus_error = f"REST: {str(e)[:80]}"
    
    if not milvus_ok:
        try:
            from memory_embedder import get_embedder
            from milvus_client import get_milvus_client
            from config import get_all_collections
            milvus_client = get_milvus_client()
            embedder = get_embedder()
            if milvus_client and milvus_client.client:
                milvus_ok = True
        except Exception as e:
            if milvus_error:
                milvus_error += f"; pymilvus: {str(e)[:80]}"
            else:
                milvus_error = f"pymilvus: {str(e)[:80]}"
    
    if milvus_error and not milvus_ok:
        health_data["checks"]["milvus"] = milvus_error

    health_data["checks"]["milvus"] = "connected" if milvus_ok else "DISCONNECTED"
    if not milvus_ok:
        critical_failures.append("milvus")

    # ── Overall status ──
    if critical_failures:
        health_data["status"] = "degraded"
        health_data["degraded_services"] = critical_failures
        # Also send to Sentry so we know
        try:
            import sentry_sdk
            sentry_sdk.capture_message(
                f"Health check degraded: {', '.join(critical_failures)}",
                level="warning"
            )
        except Exception:
            pass

    return health_data


@app.get("/api/debug/filesystem")
async def debug_filesystem():
    """Temporary debug endpoint to check filesystem structure"""
    from fastapi.responses import HTMLResponse
    result = {
        "version": "v2-test",
        "cwd": os.getcwd(),
        "ls_workspace": [],
        "ls_workspace_frontend": [],
        "frontend_dist_exists": False
    }
    try:
        result["ls_workspace"] = os.listdir("/workspace") if os.path.exists("/workspace") else "NOT FOUND"
    except Exception as e:
        result["ls_workspace_error"] = str(e)
    try:
        result["ls_workspace_frontend"] = os.listdir("/workspace/frontend") if os.path.exists("/workspace/frontend") else "NOT FOUND"
    except Exception as e:
        result["ls_workspace_frontend_error"] = str(e)
    try:
        dist_path = "/workspace/frontend/dist"
        result["frontend_dist_exists"] = os.path.isdir(dist_path)
        if result["frontend_dist_exists"]:
            result["ls_frontend_dist"] = os.listdir(dist_path)
    except Exception as e:
        result["frontend_dist_error"] = str(e)
    return result


@app.get("/test", response_class=HTMLResponse)
async def test_html():
    """Simple test page to verify routing works"""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Test Page</title></head>
    <body>
        <h1>Raibach Design System</h1>
        <p>If you can see this, the server is working!</p>
        <p>Time: """ + datetime.now().isoformat() + """</p>
        <ul>
            <li><a href="/api/health">API Health</a></li>
            <li><a href="/api/debug/filesystem">Filesystem Debug</a></li>
        </ul>
    </body>
    </html>
    """


@app.post("/api/news/search")
async def api_search_news(query: NewsQuery):
    memory = retrieve_memory_context(query.query) if query.include_memory else ""
    result = search_news(query.query, query.reasoning, memory)
    return {"result": result}


@app.post("/api/pdf/summarize")
async def api_summarize_pdfs(
    files: List[UploadFile] = File(...), reasoning: bool = False
):
    # Save uploaded files temporarily
    temp_files = []
    for file in files:
        temp_path = f"/tmp/{file.filename}"
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)
        temp_files.append(temp_path)

    # Process PDFs
    try:
        from types import SimpleNamespace

        wrapped_files = [SimpleNamespace(name=path) for path in temp_files]
    except Exception:

        class _F:  # minimal object with name attr
            def __init__(self, name):
                self.name = name

        wrapped_files = [_F(path) for path in temp_files]
    result = summarize_pdfs(wrapped_files, reasoning)

    # Clean up temp files
    for path in temp_files:
        try:
            os.remove(path)
        except Exception:
            pass

    return {"result": result}


@app.post("/api/memory/recall")
async def api_memory_recall(query: MemoryQuery):
    memory_context = retrieve_memory_context(query.query)
    result = query_llm("", query.query, query.reasoning, "reflexion", memory_context)
    return {"result": result}


@app.get("/api/reasoning/trace")
async def api_reasoning_trace():
    try:
        if not os.path.exists(REASONING_TRACE_PATH):
            return {"latest": None, "all": []}
        with open(REASONING_TRACE_PATH, "r") as f:
            data = json.load(f)
        latest = data[-1] if data else None
        return {"latest": latest, "all": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/source/evaluate")
async def api_source_evaluate(req: SourceEvalRequest):
    try:
        result = evaluate_source(req.url, req.title or "", req.content)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TrainPayload(BaseModel):
    data: Any


@app.post("/api/train")
async def api_train(payload: TrainPayload):
    try:
        os.makedirs("logs", exist_ok=True)
        with open("logs/training_data.jsonl", "a") as f:
            f.write(json.dumps(payload.data) + "\n")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# CONVERSATION ENDPOINTS
# ============================================


class CreateConversationRequest(BaseModel):
    project_id: Optional[str] = None
    title: Optional[str] = None
    metadata: Optional[dict] = None


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    message_count: Optional[int] = None
    project_id: Optional[str] = None


class AddMessageRequest(BaseModel):
    role: str
    content: str
    metadata: Optional[Dict[str, Any]] = None


@app.get("/api/conversations")
async def get_conversations(
    projectId: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all conversations for a user"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        conversations = conversation_api.get_all_conversations(
            uid,
            project_id=projectId,  # Use projectId from query param
            include_archived=include_archived,
        )
        return {"conversations": conversations}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error loading conversations: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Conversations API error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error loading conversations: {str(e)}"
        )


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get a specific conversation"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        conversation = conversation_api.get_conversation(conversation_id, uid)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error loading conversation: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Get conversation error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error loading conversation: {str(e)}"
        )


@app.post("/api/conversations")
async def create_conversation(
    request: CreateConversationRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Create a new conversation"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        conversation_id = conversation_api.create_conversation(
            uid,
            project_id=request.project_id,
            title=request.title,
            metadata=request.metadata,
        )
        return {"id": conversation_id, "success": True}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error creating conversation: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Create conversation error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error creating conversation: {str(e)}"
        )


@app.put("/api/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: str,
    request: UpdateConversationRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Update a conversation"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = conversation_api.update_conversation(
            conversation_id,
            uid,
            title=request.title,
            message_count=request.message_count,
            project_id=request.project_id,
        )
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error saving conversation: {str(e)}"
        )


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Delete a conversation"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = conversation_api.delete_conversation(conversation_id, uid)
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting conversation: {str(e)}"
        )


@app.get("/api/conversations/{conversation_id}/surface-state")
async def get_surface_state(
    conversation_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get the A2UI surface state for a conversation"""
    if not conversation_api:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        uid = get_user_id_from_header(x_user_id)
        conv = conversation_api.get_conversation(conversation_id, uid)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {
            "surfaceState": json.loads(conv.get("surface_state_json"))
            if conv.get("surface_state_json")
            else None,
            "surfaceUpdatedAt": str(conv.get("surface_updated_at"))
            if conv.get("surface_updated_at")
            else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/conversations/{conversation_id}/surface-state")
async def save_surface_state(
    conversation_id: str,
    request: Request,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Save the A2UI surface state for a conversation"""
    if not conversation_api:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        body = await request.json()
        surface_state_json = json.dumps(body.get("surfaceStateJson", body))
        uid = get_user_id_from_header(x_user_id)
        success = conversation_api.update_conversation(
            conversation_id, uid, surface_state_json=surface_state_json
        )
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"success": True, "conversationId": conversation_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/conversations/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    archived: bool = Query(True),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Archive or unarchive a conversation"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = conversation_api.archive_conversation(conversation_id, uid, archived)
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error archiving conversation: {str(e)}"
        )


@app.get("/api/conversations/archived")
async def get_archived_conversations(
    projectId: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get archived conversations"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        conversations = conversation_api.get_archived_conversations(uid, projectId)
        return {"conversations": conversations}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading archived conversations: {str(e)}"
        )


@app.get("/api/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    limit: Optional[int] = Query(None),
    offset: int = Query(0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get messages for a conversation"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        messages = conversation_api.get_messages(conversation_id, uid, limit, offset)
        return {"messages": messages}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading messages: {str(e)}")


@app.post("/api/conversations/{conversation_id}/messages")
async def add_message(
    conversation_id: str,
    request: AddMessageRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Add a message to a conversation"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        message_id = conversation_api.add_message(
            conversation_id, uid, request.role, request.content, request.metadata
        )
        return {"id": message_id, "success": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving message: {str(e)}")


@app.delete("/api/messages/{message_id}")
async def delete_message(
    message_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Delete a message"""
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = conversation_api.delete_message(message_id, uid)
        if not success:
            raise HTTPException(status_code=404, detail="Message not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting message: {str(e)}")


class ConfirmTagRequest(BaseModel):
    confirmed_tags: Optional[List[str]] = None
    detected_entities: Dict[str, Any]


@app.post("/api/conversation/confirm-tag")
async def confirm_tag(
    request: ConfirmTagRequest,
    conversation_id: str = Query(...),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Confirm and store literary tags for a conversation

    Input:
    - conversation_id: Conversation UUID
    - confirmed_tags: Optional list of confirmed tag paths
    - detected_entities: ContextDetector entities (characters, work_focus, literary_elements, topics)

    Returns confirmation with stored tag paths
    """
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)

        # Get conversation to verify ownership and get content
        conversation = conversation_api.get_conversation(conversation_id, uid)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Get conversation messages for content
        messages = conversation_api.get_messages(conversation_id, uid, limit=1000)
        conversation_content = "\n".join(
            [
                f"{msg.get('role', 'unknown')}: {msg.get('content', '')}"
                for msg in messages
            ]
        )

        # Get project_id from conversation metadata
        project_id = conversation.get("project_id") or conversation.get(
            "metadata", {}
        ).get("project_id")

        # Get Milvus client and embedder if available
        milvus_client = None
        memory_embedder = None
        try:
            from memory_embedder import get_embedder
            from milvus_client import get_milvus_client

            milvus_client = get_milvus_client()
            if milvus_client:
                milvus_client.connect()
            memory_embedder = get_embedder()
        except Exception as e:
            print(f"⚠️ Milvus/Memory embedder not available: {e}")

        # Store tags using store_literary_tags function
        result = conversation_api.store_literary_tags(
            conversation_id=conversation_id,
            user_id=uid,
            detected_entities=request.detected_entities,
            conversation_content=conversation_content,
            project_id=project_id,
            milvus_client=milvus_client,
            memory_embedder=memory_embedder,
        )

        return {
            "success": True,
            "tag_paths": result["tag_paths"],
            "tag_ids": result["tag_ids"],
            "milvus_inserted": result["milvus_inserted"],
        }

    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error confirming tags: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Confirm tag error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error confirming tags: {str(e)}")


@app.post("/api/conversation/track-tag-suggestion")
async def track_tag_suggestion(
    conversation_id: str = Query(...),
    suggested_tags: List[str] = Query(...),
    confirmed: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Track Grace's tag suggestions (for analytics and confirmation tracking)

    Input:
    - conversation_id: Conversation UUID
    - suggested_tags: List of suggested tag paths
    - confirmed: Whether user confirmed the suggestion

    Returns suggestion tracking ID
    """
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)

        # Get detected entities if available (optional)
        detected_entities = {}  # Can be enhanced to extract from conversation

        suggestion_id = conversation_api.track_tag_suggestion(
            conversation_id=conversation_id,
            user_id=uid,
            suggested_tags=suggested_tags,
            detected_entities=detected_entities,
            confirmed=confirmed,
        )

        return {"success": True, "suggestion_id": suggestion_id}

    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error tracking tag suggestion: {str(e)}"
        )


@app.get("/api/conversation/tag-suggestion-stats")
async def get_tag_suggestion_stats(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Get tag suggestion statistics for a user

    Returns:
    - total_suggestions: Total number of tag suggestions
    - confirmed_suggestions: Number of confirmed suggestions
    - confirmation_rate: Rate of confirmation (0.0 to 1.0)
    """
    if not conversation_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        stats = conversation_api.get_tag_suggestion_stats(uid)
        return stats
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error getting tag suggestion stats: {str(e)}"
        )


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


@app.get("/api/projects")
async def get_projects(
    include_archived: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all projects for a user"""
    if not projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        projects = projects_api.get_all_projects(uid, include_archived=include_archived)
        return {"projects": projects}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error loading projects: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Projects API error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error loading projects: {str(e)}")


@app.get("/api/projects/{project_id}")
async def get_project(
    project_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get a specific project by ID"""
    if not projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        project = projects_api.get_project(project_id, uid)
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


@app.post("/api/projects")
async def create_project(
    request: CreateProjectRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Create a new project"""
    if not projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        project_id = projects_api.create_project(
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


@app.put("/api/projects/{project_id}")
async def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Update a project"""
    if not projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = projects_api.update_project(
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


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Delete a project (soft delete by archiving)"""
    if not projects_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = projects_api.delete_project(project_id, uid)
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


# ============================================
# TEACHER MODEL ENDPOINTS
# ============================================


class TeacherQueryRequest(BaseModel):
    question: str
    context: Optional[str] = None
    conversation_id: Optional[str] = None
    project_id: Optional[str] = None
    reasoning: bool = False
    reasoning_style: str = "chain_of_thought"
    include_memory: bool = False
    temperature: float = 0.45
    self_reflection: bool = False
    editorial: Optional[Dict[str, Any]] = None
    mode: str = "chat"
    metadata: Optional[Dict[str, Any]] = None


class EnsureModelRequest(BaseModel):
    model_type: str = "grace"  # "grace" or "karen"


@app.post("/api/teacher/query")
async def api_teacher_query(request: TeacherQueryRequest):
    """Main AI query endpoint — context-aware with conversation persistence"""
    try:
        from grace_gui import query_llm

        query_start = time.time()
        uid = get_user_id_from_header()
        conv_id = request.conversation_id

        # ── Sentry AI monitoring: tag span with conversation + user ──
        sentry_sdk.set_user({"id": uid})
        if conv_id:
            sentry_sdk.set_tag("gen_ai.conversation.id", conv_id)
        sentry_sdk.set_tag("ai.model", "llama-3.1-8b-instruct")
        sentry_sdk.set_tag("ai.mode", request.mode)
        sentry_sdk.set_tag("ai.temperature", str(request.temperature))
        if request.project_id:
            sentry_sdk.set_tag("project.id", request.project_id)
        if request.reasoning:
            sentry_sdk.set_tag("ai.reasoning_style", request.reasoning_style)

        # ── Persistent conversation ──────────────────────────────────
        # Ensure a conversation exists in PostgreSQL (auto-create if needed)
        if conversation_api and not conv_id:
            try:
                pid = request.project_id
                title = request.question[:80] if request.question else "New Chat"
                conv_id = conversation_api.create_conversation(uid, pid, title)
            except Exception as e:
                print(f"⚠️  Failed to create conversation: {e}")

        # Save user message to PostgreSQL
        if conversation_api and conv_id:
            try:
                conversation_api.add_message(conv_id, uid, "user", request.question)
            except Exception as e:
                print(f"⚠️  Failed to save user message: {e}")

        # ── Conversation context retrieval ──────────────────────────
        conversation_context = ""
        if conversation_api and conv_id:
            try:
                msgs = conversation_api.get_messages(conv_id, uid, limit=20)
                if msgs:
                    lines = []
                    for m in msgs:
                        role = "User" if m.get("type") == "question" else "Assistant"
                        lines.append(f"{role}: {m.get('content', '')}")
                    conversation_context = "\n".join(lines)
            except Exception as e:
                print(f"⚠️  Failed to retrieve conversation history: {e}")

        # ── Memory context ──────────────────────────────────────────
        memory_context = ""
        if request.include_memory:
            memory_context = retrieve_memory_context(request.question)

        # ── Full context assembly ───────────────────────────────────
        full_context = request.context or ""
        if conversation_context:
            full_context = (
                "=== CONVERSATION HISTORY ===\n"
                + conversation_context
                + "\n\n=== CURRENT WORKSPACE ===\n"
                + full_context
            )

        # ── Mode detection ──────────────────────────────────────────
        source = (request.metadata or {}).get("source", "")
        prompt_output_sources = {"ResponsivePromptBuilder", "prompt_builder", "PromptBuilder"}
        mode = "prompt_output" if (request.mode == "prompt_output" or source in prompt_output_sources) else "chat"

        # ── Call the LLM ────────────────────────────────────────────
        result = query_llm(
            context=full_context,
            question=request.question,
            reasoning=request.reasoning,
            reasoning_style=request.reasoning_style,
            memory_context=memory_context,
            temperature=request.temperature,
            self_reflection=request.self_reflection,
            editorial=request.editorial,
            mode=mode,
            model="deepseek-chat",
        )

        # ── Audit logging (fire-and-forget) ──────────────────────────
        try:
            if conversation_api:
                latency_ms = int((time.time() - query_start) * 1000)
                conn = conversation_api.get_db()
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata) VALUES (%s, %s, %s, %s, %s)",
                    (uid, "teacher_query", "conversation", conv_id, json.dumps({
                        "model": "meta/llama-3.1-8b-instruct",
                        "temperature": request.temperature,
                        "mode": mode,
                        "latency_ms": latency_ms,
                        "response_chars": len(result),
                    }))
                )
                conn.commit()
                cursor.close()
                conn.close()
        except Exception as e:
            print(f"⚠️  Audit log write failed (non-blocking): {e}")

        # ── Save assistant response to PostgreSQL ────────────────────
        if conversation_api and conv_id:
            try:
                conversation_api.add_message(conv_id, uid, "assistant", result)
            except Exception as e:
                print(f"⚠️  Failed to save assistant response: {e}")

        return {"content": result, "error": None, "conversation_id": conv_id}

    except Exception as e:
        import traceback
        error_detail = f"Error processing teacher query: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Teacher query error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error processing query: {str(e)}")


@app.post("/api/teacher/ensure-model")
async def api_ensure_model(request: EnsureModelRequest):
    """Ensure the specified model server is running (on-demand startup)"""
    try:
        # Import model_server_manager
        from model_server_manager import (
            ensure_grace_server,
            ensure_karen_server,
        )

        success = False
        if request.model_type.lower() == "grace":
            success = ensure_grace_server()
            model_name = "Grace"
        elif request.model_type.lower() == "karen":
            success = ensure_karen_server()
            model_name = "Karen"
        else:
            raise HTTPException(
                status_code=400, detail=f"Unknown model type: {request.model_type}"
            )

        if success:
            return {
                "success": True,
                "message": f"{model_name} model server is running",
                "model_type": request.model_type,
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start {model_name} model server. Check model server logs.",
            )

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_detail = (
            f"Error ensuring model server: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Ensure model error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error ensuring model server: {str(e)}"
        )


# ============================================
# WHISPER TRANSCRIPTION ENDPOINT
# ============================================

# Whisper is optional — only used for the /api/transcribe endpoint.
# If whisper is not installed, the endpoint will return a 501 Not Implemented.

@app.post("/api/transcribe")
async def transcribe_audio(audio_file: UploadFile = File(...)):
    """
    Transcribe audio file using local Whisper model.
    Accepts WAV, MP3, WebM, and other audio formats supported by Whisper.
    """
    raise HTTPException(status_code=501, detail="Whisper not installed on this server")


# ============================================
# MEMORY STORAGE ENDPOINTS
# ============================================


class StoreDictationRequest(BaseModel):
    user_id: str
    content: str
    project_id: Optional[str] = None
    title: Optional[str] = None
    memory_id: Optional[str] = (
        None  # If provided, update existing memory instead of creating new
    )


@app.post("/api/memory/store-dictation")
async def store_dictation_memory(
    request: StoreDictationRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Store dictation content in memory system with historical context tags.
    Content is embedded and stored in Milvus for semantic search.
    """
    if not memory_api:
        raise HTTPException(
            status_code=503,
            detail="Memory API not available. Please check your database connection.",
        )

    try:
        user_id = get_user_id_from_header(x_user_id) or request.user_id

        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        if not request.content or not request.content.strip():
            raise HTTPException(status_code=400, detail="Content cannot be empty")

        print(f"📝 Storing dictation content: {len(request.content)} characters")

        # Extract historical context tags using TagExtractor
        historical_tags = {"periods": [], "movements": [], "events": []}

        try:
            # Initialize tag extractor with query_llm function
            global tag_extractor
            if tag_extractor is None:
                # Import query_llm from grace_gui (already imported at top)
                from grace_gui import query_llm

                tag_extractor = TagExtractor(query_llm)

            # Extract historical context
            historical_tags = tag_extractor.extract_historical_context_tags(
                request.content
            )
            print(f"🏛️  Extracted historical context: {historical_tags}")
        except Exception as tag_error:
            print(f"⚠️  Failed to extract historical tags (non-blocking): {tag_error}")
            # Continue without tags - don't fail the storage

        # Prepare source metadata with historical context
        # Note: Both 'historical_context' dict and direct fields for compatibility
        source_metadata = {
            "project_id": request.project_id,
            "source": "editor_content",  # Changed from 'dictation' to be more general
            "input_method": "editor",  # Can be dictation, paste, or typing
            "historical_context": historical_tags,  # Nested structure
            "periods": historical_tags.get(
                "periods", []
            ),  # Direct fields for easy access
            "movements": historical_tags.get("movements", []),
            "events": historical_tags.get("events", []),
            "stored_at": datetime.now().isoformat(),
        }

        # Store or update in memory system
        if request.memory_id:
            # Update existing memory
            print(f"📝 Updating existing memory: {request.memory_id}")
            memory_id = memory_api.update_memory(
                memory_id=request.memory_id,
                user_id=user_id,
                content=request.content,
                title=request.title
                or f"Dictation - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                source_metadata=source_metadata,
                generate_embedding=True,  # Regenerate embeddings for updated content
            )
            print(f"✅ Memory updated: {memory_id}")
        else:
            # Determine if embedding should be generated based on rules
            try:
                from config.embedding_rules import should_embed_automatically

                generate_embedding = should_embed_automatically(
                    content_type="text",
                    source_type="dictation",
                    metadata=source_metadata,
                    content_length=len(request.content),
                    project_id=request.project_id,
                    quarantine_status="safe",
                )
            except Exception as rule_error:
                # If rules fail, default to True for dictation (user-initiated save)
                print(f"⚠️  Failed to check embedding rules: {rule_error}")
                generate_embedding = True  # User explicitly saved - embed by default

            # Create new memory
            memory_id = memory_api.create_memory(
                user_id=user_id,
                content=request.content,
                content_type="text",
                source_type="dictation",
                title=request.title
                or f"Dictation - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                source_metadata=source_metadata,
                quarantine_score=0.9,  # Dictation is generally safe
                quarantine_status="safe",
                generate_embedding=generate_embedding,  # Use embedding rules to determine
            )
            print(f"✅ Dictation stored in memory: {memory_id}")

        return {
            "memory_id": memory_id,
            "success": True,
            "historical_context": historical_tags,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_detail = (
            f"Error storing dictation memory: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Store dictation error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error storing dictation memory: {str(e)}"
        )


class UpdateMemoryRequest(BaseModel):
    title: Optional[str] = None
    project_id: Optional[str] = None
    pattern_summary: Optional[str] = None


@app.put("/api/memory/{memory_id}")
async def update_memory(
    memory_id: str,
    request: UpdateMemoryRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Update a memory's title, project, or summary.
    """
    if not memory_api:
        raise HTTPException(
            status_code=503,
            detail="Memory API not available. Please check your database connection.",
        )

    try:
        user_id = get_user_id_from_header(x_user_id) or "default-user"

        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        # Get existing memory to update
        conn = memory_api.get_db()
        cursor = conn.cursor()
        memory_api.set_user_context(cursor, user_id)

        # Check if memory exists and belongs to user
        cursor.execute(
            """
            SELECT id, source_metadata FROM user_memories
            WHERE id = %s AND user_id = %s
        """,
            (memory_id, user_id),
        )

        existing = cursor.fetchone()
        if not existing:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Memory not found")

        # Update source_metadata with new project_id if provided
        source_metadata = existing.get("source_metadata") or {}
        if isinstance(source_metadata, str):
            import json

            source_metadata = json.loads(source_metadata)

        if request.project_id:
            source_metadata["project_id"] = request.project_id

        # Update memory
        update_fields = []
        update_values = []

        if request.title is not None:
            update_fields.append("title = %s")
            update_values.append(request.title)

        if request.project_id is not None:
            update_fields.append("project_id = %s")
            update_values.append(request.project_id)

        if request.pattern_summary is not None:
            # Store pattern_summary in source_metadata
            source_metadata["pattern_summary"] = request.pattern_summary

        if source_metadata:
            update_fields.append("source_metadata = %s")
            update_values.append(json.dumps(source_metadata))

        update_fields.append("updated_at = NOW()")

        if not update_fields:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="No fields to update")

        update_values.extend([memory_id, user_id])

        cursor.execute(
            f"""
            UPDATE user_memories
            SET {", ".join(update_fields)}
            WHERE id = %s AND user_id = %s
            RETURNING id
        """,
            update_values,
        )

        updated = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        if not updated:
            raise HTTPException(status_code=404, detail="Memory not found")

        print(f"✅ Memory updated: {memory_id}")
        return {"memory_id": memory_id, "success": True}

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_detail = f"Error updating memory: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Update memory error: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error updating memory: {str(e)}")


@app.delete("/api/memory/{memory_id}")
async def delete_memory(
    memory_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """
    Delete a memory.
    """
    if not memory_api:
        raise HTTPException(
            status_code=503,
            detail="Memory API not available. Please check your database connection.",
        )

    conn = None
    cursor = None
    try:
        user_id = get_user_id_from_header(x_user_id) or "default-user"

        print(
            f"🗑️ [DELETE MEMORY] Attempting to delete memory_id={memory_id}, user_id={user_id}"
        )

        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")

        # Validate memory_id format (should be UUID)
        try:
            import uuid

            uuid.UUID(memory_id)  # Validate UUID format
        except ValueError as ve:
            print(f"❌ [DELETE MEMORY] Invalid UUID format: {memory_id}, error: {ve}")
            raise HTTPException(
                status_code=400, detail=f"Invalid memory ID format: {memory_id}"
            )

        # Delete memory
        print(f"🗑️ [DELETE MEMORY] Getting database connection...")
        conn = memory_api.get_db()
        if not conn:
            raise HTTPException(
                status_code=503, detail="Failed to get database connection"
            )

        cursor = None
        try:
            # Use RealDictCursor to match memory_api pattern (it uses dict access like cursor.fetchone()['id'])
            from psycopg2.extras import RealDictCursor

            cursor = conn.cursor(cursor_factory=RealDictCursor)
            memory_api.set_user_context(cursor, user_id)
            print(
                f"🗑️ [DELETE MEMORY] Database connection established, checking if memory exists..."
            )

            # First check if memory exists and belongs to user
            cursor.execute(
                """
                SELECT id FROM user_memories
                WHERE id = %s AND user_id = %s
            """,
                (memory_id, user_id),
            )

            existing = cursor.fetchone()
            if not existing:
                print(
                    f"❌ [DELETE MEMORY] Memory not found: memory_id={memory_id}, user_id={user_id}"
                )
                cursor.close()
                conn.close()
                raise HTTPException(status_code=404, detail="Memory not found")

            print(f"✅ [DELETE MEMORY] Memory found, proceeding with deletion...")

            # Delete memory from database
            # Note: Foreign key constraints with ON DELETE CASCADE will handle related records
            cursor.execute(
                """
                DELETE FROM user_memories
                WHERE id = %s AND user_id = %s
                RETURNING id
            """,
                (memory_id, user_id),
            )

            deleted = cursor.fetchone()
            cursor.close()  # Close cursor before commit

            if not deleted:
                print(
                    f"❌ [DELETE MEMORY] Deletion returned no rows: memory_id={memory_id}, user_id={user_id}"
                )
                conn.rollback()
                conn.close()
                raise HTTPException(
                    status_code=404, detail="Memory not found or already deleted"
                )

            # Commit the deletion
            print(f"✅ [DELETE MEMORY] Deletion successful, committing transaction...")
            conn.commit()
            print(f"✅ [DELETE MEMORY] Transaction committed successfully")

        except HTTPException:
            # Re-raise HTTP exceptions (they're already properly formatted)
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
                try:
                    conn.close()
                except:
                    pass
            raise
        except Exception as db_error:
            # Catch any database errors
            if conn:
                try:
                    conn.rollback()
                except:
                    pass
            import traceback

            error_trace = traceback.format_exc()
            error_msg = str(db_error)
            print(f"❌ [DELETE MEMORY] Database error: {error_msg}")
            print(f"❌ [DELETE MEMORY] Traceback: {error_trace}")
            # Return more specific error message to help debug
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete memory: {error_msg}. Check backend logs for details.",
            )
        finally:
            # Ensure cursor is closed
            if cursor:
                try:
                    cursor.close()
                except:
                    pass
            # Connection will be returned to pool by close()
            if conn:
                try:
                    conn.close()
                except:
                    pass

        # Try to delete embeddings from Milvus (non-blocking)
        # This happens AFTER database deletion is committed, so it won't affect the main operation
        try:
            from milvus_client import get_milvus_client

            milvus_client = get_milvus_client()
            if (
                milvus_client
                and hasattr(milvus_client, "client")
                and milvus_client.client
            ):
                # Delete from all possible collections using memory_id filter
                collections = [
                    "grace_memory_character",
                    "grace_memory_plot",
                    "grace_memory_general",
                ]
                for collection_name in collections:
                    try:
                        # Use the wrapper method which handles errors better
                        milvus_client.delete_by_filter(
                            collection_name=collection_name,
                            filter_expr=f'memory_id == "{memory_id}"',
                        )
                        print(
                            f"✅ Deleted embeddings from Milvus collection {collection_name} for memory {memory_id}"
                        )
                    except Exception as milvus_error:
                        # Non-blocking - log but don't fail
                        print(
                            f"⚠️ Failed to delete from Milvus collection {collection_name}: {milvus_error}"
                        )
        except Exception as milvus_error:
            # Non-blocking - log but don't fail the deletion
            print(f"⚠️ Milvus cleanup failed (non-blocking): {milvus_error}")

        print(f"✅ Memory deleted: {memory_id}")
        return {"memory_id": memory_id, "success": True}

    except HTTPException:
        # HTTP exceptions are already properly formatted - re-raise them
        if conn:
            try:
                conn.rollback()
            except:
                pass
        raise
    except Exception as e:
        import traceback

        error_detail = f"Error deleting memory: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ [DELETE MEMORY] Unexpected error: {error_detail}")
        if conn:
            try:
                conn.rollback()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Error deleting memory: {str(e)}")
    finally:
        # Connection will be returned to pool automatically when close() is called
        # Only close if it wasn't already closed in the inner finally block
        if conn:
            try:
                # Check if connection is still open before closing
                if not conn.closed:
                    conn.close()
            except:
                pass


# ============================================
# PROMPT SESSIONS ENDPOINTS
# ============================================


class CreatePromptSessionRequest(BaseModel):
    title: str = "Untitled Prompt Session"
    description: Optional[str] = None


class UpdatePromptSessionRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    left_column_content: Optional[str] = None
    compiled_output: Optional[str] = None
    conversation_id: Optional[str] = None
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None
    category: Optional[str] = None


class SavePromptVersionRequest(BaseModel):
    left_column_content: str
    compiled_output: Optional[str] = None
    change_description: Optional[str] = None
    change_type: str = "manual"


class CreateSuggestionRequest(BaseModel):
    suggestion_type: str
    content: str
    context: Optional[str] = None
    generated_by_model: Optional[str] = None
    confidence_score: float = 1.0
    relevance_score: float = 1.0
    metadata: Optional[Dict[str, Any]] = None


class AddContextEntryRequest(BaseModel):
    context_type: str
    content: str
    source: Optional[str] = None
    relevance_score: float = 1.0
    metadata: Optional[Dict[str, Any]] = None

@app.get("/api/prompts")
async def get_prompts(
    include_archived: bool = Query(False),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all prompt sessions formatted as prompts list (for ConsolePage)"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        sessions = prompt_sessions_api.get_sessions(
            user_id=uid, include_archived=include_archived, limit=limit, offset=offset
        )
        # Transform to format ConsolePage expects: { prompts: [...] }
        prompts = [
            {
                "id": s.get("id"),
                "title": s.get("title", "Untitled Agent"),
                "category": s.get("category", ""),
                "metadata": {
                    "author": (s.get("metadata") or {}).get("author", "You"),
                    "score": (s.get("metadata") or {}).get("score"),
                },
                "message_count": s.get("version_count", 1),
                "is_archived": s.get("is_archived", False),
                "updated_at": s.get("updated_at"),
                "created_at": s.get("created_at"),
            }
            for s in sessions
        ]
        return {"prompts": prompts, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompts: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompts error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompts: {str(e)}"
        )


@app.get("/api/debug-api-state")
async def debug_api_state():
    """Debug endpoint: check global variable states"""
    import traceback
    return {
        "conversation_api": repr(conversation_api),
        "projects_api": repr(projects_api),
        "memory_api": repr(memory_api),
        "prompt_sessions_api": repr(prompt_sessions_api),
        "prompt_sessions_api_is_none": prompt_sessions_api is None,
        "prompt_sessions_api_bool": bool(prompt_sessions_api) if prompt_sessions_api is not None else "IS_NONE",
        "prompt_sessions_api_type": str(type(prompt_sessions_api)) if prompt_sessions_api is not None else "IS_NONE",
        "module_id": id(prompt_sessions_api),
    }


@app.get("/api/prompt-sessions")
async def get_prompt_sessions(
    include_archived: bool = Query(False),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all prompt sessions for a user"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        sessions = prompt_sessions_api.get_sessions(
            user_id=uid, include_archived=include_archived, limit=limit, offset=offset
        )
        return {"sessions": sessions, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt sessions: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt sessions error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt sessions: {str(e)}"
        )


@app.get("/api/prompt-sessions/{session_id}")
async def get_prompt_session(
    session_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get a specific prompt session by ID"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        session = prompt_sessions_api.get_session(session_id, uid)
        if not session:
            raise HTTPException(status_code=404, detail="Prompt session not found")
        return {"session": session, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt session: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt session error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt session: {str(e)}"
        )


@app.post("/api/prompt-sessions")
async def create_prompt_session(
    request: CreatePromptSessionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Create a new prompt session"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        session = prompt_sessions_api.create_session(
            user_id=uid, title=request.title, description=request.description
        )
        return {"session": session, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error creating prompt session: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Create prompt session error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error creating prompt session: {str(e)}"
        )


@app.put("/api/prompt-sessions/{session_id}")
async def update_prompt_session(
    session_id: str,
    request: UpdatePromptSessionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Update a prompt session"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        session = prompt_sessions_api.update_session(
            session_id=session_id,
            user_id=uid,
            title=request.title,
            description=request.description,
            left_column_content=request.left_column_content,
            compiled_output=request.compiled_output,
            conversation_id=request.conversation_id,
            is_active=request.is_active,
            is_archived=request.is_archived,
            metadata=request.metadata,
            category=request.category,
        )
        return {"session": session, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error updating prompt session: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Update prompt session error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error updating prompt session: {str(e)}"
        )


@app.delete("/api/prompt-sessions/{session_id}")
async def delete_prompt_session(
    session_id: str,
    permanent: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Delete a prompt session (soft delete by archiving or permanent)"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = prompt_sessions_api.delete_session(
            session_id=session_id, user_id=uid, permanent=permanent
        )
        if not success:
            raise HTTPException(status_code=404, detail="Prompt session not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error deleting prompt session: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Delete prompt session error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting prompt session: {str(e)}"
        )


@app.post("/api/prompt-sessions/{session_id}/versions")
async def save_prompt_version(
    session_id: str,
    request: SavePromptVersionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Save a new version of a prompt"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        version = prompt_sessions_api.save_version(
            session_id=session_id,
            user_id=uid,
            left_column_content=request.left_column_content,
            compiled_output=request.compiled_output,
            change_description=request.change_description,
            change_type=request.change_type,
        )
        return {"version": version, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error saving prompt version: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Save prompt version error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error saving prompt version: {str(e)}"
        )


@app.get("/api/prompt-sessions/{session_id}/versions")
async def get_prompt_versions(
    session_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort: str = Query("version", regex="^(version|score)$"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all versions for a prompt session.

    sort=version (default): newest version first.
    sort=score: highest overall_score first (nulls last).
    """
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        versions = prompt_sessions_api.get_versions(
            session_id=session_id, user_id=uid, limit=limit, offset=offset
        )
        if sort == "score":
            versions = sorted(
                versions,
                key=lambda v: (v.get("overall_score") is None, -(v.get("overall_score") or 0)),
            )
        return {"versions": versions, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt versions: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt versions error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt versions: {str(e)}"
        )


class VersionScoreRequest(BaseModel):
    overall_score: float
    score_breakdown: Optional[dict] = None


@app.patch("/api/prompt-sessions/{session_id}/versions/{version_number}/score")
async def patch_version_score(
    session_id: str,
    version_number: int,
    request: VersionScoreRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Write or update the quality score for a specific prompt version."""
    if not prompt_sessions_api:
        raise HTTPException(status_code=503, detail="Database not available.")

    try:
        uid = get_user_id_from_header(x_user_id)
        with prompt_sessions_api.get_db_context() as conn:
            cursor = conn.cursor()
            cursor.execute(f"SET app.current_user_id = '{uid}'")
            cursor.execute(
                """
                UPDATE prompt_versions
                SET overall_score = %s, score_breakdown = %s
                WHERE session_id = %s AND version_number = %s
                RETURNING id, version_number, overall_score, score_breakdown
                """,
                (
                    request.overall_score,
                    json.dumps(request.score_breakdown) if request.score_breakdown else None,
                    session_id,
                    version_number,
                ),
            )
            row = cursor.fetchone()
            conn.commit()
            if not row:
                raise HTTPException(status_code=404, detail="Version not found")
            return {"success": True, "version": dict(row)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating score: {str(e)}")


@app.get("/api/prompt-sessions/{session_id}/versions/{version_number}")
async def get_prompt_version(
    session_id: str,
    version_number: int,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get a specific version of a prompt"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        version = prompt_sessions_api.get_version(
            session_id=session_id, version_number=version_number, user_id=uid
        )
        if not version:
            raise HTTPException(status_code=404, detail="Prompt version not found")
        return {"version": version, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt version: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt version error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt version: {str(e)}"
        )


@app.post("/api/prompt-sessions/{session_id}/versions/{version_number}/restore")
async def restore_prompt_version(
    session_id: str,
    version_number: int,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Restore a specific version as the current content"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        version = prompt_sessions_api.restore_version(
            session_id=session_id, version_number=version_number, user_id=uid
        )
        return {"version": version, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error restoring prompt version: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Restore prompt version error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error restoring prompt version: {str(e)}"
        )


@app.get("/api/prompt-sessions/{session_id}/context-for-ai")
async def get_prompt_context_for_ai(
    session_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Get context for AI query (prompt history, suggestions, conversation)"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        context = prompt_sessions_api.get_context_for_ai(session_id, uid)
        return {"context": context, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt context for AI: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt context for AI error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt context for AI: {str(e)}"
        )


@app.post("/api/prompt-sessions/{session_id}/suggestions")
async def create_ai_suggestion(
    session_id: str,
    request: CreateSuggestionRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Create an AI suggestion for a prompt session"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        suggestion = prompt_sessions_api.create_suggestion(
            session_id=session_id,
            user_id=uid,
            suggestion_type=request.suggestion_type,
            content=request.content,
            context=request.context,
            generated_by_model=request.generated_by_model,
            confidence_score=request.confidence_score,
            relevance_score=request.relevance_score,
            metadata=request.metadata,
        )
        return {"suggestion": suggestion, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error creating AI suggestion: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Create AI suggestion error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error creating AI suggestion: {str(e)}"
        )


@app.get("/api/prompt-sessions/{session_id}/conversations")
async def get_session_conversations(
    session_id: str,
    tab: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get all conversations linked to a prompt session."""
    if not conversation_api:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        uid = get_user_id_from_header(x_user_id)
        conversations = conversation_api.get_conversations_by_session(session_id, uid)
        return {"conversations": conversations}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/prompt-sessions/{session_id}/suggestions")
async def get_ai_suggestions(
    session_id: str,
    used: Optional[bool] = Query(None),
    suggestion_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get AI suggestions for a prompt session"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        suggestions = prompt_sessions_api.get_suggestions(
            session_id=session_id,
            user_id=uid,
            used=used,
            suggestion_type=suggestion_type,
            limit=limit,
            offset=offset,
        )
        return {"suggestions": suggestions, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting AI suggestions: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get AI suggestions error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting AI suggestions: {str(e)}"
        )


@app.post("/api/prompt-sessions/suggestions/{suggestion_id}/use")
async def mark_suggestion_used(
    suggestion_id: str,
    inserted_position: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Mark an AI suggestion as used"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        suggestion = prompt_sessions_api.mark_suggestion_used(
            suggestion_id=suggestion_id,
            user_id=uid,
            inserted_position=inserted_position,
        )
        return {"suggestion": suggestion, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error marking suggestion as used: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Mark suggestion used error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error marking suggestion as used: {str(e)}"
        )


@app.get("/api/prompt-sessions/{session_id}/context-entries")
async def get_context_entries(
    session_id: str,
    context_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get context entries for a prompt session"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        entries = prompt_sessions_api.get_context_entries(
            session_id=session_id,
            user_id=uid,
            context_type=context_type,
            limit=limit,
            offset=offset,
        )
        return {"entries": entries, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting context entries: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get context entries error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting context entries: {str(e)}"
        )


@app.post("/api/prompt-sessions/{session_id}/context-entries")
async def add_context_entry(
    session_id: str,
    request: AddContextEntryRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Add a context entry for a prompt session"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        entry = prompt_sessions_api.add_context_entry(
            session_id=session_id,
            user_id=uid,
            context_type=request.context_type,
            content=request.content,
            source=request.source,
            relevance_score=request.relevance_score,
            metadata=request.metadata,
        )
        return {"entry": entry, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = f"Error adding context entry: {str(e)}\n{traceback.format_exc()}"
        print(f"❌ Add context entry error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error adding context entry: {str(e)}"
        )


@app.delete("/api/prompt-sessions/context-entries/{context_id}")
async def delete_context_entry(
    context_id: str, x_user_id: Optional[str] = Header(None, alias="X-User-ID")
):
    """Delete a context entry"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        success = prompt_sessions_api.delete_context_entry(context_id, uid)
        if not success:
            raise HTTPException(status_code=404, detail="Context entry not found")
        return {"success": True}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error deleting context entry: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Delete context entry error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting context entry: {str(e)}"
        )


@app.get("/api/prompt-sessions/stats")
async def get_prompt_session_stats(
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Get statistics for user's prompt sessions"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        stats = prompt_sessions_api.get_session_stats(uid)
        return {"stats": stats, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error getting prompt session stats: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Get prompt session stats error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error getting prompt session stats: {str(e)}"
        )


@app.get("/api/prompt-sessions/search")
async def search_prompt_sessions(
    query: str = Query(..., min_length=1),
    include_content: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Search prompt sessions by title, description, or content"""
    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    try:
        uid = get_user_id_from_header(x_user_id)
        sessions = prompt_sessions_api.search_sessions(
            user_id=uid,
            query=query,
            include_content=include_content,
            limit=limit,
            offset=offset,
        )
        return {"sessions": sessions, "error": None}
    except HTTPException:
        raise
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        import traceback

        error_detail = (
            f"Error searching prompt sessions: {str(e)}\n{traceback.format_exc()}"
        )
        print(f"❌ Search prompt sessions error: {error_detail}")
        raise HTTPException(
            status_code=500, detail=f"Error searching prompt sessions: {str(e)}"
        )


# ============================================
# AI MANIFEST ENDPOINT — P5 (2026-07-26)
# Serves the A2UI component catalog so the Python backend can inject it
# into the DeepSeek system prompt. Reads from frontend/dist/manifest.json.
# ============================================

@app.get("/api/ai/manifest")
async def ai_manifest():
    """Serve the AI playground component manifest for system prompt injection."""
    manifest_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist", "manifest.json")
    alt_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "shared", "manifest.json")
    for path in [manifest_path, alt_path]:
        if os.path.exists(path):
            with open(path, "r") as f:
                return {"manifest": json.load(f), "source": path}
    return {"manifest": {}, "source": "not found", "tags": ["ai-surface-sandbox", "agent-card", "chat-navigation-bar", "status-indicator", "control-bar"]}

class AISurfaceContext(BaseModel):
    """Context from the current document state."""
    current_surface: Optional[str] = None
    has_unsaved_changes: Optional[bool] = False
    session_id: Optional[str] = None
    session_title: Optional[str] = None


class AISurfaceRequest(BaseModel):
    """
    A2UI v0.9 Compliant Surface Assembly Request.

    Intents:
    - render-console: AI assembles console with cards
    - render-composer: AI assembles blank composer with greeting
    - render-session:{id}: AI assembles existing session

    Context provides document state so AI can decide how to handle:
    - has_unsaved_changes: If true, AI should prompt user to save/discard
    """
    intent: str
    session_id: Optional[str] = None  # For render-session intent
    context: Optional[AISurfaceContext] = None  # Document state for AI decisions


@app.post("/api/ai/assemble-surface")
async def ai_assemble_surface(
    request: AISurfaceRequest,
    limit: int = Query(10, ge=1, le=200),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    A2UI v0.9 Compliant Unified Surface Assembly.

    This is the SINGLE endpoint that controls ALL surface rendering.
    The AI is the Architect - it decides what to show.

    Response follows the A2UI v0.9 envelope structure — an array of
    protocol messages, each carrying exactly one operation key:
    [
        { "version": "v0.9.1", "createSurface": { "surfaceId": "main", "catalogId": "..." } },
        { "version": "v0.9.1", "updateComponents": { "surfaceId": "main", "components": [...] } },
        { "version": "v0.9.1", "updateDataModel": { "surfaceId": "main", "path": "/", "value": {...} } }
    ]
    """
    start_time = time.time()
    intent = request.intent
    context = request.context
    uid = get_user_id_from_header(x_user_id)

    # ═══════════════════════════════════════════════════════════════
    # A2UI v0.9: AI DECIDES HOW TO HANDLE UNSAVED CHANGES
    # If user is navigating away from composer with unsaved changes,
    # return a decision surface instead of the requested surface.
    # ═══════════════════════════════════════════════════════════════
    if context and context.has_unsaved_changes and context.current_surface == "composer":
        elapsed_ms = int((time.time() - start_time) * 1000)
        session_title = context.session_title or "Untitled"
        components = [
            {"id": "root", "component": "DecisionDialog", "children": ["message", "actions"]},
            {"id": "message", "component": "Text", "text": f"You have unsaved changes in \"{session_title}\"."},
            {"id": "actions", "component": "ActionGroup", "items": {"path": "/actions"}}
        ]
        validate_a2ui_components(components)
        return [
            {
                "version": "v0.9.1",
                "createSurface": {
                    "surfaceId": "main",
                    "catalogId": A2UI_CATALOG_ID
                }
            },
            {
                "version": "v0.9.1",
                "updateComponents": {
                    "surfaceId": "main",
                    "components": components
                }
            },
            {
                "version": "v0.9.1",
                "updateDataModel": {
                    "surfaceId": "main",
                    "path": "/",
                    "value": {
                        "decision_type": "unsaved_changes",
                        "session_id": context.session_id,
                        "session_title": session_title,
                        "pending_intent": intent,  # What user wanted to do
                        "actions": [
                            {"id": "save", "label": "Save Changes", "variant": "primary"},
                            {"id": "discard", "label": "Discard Changes", "variant": "destructive"},
                            {"id": "cancel", "label": "Cancel", "variant": "secondary"}
                        ],
                        "ai_message": f"Hold on — you have unsaved work in \"{session_title}\". What would you like me to do?",
                        "assembly_time_ms": elapsed_ms
                    }
                }
            }
        ]

    # ═══════════════════════════════════════════════════════════════
    # INTENT: render-console
    # ═══════════════════════════════════════════════════════════════
    if intent == "render-console":
        if not prompt_sessions_api:
            raise HTTPException(
                status_code=503,
                detail="A2UI FAILURE: Database not available",
            )

        # ── PERFORMANCE TRACE: Milestone A (Database) ──
        t_a_start = time.perf_counter()

        # Fetch raw session data from PostgreSQL — lightweight: only metadata,
        # not the full prompt package (left_column_content / compiled_output).
        sessions = prompt_sessions_api.get_sessions(
            user_id=uid,
            include_archived=False,
            limit=limit,
            offset=0,
            lightweight=True,
        )
        ms_a = (time.perf_counter() - t_a_start) * 1000

        # Prepare session summaries for the AI.
        # The AI receives id, title, description, and category — it decides
        # which cards to show and how to arrange them using the A2UI catalog.
        session_summaries = []
        for session in sessions:
            session_summaries.append({
                "id": str(session.get("id")),
                "title": session.get("title") or "Untitled",
                "description": session.get("description") or "",
                "category": session.get("category") or "",
            })

        # The AI assembles the console surface. It is the only path.
        # If the AI does not respond, the surface cannot render.
        # Categories come from the database — the AI does not assign them.
        llm_prompt = (
            "You are Grace, the A2UI surface assembler. "
            "Build the console card grid using the sessions below. "
            "Use the agent-card component from the A2UI catalog. "
            "Use the category that is already on each session — do not change it. "
            "Include a friendly greeting in ai_message.\n\n"
            f"Sessions:\n{json.dumps(session_summaries)}\n\n"
            "Output ONLY valid JSON. No markdown fences, no explanation.\n"
            'Format: {"cards":[{"id":"...","title":"...","category":"...","description":"..."}],"ai_message":"greeting here"}'
        )

        ms_b = 0.0
        ms_c = 0.0

        t_b_start = time.perf_counter()
        llm_response = query_llm(
            question=llm_prompt,
            mode="console_assembly",
            temperature=0.0,
            prompt_id="surface-assembly-console",
            model="deepseek-v4-flash"
        )
        ms_b = (time.perf_counter() - t_b_start) * 1000

        if not llm_response or not llm_response.strip():
            raise HTTPException(
                status_code=503,
                detail="A2UI FAILURE: AI did not respond. The AI must be active to render this surface."
            )

        try:
            t_c_start = time.perf_counter()
            response_text = llm_response.strip()
            print(f"[A2UI Console] AI response ({len(response_text)} chars):\n{response_text[:500]}...")

            # Strip markdown code fences if the AI wraps the JSON
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            parsed_response = json.loads(response_text)
            cards = parsed_response.get("cards", [])
            ai_message = parsed_response.get("ai_message", "Console ready")
            ms_c = (time.perf_counter() - t_c_start) * 1000
        except json.JSONDecodeError as e:
            print(f"[A2UI Console] JSON parse FAILED: {e}")
            raise HTTPException(status_code=503, detail="A2UI FAILURE: AI returned invalid JSON")

        elapsed_ms = int((time.time() - start_time) * 1000)
        print(f"🚨 [A2UI PERF] Console: {len(cards)} cards in {elapsed_ms}ms (DB:{ms_a:.1f}ms AI:{ms_b:.1f}ms Parse:{ms_c:.1f}ms)")

        # ═══════════════════════════════════════════════════════════════
        # A2UI v0.9 ENVELOPE RESPONSE
        # Array of protocol messages: createSurface, updateComponents, updateDataModel
        # ═══════════════════════════════════════════════════════════════
        components = [
            {"id": "root", "component": "Column", "children": ["header", "card-grid"]},
            {"id": "header", "component": "Text", "text": ai_message, "variant": "greeting"},
            {"id": "card-grid", "component": "ConsoleCardGrid", "items": {"path": "/cards"}}
        ]
        validate_a2ui_components(components)
        return [
            {
                "version": "v0.9.1",
                "createSurface": {
                    "surfaceId": "main",
                    "catalogId": A2UI_CATALOG_ID
                }
            },
            {
                "version": "v0.9.1",
                "updateComponents": {
                    "surfaceId": "main",
                    "components": components
                }
            },
            {
                "version": "v0.9.1",
                "updateDataModel": {
                    "surfaceId": "main",
                    "path": "/",
                    "value": {
                        "cards": cards,
                        "assembly_time_ms": elapsed_ms,
                        "llm_used": True
                    }
                }
            }
        ]

    # ═══════════════════════════════════════════════════════════════
    # INTENT: render-composer (blank workspace)
    # ═══════════════════════════════════════════════════════════════
    elif intent == "render-composer":
        # Milestone A: No DB call for blank composer
        ms_a = 0.0

        # Call LLM to generate Grace's greeting
        llm_prompt = """You are Grace, the AI assistant for a prompt engineering workspace.
The user just clicked "Composer" to start building a new prompt agent.

Generate a warm, friendly greeting to welcome them to their fresh workspace.
Be encouraging but concise (1-2 sentences).

Output ONLY valid JSON:
{"ai_message": "Your greeting here", "suggested_title": "A creative suggested title for their new prompt"}"""

        ai_message = "Welcome! I've prepared a fresh workspace for you. What would you like to build today?"
        suggested_title = "New Prompt Agent"

        # ── PERFORMANCE TRACE: Milestone B (Network/LLM) ──
        ms_b = 0.0
        ms_c = 0.0
        t_b_start = time.perf_counter()

        try:
            llm_response = query_llm(
                question=llm_prompt,
                mode="console_assembly",
                temperature=0.0,
                prompt_id="surface-assembly-composer",
                model="deepseek-v4-flash"
            )
            ms_b = (time.perf_counter() - t_b_start) * 1000

            if llm_response and llm_response.strip():
                # ── PERFORMANCE TRACE: Milestone C (Validation/Parse) ──
                t_c_start = time.perf_counter()
                response_text = llm_response.strip()
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0].strip()
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0].strip()

                try:
                    parsed = json.loads(response_text)
                    ai_message = parsed.get("ai_message", ai_message)
                    suggested_title = parsed.get("suggested_title", suggested_title)
                except json.JSONDecodeError:
                    ai_message = llm_response.strip()[:200]
                ms_c = (time.perf_counter() - t_c_start) * 1000
            else:
                ms_c = 0.0
        except Exception as e:
            ms_b = (time.perf_counter() - t_b_start) * 1000
            ms_c = 0.0
            print(f"[A2UI Surface] LLM greeting warning: {e}")

        elapsed_ms = int((time.time() - start_time) * 1000)

        # ── PERFORMANCE TRACE: LOG BREAKDOWN ──
        print(f"\n{'='*60}")
        print(f"[PERF TRACE] POST /api/ai/assemble-surface | intent=render-composer | total={elapsed_ms}ms")
        print(f"  Milestone A (Database - N/A):               {ms_a:8.1f}ms")
        print(f"  Milestone B (Network/LLM - query_llm):     {ms_b:8.1f}ms")
        print(f"  Milestone C (Validation - JSON parse):      {ms_c:8.1f}ms")
        print(f"  Remainder (other):                          {elapsed_ms - ms_a - ms_b - ms_c:8.1f}ms")
        print(f"{'='*60}\n")

        # Default sections for blank composer
        default_sections = [
            {"name": "System Role", "type": "system", "content": "", "position": 0},
            {"name": "User Role", "type": "user", "content": "", "position": 1},
        ]

        # ═══════════════════════════════════════════════════════════════
        # A2UI v0.9 ENVELOPE RESPONSE
        # Array of protocol messages: createSurface, updateComponents, updateDataModel
        # ═══════════════════════════════════════════════════════════════
        components = [
            {"id": "root", "component": "Column", "children": ["left-col", "middle-col", "right-col"]},
            {"id": "left-col", "component": "SectionEditor", "sections": {"path": "/session/left_column/sections"}},
            {"id": "middle-col", "component": "CompiledOutput", "content": {"path": "/session/middle_column/compiled_output"}},
            {"id": "right-col", "component": "ChatPanel", "conversationId": {"path": "/session/right_column/conversation_id"}}
        ]
        validate_a2ui_components(components)
        return [
            {
                "version": "v0.9.1",
                "createSurface": {
                    "surfaceId": "main",
                    "catalogId": A2UI_CATALOG_ID
                }
            },
            {
                "version": "v0.9.1",
                "updateComponents": {
                    "surfaceId": "main",
                    "components": components
                }
            },
            {
                "version": "v0.9.1",
                "updateDataModel": {
                    "surfaceId": "main",
                    "path": "/",
                    "value": {
                        "session": {
                            "id": None,  # No ID until saved
                            "title": suggested_title,
                            "is_unsaved": True,
                            "left_column": {"sections": default_sections},
                            "middle_column": {"compiled_output": ""},
                            "right_column": {"conversation_id": None},
                        },
                        "ai_message": ai_message,
                        "grace_greeting": True,
                        "suggested_title": suggested_title,
                        "assembly_time_ms": elapsed_ms,
                        "llm_used": True
                    }
                }
            }
        ]

    # ═══════════════════════════════════════════════════════════════
    # INTENT: render-session:{id}
    # ═══════════════════════════════════════════════════════════════
    elif intent.startswith("render-session:"):
        session_id = intent.split(":")[1] if ":" in intent else request.session_id

        if not session_id:
            raise HTTPException(status_code=400, detail="Session ID required for render-session intent")

        if not prompt_sessions_api:
            raise HTTPException(status_code=503, detail="A2UI FAILURE: Database not available")

        # ── PERFORMANCE TRACE: Milestone A (Database) ──
        t_a_start = time.perf_counter()

        # Fetch session from PostgreSQL
        session = prompt_sessions_api.get_session(user_id=uid, session_id=session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Fetch Milvus versions
        milvus_versions = []
        try:
            milvus_versions = milvus_get_versions(prompt_id=session_id)
        except Exception as e:
            print(f"[A2UI Surface] Milvus fetch warning: {e}")

        ms_a = (time.perf_counter() - t_a_start) * 1000

        # Parse stored data
        sections = []
        try:
            if session.get("left_column_content"):
                parsed = json.loads(session["left_column_content"])
                sections = parsed.get("sections", [])
        except:
            pass

        # Call LLM to generate contextual greeting
        llm_prompt = f"""You are Grace, the AI assistant. The user is opening their saved session: "{session.get('title')}".
Generate a brief, friendly message welcoming them back (1 sentence max).
Output ONLY valid JSON: {{"ai_message": "Your message"}}"""

        ai_message = f"Welcome back! Here's your session: {session.get('title')}"

        # ── PERFORMANCE TRACE: Milestone B (Network/LLM) ──
        ms_b = 0.0
        ms_c = 0.0
        t_b_start = time.perf_counter()

        try:
            llm_response = query_llm(
                question=llm_prompt,
                mode="console_assembly",
                temperature=0.0,
                prompt_id="surface-assembly-session",
                model="deepseek-v4-flash"
            )
            ms_b = (time.perf_counter() - t_b_start) * 1000

            if llm_response and llm_response.strip():
                # ── PERFORMANCE TRACE: Milestone C (Validation/Parse) ──
                t_c_start = time.perf_counter()
                response_text = llm_response.strip()
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0].strip()
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0].strip()
                try:
                    parsed = json.loads(response_text)
                    ai_message = parsed.get("ai_message", ai_message)
                except:
                    pass
                ms_c = (time.perf_counter() - t_c_start) * 1000
            else:
                ms_c = 0.0
        except Exception as e:
            ms_b = (time.perf_counter() - t_b_start) * 1000
            ms_c = 0.0
            print(f"[A2UI Surface] LLM session greeting warning: {e}")

        elapsed_ms = int((time.time() - start_time) * 1000)

        # ── PERFORMANCE TRACE: LOG BREAKDOWN ──
        print(f"\n{'='*60}")
        print(f"[PERF TRACE] POST /api/ai/assemble-surface | intent=render-session | total={elapsed_ms}ms")
        print(f"  Milestone A (Database - get_session+milvus): {ms_a:8.1f}ms")
        print(f"  Milestone B (Network/LLM - query_llm):       {ms_b:8.1f}ms")
        print(f"  Milestone C (Validation - JSON parse):        {ms_c:8.1f}ms")
        print(f"  Remainder (other):                            {elapsed_ms - ms_a - ms_b - ms_c:8.1f}ms")
        print(f"{'='*60}\n")

        # ═══════════════════════════════════════════════════════════════
        # A2UI v0.9 ENVELOPE RESPONSE
        # Array of protocol messages: createSurface, updateComponents, updateDataModel
        # ═══════════════════════════════════════════════════════════════
        components = [
            {"id": "root", "component": "Column", "children": ["left-col", "middle-col", "right-col"]},
            {"id": "left-col", "component": "SectionEditor", "sections": {"path": "/session/left_column/sections"}},
            {"id": "middle-col", "component": "CompiledOutput", "content": {"path": "/session/middle_column/compiled_output"}},
            {"id": "right-col", "component": "ChatPanel", "conversationId": {"path": "/session/right_column/conversation_id"}}
        ]
        validate_a2ui_components(components)
        return [
            {
                "version": "v0.9.1",
                "createSurface": {
                    "surfaceId": "main",
                    "catalogId": A2UI_CATALOG_ID
                }
            },
            {
                "version": "v0.9.1",
                "updateComponents": {
                    "surfaceId": "main",
                    "components": components
                }
            },
            {
                "version": "v0.9.1",
                "updateDataModel": {
                    "surfaceId": "main",
                    "path": "/",
                    "value": {
                        "session": {
                            "id": str(session_id),
                            "title": session.get("title"),
                            "is_unsaved": False,
                            "left_column": {
                                "sections": sections,
                                "raw_content": session.get("left_column_content"),
                            },
                            "middle_column": {
                                "compiled_output": session.get("compiled_output"),
                            },
                            "right_column": {
                                "conversation_id": str(session.get("conversation_id")) if session.get("conversation_id") else None,
                            },
                        },
                        "milvus": {
                            "versions": milvus_versions,
                            "version_count": len(milvus_versions),
                        },
                        "metadata": {
                            "version": session.get("current_version"),
                            "created_at": str(session.get("created_at")) if session.get("created_at") else None,
                            "updated_at": str(session.get("updated_at")) if session.get("updated_at") else None,
                        },
                        "ai_message": ai_message,
                        "assembly_time_ms": elapsed_ms,
                        "llm_used": True
                    }
                }
            }
        ]

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown intent: {intent}. Valid intents: render-console, render-composer, render-session:{{id}}"
        )


class AIConfirmExitRequest(BaseModel):
    """Request body for Grace's exit confirmation."""
    has_unsaved_changes: bool = True
    session_title: Optional[str] = None
    content_preview: Optional[str] = None  # First ~100 chars of content
    destination: Optional[str] = None  # Where user is trying to go


@app.post("/api/ai/confirm-exit")
async def ai_confirm_exit(
    request: AIConfirmExitRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    STRICT A2UI: Grace asks the user about unsaved changes.

    When the user tries to navigate away from unsaved work,
    Grace speaks to them conversationally in the chat panel.
    """
    start_time = time.time()

    # Build context for Grace
    context = ""
    if request.session_title:
        context += f"Session title: {request.session_title}. "
    if request.content_preview:
        context += f"Content preview: {request.content_preview[:100]}... "
    if request.destination:
        context += f"User wants to go to: {request.destination}. "

    llm_prompt = f"""You are Grace, a friendly AI assistant in a prompt engineering workspace.
The user has unsaved work and is trying to navigate away.

{context}

Generate a warm, conversational message asking if they want to save their work.
Be friendly but not annoying. Keep it to 1-2 sentences.
Sound like a helpful friend, not a robot.

Output ONLY valid JSON:
{{"ai_message": "Your friendly message here"}}"""

    ai_message = "Hold on — you've got unsaved work here. Want me to save it before you go?"

    try:
        llm_response = query_llm(
            question=llm_prompt,
            mode="console_assembly",
            temperature=0.8,  # More personality
            prompt_id="confirm-exit"
        )

        if llm_response and llm_response.strip():
            response_text = llm_response.strip()
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            try:
                parsed = json.loads(response_text)
                ai_message = parsed.get("ai_message", ai_message)
            except json.JSONDecodeError:
                ai_message = llm_response.strip()[:150]
    except Exception as e:
        print(f"[AI Assembly] LLM exit confirmation warning: {e}")

    elapsed_ms = int((time.time() - start_time) * 1000)

    return {
        "status": "ok",
        "assembly_time_ms": elapsed_ms,
        "ai_message": ai_message,
        "grace_speaking": True,
        "actions": [
            {"label": "Save & Go", "intent": "save-and-navigate", "primary": True},
            {"label": "Don't Save", "intent": "discard-and-navigate", "destructive": True},
            {"label": "Stay Here", "intent": "cancel-navigation"},
        ]
    }


class AISaveSurfaceRequest(BaseModel):
    """Request body for AI-driven surface save."""
    session_id: Optional[str] = None
    title: Optional[str] = None
    left_column: Optional[dict] = None  # sections, positions
    middle_column: Optional[dict] = None  # compiled_output, model_used
    right_column: Optional[dict] = None  # conversation_id, messages


@app.post("/api/ai/save-surface")
async def ai_save_surface(
    request: AISaveSurfaceRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    AI-driven Surface Save command.

    When the user clicks Save, the AI:
    1. Analyzes the current surface state
    2. Compiles section content into a unified prompt
    3. Generates metadata (description, suggested title)
    4. Persists to PostgreSQL + Milvus atomically

    This is NOT a webpage form submission - it's an AI command.
    The AI captures and compiles the complete surface state before saving.
    """
    start_time = time.time()

    if not prompt_sessions_api:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Please check your connection.",
        )

    uid = get_user_id_from_header(x_user_id)

    try:
        # Build left_column_content JSON from sections
        sections = request.left_column.get("sections", []) if request.left_column else []
        left_column_content = json.dumps({
            "sections": sections,
            "metadata": {
                "savedAt": datetime.now().isoformat(),
                "sectionCount": len(sections),
            }
        })

        compiled_output = request.middle_column.get("compiled_output", "") if request.middle_column else ""
        conversation_id = request.right_column.get("conversation_id") if request.right_column else None

        # ══════════════════════════════════════════════════════════════════════
        # A2UI: AI COMPILES THE SURFACE STATE BEFORE SAVING
        # The AI analyzes all sections and generates:
        # - compiled_output: The unified prompt from all sections
        # - description: A semantic summary for search/categorization
        # - suggested_title: A better title if the current one is generic
        # ══════════════════════════════════════════════════════════════════════
        ai_compilation = None
        llm_used = False

        # Only call LLM if we have actual content to compile
        section_contents = [s.get("content", "") for s in sections if s.get("content", "").strip()]
        if section_contents:
            try:
                # Build the sections summary for the LLM
                sections_text = "\n\n".join([
                    f"### {s.get('section', s.get('role', 'Unknown'))}:\n{s.get('content', '')}"
                    for s in sections if s.get("content", "").strip()
                ])

                llm_prompt = f"""You are Grace, the AI assistant for a prompt engineering workspace.
The user is saving their prompt template. Analyze the sections and generate a COMPILATION for semantic storage.

Generate:

1. compiled_output: Combine all sections into a single, clean prompt that could be sent to an LLM.
   Format it properly with clear section separators if needed.

2. description: A 1-2 sentence semantic summary of what this prompt does.
   This will be used for SEMANTIC SEARCH — write it so that searching "prompt about X" will find it.

3. suggested_title: If the current title "{request.title or 'Untitled'}" is generic or doesn't
   describe the prompt well, suggest a better descriptive title (max 6 words). Otherwise, keep the current title.

4. tags: Extract 5-10 semantic keywords/tags that describe this prompt's purpose, domain, and techniques.
   These enable search like "find prompts about customer service" or "prompts using chain-of-thought".

Current sections:
{sections_text}

Output ONLY valid JSON:
{{"compiled_output": "The full compiled prompt here...", "description": "Brief summary of the prompt's purpose", "suggested_title": "A descriptive title", "tags": ["tag1", "tag2", "tag3"]}}"""

                llm_response = query_llm(
                    question=llm_prompt,
                    mode="console_assembly",
                    temperature=0.3,  # Low creativity for consistent compilation
                    prompt_id="save-surface-compile"
                )

                if llm_response and llm_response.strip():
                    response_text = llm_response.strip()
                    # Extract JSON from code blocks if present
                    if "```json" in response_text:
                        response_text = response_text.split("```json")[1].split("```")[0].strip()
                    elif "```" in response_text:
                        response_text = response_text.split("```")[1].split("```")[0].strip()

                    try:
                        ai_compilation = json.loads(response_text)
                        llm_used = True
                        print(f"[AI Save] LLM compiled surface: {len(ai_compilation.get('compiled_output', ''))} chars")
                    except json.JSONDecodeError as e:
                        print(f"[AI Save] LLM response not valid JSON: {e}")
            except Exception as e:
                print(f"[AI Save] LLM compilation warning: {e}")

        # Use AI-compiled output if available, otherwise keep original
        if ai_compilation:
            if ai_compilation.get("compiled_output"):
                compiled_output = ai_compilation["compiled_output"]
            # Update title if AI suggested a better one
            if ai_compilation.get("suggested_title") and request.title in [None, "", "Untitled", "New Prompt Agent"]:
                request.title = ai_compilation["suggested_title"]

        # Get AI-generated description or create default
        ai_description = ai_compilation.get("description", "") if ai_compilation else ""
        session_description = ai_description or f"Prompt with {len(sections)} sections"

        # Build metadata including AI compilation info
        save_metadata = {
            "savedBy": "ai_save_surface",
            "llm_used": llm_used,
            "ai_compiled": ai_compilation is not None,
        }
        if ai_description:
            save_metadata["ai_description"] = ai_description

        if request.session_id:
            # UPDATE existing session
            session = prompt_sessions_api.update_session(
                user_id=uid,
                session_id=request.session_id,
                title=request.title,
                description=session_description,
                left_column_content=left_column_content,
                compiled_output=compiled_output,
                metadata=save_metadata,
            )
            action = "updated"
        else:
            # CREATE new session (create_session only accepts user_id, title, description)
            title = request.title or f"Prompt - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            session = prompt_sessions_api.create_session(
                user_id=uid,
                title=title,
                description=session_description,
            )
            # Now update with full content
            if session and session.get("id"):
                session = prompt_sessions_api.update_session(
                    session_id=session["id"],
                    user_id=uid,
                    left_column_content=left_column_content,
                    compiled_output=compiled_output,
                    conversation_id=conversation_id,
                    metadata=save_metadata,
                )
            action = "created"

        session_id = session.get("id") if session else request.session_id

        # ══════════════════════════════════════════════════════════════════════
        # A2UI: EMBED THE AI-COMPILED SEMANTIC SUMMARY, NOT RAW JSON
        # This enables semantic search: "find prompts about swimming" will work
        # even if "swimming" isn't a literal key in the JSON structure.
        #
        # We embed: Title + Description + Tags + Compiled Prompt (truncated)
        # This gives Milvus maximum semantic surface area for retrieval.
        # ══════════════════════════════════════════════════════════════════════
        milvus_saved = False
        ai_tags = []
        try:
            # Build semantic content for embedding
            if ai_compilation and ai_compilation.get("description"):
                # Extract tags for embedding and metadata storage
                ai_tags = ai_compilation.get("tags", [])
                tags_str = ", ".join(ai_tags) if ai_tags else ""

                # Best case: embed the AI-generated semantic description + tags
                semantic_content = f"""Title: {request.title or ai_compilation.get('suggested_title', 'Untitled')}

Description: {ai_compilation['description']}

Tags: {tags_str}

Compiled Prompt:
{compiled_output[:2000]}"""  # Truncate for embedding limits
                print(f"[AI Save] Embedding AI-compiled semantic summary ({len(semantic_content)} chars, {len(ai_tags)} tags)")
            else:
                # Fallback: embed a structured summary of the sections
                section_summary = " | ".join([
                    f"{s.get('section', s.get('role', 'Section'))}: {s.get('content', '')[:100]}"
                    for s in sections if s.get("content", "").strip()
                ])
                semantic_content = f"Title: {request.title or 'Untitled'}\nSections: {section_summary}"
                print(f"[AI Save] Embedding section summary (no AI compilation)")

            # Pass AI metadata to Milvus for filtering and retrieval
            milvus_save_version(session_id, semantic_content, ai_metadata=ai_compilation)
            milvus_saved = True
        except Exception as e:
            print(f"[AI Save] Milvus save warning: {e}")

        elapsed_ms = int((time.time() - start_time) * 1000)

        # AI confirmation message - now includes compilation info
        ai_message = f"Surface {action} successfully in {elapsed_ms}ms."
        if llm_used:
            ai_message += f" AI compiled {len(sections)} sections."
        else:
            ai_message += f" {len(sections)} sections saved."
        if milvus_saved:
            ai_message += " Vector embeddings updated."

        return {
            "status": "ok",
            "action": action,
            "session_id": session_id,
            "save_time_ms": elapsed_ms,
            "sections_saved": len(sections),
            "milvus_saved": milvus_saved,
            "llm_used": llm_used,
            "ai_compiled": ai_compilation is not None,
            "compiled_output_length": len(compiled_output),
            "ai_message": ai_message,
            # Include AI-generated data if available (for semantic search & display)
            "ai_description": ai_compilation.get("description") if ai_compilation else None,
            "ai_suggested_title": ai_compilation.get("suggested_title") if ai_compilation else None,
            "ai_tags": ai_tags if ai_tags else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save surface: {str(e)}"
        )


@app.get("/api/admin/audit-logs")
async def api_admin_audit_logs(
    limit: int = Query(50),
    offset: int = Query(0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Admin-only: retrieve audit log entries."""
    uid = get_user_id_from_header(x_user_id)
    if not user_is_admin(uid):
        raise HTTPException(status_code=403, detail="Admin access required")

    if not conversation_api:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        conn = conversation_api.get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_id, action, resource_type, resource_id, metadata, created_at "
            "FROM audit_logs ORDER BY created_at DESC LIMIT %s OFFSET %s",
            (limit, offset)
        )
        rows = cursor.fetchall()
        logs = [dict(r) for r in rows]
        # Convert datetime to string for JSON
        for log in logs:
            if log.get("created_at"):
                log["created_at"] = log["created_at"].isoformat()
        cursor.close()
        conn.close()
        return {"logs": logs, "count": len(logs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading audit logs: {str(e)}")


# ============================================
# PROMPT SESSION + VERSION MANAGEMENT
# ============================================


# ============================================
# FIGMA API ENDPOINTS
# ============================================

class FigmaQueryRequest(BaseModel):
    file_key: str
    query: Optional[str] = None
    node_id: Optional[str] = None
    component_id: Optional[str] = None

@app.post("/api/figma/file")
async def api_figma_file(request: FigmaQueryRequest):
    """Get Figma file metadata and structure."""
    try:
        data = get_file(request.file_key)
        return data or {"error": "No data returned"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/figma/versions/{file_key}")
async def api_figma_versions(file_key: str):
    """Get version history for a Figma file."""
    try:
        data = get_file_versions(file_key)
        return data or {"error": "No data returned"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/figma/component/{file_key}/{component_id}")
async def api_figma_component(file_key: str, component_id: str):
    """Get a specific Figma component."""
    try:
        data = get_component(file_key, component_id)
        return data or {"error": "Component not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/figma/node/{file_key}/{node_id:path}")
async def api_figma_node(file_key: str, node_id: str):
    """Get a specific Figma node (frame, component instance, etc.)."""
    try:
        data = get_node(file_key, node_id)
        return data or {"error": "Node not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/figma/dev-resources/{file_key}")
async def api_figma_dev_resources(file_key: str, node_id: str = None):
    """Get dev resources (Code Connect annotations) from a Figma file."""
    try:
        data = get_dev_resources(file_key, node_id)
        return data or {"error": "No dev resources found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/figma/search")
async def api_figma_search(request: FigmaQueryRequest):
    """Search for nodes by name within a Figma file."""
    try:
        data = search_file(request.file_key, request.query or "")
        return data or {"error": "Search returned no results"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/figma/config")
async def api_figma_config():
    """Return non-secret Figma configuration the frontend needs at startup."""
    return {
        "default_file_key": os.getenv("FIGMA_DEFAULT_FILE_KEY", ""),
        "connected": bool(os.getenv("FIGMA_TOKEN", "")),
    }

# ============================================
# MILVUS VECTOR DATABASE ENDPOINTS
# ============================================

@app.get("/api/milvus/info")
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

@app.get("/api/milvus/collections")
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

@app.get("/api/milvus/vectors/{collection}")
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


@app.post("/api/milvus/save")
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


@app.get("/api/milvus/versions")
async def api_milvus_versions(prompt_id: Optional[str] = None):
    """Return saved Milvus workspace versions, optionally filtered by prompt."""
    try:
        versions = milvus_get_versions(prompt_id)
        return {"status": "ok", "versions": versions}
    except Exception as e:
        print(f"[Milvus versions] Error: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=str(e))


# ── JSON-RPC 2.0 Agent Integration ─────────────────────────────────────
# Enables AI agents to create projects, fetch data, etc. via standardized RPC calls.

@app.post("/api/agent/rpc")
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
        rpc_handler = AgentRpcHandler(projects_api=projects_api)
        
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


# ============================================
# FILE OPERATIONS ENDPOINTS (for DocumentationQueryTool)
# ============================================

class FileReadRequest(BaseModel):
    path: str

class FileWriteRequest(BaseModel):
    path: str
    content: str

@app.get("/api/files/read")
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

@app.post("/api/files/write")
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

@app.get("/api/files/list")
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
