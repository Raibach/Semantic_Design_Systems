---
name: a2-chat-dock-control
description: Enforces a2UI chat docking behavior (75px min-width, blue bar visibility) and prevents vanilla CSS overrides.
---

# a2-chat-dock-control

This skill **MUST** be applied whenever modifying the Layout, Chat Panel, or Resizing logic in the Composer or Console pages.

## Core Rules (Non-Negotiable)
1. **NO Vanilla Layouts:** Never use raw `<div>` flex grids. Always use the `a2-surface` or `ai-surface-sandbox` wrapper.
2. **75px Minimum:** The chat panel container **MUST** never collapse below 75px. The blue navigation bar is hard-coded to 75px and must always be visible.
3. **Copy Console Pattern:** If implementing a dock/resize feature, **copy the exact logic** from `WritingAreaIndex.tsx` (lines 1949-1974). Do not invent new math or layout algorithms.
4. **No `min-width: 0`:** Never set `min-width: 0` on the chat container. It must respect the 75px floor.
5. **Component Names:** Use `a2-` prefix for all custom components (e.g., `a2-chat-panel`).

## Usage
Use this skill whenever:
- The user asks to "resize," "dock," or "collapse" the chat.
- The user asks to "add a button" or "change layout."
- The AI starts suggesting standard HTML/CSS solutions.

## Steps to Execute
1. **Check Context:** Is the request related to layout or UI?
2. **Apply Rule #1:** If yes, verify the code uses `a2-surface` or `ai-surface-sandbox`.
3. **Apply Rule #2:** If it involves the chat, ensure `COLLAPSED_WIDTH = 75` is set and the blue bar is visible.
4. **Apply Rule #3:** If the logic is new, **copy** the Console pattern immediately. Do not write new CSS.
5. **Verify:** Ensure no `overflow: hidden` is clipping the blue bar.

## Example Correction
**BAD (Vanilla):**
```tsx
<div style={{ width: chatWidth }}><InteractiveChatInterface /></div>