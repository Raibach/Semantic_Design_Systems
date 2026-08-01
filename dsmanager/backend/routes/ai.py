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
    get_dev_resources, search_file, extract_node_spec,
)
from milvus_rest import MilvusREST

router = APIRouter()


def _extract_json_payload(response_text: str) -> Any:
    """Extract a JSON object/array from LLM output without relying on fenced-block parsing."""
    text = (response_text or "").strip()
    if not text:
        raise ValueError("empty response")

    if "```json" in text:
        text = text.split("```json", 1)[1]
    elif "```" in text:
        text = text.split("```", 1)[1]

    if "```" in text:
        text = text.split("```", 1)[0]

    text = text.strip()
    if not text:
        raise ValueError("empty JSON payload")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for index, character in enumerate(text):
            if character not in "[{":
                continue
            try:
                value, _ = decoder.raw_decode(text[index:])
                return value
            except json.JSONDecodeError:
                continue
        raise


# ============================================
# AI MANIFEST ENDPOINT — P5 (2026-07-26)
# Serves the A2UI component catalog so the Python backend can inject it
# into the DeepSeek system prompt. Reads from frontend/dist/manifest.json.
# ============================================

@router.get("/api/ai/manifest")
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


@router.post("/api/ai/assemble-surface")
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
        if not state.prompt_sessions_api:
            raise HTTPException(
                status_code=503,
                detail="A2UI FAILURE: Database not available",
            )

        # ── PERFORMANCE TRACE: Milestone A (Database) ──
        t_a_start = time.perf_counter()

        # Fetch raw session data from PostgreSQL — lightweight: only metadata,
        # not the full prompt package (left_column_content / compiled_output).
        sessions = state.prompt_sessions_api.get_sessions(
            user_id=uid,
            include_archived=False,
            limit=limit,
            offset=0,
            lightweight=True,
            exclude_drafts=True,  # unsigned composer drafts never litter the console
        )
        ms_a = (time.perf_counter() - t_a_start) * 1000

        # Initial console paint is DB-authoritative and does not block on model
        # inference. The A2UI contract remains intact: the surface still binds a
        # ConsoleCardGrid to /cards, but the card data comes straight from
        # PostgreSQL instead of waiting on an expensive reasoning model.
        cards = []
        for session in sessions:
            cards.append({
                "id": str(session.get("id")),
                "title": session.get("title") or "Untitled",
                "description": session.get("description") or "",
                "category": session.get("category") or "",
                "status": (session.get("status") or "Active").lower(),
                "version": session.get("current_version") or 1,
                "likes": session.get("likes") or 0,
                "model_name": session.get("model_name") or "",
                "team_name": session.get("team_name") or "",
                "avatar_url": session.get("avatar_url") or "",
                "category_color": session.get("category_color") or "",
                "category_title_color": session.get("category_title_color") or "",
                "category_text_color": session.get("category_text_color") or "",
                "username": session.get("author_name") or session.get("author_email") or "",
                "createdAt": session.get("created_at").isoformat() if session.get("created_at") else "",
                "lastUsed": session.get("last_accessed_at").isoformat() if session.get("last_accessed_at") else "",
                "message_count": session.get("version_count") or 0,
            })

        # ── TRUE A2UI: Model is the architect for the console surface ──
        # DB only supplies raw data. The model MUST return the components.
        # Hard-fail (503) if the model cannot assemble it. No DB skip, no fallbacks.
        cards_for_prompt = json.dumps(cards)
        llm_prompt = f"""You are Grace, the A2UI surface assembler for the console.

The user opened the Console. There are {len(cards)} prompt packages.

Card data (bind ConsoleCardGrid to this):
{cards_for_prompt}

Assemble the FULL console surface using A2UI v0.9.1.

COMPONENT CATALOG (only these):
- Column (children array)
- Text (variant: "greeting")
- ConsoleCardGrid (items: {{"path": "/cards"}})

REQUIREMENTS:
1. id "root" Column at top
2. Text greeting with variant "greeting"
3. ConsoleCardGrid bound to /cards
4. Short friendly ai_message

Output ONLY this exact JSON (no markdown, no extra text):
{{
  "components": [
    {{"id": "root", "component": "Column", "children": ["header", "card-grid"]}},
    {{"id": "header", "component": "Text", "text": "greeting", "variant": "greeting"}},
    {{"id": "card-grid", "component": "ConsoleCardGrid", "items": {{"path": "/cards"}}}}
  ],
  "ai_message": "Your message"
}}
"""

        ms_b = 0.0
        ms_c = 0.0
        t_b_start = time.perf_counter()
        llm_response = query_llm(
            question=llm_prompt,
            mode="console_assembly",
            temperature=0.0,
            prompt_id="surface-assembly-console"
            # model intentionally omitted — use the enabled provider's default
        )
        ms_b = (time.perf_counter() - t_b_start) * 1000

        if not llm_response or not llm_response.strip():
            raise HTTPException(
                status_code=503,
                detail="A2UI FAILURE: AI did not respond. The AI must be active to render this surface."
            )
        if llm_response.strip().startswith("Error:"):
            raise HTTPException(status_code=503, detail=f"A2UI FAILURE: {llm_response.strip()}")

        t_c_start = time.perf_counter()
        response_text = llm_response.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        try:
            parsed = _extract_json_payload(response_text)
            components = parsed["components"]
            ai_message = parsed.get("ai_message", f"{len(cards)} packages ready.")
            if not isinstance(components, list) or len(components) == 0:
                raise ValueError("components must be non-empty array")
            ms_c = (time.perf_counter() - t_c_start) * 1000
        except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
            print(
                f"[A2UI Console] AI RESPONSE PARSE FAILED:\n"
                f"  error_type: {type(e).__name__}\n"
                f"  error_message: {e}\n"
                f"  llm_response_length: {len(response_text)}\n"
                f"  llm_response_first_500: {response_text[:500]}\n"
                f"  timestamp: {time.strftime('%Y-%m-%dT%H:%M:%S%z')}\n"
                f"  FIX: The LLM returned something that isn't valid A2UI JSON. Check the prompt or the model."
            )
            raise HTTPException(
                status_code=503, 
                detail=f"A2UI FAILURE: AI returned invalid JSON for render-console — {type(e).__name__}: {str(e)}. Raw (first 300 chars): {response_text[:300]}"
            )

        elapsed_ms = int((time.time() - start_time) * 1000)
        print(f"\n{'='*60}")
        print(f"[PERF TRACE] POST /api/ai/assemble-surface | intent=render-console | total={elapsed_ms}ms")
        print(f"  Milestone A (Database): {ms_a:8.1f}ms")
        print(f"  Milestone B (LLM):      {ms_b:8.1f}ms")
        print(f"  Milestone C (Parse):    {ms_c:8.1f}ms")
        print(f"{'='*60}\n")

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
                        "llm_used": True,
                        "ai_message": ai_message
                    }
                }
            }
        ]

    # ═══════════════════════════════════════════════════════════════
    # INTENT: render-composer (blank workspace)
    # ═══════════════════════════════════════════════════════════════
    elif intent == "render-composer":
        # ── HONEST STATUS (2026-08-01): ──
        # TRUE:  AI decides the data payload (sections, title, message).
        # TRUE:  On failure, returns 503 — no fake fallback. Correct.
        # NOT TRUE YET: "AI assembles the FULL surface" — the envelope
        #   hardcodes left_column / middle_column / right_column shape.
        #   AI cannot decide "this task needs 4 columns" or "skip the
        #   output viewer." It can only populate data into a fixed frame.
        # DISCOVERY GOAL: AI should emit the component tree itself
        #   (which components, in what arrangement) from the Figma spec.
        ms_a = 0.0

        # Fetch live Figma spec for the composer surface.
        # NOTE: node ID "40000717:17091" is HARDCODED and currently
        # returns an empty spec (48 chars, zero children). This is the
        # root cause of composer assembly failures. The node may have
        # been deleted or moved in the Figma file. Fix: verify the
        # correct node ID or make it configurable.
        FIGMA_FILE_KEY = "20UPR2KQMsbAxlo5NJb1se"
        FIGMA_NODE_ID = "40000717:17091"
        figma_spec = None
        figma_error_detail = None
        try:
            raw = get_node(FIGMA_FILE_KEY, FIGMA_NODE_ID)
            if raw and raw.get("error"):
                figma_error_detail = f"Figma API error: {raw['error']}"
            elif raw:
                figma_spec = extract_node_spec(raw)
                # extract_node_spec returns {"id":..., "name":..., "type":...}
                # even for empty/dead nodes. Check for actual design data:
                if not figma_spec.get("children") and not figma_spec.get("layout") and not figma_spec.get("fills"):
                    figma_error_detail = (
                        f"Figma node {FIGMA_NODE_ID} returned EMPTY spec "
                        f"(no children, no layout, no fills). The node may have been "
                        f"deleted or moved in file {FIGMA_FILE_KEY}. "
                        f"Spec keys received: {list(figma_spec.keys())}"
                    )
                    figma_spec = None  # Treat as missing — don't send garbage to the LLM
        except Exception as e:
            figma_error_detail = f"Figma fetch exception: {e}"
            import traceback
            print(f"[A2UI Composer] Figma fetch EXCEPTION:\n  type: {type(e).__name__}\n  message: {e}\n  traceback:\n{traceback.format_exc()}")

        if not figma_spec:
            print(
                f"[A2UI Composer] ASSEMBLY BLOCKED — no Figma spec:\n"
                f"  file_key: {FIGMA_FILE_KEY}\n"
                f"  node_id: {FIGMA_NODE_ID}\n"
                f"  reason: {figma_error_detail or 'Figma spec is None'}\n"
                f"  timestamp: {time.strftime('%Y-%m-%dT%H:%M:%S%z')}\n"
                f"  FIX: Verify the Figma node ID exists and has children/layout/fills."
            )
            raise HTTPException(
                status_code=503,
                detail=f"A2UI FAILURE: Cannot assemble composer — {figma_error_detail or 'Figma spec is None'}. Figma is the source of truth for surface layout."
            )

        figma_json = json.dumps(figma_spec)[:8000]  # keep prompt size reasonable

        llm_prompt = f"""You are Grace, the A2UI surface assembler.

Figma design spec (source of truth — derive every element, layout, panel, and binding from this):
{figma_json}

The user clicked "Composer". Assemble the FULL surface using A2UI v0.9.1.

Derive:
- All components and their exact hierarchy from the Figma spec
- The right side panel (Resources, Variables, Efficiency, etc.) exactly as shown
- Data bindings for sections, output, chat
- Initial sections, title, greeting

Output ONLY valid JSON (no markdown):
{{
  "components": [ ... adjacency list derived from Figma ... ],
  "initial_sections": [ ... ],
  "suggested_title": "...",
  "ai_message": "..."
}}"""

        # ── PERFORMANCE TRACE: Milestone B (Network/LLM) ──
        ms_b = 0.0
        ms_c = 0.0
        t_b_start = time.perf_counter()
        llm_response = query_llm(
            question=llm_prompt,
            mode="surface_assembly",
            temperature=0.0,
            prompt_id="surface-assembly-composer"
            # model intentionally omitted — use the enabled provider's default (e.g. glm-5.2 via Z.ai)
        )
        ms_b = (time.perf_counter() - t_b_start) * 1000

        # TRUE A2UI: Hard-fail if AI doesn't respond
        if not llm_response or not llm_response.strip():
            raise HTTPException(
                status_code=503,
                detail="A2UI FAILURE: AI did not respond. The AI must be active to render this surface."
            )
        if llm_response.strip().startswith("Error:"):
            raise HTTPException(status_code=503, detail=f"A2UI FAILURE: {llm_response.strip()}")

        # ── PERFORMANCE TRACE: Milestone C (Validation/Parse) ──
        t_c_start = time.perf_counter()
        response_text = llm_response.strip()
        
        # Strip markdown fences if present
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        # Parse and validate AI response - NO fallbacks
        try:
            parsed = _extract_json_payload(response_text)
            components = parsed["components"]
            initial_sections = parsed["initial_sections"]
            ai_message = parsed["ai_message"]
            suggested_title = parsed["suggested_title"]
            
            # Validate required fields
            if not isinstance(components, list) or len(components) == 0:
                raise ValueError("components must be non-empty array")
            if not isinstance(initial_sections, list):
                raise ValueError("initial_sections must be array")
            if not isinstance(ai_message, str) or not ai_message.strip():
                raise ValueError("ai_message must be non-empty string")
            if not isinstance(suggested_title, str) or not suggested_title.strip():
                raise ValueError("suggested_title must be non-empty string")
                
            ms_c = (time.perf_counter() - t_c_start) * 1000
        except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
            print(
                f"[A2UI Composer] AI RESPONSE PARSE FAILED:\n"
                f"  error_type: {type(e).__name__}\n"
                f"  error_message: {e}\n"
                f"  llm_response_length: {len(response_text)}\n"
                f"  llm_response_first_500: {response_text[:500]}\n"
                f"  timestamp: {time.strftime('%Y-%m-%dT%H:%M:%S%z')}\n"
                f"  FIX: The LLM returned something that isn't valid A2UI JSON. Check the prompt or the model."
            )
            raise HTTPException(
                status_code=503, 
                detail=f"A2UI FAILURE: AI returned invalid JSON for render-composer — {type(e).__name__}: {str(e)}. Raw (first 300 chars): {response_text[:300]}"
            )

        # No DB update here. suggested_title lives in the in-memory data model only.
        # Real title + session creation happens on explicit Save via /ai/save-surface.

        elapsed_ms = int((time.time() - start_time) * 1000)

        # ── PERFORMANCE TRACE: LOG BREAKDOWN ──
        print(f"\n{'='*60}")
        print(f"[PERF TRACE] POST /api/ai/assemble-surface | intent=render-composer | total={elapsed_ms}ms")
        print(f"  Milestone A (Database - draft create):      {ms_a:8.1f}ms")
        print(f"  Milestone B (Network/LLM - query_llm):     {ms_b:8.1f}ms")
        print(f"  Milestone C (Validation - JSON parse):      {ms_c:8.1f}ms")
        print(f"  Remainder (other):                          {elapsed_ms - ms_a - ms_b - ms_c:8.1f}ms")
        print(f"{'='*60}\n")

        # ═══════════════════════════════════════════════════════════════
        # A2UI v0.9.1 ENVELOPE RESPONSE
        # HONEST STATUS (2026-08-01):
        #   - components list: AI-generated (which prompt blocks, which data)
        #   - Data model SHAPE: slot contract is FIXED (left/middle/right)
        #     because slots are the foundational loading framework.
        #     The AI fills slots; it does not create or remove slots.
        #   - Sections within left_column: AI-generated (the prompt blocks)
        #   - Per owner: slots are pure AI-native loading contract.
        #     Scaling features = slot them in. No visible styling yet.
        # ═══════════════════════════════════════════════════════════════
        
        # Validate AI-generated components against catalog
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
                    "components": components  # AI-generated, not hardcoded
                }
            },
            {
                "version": "v0.9.1",
                "updateDataModel": {
                    "surfaceId": "main",
                    "path": "/",
                    "value": {
                        "session": {
                            "id": None,  # in-memory only until explicit Save
                            "title": suggested_title,  # AI-generated
                            "is_unsaved": True,
                            "left_column": {"sections": initial_sections},  # slot contract (fixed), sections are AI-generated
                            "middle_column": {"compiled_output": ""},      # slot contract (fixed)
                            "right_column": {"conversation_id": None},      # slot contract (fixed), chat is mostly static
                        },
                        "ai_message": ai_message,  # AI-generated
                        "grace_greeting": True,
                        "suggested_title": suggested_title,  # AI-generated
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

        if not state.prompt_sessions_api:
            raise HTTPException(status_code=503, detail="A2UI FAILURE: Database not available")

        # ── PERFORMANCE TRACE: Milestone A (Database) ──
        t_a_start = time.perf_counter()

        # Fetch session from PostgreSQL
        session = state.prompt_sessions_api.get_session(user_id=uid, session_id=session_id)

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

        # Fetch actual conversation messages (for ChatPanel history on mount)
        messages = []
        conv_id = session.get("conversation_id")
        if conv_id and state.conversation_api:
            try:
                messages = state.conversation_api.get_messages(str(conv_id), uid, limit=200)
            except Exception as e:
                print(f"[A2UI Surface] Messages fetch warning: {e}")

        # ── TRUE A2UI: MODEL IS THE ARCHITECT ──
        # DB supplies the data. The model MUST return the components (adjacency list).
        # Hard-fail (503) if the model cannot assemble the surface structure.
        # No hardcoded components. No greeting-only shortcut.
        session_info = {
            "title": session.get("title"),
            "sections_count": len(sections),
            "has_compiled": bool(session.get("compiled_output")),
            "milvus_count": len(milvus_versions),
            "message_count": len(messages),
        }
        llm_prompt = f"""You are Grace, the A2UI surface assembler.

User is loading saved session: "{session.get('title') or 'Untitled'}".

Data summary:
{json.dumps(session_info)}

Assemble the FULL surface with A2UI v0.9.1.

CATALOG (use these):
- Column (children)
- prompt-section-editor (sections: {{"path": "/session/left_column/sections"}})
- compiled-output-viewer (content: {{"path": "/session/middle_column/compiled_output"}})
- chat-panel (conversationId: {{"path": "/session/right_column/conversation_id"}})
- Text (variant: "greeting")
- workspace-layout (resizable host for the three panes)

REQUIREMENTS:
1. id "root" Column
2. 3-column workspace layout
3. Bind editors to the paths above
4. Short ai_message

Output ONLY this JSON (no markdown):
{{
  "components": [
    {{"id": "root", "component": "Column", "children": ["workspace"]}},
    {{"id": "workspace", "component": "workspace-layout", "children": ["left-col", "middle-col", "right-col"]}},
    {{"id": "left-col", "component": "prompt-section-editor", "sections": {{"path": "/session/left_column/sections"}}}},
    {{"id": "middle-col", "component": "compiled-output-viewer", "content": {{"path": "/session/middle_column/compiled_output"}}}},
    {{"id": "right-col", "component": "chat-panel", "conversationId": {{"path": "/session/right_column/conversation_id"}}}}
  ],
  "ai_message": "Welcome back..."
}}
"""

        # ── PERFORMANCE TRACE: Milestone B (Network/LLM) ──
        ms_b = 0.0
        ms_c = 0.0
        t_b_start = time.perf_counter()
        llm_response = query_llm(
            question=llm_prompt,
            mode="surface_assembly",
            temperature=0.0,
            prompt_id="surface-assembly-session"
            # model intentionally omitted — use the enabled provider's default
        )
        ms_b = (time.perf_counter() - t_b_start) * 1000

        if not llm_response or not llm_response.strip():
            raise HTTPException(
                status_code=503,
                detail="A2UI FAILURE: AI did not respond. The AI must be active to render this surface."
            )
        if llm_response.strip().startswith("Error:"):
            raise HTTPException(status_code=503, detail=f"A2UI FAILURE: {llm_response.strip()}")

        # ── PERFORMANCE TRACE: Milestone C (Validation/Parse) ──
        t_c_start = time.perf_counter()
        response_text = llm_response.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        try:
            parsed = _extract_json_payload(response_text)
            components = parsed["components"]
            ai_message = parsed.get("ai_message", "Welcome back to your session.")
            if not isinstance(components, list) or len(components) == 0:
                raise ValueError("components must be non-empty array")
            ms_c = (time.perf_counter() - t_c_start) * 1000
        except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
            print(f"[A2UI Session] AI response parse FAILED: {e}")
            print(f"[A2UI Session] Raw response: {response_text[:500]}")
            raise HTTPException(
                status_code=503, 
                detail=f"A2UI FAILURE: AI returned invalid JSON - {str(e)}"
            )

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
        # A2UI v0.9.1 ENVELOPE RESPONSE - AI-GENERATED COMPONENTS
        # ═══════════════════════════════════════════════════════════════
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
                                "messages": messages,
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
                            "column_widths": session.get("metadata", {}).get("column_widths") if session.get("metadata") else None,
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


@router.post("/api/ai/confirm-exit")
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
                parsed = _extract_json_payload(response_text)
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
    column_widths: Optional[dict] = None  # { left: number|null, chat: number }


@router.post("/api/ai/save-surface")
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

    if not state.prompt_sessions_api:
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
                        ai_compilation = _extract_json_payload(response_text)
                        llm_used = True
                        print(f"[AI Save] LLM compiled surface: {len(ai_compilation.get('compiled_output', ''))} chars")
                    except (json.JSONDecodeError, ValueError) as e:
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

        # Build metadata including AI compilation info + column widths
        save_metadata = {
            "savedBy": "ai_save_surface",
            "llm_used": llm_used,
            "ai_compiled": ai_compilation is not None,
            "column_widths": request.column_widths,
        }
        if ai_description:
            save_metadata["ai_description"] = ai_description

        if request.session_id:
            # UPDATE existing session
            session = state.prompt_sessions_api.update_session(
                user_id=uid,
                session_id=request.session_id,
                title=request.title,
                description=session_description,
                left_column_content=left_column_content,
                compiled_output=compiled_output,
                conversation_id=conversation_id,
                metadata=save_metadata,
            )
            action = "updated"
        else:
            # CREATE new session (create_session only accepts user_id, title, description)
            title = request.title or f"Prompt - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            session = state.prompt_sessions_api.create_session(
                user_id=uid,
                title=title,
                description=session_description,
            )
            # Now update with full content
            if session and session.get("id"):
                session = state.prompt_sessions_api.update_session(
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


@router.get("/api/admin/audit-logs")
async def api_admin_audit_logs(
    limit: int = Query(50),
    offset: int = Query(0),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Admin-only: retrieve audit log entries."""
    uid = get_user_id_from_header(x_user_id)
    if not user_is_admin(uid):
        raise HTTPException(status_code=403, detail="Admin access required")

    if not state.conversation_api:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        conn = state.conversation_api.get_db()
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
