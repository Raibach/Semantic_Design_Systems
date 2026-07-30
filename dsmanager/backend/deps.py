"""Shared dependencies: config constants, A2UI catalog, and helper functions.
Extracted from main.py during modularization — zero behavior change."""
import json
import os
import sys
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

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


def get_user_id_from_header(x_user_id: Optional[str] = None) -> str:
    """Get user ID from header or use default placeholder"""
    # NOTE: Auth uses X-User-ID header; falls back to DEFAULT_USER_ID env var
    if x_user_id:
        return x_user_id
    # For now, use a default user ID (will be replaced with real auth)
    return os.getenv("DEFAULT_USER_ID", "00000000-0000-0000-0000-000000000001")
