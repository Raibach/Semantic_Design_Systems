"""Service singletons and startup initialization.
Extracted from main.py during modularization — zero behavior change.
Route modules import these via: import services"""
import os
import sys
import traceback

from conversation_api import ConversationAPI
from projects_api import ProjectsAPI
from grace_memory_api import GraceMemoryAPI
from prompt_sessions_api import PromptSessionsAPI
from tag_extractor import TagExtractor

conversation_api = None
projects_api = None
memory_api = None
tag_extractor = None
prompt_sessions_api = None


def init_services(database_url: str) -> None:
    global conversation_api, projects_api, memory_api, tag_extractor, prompt_sessions_api
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
