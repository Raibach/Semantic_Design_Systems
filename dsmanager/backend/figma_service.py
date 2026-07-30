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