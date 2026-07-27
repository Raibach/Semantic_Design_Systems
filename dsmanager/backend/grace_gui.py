"""
Grace GUI module for the prompt-composer-console backend.
Supports multiple model providers with fallback:
1. NVIDIA NIM Cloud API (if available)
2. DeepInfra hosted endpoint (fallback)
"""

import os
import time
from typing import Any, Dict, List, Optional

import requests

# ═══════════════════════════════════════════════════════════════════════════════
# A2UI MISSION HEADER — Prepended to EVERY request for maximum attention weight
# This anchor sits at the top of the context window where model focus is strongest
# ═══════════════════════════════════════════════════════════════════════════════
MISSION_HEADER = """
<critical_protocol>
ROLE: Silent A2UI Assembler.
CONSTRAINTS: NO HTML, NO Webpages, NO DOM manipulation, NO conversational preamble.
OUTPUT: ONLY <a2ui_surface>...</a2ui_surface> XML tags from the Registry.
IF DRIFTED: Discard conversational text immediately. Return to tag emission.
ERROR HANDLING: Use <error-banner message="..."/> only. Never create debug pages.
</critical_protocol>
"""

# Model provider configuration - DeepSeek primary, NVIDIA fallback
MODEL_PROVIDERS = {
    "deepseek": {
        "name": "DeepSeek API",
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-v4-flash",  # Fast model, no reasoning overhead
        "enabled": True,
        "priority": 1,
    },
    "nvidia_nim": {
        "name": "NVIDIA NIM Cloud API",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "model": "nvidia/llama-3.3-nemotron-super-49b-v1",
        "enabled": False,  # Disabled - too slow and unreliable
        "priority": 2,
    },
}

MAX_RETRIES = 1
RETRY_DELAY = 0
LLM_TIMEOUT = 10  # 10s timeout — development mode, fail fast


def search_news(query: str, reasoning: bool = False, memory: str = "") -> str:
    """Search news using the LLM."""
    print(f"[grace_gui] search_news called with query: {query}")

    prompt = f"""Search for news about: {query}

Memory context: {memory[:500] if memory else "None"}

Please provide a summary of relevant news articles."""

    return query_llm(
        context="You are a news research assistant.",
        question=prompt,
        reasoning=reasoning,
    )


def summarize_pdfs(files: List[Any], reasoning: bool = False) -> str:
    """Summarize PDFs using the LLM."""
    print(f"[grace_gui] summarize_pdfs called with {len(files)} files")
    return "PDF summarization requires actual PDF processing. This feature will be implemented when PDF files are provided."


def retrieve_memory_context(query: str) -> str:
    """Retrieve memory context for a query."""
    print(f"[grace_gui] retrieve_memory_context called with query: {query}")
    return ""


def query_llm(
    context: str = "",
    question: str = "",
    reasoning: bool = False,
    reasoning_style: str = "chain_of_thought",
    memory_context: str = "",
    temperature: float = 0.0,  # A2UI: Use temperature=0 for deterministic tag emission
    self_reflection: bool = False,
    editorial: Optional[Dict[str, Any]] = None,
    mode: str = "chat",
    prompt_id: str = "unknown",
    model: Optional[str] = None,  # Override default provider model
) -> str:
    """Query the LLM via available cloud providers with automatic fallback.

    Parameters
    ----------
    mode : str
        "prompt_output"
            Third-column execution panel. The prompt is treated as a direct
            instruction to be carried out. Return ONLY the raw output — no
            preamble, no commentary, no meta-explanation. The response must
            look exactly as if it came from a production system running the
            prompt.

        "chat"
            Right-column prompt-engineering assistant. Analyse, critique, and
            improve the prompt. Never execute or simulate the prompt output.
            All responses are advisory: suggestions, rewrites, and rationale.
    """

    if not question.strip():
        return "Please provide a question to answer."

    # ------------------------------------------------------------------ #
    #  System prompt — varies by mode                                     #
    # ------------------------------------------------------------------ #
    if mode == "console_assembly":
        # ── Lightweight mode for console card generation ──────────────────
        # Minimal system prompt - just enough to set personality and output format
        system_prompt = (
            "You are Grace, the AI librarian managing the prompt gallery. "
            "Convert session data to JSON cards. Include chat_panel in your response. "
            "Output ONLY valid JSON with 'cards' array, 'ai_message' greeting, and 'chat_panel': true."
        )

    elif mode == "prompt_output":
        # ── Assemble agentic flow from structured JSON context ──────────
        assembled_system = ""
        assembled_user = ""
        try:
            import json as _json
            payload = _json.loads(context) if context and context.strip() else {}
            core = payload.get("core_roles", {})
            custom = payload.get("custom_roles", [])

            # System Role IS the model's identity. User Role IS the task.
            system_role = core.get("System Role", "")
            user_role = core.get("User Role", "Execute the prompt configuration.")
            
            # Append constraints, context, few-shot as additional instructions
            extras = []
            if core.get("Constraints"):
                extras.append(f"CONSTRAINTS (follow strictly):\n{core['Constraints']}")
            if core.get("Context"):
                extras.append(f"CONTEXT:\n{core['Context']}")
            if core.get("Few Shot"):
                extras.append(f"EXAMPLES:\n{core['Few Shot']}")
            for cr in custom:
                if cr.get("name") and cr.get("content"):
                    extras.append(f"{cr['name']}:\n{cr['content']}")
            
            if extras:
                system_role = system_role + "\n\n" + "\n\n".join(extras)

            assembled_system = system_role
            assembled_user = user_role
            
            # Tool Call is source code input — append to user message, truncated
            if core.get("Tool Call"):
                tc = core["Tool Call"]
                if len(tc) > 3000:
                    tc = tc[:3000] + "\n\n[...truncated...]"
                assembled_user = assembled_user + "\n\n--- SOURCE CODE TO ANALYZE ---\n" + tc
        except Exception:
            assembled_system = context
            assembled_user = "Execute the prompt configuration."

        system_prompt = assembled_system if assembled_system else (
            "You are a production execution engine. Execute the user's request "
            "and return only the output they asked for. No preamble, no commentary."
        )

        question = assembled_user

    else:
        # mode == "chat" — conversational AI surface for the Prompt Composer.
        # When the frontend provides a unified blueprint prompt via the
        # "context" parameter, use it directly as the single source of truth.
        # Otherwise fall back to a minimal safe default.
        #
        # CRITICAL: Always include the XML tag instructions so the AI
        # knows it can write to the left-column prompt sections.
        # The tags are the AI's only interface to the workspace.

        # A2UI Critical Protocol - XML envelope technique
        a2ui_protocol = (
            "\n\n## CRITICAL A2UI PROTOCOL\n"
            "ROLE: You are a SILENT A2UI ASSEMBLER. You do NOT build webpages.\n"
            "CONSTRAINTS:\n"
            "1. NEVER output raw HTML tags (<div>, <script>, <style>).\n"
            "2. NEVER create new files, routes, or 'hidden pages' to fix errors.\n"
            "3. NEVER manipulate the DOM directly.\n"
            "4. If an error occurs, report it ONLY via the <error-banner> tag.\n"
            "5. Your ONLY valid output is A2UI XML tags defined in the Tag Registry below.\n"
            "\n"
            "OUTPUT FORMAT:\n"
            "- Wrap ALL component updates in <a2ui_surface>...</a2ui_surface>.\n"
            "- Use self-closing attribute form: <update_components component=\"name\" props='{...}' />\n"
            "- NO raw HTML, NO JavaScript, NO CSS.\n"
            "\n"
            "EXAMPLE INPUT: 'User clicks Console'\n"
            "EXAMPLE OUTPUT:\n"
            "<a2ui_surface>\n"
            "  <update_components component=\"chat-panel\" props='{\"status\": \"active\"}' />\n"
            "  <update_components component=\"agent-card\" props='{\"id\": \"main\"}' />\n"
            "</a2ui_surface>\n"
        )

        tag_instructions = (
            a2ui_protocol +
            "\n\n## YOUR IDENTITY\n"
            "You are a PROMPT ENGINEERING EXPERT. This is not optional.\n"
            "Every user who interacts with you expects you to be better at\n"
            "prompt engineering than they are. They come to you for\n"
            "expertise, guidance, and correction — not just execution.\n"
            "\n"
            "Your responsibilities:\n"
            "- The user provides objectives and ideas. YOU build the prompt.\n"
            "- YOU decide which content goes in which section. The user may\n"
            "  not know the difference between System Role, User Role, Context,\n"
            "  Constraints, Few Shot, or Tool Call. YOU do.\n"
            "- If the user puts content in the wrong section, CORRECT it.\n"
            "  Move it to the right section without being asked.\n"
            "- If sections are empty that should be filled, FILL them.\n"
            "  Don't wait for the user to say \"add to Constraints\" — if\n"
            "  you see what constraints should exist, ADD them.\n"
            "- If the user's prompt is weak, SAY so — and explain why.\n"
            "  Then offer to fix it, or just fix it.\n"
            "- Be direct. Don't hedge. Don't say \"you might want to.\"\n"
            "  Say \"This constraint is too loose. I'm tightening it.\"\n"
            "- The user is NOT a prompt engineer. They have domain\n"
            "  knowledge but may not know how to structure it. YOU bridge\n"
            "  that gap. You translate their ideas into engineering.\n"
            "\n\n## YOUR WORKSPACE INTERFACE\n"
            "You have FULL control over the left column prompt sections.\n"
            "Use these XML tags to WRITE content — do not describe what should\n"
            "go there, WRITE it there immediately:\n\n"
            "<update_agent>TEXT</update_agent> — Write to the System Role section\n"
            "<update_user>TEXT</update_user> — Write to the User Role section\n"
            "<update_tool>TEXT</update_tool> — Write to the Tool Call section\n"
            "<update_few_shot>TEXT</update_few_shot> — Write to the Few Shot section\n"
            "<update_context>TEXT</update_context> — Write to the Context section\n"
            "<update_constraints>TEXT</update_constraints> — Write to the Constraints section\n"
            "<add_role name=\"NAME\">CONTENT</add_role> — Create a new custom section\n"
            "<remove_role name=\"NAME\"/> — Delete a custom section\n"
            "<run_prompt/> — Trigger prompt execution\n"
            "<switch_tab>trace|variables|chat</switch_tab> — Navigate right-column tabs\n"
            "<save/> — Save the current prompt\n"
            "<reassemble-console sort=\"category|title\"/> — Sort console cards\n"
            "<reassemble-console filter=\"Design System\"/> — Filter console by category\n"
            "\n\n## LEXICAL EDITOR (Third Column Tool)\n"
            "You can open a full rich-text editor in the third column.\n"
            "Use these tags to launch and control it:\n\n"
            "<load_tool name=\"lexical-editor\"/> — Launch the editor\n"
            "<close_tool/> — Close editor, return to output view\n"
            "\n"
            "Once the editor is open, control it with these tags.\n"
            "ALWAYS use the self-closing attribute form:\n\n"
            "<set_content content=\"TEXT\"/> — Replace all editor content\n"
            "<insert_text text=\"TEXT\"/> — Insert at cursor position\n"
            "<append_text text=\"TEXT\"/> — Append to end of document\n"
            "<format_text type=\"bold|italic|underline|strikethrough|code\"/> — Inline formatting\n"
            "<format_block type=\"h1|h2|h3|paragraph|quote|code|ul|ol|checklist\"/> — Block type\n"
            "<format_align type=\"left|center|right|justify\"/> — Alignment\n"
            "<format_font family=\"Inter\" size=\"16px\"/> — Font changes\n"
            "<clear_formatting/> — Remove formatting from selection\n"
            "<insert_table rows=\"3\" cols=\"3\"/> — Insert a table\n"
            "<insert_link url=\"https://...\" text=\"label\"/> — Insert hyperlink\n"
            "<insert_horizontal_rule/> — Divider line\n"
            "<insert_code_block language=\"typescript\"/> — Code block\n"
            "<undo/> — Undo last edit\n"
            "<redo/> — Redo last undone edit\n"
            "<toggle_code_view/> — Switch between rich text and code view\n"
            "<toggle_lock/> — Lock/unlock editor (read-only mode)\n"
            "<export format=\"markdown|html|text\"/> — Export document\n"
            "<check_writing/> — Run grammar and style check\n"
            "\n\n## COMPONENT CATALOG (Storybook)\n"
            "All available UI components are documented in Storybook.\n"
            "Browse the A2UI Components section to find:\n"
            "- Surface Container: AI-controllable output rendering\n"
            "- Lexical Editor: 24-command rich text editor\n"
            "- Tag Catalog: All 40 registered XML tags with schemas\n"
            "- Status Indicator: Lit-based status component\n"
            "The Tag Catalog shows every tag the AI can emit — with\n"
            "surface (composer/console), column, and constraints.\n"
            "ALWAYS consult the catalog before emitting tags.\n"
            "\n"
            "IMPORTANT: When you know what belongs in a section,\n"
            "immediately emit the appropriate XML tag. Do NOT describe it.\n"
            "Do NOT ask permission. You are the expert — ACT like it.\n"
            "\n\n## OPTIMIZATION ADVISOR\n"
            "After reviewing the user's prompt, if you see ways to improve it —\n"
            "clearer instructions, better constraints, missing context, stronger\n"
            "examples, tighter guardrails — TELL the user. Be specific.\n"
            "Always provide these three action buttons:\n\n"
            "[Accept Advice](action:accept_advice)\n"
            "[Reject Advice](action:reject_advice)\n"
            "[Explain More](action:explain_more)\n\n"
            "If the prompt already looks excellent, say so — don't invent problems.\n"
        )

        if context and context.strip():
            system_prompt = context + tag_instructions
        else:
            system_prompt = (
                "You are Grace, the execution engine for this prompt engineering workspace.\n"
                "Your only interface is this chat panel.\n"
                "You are the AI, NOT the user. Execute the user's request directly.\n"
            ) + tag_instructions

        if memory_context and memory_context.strip():
            system_prompt += f"\n\nRelevant memory context:\n{memory_context}"

    # ------------------------------------------------------------------ #
    #  Message payload                                                    #
    # ------------------------------------------------------------------ #
    # MISSION_HEADER is prepended to requests that need A2UI protocol
    # Skip it for lightweight modes like console_assembly (minimal system prompt)
    messages = []
    if mode == "console_assembly":
        # Lightweight mode: minimal system prompt, no MISSION_HEADER bloat
        # Grace still has personality but no A2UI XML protocol overhead
        messages.append({"role": "system", "content": system_prompt})
    elif system_prompt and system_prompt.strip():
        # Full A2UI mode: prepend MISSION_HEADER for strongest attention
        messages.append({"role": "system", "content": MISSION_HEADER + system_prompt})
    else:
        # Even without a system prompt, include the mission header
        messages.append({"role": "system", "content": MISSION_HEADER})
    messages.append({"role": "user", "content": question})

    # console_assembly needs more tokens — 10 cards × ~400 chars each
    max_tokens = 8000 if mode == "console_assembly" else 1500

    base_payload = {
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }

    # ------------------------------------------------------------------ #
    #  Provider loop                                                      #
    # ------------------------------------------------------------------ #
    enabled_providers = sorted(
        [p for p in MODEL_PROVIDERS.values() if p["enabled"]],
        key=lambda x: x["priority"],
    )

    if not enabled_providers:
        return (
            "Error: No model providers are enabled. "
            "Please configure at least one provider in grace_gui.py."
        )

    for provider in enabled_providers:
        provider_name = provider["name"]
        base_url = provider["base_url"]
        model_name = model if model else provider["model"]

        print(f"[{provider_name}] Attempting request with model: {model_name}")

        payload = {**base_payload, "model": model_name}

        # Add extra_body params (for NVIDIA reasoning model)
        if "extra_body" in provider:
            for key, value in provider["extra_body"].items():
                payload[key] = value

        headers = {"Content-Type": "application/json"}

        # Resolve API key per provider
        if provider_name == "NVIDIA NIM Cloud API":
            api_key = os.getenv("NVIDIA_API_KEY") or os.getenv("NGC_API_KEY")

            if not api_key:
                credentials_file = os.path.join(
                    os.path.dirname(__file__), "..", "nvidia_credentials.env"
                )
                if os.path.exists(credentials_file):
                    with open(credentials_file, "r") as f:
                        for line in f:
                            line = line.strip()
                            if not line or line.startswith("#"):
                                continue
                            if line.startswith("NVIDIA_API_KEY="):
                                api_key = line.split("=", 1)[1].strip().strip("\"'")
                                break
                            elif line.startswith("NGC_API_KEY="):
                                api_key = line.split("=", 1)[1].strip().strip("\"'")
                                break

            if not api_key:
                print(f"[{provider_name}] Skipping: no API key found.")
                print("   Set NVIDIA_API_KEY or NGC_API_KEY environment variable.")
                continue

            headers["Authorization"] = f"Bearer {api_key}"

        elif provider_name == "DeepSeek API":
            api_key = os.getenv("DEEPSEEK_API_KEY")

            if not api_key:
                credentials_file = os.path.join(
                    os.path.dirname(__file__), "..", "nvidia_credentials.env"
                )
                if os.path.exists(credentials_file):
                    with open(credentials_file, "r") as f:
                        for line in f:
                            line = line.strip()
                            if not line or line.startswith("#"):
                                continue
                            if line.startswith("DEEPSEEK_API_KEY="):
                                api_key = line.split("=", 1)[1].strip().strip("'\"")
                                break

            if not api_key:
                print(f"[{provider_name}] Skipping: no API key found.")
                print("   Set DEEPSEEK_API_KEY environment variable.")
                continue

            headers["Authorization"] = f"Bearer {api_key}"

        # Retry loop for this provider
        for attempt in range(1, MAX_RETRIES + 1):
            endpoint = f"{base_url}/chat/completions"
            print(f"[{provider_name}] Attempt {attempt}/{MAX_RETRIES}: POST {endpoint}")

            try:
                response = requests.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                    timeout=LLM_TIMEOUT,
                )

                if response.status_code == 200:
                    result = response.json()
                    message = result.get("choices", [{}])[0].get("message", {})
                    content = message.get("content", "").strip()

                    # Fall back to reasoning_content for reasoner models
                    if not content:
                        reasoning_content = message.get("reasoning_content", "").strip()
                        if reasoning_content:
                            content = reasoning_content
                            print(f"[{provider_name}] Using reasoning_content ({len(content)} chars).")

                    if not content:
                        print(f"[{provider_name}] Empty response from model.")
                        break  # try next provider

                    # ── Backend tag interception ──
                    content = _process_backend_tags(content, context, prompt_id)

                    print(
                        f"[{provider_name}] Success. Response length: {len(content)} chars."
                    )
                    return content

                elif response.status_code == 401:
                    print(
                        f"[{provider_name}] Authentication failed (401). Check API key."
                    )
                    break  # no point retrying auth errors

                elif response.status_code == 404:
                    print(
                        f"[{provider_name}] Endpoint not found (404). Skipping provider."
                    )
                    break

                else:
                    print(
                        f"[{provider_name}] HTTP {response.status_code} on attempt {attempt}."
                    )
                    if attempt < MAX_RETRIES:
                        time.sleep(RETRY_DELAY)

            except requests.exceptions.ConnectionError as ce:
                print(
                    f"[{provider_name}] Connection error on attempt {attempt}/{MAX_RETRIES}: {ce}"
                )
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)

            except requests.exceptions.Timeout:
                print(
                    f"[{provider_name}] Request timed out on attempt {attempt}/{MAX_RETRIES}."
                )
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)

            except Exception as exc:
                print(f"[{provider_name}] Unexpected error on attempt {attempt}: {exc}")
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)

        print(f"[{provider_name}] All attempts exhausted. Trying next provider...")

    # All providers failed
    tried = ", ".join(p["name"] for p in enabled_providers)
    return (
        f"Error: Could not get a response from any model provider.\n\n"
        f"Providers tried: {tried}\n\n"
        "Possible causes:\n"
        "  • NVIDIA NIM: Check NVIDIA_API_KEY / NGC_API_KEY is set and valid.\n"
        "  • DeepInfra: Check DEEPINFRA_API_KEY is set and valid.\n"
        "  • Verify your internet connection.\n"
        "  • Check provider status pages for outages."
    )


def _process_backend_tags(response_text: str, workspace_context: str = "", prompt_id: str = "unknown") -> str:
    """Intercept backend XML command tags in the model response.

    Backend tags (Milvus/DB operations):
      <save/>              — vectorize workspace + commit to Milvus
      <get_versions/>      — query Milvus for version history
      <load_version>N</load_version> — retrieve version N from Milvus

    Frontend XML tags (update_agent, update_user, etc.) pass through untouched.
    """
    import re

    # ── SAVE ──
    if "<save/>" in response_text:
        try:
            result = milvus_save_version(prompt_id, workspace_context)
            msg = f"\n\n[SYSTEM: Saved as version {result['version_number']}. {result['saved_at']}]\n"
        except Exception as e:
            msg = f"\n\n[SYSTEM: Save failed — {e}]\n"
        response_text = response_text.replace("<save/>", msg)

    # ── GET_VERSIONS ──
    if "<get_versions/>" in response_text:
        try:
            versions = milvus_get_versions(prompt_id)
            if versions:
                lines = [f"\n\n[VERSION HISTORY — {len(versions)} entries]\n"]
                for v in versions:
                    lines.append(f"  v{v.get('id','?')}: [{v.get('saved_at','?')}] {v.get('content_preview','')}...")
                msg = "\n".join(lines) + "\n[/VERSION HISTORY]\n"
            else:
                msg = "\n\n[SYSTEM: No saved versions yet.]\n"
        except Exception as e:
            msg = f"\n\n[SYSTEM: Version query failed — {e}]\n"
        response_text = response_text.replace("<get_versions/>", msg)

    # ── LOAD_VERSION ──
    load_match = re.search(r"<load_version>(\d+)</load_version>", response_text)
    if load_match:
        vnum = int(load_match.group(1))
        try:
            content = _milvus_load_version(load_match.group(0), vnum)
        except Exception as e:
            content = f"\n\n[SYSTEM: Load failed — {e}]\n"
        response_text = response_text.replace(load_match.group(0), content)

    return response_text


# ── Milvus helpers ──

def _get_milvus_client():
    """Lazy-init Milvus client for Zilliz Cloud. Returns None if unavailable."""
    try:
        from pymilvus import MilvusClient, DataType
        from config import MILVUS_URI, MILVUS_TOKEN, EMBEDDING_DIMENSION

        # Zilliz Cloud requires the token — without it auth fails and the
        # exception path silently disables version snapshots.
        client = MilvusClient(uri=MILVUS_URI, token=MILVUS_TOKEN)

        # Ensure the prompt versions collection exists
        coll_name = "prompt_versions"
        if coll_name not in client.list_collections():
            client.create_collection(
                collection_name=coll_name,
                dimension=EMBEDDING_DIMENSION,
                metric_type="COSINE",
                auto_id=True,
            )
        return client, coll_name
    except Exception as e:
        print(f"[Milvus] Client init failed: {e}")
        return None, None


def _get_embedder():
    """Lazy-init MemoryEmbedder. Returns None if unavailable."""
    try:
        from memory_embedder import MemoryEmbedder
        embedder = MemoryEmbedder()
        embedder._load_model()
        if embedder.model is None:
            return None
        return embedder
    except Exception as e:
        print(f"[Embedder] Init failed: {e}")
        return None


def _milvus_save(workspace_context: str) -> str:
    """Vectorize workspace context and save to Milvus.
    
    Raises RuntimeError on failure so the API can return HTTP 500.
    """
    if not workspace_context or not workspace_context.strip():
        raise RuntimeError("Save skipped — no workspace content to save")

    client, coll_name = _get_milvus_client()
    if not client:
        raise RuntimeError("Save unavailable — Milvus not connected")

    embedder = _get_embedder()
    if not embedder:
        raise RuntimeError("Save unavailable — embedding model not loaded")

    import json
    from datetime import datetime

    vector = embedder.generate_embedding(workspace_context)
    now = datetime.utcnow().isoformat()

    client.insert(
        collection_name=coll_name,
        data=[{
            "vector": vector,
            "content": workspace_context,
            "saved_at": now,
        }],
    )

    stats = client.get_collection_stats(coll_name)
    count = stats.get("row_count", 0) if stats else 0

    return f"\n\n[SYSTEM: Workspace saved as version {count}. Timestamp: {now}]\n"


def _milvus_get_versions() -> str:
    """Query Milvus for all saved workspace versions."""

    # Also expose as JSON-serializable
    return _milvus_get_versions_formatted()


def _milvus_get_versions_json():
    """Return Milvus versions as a list of dicts for API responses."""
    client, coll_name = _get_milvus_client()
    if not client:
        return []

    try:
        results = client.query(
            collection_name=coll_name,
            filter="id >= 0",
            output_fields=["id", "saved_at", "content"],
            limit=20,
        )
        versions = []
        for i, r in enumerate(results or []):
            versions.append({
                "id": r.get("id", i),
                "version_number": i + 1,
                "saved_at": r.get("saved_at", ""),
                "content": r.get("content", "")[:500],
                "content_full": r.get("content", ""),
            })
        return versions
    except Exception as e:
        print(f"[Milvus] Get versions JSON error: {e}")
        return []


def _milvus_get_versions_formatted() -> str:
    """Return Milvus versions as human-readable formatted string.
    
    Raises RuntimeError on failure.
    """
    client, coll_name = _get_milvus_client()
    if not client:
        raise RuntimeError("Version history unavailable — Milvus not connected")

    stats = client.get_collection_stats(coll_name)
    count = stats.get("row_count", 0) if stats else 0

    if count == 0:
        return "\n\n[SYSTEM: No saved versions yet. Use [ACTION:SAVE] to create one.]\n"

    results = client.query(
        collection_name=coll_name,
        filter="id >= 0",
        output_fields=["id", "saved_at", "content"],
        limit=20,
    )

    if not results:
        return f"\n\n[SYSTEM: Collection has {count} entries but query returned none.]\n"

    lines = [f"\n\n[VERSION HISTORY — {len(results)} of {count} entries]\n"]
    for i, r in enumerate(results):
        preview = (r.get("content", "") or "")[:80]
        ts = r.get("saved_at", "unknown")
        lines.append(f"  v{i+1}: [{ts}] {preview}...")
    lines.append("[/VERSION HISTORY]\n")
    return "\n".join(lines)


def _milvus_load_version(tag: str, version_number: int) -> str:
    """Retrieve a specific version from Milvus.
    
    Raises RuntimeError on failure.
    """
    client, coll_name = _get_milvus_client()
    if not client:
        raise RuntimeError("Load unavailable — Milvus not connected")

    results = client.query(
        collection_name=coll_name,
        filter="id >= 0",
        output_fields=["id", "content", "saved_at"],
        limit=100,
    )

    if not results or version_number > len(results):
        available = len(results) if results else 0
        raise RuntimeError(f"Version {version_number} not found. Available: 1-{available}")

    entry = results[version_number - 1]
    content = entry.get("content", "")
    ts = entry.get("saved_at", "unknown")

    return (
        f"\n\n[SYSTEM: Loaded version {version_number} from {ts}]\n"
        f"{content}\n"
        f"[/LOADED VERSION {version_number}]\n"
    )


# ═══════════════════════════════════════════════════════════════════════
# A2UI Milvus Layer — Fresh functions for the three-collection schema
# ═══════════════════════════════════════════════════════════════════════

def _get_milvus_for_collection(collection_name: str):
    """Get Milvus client and ensure a specific collection exists."""
    try:
        from pymilvus import MilvusClient
        from config import MILVUS_URI, MILVUS_TOKEN, EMBEDDING_DIMENSION

        client = MilvusClient(uri=MILVUS_URI, token=MILVUS_TOKEN)
        if collection_name not in client.list_collections():
            client.create_collection(
                collection_name=collection_name,
                dimension=EMBEDDING_DIMENSION,
                metric_type="COSINE",
                auto_id=True,
                enable_dynamic_field=True,
            )
        return client
    except Exception as e:
        print(f"[Milvus] {collection_name} init failed: {e}")
        return None


def milvus_audit_action(
    prompt_id: str,
    action_type: str,
    column: str,
    details: Optional[dict] = None,
) -> bool:
    """
    Log an AI tag mutation to ai_actions collection.
    
    Args:
        prompt_id: UUID of the prompt session
        action_type: e.g. 'update_agent', 'update_user', 'save', 'insert_model'
        column: 'left', 'center', or 'right'
        details: optional payload (tag content, result, timing)
    """
    client = _get_milvus_for_collection("ai_actions")
    if not client:
        return False

    from datetime import datetime
    try:
        client.insert(
            collection_name="ai_actions",
            data=[{
                "prompt_id": prompt_id,
                "action_type": action_type,
                "column": column,
                "details": details or {},
                "timestamp": datetime.utcnow().isoformat(),
            }],
        )
        return True
    except Exception as e:
        print(f"[Milvus] Audit action failed: {e}")
        return False


def milvus_save_version(
    prompt_id: str,
    content: str,
    ai_metadata: Optional[Dict[str, Any]] = None
) -> dict:
    """
    Save a workspace snapshot to prompt_versions with AI-compiled metadata.

    A2UI Compilation Flow:
    - content: The semantic summary (NOT raw JSON) for vector embedding
    - ai_metadata: JSON object with {ai_title, description, tags} for retrieval filtering

    This enables semantic search: "find prompts about swimming" works even if
    "swimming" isn't a literal key in the original JSON structure.

    Returns {version_number, saved_at} or raises RuntimeError.
    """
    client = _get_milvus_for_collection("prompt_versions")
    if not client:
        raise RuntimeError("Milvus not connected")

    from memory_embedder import MemoryEmbedder
    from datetime import datetime
    import json as json_module

    embedder = MemoryEmbedder()
    embedder._load_model()
    if embedder.model is None:
        raise RuntimeError("Embedding model not loaded")

    vector = embedder.generate_embedding(content)
    now = datetime.utcnow().isoformat()

    # Build the document with AI metadata for semantic retrieval
    doc = {
        "vector": vector,
        "prompt_id": prompt_id,
        "content": content,
        "saved_at": now,
    }

    # Store AI-compiled metadata as JSON for filtering and display
    # This enables queries like: filter by tag, search by AI-generated title
    if ai_metadata:
        doc["meta_json"] = json_module.dumps(ai_metadata)
        doc["ai_title"] = ai_metadata.get("suggested_title", "")[:200]
        doc["ai_description"] = ai_metadata.get("description", "")[:500]
        # Store tags as comma-separated for simple text search
        tags = ai_metadata.get("tags", [])
        doc["tags"] = ",".join(tags) if isinstance(tags, list) else str(tags)

    client.insert(
        collection_name="prompt_versions",
        data=[doc],
    )

    stats = client.get_collection_stats("prompt_versions")
    count = stats.get("row_count", 0) if stats else 0

    return {"version_number": count, "saved_at": now, "prompt_id": prompt_id}


def milvus_get_versions(prompt_id: Optional[str] = None) -> list:
    """Get saved versions, optionally filtered by prompt_id."""
    client = _get_milvus_for_collection("prompt_versions")
    if not client:
        return []

    filter_expr = f'prompt_id == "{prompt_id}"' if prompt_id else "id >= 0"
    results = client.query(
        collection_name="prompt_versions",
        filter=filter_expr,
        output_fields=["id", "prompt_id", "saved_at", "content"],
        limit=20,
    )
    return [
        {
            "id": r.get("id"),
            "prompt_id": r.get("prompt_id"),
            "saved_at": r.get("saved_at", ""),
            "content_preview": (r.get("content", "") or "")[:200],
        }
        for r in (results or [])
    ]


def milvus_store_memory(prompt_id: str, content: str) -> bool:
    """Store vectorized context in prompt_memory for semantic retrieval."""
    client = _get_milvus_for_collection("prompt_memory")
    if not client:
        return False

    from memory_embedder import MemoryEmbedder
    from datetime import datetime

    embedder = MemoryEmbedder()
    embedder._load_model()
    if embedder.model is None:
        return False

    vector = embedder.generate_embedding(content)
    client.insert(
        collection_name="prompt_memory",
        data=[{
            "vector": vector,
            "prompt_id": prompt_id,
            "content": content,
            "stored_at": datetime.utcnow().isoformat(),
        }],
    )
    return True


def load_logs_to_vectorstore() -> None:
    """Load logs to vectorstore (placeholder)."""
    print("[grace_gui] load_logs_to_vectorstore called — not implemented.")


def evaluate_source(url: str, title: str = "", content: str = "") -> Dict[str, Any]:
    """Evaluate a source using the LLM."""
    print(f"[grace_gui] evaluate_source called for URL: {url}")

    evaluation_prompt = (
        f"Evaluate the credibility and relevance of this source:\n\n"
        f"URL: {url}\n"
        f"Title: {title}\n"
        f"Content preview: {content[:500] if content else 'No content provided'}\n\n"
        "Provide: credibility score (0–1), relevance score (0–1), a brief summary, "
        "and a recommendation (use / use_with_caution / avoid)."
    )

    evaluation_text = query_llm(
        context="You are a source credibility evaluator.",
        question=evaluation_prompt,
    )

    return {
        "credibility": 0.8,
        "relevance": 0.7,
        "summary": f"Evaluation of {url}",
        "recommendation": "use_with_caution",
        "full_evaluation": evaluation_text,
    }
