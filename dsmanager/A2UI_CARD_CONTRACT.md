# A2UI Agent Card — Figma Template Contract

> **Purpose:** This document gives you the exact tagging, data injection paths, and schema contracts needed to build the `agent-card` Figma template so the AI can call it and the Lit component can render it pixel-identical.

---

## 1. Design Source of Truth

| Item | Value |
|------|-------|
| **Figma File Key** | `20UPR2KQMsbAxlo5NJb1se` |
| **Figma Node ID** | `40000717:17091` |
| **Figma Node Name** | `console-card` |
| **Spec Endpoint** | `GET /api/figma/spec/20UPR2KQMsbAxlo5NJb1se/40000717:17091` |
| **Lit Component** | `<agent-card-element>` |
| **Catalog Component ID** | `agent-card` |

The spec endpoint returns every fill, stroke, effect, font, weight, size, line height, and bounding box extracted from the Figma node. It is cached in PostgreSQL (`figma_specs` table) and refreshed on demand.

---

## 2. Figma Node → Lit Component → Catalog Mapping

The A2UI system connects these three layers through consistent naming:

```
Figma Node (40000717:17091)
    │
    ├── Spec extracted via /api/figma/spec → cached in PostgreSQL
    │
    ├── Lit component <agent-card-element> renders pixel-identical
    │   (reads CSS custom properties: --card-bg, --card-title-color, --card-text-color)
    │
    └── A2UI Catalog schema defines the JSON contract the AI must emit
```

---

## 3. Card Dimensions & Layout Structure

| Property | Value |
|----------|-------|
| **Outer dimensions** | 276 × 372 px |
| **Padding** | 10 px all sides |
| **Gap between regions** | 10 px |
| **Border radius** | 10 px |
| **Border** | 1 px solid #FFFFFF (inside) |
| **Shadow** | Dual drop shadow: `4px 4px 10px rgba(0,0,0,0.15)` + `-4px -4px 5px rgba(0,0,0,0.1)` |

### Vertical Regions (inside the 10px padding)

| Region | Height | Content |
|--------|--------|---------|
| **card-header** | 54 px | Molecule logo (39×35) + model name + category |
| **card-content** | 201 px | Title + description + divider line |
| **author-section** | 39 px | Avatar (41×39 pill) + @username + team/role |
| **footer-details** | 28 px | Version pill (164×28) + likes count + heart icon |

**Content height sum:** 54 + 201 + 39 + 28 = **322 px**  
**Plus padding + gaps:** 322 + (3 gaps × 10) = **352 px** inside 372 px card (10 px top + 10 px bottom padding)

---

## 4. Data Fields & Injection Paths

These are the **exact fields** the Lit component expects as HTML attributes. They come from PostgreSQL via the AI's surface assembly response.

### 4.1 HTML Attributes (Lit Reactive Properties)

| Attribute | Type | Description | Source |
|-----------|------|-------------|--------|
| `id` | string (UUID) | Card / session identifier | `prompt_sessions.id` |
| `title` | string | Card title (2-line clamp) | `prompt_sessions.title` |
| `category` | string | Category label | `prompt_sessions.category` |
| `model-name` | string | LLM model name | `prompt_sessions.model_name` |
| `description` | string | Card description (6-line clamp) | `prompt_sessions.description` |
| `status` | string | `Active` / `Draft` / `Archived` | `prompt_sessions.status` |
| `version` | number | Version number (capped at 99) | `prompt_sessions.current_version` |
| `likes` | number | Like count | `prompt_sessions.likes` |
| `username` | string | Author handle (shown as `@username`) | `metadata.username` or `author_email` prefix |
| `team-name` | string | Team / role line | `prompt_sessions.team_name` |
| `avatar-url` | string | Avatar image URL | `prompt_sessions.avatar_url` |
| `created-at` | string (ISO) | Creation timestamp | `prompt_sessions.created_at` |
| `last-used` | string (ISO) | Last accessed timestamp | `prompt_sessions.last_accessed_at` |
| `category-color` | string (hex) | Card background tint | `categories.color` |
| `category-title-color` | string (hex) | Category label text color | `categories.title_color` |
| `category-text-color` | string (hex) | Title + description text color | `categories.text_color` |

### 4.2 CSS Custom Properties (Theming)

The Lit component applies these via inline style on the `.card` element:

```css
--card-bg: ${category-color};
--card-title-color: ${category-title-color};
--card-text-color: ${category-text-color};
```

**Validation:** Only safe CSS color tokens are accepted (`#hex`, `rgb()`, `hsl()`, named colors). Invalid values fall back to Figma defaults:
- Background: `#658D1B`
- Title: `#F6C031`
- Text: `#2A2836`

### 4.3 Category Enum (Valid Values)

The catalog restricts `category` to:
- `Design System`
- `Learning Module`
- `Graphics`
- `Writing`
- `Coding`

---

## 5. A2UI Catalog Schema Contract

This is the **exact JSON schema** the AI must emit when including an `agent-card` in a surface assembly response.

```json
{
  "id": "card-001",
  "component": "agent-card",
  "id": "uuid-here",
  "title": "API Documentation Writer",
  "model_name": "DeepSeek",
  "category": "Writing",
  "category_color": "#658D1B",
  "category_title_color": "#F6C031",
  "category_text_color": "#2A2836",
  "description": "Generates comprehensive API documentation from OpenAPI specs",
  "status": "Active",
  "version": 3,
  "likes": 42,
  "username": "johndoe",
  "author": "John Doe",
  "team_name": "Platform Team",
  "avatar_url": "https://...",
  "created_at": "2026-07-27T10:00:00Z",
  "last_used": "2026-07-28T08:30:00Z"
}
```

**Required fields:** `component`, `id`, `title`  
**All other fields have defaults** (see catalog schema).

---

## 6. How the AI Calls the Card (Surface Assembly)

### 6.1 Endpoint

```
POST /api/ai/assemble-surface
```

### 6.2 Intent for Console

```json
{
  "intent": "render-console"
}
```

### 6.3 AI Response Envelope (A2UI v0.9.1)

The AI returns an array of protocol messages. The card grid is declared as a `ConsoleCardGrid` component bound to `/cards`:

```json
[
  {
    "version": "v0.9.1",
    "createSurface": {
      "surfaceId": "main",
      "catalogId": "https://raibach.net/a2ui/catalogs/prompt-composer/v0_9_1/catalog.json"
    }
  },
  {
    "version": "v0.9.1",
    "updateComponents": {
      "surfaceId": "main",
      "components": [
        {"id": "root", "component": "Column", "children": ["header", "card-grid"]},
        {"id": "header", "component": "Text", "text": "Welcome back!", "variant": "greeting"},
        {"id": "card-grid", "component": "ConsoleCardGrid", "items": {"path": "/cards"}}
      ]
    }
  },
  {
    "version": "v0.9.1",
    "updateDataModel": {
      "surfaceId": "main",
      "path": "/",
      "value": {
        "cards": [
          {
            "id": "uuid-1",
            "title": "API Docs Writer",
            "category": "Writing",
            "category_color": "#658D1B",
            "category_title_color": "#F6C031",
            "category_text_color": "#2A2836",
            "description": "...",
            "status": "Active",
            "version": 3,
            "likes": 42,
            "model_name": "DeepSeek",
            "team_name": "Platform",
            "avatar_url": "https://...",
            "username": "johndoe",
            "created_at": "...",
            "last_used": "..."
          }
        ]
      }
    }
  }
]
```

### 6.4 Data Flow

```
PostgreSQL (prompt_sessions + categories tables)
        │
        ├── AI receives session summaries (id, title, category)
        ├── AI returns card IDs in desired order
        └── Backend hydrates FULL card fields from DB (sessions_by_id)
                    │
                    ▼
            updateDataModel → /cards
                    │
                    ▼
            ConsoleCardGrid (LitCardGrid + PromptDashboardCanvas)
                    │
                    ▼
            <agent-card-element> per card item
```

---

## 7. Typography Spec (from Figma Node)

| Element | Font | Weight | Size | Line Height | Color |
|---------|------|--------|------|-------------|-------|
| Model indicator | Inter | 700 | 12 px | 14.5227 px | #FFFFFF |
| Category label | Inter | 700 | 14 px | 16.9432 px | `--card-title-color` (default #F6C031) |
| Card title | Inter | 700 | 18 px | 26 px | `--card-text-color` (default #FFFFFF) |
| Description | Inter | 600 | 13 px | 20 px | `--card-text-color` |
| ##PROMPT## label | Inter | 400 | 12 px | — | `--card-text-color` |
| Username | Inter | 600 | 13 px | 20 px | #00437C (underlined) |
| Role / team | Inter | 500 | 12 px | 16 px | #FFFFFF |
| Version text | Inter | 500 | 14 px | 16.9432 px | #FFFFFF |
| Status text | Inter | 700 | 14 px | 16.9432 px | #672223 |
| Like count | Inter | 700 | 13 px | 20 px | #FFFFFF |

---

## 8. SVG Assets (Embedded in Lit Component)

These vectors are **byte-identical exports** from Figma and embedded in the Lit component:

| Asset | Figma Node | Description |
|-------|-----------|-------------|
| Molecule logo | `40000717:17099` | 39×35, fill #FCCD3D |
| Heart icon | `40000717:17125` | 30×28, dual stroke #FFDE30 + #FFF |

---

## 9. What You Need to Tag in Figma

To make the Figma template fully drive the Lit component, ensure these layers are named consistently:

| Figma Layer Name | Maps to | Notes |
|------------------|---------|-------|
| `console-card` | Root frame | 276×372, this is node `40000717:17091` |
| `card-header` | `.card-header` | 54px row |
| `card-logo` | `.card-logo` | 39×35 SVG mark |
| `model-indicator` | `.model-indicator` | Model name text |
| `category` | `.category` | Category label |
| `card-content` | `.card-content` | 201px vertical stack |
| `card-title` | `.card-title` | Title text (2-line clamp) |
| `card-description` | `.card-description` | Description block |
| `desc-text` | `.desc-text` | Text with ##PROMPT## prefix |
| `desc-line` | `.desc-line` | 250×1 divider (#FFF) |
| `author-section` | `.author-section` | 39px row |
| `author-avatar` | `.author-avatar` | 41×39 pill (1px #FFF outside) |
| `author-username` | `.author-username` | @username text |
| `author-role` | `.author-role` | Team/role text |
| `footer-details` | `.footer-details` | 28px row |
| `version-pill` | `.version-pill` | 164×28 r8 border |
| `version-text` | `.version-text` | "Version N \|" |
| `status-text` | `.status-text` | Status label |
| `likes` | `.likes` | Like count + heart |
| `favorite` | `.favorite` | Heart SVG |

---

## 10. Verification Checklist

After building the Figma template, verify:

- [ ] All text layers use **Inter** font family
- [ ] Card frame is exactly **276×372 px**
- [ ] Padding is **10 px** on all sides
- [ ] Gap between regions is **10 px**
- [ ] Border radius is **10 px**
- [ ] Border is **1 px solid #FFFFFF** (inside)
- [ ] Dual shadow matches spec
- [ ] Category label color uses the **category title color token**
- [ ] Card background uses the **category color token**
- [ ] Title + description use the **category text color token**
- [ ] All layer names match Section 9
- [ ] Heart icon is 30×28 with dual stroke (#FFDE30 + #FFF)
- [ ] Molecule logo is 39×35 fill #FCCD3D

---

## 11. Quick Reference: Data Injection Summary

```
┌─────────────────────────────────────────────────────────────┐
│  FIGMA TEMPLATE (node 40000717:17091)                        │
│  ├── Layer names = CSS class names in Lit                    │
│  └── Color tokens = category_color / title_color / text_color│
├─────────────────────────────────────────────────────────────┤
│  A2UI CATALOG (component-catalog.json)                       │
│  ├── component: "agent-card"                                 │
│  └── x-figma-source → fileKey, nodeId, specEndpoint          │
├─────────────────────────────────────────────────────────────┤
│  SURFACE ASSEMBLY (POST /api/ai/assemble-surface)            │
│  ├── Intent: "render-console"                                │
│  ├── ConsoleCardGrid → items: {path: "/cards"}               │
│  └── updateDataModel → /cards = [hydrated card objects]      │
├─────────────────────────────────────────────────────────────┤
│  LIT RENDERER (<agent-card-element>)                         │
│  ├── Props = HTML attributes (Section 4.1)                   │
│  ├── CSS vars = --card-bg, --card-title-color, --card-text-color│
│  └── Shadow DOM = pixel-identical to Figma spec              │
└─────────────────────────────────────────────────────────────┘
```

---

> *"The Figma node is the source of truth. The Lit component is the runtime renderer. The A2UI catalog is the contract. PostgreSQL owns the data."*