# A2UI Surface & Conversation Integration

## Overview

The A2UI Surface (third column output window) can be fully controlled by the AI chat panel. This document describes:

1. **How the AI controls the surface** via XML tags in chat messages
2. **How to save/restore surface state** with conversations
3. **How to store surface state** in the database
4. **Complete end-to-end flow**

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   PromptWorkspace                       │
├──────────────────┬──────────────────┬──────────────────┤
│                  │                  │                  │
│ Left Column      │ Right Column     │ Third Column     │
│ (Editor)         │ (Chat)           │ (A2UI Surface)   │
│                  │                  │                  │
│                  │ "Add button"     │ <button/>        │
│ <prompt-builder> │ "Show project"   │ <project-card/>  │
│                  │ <project-card    │ ...              │
│                  │  id="p1"         │                  │
│                  │  name="Q4"/>     │                  │
│                  │                  │                  │
└──────────────────┴──────────────────┴──────────────────┘
        (Left)            (Right)          (Middle)
```

### Data Flow

```
User/Agent Action
    ↓
Chat Panel emits XML tags (e.g., "<project-card id='p1' name='Q4'/>")
    ↓
AI Orchestrator extracts tags from DOM mutations
    ↓
Event Bus validates & routes commands
    ↓
A2UISurfaceContainer renders components
    ↓
User sees output in third column
    ↓
Surface State is captured & saved with conversation
    ↓
Backend stores in DB as JSON blob
    ↓
On conversation reload → restore surface state
```

---

## 1. AI Commands - How to Control the Surface

The AI can emit XML tags in its chat responses to control the third column:

### Render Project Card
```xml
I've created a new project for you:
<project-card-element id="proj-123" name="Q4 Planning" description="Strategic quarterly planning"/>
```

### Add Button
```xml
Here are your options:
<add-button label="Create New Project" onclick="window.location.href='/projects/new'"/>
```

### Set HTML Content
```xml
<set-html content="<div><h2>Results</h2><p>Analysis complete</p></div>"/>
```

### Append Content
```xml
<append-html content="<p>Processing complete at 12:30 PM</p>"/>
```

### Clear Surface
```xml
<clear-surface/>
```

---

## 2. Frontend Integration

### In MiddleColumnSlot.tsx

```tsx
import { A2UISurfaceContainer } from '@/components/A2UISurfaceContainer';
import { saveConversationWithSurface, loadConversationWithSurface } from '@/services/surfaceStateIntegration';
import { useRef } from 'react';

export function MiddleColumnSlot({ compiledOutput, ...props }) {
  const surfaceContainerRef = useRef<HTMLDivElement>(null);

  // When surface changes, notify parent
  const handleSurfaceCleared = () => {
    // Save the empty state
    onSurfaceCleared?.();
  };

  // Main render
  return (
    <div className="flex flex-col h-full">
      {/* Surface output controlled by AI */}
      <div 
        ref={surfaceContainerRef}
        className="flex-1 overflow-auto p-4"
      >
        <A2UISurfaceContainer
          sessionId={sessionId}
          column="middle"
          onSurfaceCleared={handleSurfaceCleared}
          onComponentMounted={(tag, props) => {
            console.log('AI rendered:', tag, props);
          }}
        />
      </div>

      {/* Fallback: text output if surface is empty */}
      {compiledOutput && (
        <div className="mt-4 p-4 bg-gray-50 border-t">
          <MarkdownRenderer content={compiledOutput} />
        </div>
      )}
    </div>
  );
}
```

### In PromptWorkspace.tsx

```tsx
import { useRef, useEffect } from 'react';
import { saveConversationWithSurface, loadConversationWithSurface } from '@/services/surfaceStateIntegration';

export function PromptWorkspace({ session, ...props }) {
  const surfaceContainerRef = useRef<HTMLDivElement>(null);

  // When loading a conversation
  useEffect(() => {
    if (session?.conversationId) {
      const handleLoadConversation = async () => {
        const conv = await conversationStorage.getConversation(session.conversationId);
        // Restore surface state
        loadConversationWithSurface(conv, surfaceContainerRef);
      };
      handleLoadConversation();
    }
  }, [session?.conversationId]);

  // When saving
  const handleSave = async () => {
    const conv = await conversationStorage.getConversation(session?.conversationId!);
    // Capture surface state before saving
    const withSurface = saveConversationWithSurface(conv, surfaceContainerRef);
    await conversationStorage.updateConversation(withSurface);
  };

  return (
    <ResizableSplitter>
      <ResponsivePromptBuilder />
      <InteractiveChatInterface />
      
      {/* Third column with surface */}
      <div ref={surfaceContainerRef} className="flex-1 overflow-auto">
        <MiddleColumnSlot {...props} />
      </div>
    </ResizableSplitter>
  );
}
```

---

## 3. Database Schema

### Add to conversations table:

```sql
ALTER TABLE conversations ADD COLUMN surface_state_json TEXT;
ALTER TABLE conversations ADD COLUMN surface_updated_at TIMESTAMP;
```

### Surface State JSON Structure:

```json
{
  "id": "surface-conv-abc123-1726234567890",
  "conversationId": "conv-abc123",
  "timestamp": 1726234567890,
  "components": [
    {
      "tag": "project-card-element",
      "id": "restored-1726234567890",
      "props": {
        "id": "proj-123",
        "name": "Q4 Planning",
        "description": "Strategic quarterly planning"
      },
      "position": 0
    }
  ],
  "html": "<div data-ai-mounted=\"true\">...</div>",
  "metadata": {
    "elementCount": 1,
    "lastModified": 1726234567890,
    "contentHash": "abc123xyz"
  }
}
```

---

## 4. Backend API Endpoints

### Save Surface State

```
POST /api/conversations/:conversationId/surface-state
Content-Type: application/json

{
  "surfaceStateJson": "{\"id\": \"surface-...\"}"
}

Response:
{
  "success": true,
  "conversationId": "conv-abc123",
  "savedAt": "2024-09-13T12:30:00Z"
}
```

### Get Surface State

```
GET /api/conversations/:conversationId/surface-state

Response:
{
  "surfaceState": {
    "id": "surface-...",
    "conversationId": "conv-abc123",
    "components": [...],
    ...
  }
}
```

### Backend Implementation (Python/FastAPI)

```python
from sqlalchemy import Column, String, DateTime
from datetime import datetime

class ConversationModel(Base):
    __tablename__ = "conversations"
    
    id = Column(String, primary_key=True)
    surface_state_json = Column(String, nullable=True)
    surface_updated_at = Column(DateTime, default=datetime.utcnow)

@router.post("/conversations/{conversation_id}/surface-state")
async def save_surface_state(conversation_id: str, request: SaveSurfaceRequest):
    conv = db.query(ConversationModel).filter_by(id=conversation_id).first()
    if not conv:
        return {"error": "Conversation not found"}, 404
    
    conv.surface_state_json = request.surface_state_json
    conv.surface_updated_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "conversationId": conversation_id,
        "savedAt": conv.surface_updated_at.isoformat()
    }

@router.get("/conversations/{conversation_id}/surface-state")
async def get_surface_state(conversation_id: str):
    conv = db.query(ConversationModel).filter_by(id=conversation_id).first()
    if not conv or not conv.surface_state_json:
        return {"surfaceState": None}
    
    surface_state = json.loads(conv.surface_state_json)
    return {"surfaceState": surface_state}
```

---

## 5. Complete Workflow

### Scenario: Agent creates a project

1. **Chat Panel**: AI responds with XML tag
   ```
   I've created Q4 Planning project. Here's the summary:
   <project-card-element id="p1" name="Q4 Planning" description="..."/>
   ```

2. **AI Orchestrator**: 
   - Detects DOM mutation in chat
   - Extracts `<project-card-element/>` tag
   - Creates AiCommand object

3. **Event Bus**:
   - Validates tag against TAG_REGISTRY
   - Routes to A2UISurfaceContainer

4. **A2UISurfaceContainer**:
   - Creates DOM element: `<project-card-element/>`
   - Mounts in third column
   - User sees rendered card

5. **User clicks "Save"**:
   - PromptWorkspace calls `handleSave()`
   - Captures surface state: `captureSurfaceState(surfaceContainerRef.current, conversationId)`
   - Serializes: `serializeSurfaceState(state)`
   - Sends to backend: `POST /api/conversations/:id/surface-state`
   - Backend saves JSON blob

6. **Later: User loads conversation**:
   - Fetches conversation from DB
   - Loads surfaceStateJson
   - Calls `restoreSurfaceState(containerRef, state)`
   - Third column shows same card as before

---

## 6. Testing

### Mock Test Runner

See `mock-e2e-test.ts` for a complete end-to-end simulation:

```bash
# Run mock E2E test
npm run test:mock-e2e
```

This simulates:
- Agent RPC call to create project
- JSON-RPC success response
- Frontend event dispatch
- Surface state capture
- Database storage
- Conversation reload
- Surface state restoration

---

## 7. Key Files

- `A2UISurfaceContainer.tsx` - AI-managed output window
- `surfaceStateService.ts` - Serialization/deserialization
- `surfaceStateIntegration.ts` - Integration helpers
- `tag-registry.ts` - Available AI commands (needs update for surface tags)

---

## 8. Next Steps

1. **Update tag registry** with surface tags:
   - `project-card-element`
   - `set-html`
   - `set-text`
   - `add-button`
   - `append-html`
   - `clear-surface`

2. **Create backend API** for surface state CRUD

3. **Integrate into MiddleColumnSlot** and PromptWorkspace

4. **Add auto-save** that captures surface state every N seconds

5. **Test end-to-end** with mock agent scenarios

---

## Questions?

This system provides:
- ✅ Full AI control of output window (third column)
- ✅ Complete state persistence with conversations
- ✅ One unique ID per surface + all elements underneath
- ✅ Ability to save/restore entire surface state as a package
