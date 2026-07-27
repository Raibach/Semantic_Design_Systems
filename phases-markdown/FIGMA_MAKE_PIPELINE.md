# Figma Make Pipeline

**Status**: ⚠️ Manual — needs automation script  
**Last Updated**: 2026-07-14

## Summary

How Figma Make exports get transformed and wired into the flat `frontend/src/` structure. Currently manual. Target: fully automated script.

---

## Pipeline

```
Figma Make export (.zip)
        │
        ▼
FIGMA-imports/          ← Unzip here (staging)
        │
        ▼  Apply transformation rules
        │
frontend/src/           ← Final destination
  ├── components/       ← ALL components, FLAT
  ├── imports/          ← SVG path files
  ├── assets/           ← PNG, SVG static files
  └── types.ts          ← Shared TypeScript types
```

## Directory Rules (Non-Negotiable)

| Rule | Correct | Wrong |
|------|---------|-------|
| No `/app/` folder | `frontend/src/components/` | `frontend/src/app/components/` |
| Flat components | `components/MyComponent.tsx` | `components/subfolder/MyComponent.tsx` |
| Shared types | `components/types.ts` | `types/MyComponent.types.ts` |

---

## Phases

### Phase 1: Manual extraction (Current)
- Manually unzip, transform, copy
- Check each file against the 8-point checklist
- Documented in `FIGMA-imports/For-Figma-AI-Propmt.md`

**Status**: ✅ Active

### Phase 2: Automation script
- Node/Python script that takes a `.zip`, applies all rules, outputs clean components
- CLI command: `pnpm figma:import ./export.zip`

**Status**: Not started

### Phase 3: CI integration
- GitHub Action triggers on push to `FIGMA-imports/`
- Auto-transforms, opens PR for review

**Status**: Not started

---

## Checklist (every component must pass)

- [ ] All components in `frontend/src/components/` — flat, no subfolders
- [ ] Every React import is `import * as React from 'react'`
- [ ] Every component import uses `./ComponentName`
- [ ] Zero paths containing `/app/`
- [ ] Zero `@/` paths
- [ ] Zero `.css` or `.module.css` files
- [ ] All shared types in `./types.ts`
- [ ] All exports are named `export function`

---

## Assets Already Integrated

Components: `ImageWithFallback.tsx`, `FigmaCard.tsx`, `FigmaComponentBrowser.tsx`, `FigmaComponentViewer.tsx`  
SVG paths: `svg-qb5kclrae4.ts`, `svg-2eefhakq49.ts`, +30 more in `imports/`  
PNGs: 8 card assets in `assets/` and `components/`

## Pending Extraction

| Source | Target | Status |
|--------|--------|--------|
| App.tsx → PromptCard | `components/PromptCard.tsx` | Needs transform |
| App.tsx → Group8747 | `components/PromptGallery.tsx` | Needs transform |
