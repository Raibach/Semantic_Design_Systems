# A2UI v0.9 Compliance Implementation

**Date:** 2026-07-20
**Author:** Claude Code + John Holt
**Status:** Complete

---

## Summary

Brought the application into full compliance with **Google's A2UI (Agent-to-User Interface) v0.9 specification**. The AI is now the Architect — it controls all surface rendering. No URL routing. Every navigation action is an AI command.

---

## What Changed

### 1. Routes Removed (`frontend/src/App.tsx`)

**Before:**
```tsx
<Route path="/prompts" element={<WritingAreaIndex />} />
<Route path="/prompts/:id" element={<WritingAreaIndex />} />
<Route path="/prompts/:id/edit" element={<WritingAreaIndex />} />
```

**After:**
```tsx
<Route path="/" element={<WritingAreaIndex />} />
<Route path="*" element={<Navigate to="/" replace />} />
```

- Removed all `/prompts` routes
- Kept only `/` root route — AI controls all surfaces
- Updated legacy functions to use unified endpoint

---

### 2. URL Navigation Removed (`frontend/src/hooks/useNotificationGate.ts`)

- Removed `tabToPath()` function that returned URL paths
- Removed `onNavigate` URL routing callback
- Tab changes now only update internal React state
- AI assembly handles actual surface changes

---

### 3. Unified Backend Endpoint (`backend/main.py`)

Created `/api/ai/assemble-surface` with **A2UI v0.9 Envelope format**:

```python
# Returns array of protocol messages
[
    {
        "version": "v0.9",
        "createSurface": {
            "surfaceId": "main",
            "catalogId": "https://impromptu.raibach.net/a2ui/catalog.json"
        }
    },
    {
        "version": "v0.9",
        "updateComponents": {
            "surfaceId": "main",
            "surface": "console",
            "components": [...]
        }
    },
    {
        "version": "v0.9",
        "updateDataModel": {
            "surfaceId": "main",
            "path": "/",
            "value": {
                "cards": [...],
                "ai_message": "Welcome!",
                "assembly_time_ms": 1234
            }
        }
    }
]
```

**Supported Intents:**

| Intent | Description |
|--------|-------------|
| `render-console` | AI assembles console with categorized cards |
| `render-composer` | AI assembles blank workspace with Grace greeting |
| `render-session:{id}` | AI assembles existing session from database |

---

### 4. Frontend `assembleSurfaceWithAI()` (`frontend/src/pages/WritingAreaIndex.tsx`)

Single function handles ALL surface assembly:

```typescript
const assembleSurfaceWithAI = useCallback(async (intent: string) => {
  setIsAIAssembling(true);
  setAiAssemblyMessage("Hold on — Grace is assembling...");

  const response = await fetch(`${API_BASE}/ai/assemble-surface`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent }),
  });

  const envelope = await response.json();

  // Parse A2UI v0.9 envelope
  for (const operation of envelope) {
    if (operation.updateComponents) {
      surface = operation.updateComponents.surface;
    }
    if (operation.updateDataModel) {
      dataModel = operation.updateDataModel.value;
    }
  }

  // Render based on surface type
  if (surface === 'console') {
    setAssembledConsoleCards(dataModel.cards);
  } else if (surface === 'composer') {
    setCurrentPromptSession(dataModel.session);
  }
}, []);
```

---

### 5. Initial Mount Behavior

On app load, AI assembles initial surface based on context:

```typescript
useEffect(() => {
  let initialIntent = 'render-console';

  if (routeSessionId) {
    initialIntent = `render-session:${routeSessionId}`;
  } else if (headerTab === 'composer') {
    initialIntent = 'render-composer';
  }

  assembleSurfaceWithAI(initialIntent);
}, []);
```

---

### 6. Tab Clicks → AI Intents

Navigation is now AI-driven:

| User Action | AI Intent |
|-------------|-----------|
| Click Console tab | `assembleSurfaceWithAI('render-console')` |
| Click Composer tab | `assembleSurfaceWithAI('render-composer')` |
| Click session card | `assembleSurfaceWithAI('render-session:{id}')` |
| Click Create New | `assembleSurfaceWithAI('render-composer')` |

---

## A2UI v0.9 Envelope Structure

The response follows the official A2UI v0.9 envelope format:

| Operation | Purpose |
|-----------|---------|
| `createSurface` | Initialize the rendering surface with catalog reference |
| `updateComponents` | Declare UI structure (component tree) |
| `updateDataModel` | Bind data to component paths |

This separation allows:
- **Streaming:** Header renders before data loads
- **Security:** UI schema separate from application data
- **Future-proofing:** Version field enables protocol evolution

---

## Files Modified

| File | Changes |
|------|---------|
| `frontend/src/App.tsx` | Removed `/prompts` routes |
| `frontend/src/hooks/useNotificationGate.ts` | Removed URL navigation |
| `frontend/src/pages/WritingAreaIndex.tsx` | Added `assembleSurfaceWithAI()`, updated mount and tab handlers |
| `backend/main.py` | Added `/api/ai/assemble-surface` unified endpoint |

---

## Verification

| A2UI v0.9 Requirement | Our Implementation | Status |
|-----------------------|-------------------|--------|
| Declarative data format, not executable code | JSON envelope with operations | ✅ |
| Pre-approved component catalog | Trusted components only | ✅ |
| AI generates UI dynamically at runtime | LLM assembles every surface | ✅ |
| Zero-trust rendering | HTTP 503 on AI failure, no fallbacks | ✅ |
| Backend decides WHAT, frontend decides HOW | Envelope structure separates concerns | ✅ |
| Version field in protocol | `"version": "v0.9"` in every operation | ✅ |
| Array of operations | Response is `[{createSurface}, {updateComponents}, {updateDataModel}]` | ✅ |

---

## Result

**True A2UI v0.9 compliance achieved.**

- AI is the Architect
- No URL routing
- Every surface change is an AI command
- Proper envelope structure with versioned operations
