# A2UI & Agent Integration Guide

This guide explains how the newly refactored database architecture works with A2UI Lit components and AI agent integration via JSON-RPC 2.0.

## Architecture Overview

### Before (Broken)
- Project descriptions stored only in `localStorage` under keys like `project_description_<id>`
- Projects created in database had no description
- Duplicate project entries when `PromptModal.tsx` wrote the same project twice to localStorage
- AI agents had no way to create projects with descriptions

### After (Fixed)
- Project descriptions stored in PostgreSQL database as part of the `projects` table
- `conversationStorage.ts` now syncs description with the database
- No duplicate writes — `createProject()` handles all database and localStorage operations
- AI agents can create/fetch projects via JSON-RPC 2.0 endpoint `/api/agent/rpc`
- Lit components render data directly from the database without localStorage fallbacks

---

## Lit Component Usage

### ProjectCardElement

A Lit component that renders a project card with name and description from the PostgreSQL database.

**Location:** `frontend/src/components/ProjectCardElement.ts`

**Features:**
- Uses A2UI reactive controller pattern
- Schema-backed (zod) validation
- No localStorage lookups inside the component
- Clean, database-first design

**Example Usage in Template:**
```html
<project-card-element
  .props={{
    id: "proj-123",
    name: "E-Commerce Replatform",
    description: "Migrating the legacy storefront to a high-performance framework.",
    createdAt: 1689120000000
  }}
></project-card-element>
```

**Component Properties:**
```typescript
{
  id: string;              // Project ID from database
  name: string;            // Project name
  description?: string;    // NOW from PostgreSQL, not localStorage!
  createdAt?: number;      // Timestamp in milliseconds
  updatedAt?: number;      // Last modified timestamp
}
```

---

## Agent Integration via JSON-RPC 2.0

### Endpoint

**URL:** `POST /api/agent/rpc`

**Headers:**
```
Content-Type: application/json
X-User-ID: <uuid>  # Required: The user making the request
```

### Supported Methods

#### 1. `create_project`

Creates a new project in PostgreSQL with name and optional description.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "create_project",
  "params": {
    "name": "Q4 Marketing Campaign",
    "description": "Comprehensive Q4 marketing strategy including digital ads, email campaigns, and social media outreach."
  },
  "id": "agent-req-001"
}
```

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "project": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Q4 Marketing Campaign",
      "description": "Comprehensive Q4 marketing strategy...",
      "created_at": "2026-07-16T10:37:39Z"
    }
  },
  "id": "agent-req-001"
}
```

**Error Response (missing name):**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid params: 'name' is required and cannot be empty."
  },
  "id": "agent-req-001"
}
```

#### 2. `get_project`

Retrieves a specific project by ID.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "get_project",
  "params": {
    "id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "id": "agent-req-002"
}
```

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "project": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Q4 Marketing Campaign",
      "description": "Comprehensive Q4 marketing strategy...",
      "created_at": "2026-07-16T10:37:39Z"
    }
  },
  "id": "agent-req-002"
}
```

#### 3. `list_projects`

Lists all projects for the user, optionally including archived ones.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "list_projects",
  "params": {
    "include_archived": false
  },
  "id": "agent-req-003"
}
```

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "projects": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Q4 Marketing Campaign",
        "description": "Comprehensive Q4 marketing strategy...",
        "created_at": "2026-07-16T10:37:39Z"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "name": "Product Roadmap 2026",
        "description": "Long-term product vision and quarterly milestones",
        "created_at": "2026-07-10T15:22:10Z"
      }
    ]
  },
  "id": "agent-req-003"
}
```

---

## Agent Tool Schema Configuration

### For OpenAI / Function Calling

Use the tool definitions in the `backend/` directory:

- **`agent_tools_create_project.json`** — Tool definition for `create_project`
- **`agent_tools_get_project.json`** — Tool definition for `get_project`
- **`agent_tools_list_projects.json`** — Tool definition for `list_projects`

**Example System Prompt Integration:**
```
You are a project management assistant. You have access to the following tools:
[include contents of agent_tools_create_project.json]
[include contents of agent_tools_get_project.json]
[include contents of agent_tools_list_projects.json]

When the user asks to create, view, or list projects, use these tools to interact
with the database directly. All project data, including descriptions, is persisted
in PostgreSQL.
```

### For Anthropic Claude / Tool Use

```python
tools = [
    {
        "name": "create_project",
        "description": "Creates a new project in the PostgreSQL database...",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "The title or name of the project."},
                "description": {"type": "string", "description": "The project description."}
            },
            "required": ["name"]
        }
    },
    # ... get_project, list_projects
]
```

---

## Backend Implementation

### Core Files

**`backend/agent_rpc_handler.py`**
- Main JSON-RPC 2.0 handler class
- Routes requests to appropriate project API methods
- Validates parameters and returns standardized JSON-RPC responses
- Includes error handling with proper RPC error codes

**`backend/main.py`** (modified)
- Added `/api/agent/rpc` POST endpoint
- Validates user ID from header
- Initializes `AgentRpcHandler` with `ProjectsAPI` instance
- Handles validation errors and server errors

### Error Codes (JSON-RPC 2.0 Standard)

| Code | Meaning | Example |
|------|---------|---------|
| -32600 | Invalid Request | Invalid `jsonrpc` version |
| -32601 | Method not found | Unknown method name |
| -32602 | Invalid params | Missing required parameter |
| -32603 | Internal server error | Database connection failed |
| -32000 | Server error | Project not found |

---

## Frontend Integration

### Updating Components to Use Database-Backed Descriptions

**Old Approach (PromptModal.tsx before):**
```typescript
// Read from localStorage (local-only, never persisted)
const savedDescription = localStorage.getItem(`project_description_${project.id}`);
setDescription(savedDescription);

// Write to localStorage (creates duplicates)
localStorage.setItem(`project_description_${project.id}`, description);
```

**New Approach (PromptModal.tsx after):**
```typescript
// Read from project object (from PostgreSQL via API)
if (editingPrompt.description) {
  setDescription(editingPrompt.description);
}

// Pass to API via saveProject
const updatedProject: Project = {
  ...editingPrompt,
  name: title.trim(),
  description: description.trim() || undefined,
};
await conversationStorage.saveProject(updatedProject);
```

### conversationStorage.ts Changes

**`createProject` now accepts description:**
```typescript
const project = await conversationStorage.createProject(
  "My Project",
  { description: "Project description" }  // NEW: passes to API
);
```

**`saveProject` now sends description to API:**
```typescript
await apiCall(`/api/projects/${project.id}`, {
  method: 'PUT',
  body: JSON.stringify({
    name: project.name,
    description: project.description ?? null,  // NEW: included in request
    is_archived: false,
  }),
});
```

---

## Testing

### Test the RPC Endpoint

**Using curl:**
```bash
curl -X POST http://localhost:8000/api/agent/rpc \
  -H "Content-Type: application/json" \
  -H "X-User-ID: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "jsonrpc": "2.0",
    "method": "create_project",
    "params": {
      "name": "Test Project",
      "description": "Testing the new RPC endpoint"
    },
    "id": "test-001"
  }'
```

**Expected Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "project": {
      "id": "<uuid>",
      "name": "Test Project",
      "description": "Testing the new RPC endpoint",
      "created_at": "2026-07-16..."
    }
  },
  "id": "test-001"
}
```

### Verify Database Persistence

```sql
SELECT id, name, description, created_at FROM projects 
WHERE name = 'Test Project';
```

Should return the project with description in the `description` column (not localhost keys).

---

## Migration Notes

If you have existing projects with descriptions stored in localStorage, they are **automatically migrated**:

1. When loading a project in edit mode, `PromptModal.tsx` checks `project.description` first
2. If not found, it falls back to `localStorage.getItem(`project_description_${id}`)`
3. When saving, the description is written to PostgreSQL
4. Future loads will use the PostgreSQL value

**No manual migration needed** — the fallback ensures backward compatibility while data moves to the database.

---

## Next Steps

1. **Deploy the backend changes** to activate `/api/agent/rpc` endpoint
2. **Register the tool schemas** with your AI agent provider (OpenAI, Anthropic, etc.)
3. **Test agent-driven project creation** using the provided tool definitions
4. **Build additional components** for agent-driven UX (use `ProjectCardElement` as a template)
5. **Monitor PostgreSQL** to confirm descriptions are persisting (no more localStorage)

---

## References

- **Lit Components:** https://lit.dev/
- **A2UI Lit Package:** https://www.npmjs.com/package/@a2ui/lit
- **JSON-RPC 2.0 Spec:** https://www.jsonrpc.org/specification
- **Project API:** `backend/projects_api.py`
- **Conversation Storage:** `frontend/src/services/conversationStorage.ts`
