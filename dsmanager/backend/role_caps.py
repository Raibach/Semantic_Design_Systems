"""
Role-to-Capability Resolution — Backend mirror of frontend/src/shared/role-caps.ts

This module resolves a user's departmental role from the database (users.prompt_role)
and returns the filtered set of AI tags, visible tabs, and governance tables for that role.

Two dimensions of access:
  1. Departmental role (users.prompt_role) — what you SEE (tabs, tags, data views)
  2. Session permission (session_permissions.role) — what you can DO (owner/editor/viewer)

This module handles dimension 1. Session permissions are enforced in prompt_sessions_api.py.

The AI manifest endpoint (/api/ai/manifest) uses get_filtered_manifest() to return
only the tags the user's role permits. The AI literally cannot emit tags that aren't
in its system prompt — role filtering happens before the LLM is called.
"""

import json
import os
from typing import Any, Dict, List, Optional

# ═══════════════════════════════════════════════════════════════════════════════
# Departmental roles — must match frontend/src/shared/role-caps.ts
# ═══════════════════════════════════════════════════════════════════════════════

VALID_DEPARTMENTAL_ROLES = {"governance", "ux-design", "research", "product", "basic"}

# ═══════════════════════════════════════════════════════════════════════════════
# Role → Capability mapping (mirrors role-caps.ts ROLE_CAPABILITIES)
# ═══════════════════════════════════════════════════════════════════════════════
# If you change this dict, also change ROLE_CAPABILITIES in role-caps.ts.

ROLE_CAPABILITIES: Dict[str, Dict[str, Any]] = {
    "governance": {
        "label": "Governance",
        "persona": "Corporate director, compliance officer, department head",
        "driving_question": "How much did this prompt cost the company, and is the AI behaving safely?",
        "tabs": ["trace", "metadata"],
        "allowed_tags": [
            "version-trace",
            "status-indicator",
            "error-banner",
            "dynamic-button",
        ],
        "governance_tables": [
            "grace_decisions", "grace_health_metrics", "audit_logs",
            "usage_metrics", "data_dignity_ledger", "prompt_history",
            "memory_provenance",
        ],
        "can_author": False,
        "sees_cost_data": True,
        "sees_decision_trace": True,
        "sees_quality_metrics": True,
        "sees_cross_departmental_data": True,
    },
    "ux-design": {
        "label": "UX Design",
        "persona": "Design system manager, component librarian",
        "driving_question": "How are the components performing, and is the design system being followed?",
        "tabs": ["chat", "trace", "tools", "variables"],
        "allowed_tags": [
            "prompt-section-editor", "compiled-output-viewer", "workspace-layout",
            "toggle_code_view", "output-panel", "version-trace",
            "status-indicator", "error-banner", "dynamic-button",
        ],
        "governance_tables": [
            "prompt_versions", "prompt_artifacts", "prompt_feedback",
            "prompt_ratings", "figma_specs", "tag_definitions",
        ],
        "can_author": True,
        "sees_cost_data": False,
        "sees_decision_trace": False,
        "sees_quality_metrics": True,
        "sees_cross_departmental_data": False,
    },
    "research": {
        "label": "Research",
        "persona": "Researcher, analyst, synthesizer",
        "driving_question": "Can I synthesize my discovery notes and cross-reference other prompts?",
        "tabs": ["chat", "trace", "evaluation"],
        "allowed_tags": [
            "load_tool", "close_tool", "set_content", "insert_text", "append_text",
            "format_text", "format_block", "format_align", "format_font",
            "clear_formatting", "insert_table", "insert_link",
            "insert_horizontal_rule", "insert_code_block", "insert_image",
            "undo", "redo", "toggle_code_view", "toggle_lock", "export",
            "check_writing", "apply_suggestion", "dismiss_suggestion",
            "start_dictation", "stop_dictation",
            "status-indicator", "error-banner", "dynamic-button",
        ],
        "governance_tables": [
            "training_data", "prompt_feedback", "prompt_comments", "prompt_versions",
        ],
        "can_author": True,
        "sees_cost_data": False,
        "sees_decision_trace": False,
        "sees_quality_metrics": True,
        "sees_cross_departmental_data": False,
    },
    "product": {
        "label": "Product",
        "persona": "Product manager, product designer",
        "driving_question": "Can I assemble wireframes using approved design system components for ideation?",
        "tabs": ["chat", "trace", "tools"],
        "allowed_tags": [
            "prompt-section", "save-button", "run-button",
            "output-panel", "version-trace", "layout-row", "layout-col",
            "prompt-section-editor", "compiled-output-viewer", "workspace-layout",
            "chat-panel", "status-indicator", "error-banner", "dynamic-button",
        ],
        "governance_tables": [
            "prompt_versions", "prompt_artifacts", "prompt_feedback",
            "prompt_ratings", "prompt_history",
        ],
        "can_author": True,
        "sees_cost_data": False,
        "sees_decision_trace": True,
        "sees_quality_metrics": False,
        "sees_cross_departmental_data": False,
    },
    "basic": {
        "label": "User",
        "persona": "Agnes in Accounting — most users who just run the prompt",
        "driving_question": "I just need to run this prompt and get my answer.",
        "tabs": ["chat"],
        "allowed_tags": ["chat-panel", "status-indicator", "error-banner"],
        "governance_tables": [],
        "can_author": False,
        "sees_cost_data": False,
        "sees_decision_trace": False,
        "sees_quality_metrics": False,
        "sees_cross_departmental_data": False,
    },
}

# ═══════════════════════════════════════════════════════════════════════════════
# DB lookup
# ═══════════════════════════════════════════════════════════════════════════════

def get_user_role(user_id: str) -> str:
    """
    Look up a user's departmental role from the database.

    Reads users.prompt_role (default 'basic' if column is NULL or user not found).
    Falls back to 'basic' on any error — never raises, never blocks rendering.

    The role drives what the user SEES (tabs, tags, data views).
    Session permissions (owner/editor/viewer) drive what the user can DO.
    """
    try:
        from database_pool import DatabasePoolManager
        pool = DatabasePoolManager.get_instance()
        with pool.get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT prompt_role FROM users WHERE id = %s",
                (user_id,)
            )
            row = cur.fetchone()
            cur.close()
            if row and row.get("prompt_role"):
                role = row["prompt_role"]
                if role in VALID_DEPARTMENTAL_ROLES:
                    return role
                # Unknown role in DB — fall back to basic, log it
                print(f"[role_caps] Unknown prompt_role '{role}' for user {user_id}, falling back to 'basic'")
            return "basic"
    except Exception as e:
        # Never block rendering — fall back to basic
        print(f"[role_caps] Could not look up role for user {user_id}: {e}, falling back to 'basic'")
        return "basic"


# ═══════════════════════════════════════════════════════════════════════════════
# Capability accessors
# ═══════════════════════════════════════════════════════════════════════════════

def get_role_capabilities(role: str) -> Dict[str, Any]:
    """Get the full capability set for a departmental role. Falls back to 'basic'."""
    return ROLE_CAPABILITIES.get(role, ROLE_CAPABILITIES["basic"])


def get_allowed_tags(role: str) -> List[str]:
    """Get the list of AI tags a role is permitted to emit."""
    return get_role_capabilities(role).get("allowed_tags", [])


def get_visible_tabs(role: str) -> List[str]:
    """Get the list of right-column tabs visible to a role."""
    return get_role_capabilities(role).get("tabs", ["chat"])


def get_governance_tables(role: str) -> List[str]:
    """Get the list of governance tables a role can query."""
    return get_role_capabilities(role).get("governance_tables", [])


def role_can_author(role: str) -> bool:
    """Check if a role can author/edit prompt content."""
    return get_role_capabilities(role).get("can_author", False)


def role_sees_cost_data(role: str) -> bool:
    """Check if a role sees cost/financial data."""
    return get_role_capabilities(role).get("sees_cost_data", False)


def role_sees_decision_trace(role: str) -> bool:
    """Check if a role sees AI decision traces (reasoning, confidence, overrides)."""
    return get_role_capabilities(role).get("sees_decision_trace", False)


# ═══════════════════════════════════════════════════════════════════════════════
# Manifest filtering
# ═══════════════════════════════════════════════════════════════════════════════

def get_filtered_manifest(user_id: str, full_manifest: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Return the AI playground manifest filtered by the user's departmental role.

    If full_manifest is provided, filter its tags to only those the role permits.
    If not provided, return just the allowed tag names and capability flags.

    This is what the /api/ai/manifest endpoint calls. The filtered manifest is
    injected into the LLM system prompt — the AI literally cannot emit tags
    that aren't in its prompt.
    """
    role = get_user_role(user_id)
    caps = get_role_capabilities(role)
    allowed_tags = set(caps.get("allowed_tags", []))

    if full_manifest:
        # Filter the full tag registry to only allowed tags
        filtered = {}
        for tag_name, tag_def in full_manifest.items():
            if tag_name in allowed_tags:
                filtered[tag_name] = tag_def
        return {
            "manifest": filtered,
            "role": role,
            "tabs": caps.get("tabs", ["chat"]),
            "can_author": caps.get("can_author", False),
            "sees_cost_data": caps.get("sees_cost_data", False),
            "sees_decision_trace": caps.get("sees_decision_trace", False),
            "sees_quality_metrics": caps.get("sees_quality_metrics", False),
            "tag_count": len(filtered),
        }

    return {
        "role": role,
        "allowed_tags": list(allowed_tags),
        "tabs": caps.get("tabs", ["chat"]),
        "can_author": caps.get("can_author", False),
        "sees_cost_data": caps.get("sees_cost_data", False),
        "sees_decision_trace": caps.get("sees_decision_trace", False),
        "sees_quality_metrics": caps.get("sees_quality_metrics", False),
    }


def get_role_manifest_json() -> str:
    """Export the full role capabilities matrix as JSON (for API endpoints)."""
    return json.dumps(ROLE_CAPABILITIES, indent=2)
