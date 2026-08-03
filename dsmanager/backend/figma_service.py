"""
Figma API Service — connects to Figma files, components, styles, and version history.
Stores references in PostgreSQL for fast local access.
"""
import os
import json
import time
from typing import Optional, Dict, List, Any
import requests

FIGMA_TOKEN = os.getenv("FIGMA_TOKEN", "")
FIGMA_BASE = "https://api.figma.com/v1"

def _headers():
    return {"X-FIGMA-TOKEN": FIGMA_TOKEN} if FIGMA_TOKEN else {}

def get_file(file_key: str, depth: int = 2) -> Optional[Dict]:
    """Get full Figma file data including components and styles."""
    if not FIGMA_TOKEN:
        return {"error": "FIGMA_TOKEN not configured"}
    try:
        r = requests.get(
            f"{FIGMA_BASE}/files/{file_key}",
            headers=_headers(),
            params={"depth": depth, "geometry": "paths"},
            timeout=30,
        )
        if r.status_code == 200:
            data = r.json()
            return {
                "name": data.get("name"),
                "last_modified": data.get("lastModified"),
                "version": data.get("version"),
                "thumbnail_url": data.get("thumbnailUrl"),
                "components": data.get("components", {}),
                "component_sets": data.get("componentSets", {}),
                "styles": data.get("styles", {}),
            }
        return {"error": f"Figma API returned {r.status_code}", "detail": r.text[:200]}
    except Exception as e:
        return {"error": str(e)}

def get_file_versions(file_key: str) -> Optional[Dict]:
    """Get version history for a Figma file."""
    if not FIGMA_TOKEN:
        return {"error": "FIGMA_TOKEN not configured"}
    try:
        r = requests.get(
            f"{FIGMA_BASE}/files/{file_key}/versions",
            headers=_headers(),
            timeout=30,
        )
        if r.status_code == 200:
            data = r.json()
            return {
                "versions": data.get("versions", []),
                "pagination": data.get("pagination", {}),
            }
        return {"error": f"Figma API returned {r.status_code}"}
    except Exception as e:
        return {"error": str(e)}

def get_file_comments(file_key: str) -> Optional[Dict]:
    """Get comments on a Figma file."""
    if not FIGMA_TOKEN:
        return {"error": "FIGMA_TOKEN not configured"}
    try:
        r = requests.get(
            f"{FIGMA_BASE}/files/{file_key}/comments",
            headers=_headers(),
            timeout=30,
        )
        if r.status_code == 200:
            return {"comments": r.json().get("comments", [])}
        return {"error": f"Figma API returned {r.status_code}"}
    except Exception as e:
        return {"error": str(e)}

def get_component(file_key: str, component_id: str) -> Optional[Dict]:
    """Fetch a specific component from a file."""
    data = get_file(file_key)
    if not data or "error" in data:
        return data
    components = data.get("components", {})
    comp = components.get(component_id)
    if comp:
        return {"component": comp, "file_name": data.get("name"), "file_version": data.get("version")}
    return {"error": f"Component {component_id} not found", "available": list(components.keys())[:10]}

def get_dev_resources(file_key: str, node_id: Optional[str] = None) -> Optional[Dict]:
    """Get dev resources (Code Connect annotations) from a Figma file."""
    if not FIGMA_TOKEN:
        return {"error": "FIGMA_TOKEN not configured"}
    try:
        url = f"{FIGMA_BASE}/files/{file_key}/dev_resources"
        params = {}
        if node_id:
            params["node_id"] = node_id
        r = requests.get(url, headers=_headers(), params=params, timeout=30)
        if r.status_code == 200:
            return {"dev_resources": r.json().get("dev_resources", [])}
        return {"error": f"Figma API returned {r.status_code}"}
    except Exception as e:
        return {"error": str(e)}

def get_node(file_key: str, node_id: str) -> Optional[Dict]:
    """Get a specific node from a Figma file (e.g., a frame or component instance)."""
    if not FIGMA_TOKEN:
        return {"error": "FIGMA_TOKEN not configured"}
    try:
        r = requests.get(
            f"{FIGMA_BASE}/files/{file_key}/nodes",
            headers=_headers(),
            params={"ids": node_id, "geometry": "paths"},
            timeout=30,
        )
        if r.status_code == 200:
            nodes = r.json().get("nodes", {})
            return nodes.get(node_id.replace("-", ":"), {"error": "node not found"})
        return {"error": f"Figma API returned {r.status_code}"}
    except Exception as e:
        return {"error": str(e)}

def search_file(file_key: str, query: str) -> Optional[Dict]:
    """Search for nodes by name in a Figma file."""
    data = get_file(file_key, depth=3)
    if not data or "error" in data:
        return data
    
    results = []
    def search_node(node, path=""):
        name = node.get("name", "")
        if query.lower() in name.lower():
            results.append({"name": name, "id": node.get("id"), "type": node.get("type"), "path": path})
        for child in node.get("children", []):
            search_node(child, f"{path}/{name}" if path else name)
    
    if "document" in data:
        search_node(data["document"])
    
    return {"results": results[:50], "query": query, "file_name": data.get("name")}


# ─────────────────────────────────────────────────────────────────────────────
# DESIGN SPEC EXTRACTION — Figma → Lit catalog feed
# Normalizes a Figma node tree into a style spec the Lit components and the
# A2UI catalog consume: every fill, stroke, effect, font, weight, size,
# line height, letter spacing, layout value, and bounding box. No rounding,
# no dropped values — the spec carries Figma's numbers verbatim.
# ─────────────────────────────────────────────────────────────────────────────

def _figma_color(c: Optional[Dict]) -> Optional[Dict]:
    """Figma RGBA (0-1 floats) → hex + alpha, lossless."""
    if not c:
        return None
    r = round(c.get("r", 0) * 255)
    g = round(c.get("g", 0) * 255)
    b = round(c.get("b", 0) * 255)
    return {
        "hex": f"#{r:02X}{g:02X}{b:02X}",
        "alpha": c.get("a", 1),
        "r": r, "g": g, "b": b,
    }


def _figma_paint(p: Dict) -> Dict:
    """Normalize one fill/stroke paint entry."""
    out = {"type": p.get("type"), "visible": p.get("visible", True)}
    if p.get("type") == "SOLID":
        out["color"] = _figma_color(p.get("color"))
        out["opacity"] = p.get("opacity", 1)
    elif p.get("type") == "IMAGE":
        out["scaleMode"] = p.get("scaleMode")
        out["imageRef"] = p.get("imageRef")
    elif p.get("type", "").startswith("GRADIENT"):
        out["gradientStops"] = [
            {"position": s.get("position"), "color": _figma_color(s.get("color"))}
            for s in p.get("gradientStops", [])
        ]
    return out


_LAYOUT_KEYS = (
    "layoutMode", "primaryAxisAlignItems", "counterAxisAlignItems",
    "itemSpacing", "paddingLeft", "paddingRight", "paddingTop",
    "paddingBottom", "layoutAlign", "layoutGrow",
)

_TEXT_STYLE_KEYS = (
    "fontFamily", "fontPostScriptName", "fontWeight", "fontSize",
    "lineHeightPx", "lineHeightPercentFontSize", "letterSpacing",
    "textAlignHorizontal", "textAlignVertical", "textCase", "textDecoration",
)


def extract_node_spec(node: Dict) -> Dict:
    """
    Recursively extract the full design spec of a Figma node.

    Every node contributes: id, name, type, absolute bounds, fills, strokes
    (+ weight/align), corner radius, effects (drop shadows with offset,
    radius, spread, color), auto-layout values, and — for TEXT layers — the
    complete type style (family, PostScript name, weight, size, line height
    px + %, letter spacing, alignment, case, decoration).

    CAVEAT (2026-08-01): If a node has no children, fills, layout, or any
    design data, this returns {"id":..., "name":..., "type":...} which is
    TRUTHY but USELESS — it passes `if spec` checks but has zero design info.
    The caller (ai.py) now validates that the spec has actual design data
    (children, layout, or fills) before accepting it.

    DEAD NODE: Figma node 40000717:17091 in file 20UPR2KQMsbAxlo5NJb1se
    currently returns an empty spec (48 chars, zero children). This node
    may have been deleted or moved. The ai.py render-composer handler will
    reject this with a 503 until a valid node ID is provided.
    """
    spec: Dict[str, Any] = {
        "id": node.get("id"),
        "name": node.get("name"),
        "type": node.get("type"),
    }

    bb = node.get("absoluteBoundingBox")
    if bb:
        spec["bounds"] = {
            "x": bb.get("x"), "y": bb.get("y"),
            "width": bb.get("width"), "height": bb.get("height"),
        }

    fills = [_figma_paint(f) for f in (node.get("fills") or [])]
    if fills:
        spec["fills"] = fills

    strokes = [_figma_paint(s) for s in (node.get("strokes") or [])]
    if strokes:
        spec["strokes"] = strokes
        spec["strokeWeight"] = node.get("strokeWeight")
        spec["strokeAlign"] = node.get("strokeAlign")

    if node.get("cornerRadius") is not None:
        spec["cornerRadius"] = node.get("cornerRadius")
    if node.get("rectangleCornerRadii") is not None:
        spec["rectangleCornerRadii"] = node.get("rectangleCornerRadii")

    effects = []
    for e in node.get("effects") or []:
        eff: Dict[str, Any] = {"type": e.get("type"), "visible": e.get("visible", True)}
        if e.get("type") == "DROP_SHADOW":
            off = e.get("offset", {})
            eff.update({
                "x": off.get("x"), "y": off.get("y"),
                "radius": e.get("radius"), "spread": e.get("spread"),
                "color": _figma_color(e.get("color")),
            })
        effects.append(eff)
    if effects:
        spec["effects"] = effects

    layout = {k: node[k] for k in _LAYOUT_KEYS if k in node}
    if layout:
        spec["layout"] = layout

    if node.get("type") == "TEXT":
        style = node.get("style", {})
        spec["text"] = {
            "characters": node.get("characters"),
            **{k: style[k] for k in _TEXT_STYLE_KEYS if k in style},
        }

    children = [extract_node_spec(c) for c in (node.get("children") or [])]
    if children:
        spec["children"] = children

    return spec


# ─────────────────────────────────────────────────────────────────────────────
# CACHE-FIRST SPEC ACCESSOR
# Single source of truth for "give me a usable spec for this node." Used by
# both the spec endpoint (figma.py /api/figma/spec) and runtime A2UI surface
# assembly (ai.py render-* handlers). Runtime rendering must NEVER block on
# live Figma — it reads the PostgreSQL figma_specs cache first and only falls
# back to Figma on miss. This is the foundation of Figma-as-source-of-truth
# for the Lit catalog: design is synced at authoring time, consumed from
# cache at render time.
# ─────────────────────────────────────────────────────────────────────────────

def _spec_has_design_data(spec: Optional[Dict]) -> bool:
    """A spec is usable only if it carries real design data, not just
    {id, name, type}. extract_node_spec returns the bare triple for dead/
    empty nodes — those must not satisfy a cache hit (see DEAD NODE caveat
    on extract_node_spec)."""
    if not spec or not isinstance(spec, dict):
        return False
    return bool(spec.get("children") or spec.get("layout") or spec.get("fills"))


def _spec_db_conn():
    """Open a Postgres connection to the figma_specs cache. Best-effort: the
    caller decides how to handle a missing/unreachable DB."""
    import psycopg2
    from psycopg2.extras import RealDictCursor
    return psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=RealDictCursor)


def _cache_read(file_key: str, node_id: str) -> Optional[Dict]:
    """Read a cached spec row. Returns the spec dict or None on miss/absence.
    Any DB error is swallowed (caller falls through to Figma)."""
    try:
        conn = _spec_db_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT file_key, node_id, name, spec, synced_at FROM figma_specs "
            "WHERE file_key = %s AND node_id = %s",
            (file_key, node_id),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        return row
    except Exception as e:
        print(f"⚠️ figma_specs cache read failed (falling through to Figma): {e}")
        return None


def _cache_upsert(file_key: str, node_id: str, name: Optional[str], spec: Dict) -> None:
    """Write a spec row. Best-effort: a cache write failure never blocks the
    caller — the spec is still returned to the requester."""
    try:
        conn = _spec_db_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO figma_specs (file_key, node_id, name, spec, synced_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (file_key, node_id)
            DO UPDATE SET name = EXCLUDED.name, spec = EXCLUDED.spec, synced_at = NOW()
            """,
            (file_key, node_id, name, json.dumps(spec)),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"⚠️ figma_specs cache upsert failed (spec still returned): {e}")


def _fetch_and_cache(file_key: str, node_id: str) -> tuple[Optional[Dict], Optional[str]]:
    """Pull a node live from Figma, extract its spec, and upsert the cache.
    Returns (spec, error_detail). spec is None when the node is missing or
    returned an empty/dead spec (caller should treat as a miss)."""
    raw = get_node(file_key, node_id)
    if not raw:
        return None, f"Figma returned no data for node {node_id}"
    if raw.get("error"):
        return None, f"Figma API error: {raw['error']}"

    # get_node returns the per-node envelope; the node document is nested.
    document = raw.get("document", raw)
    spec = extract_node_spec(document)
    if not _spec_has_design_data(spec):
        # Dead/empty node — do NOT cache garbage. Let the caller fall back.
        return None, (
            f"Figma node {node_id} returned EMPTY spec "
            f"(no children, no layout, no fills). The node may have been "
            f"deleted or moved in file {file_key}. "
            f"Spec keys received: {list(spec.keys())}"
        )
    _cache_upsert(file_key, node_id, document.get("name"), spec)
    return spec, None


def get_cached_spec(
    file_key: str,
    node_id: str,
    *,
    refresh: bool = False,
    allow_stale_fallback: bool = True,
) -> tuple[Optional[Dict], Optional[str], str]:
    """
    Cache-first spec accessor — the single entry point for render time.

    Resolution order:
      1. Cache (PostgreSQL figma_specs) — unless refresh=True or DEV mode.
         In DEV mode the cache is bypassed for read so every pull is fresh.
      2. Live Figma pull + cache upsert.
      3. Stale-cache fallback — if the live pull fails/returns an empty spec
         AND allow_stale_fallback is True, serve whatever is in the cache so
         runtime rendering survives transient Figma outages or dead nodes.
      4. Give up.

    Returns (spec, error_detail, source) where source is one of:
      "cache" | "figma" | "stale-cache" | "miss".

    Figma is the source of truth for surface layout, but runtime assembly
    consumes it via this cache so a designer closing Figma, a network
    blip, or a momentarily-empty node never takes down a surface.
    """
    node_id = node_id.replace("-", ":")

    # 1) Cache read (skipped on refresh or in dev, to keep authoring loops hot)
    if not refresh:
        try:
            from config import is_development
            dev = is_development()
        except Exception:
            dev = False
        if not dev:
            row = _cache_read(file_key, node_id)
            if row and _spec_has_design_data(row.get("spec")):
                return row["spec"], None, "cache"

    # 2) Live Figma pull + cache upsert
    spec, err = _fetch_and_cache(file_key, node_id)
    if spec:
        return spec, None, "figma"

    # 3) Stale-cache fallback (only triggered when the live pull failed)
    if allow_stale_fallback:
        row = _cache_read(file_key, node_id)
        if row and _spec_has_design_data(row.get("spec")):
            print(
                f"[figma] serving STALE cache for {file_key}/{node_id} "
                f"(live pull failed: {err})"
            )
            return row["spec"], err, "stale-cache"

    # 4) Nothing usable
    return None, err or "Figma spec is None", "miss"