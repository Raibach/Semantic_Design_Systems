# Semantic Design System Lifecycle Management — {impromptu}


**Built by John Holt, Raibach Interactive Design Studio**
**Date:** 2026-07-27 · **Version:** 0.9.1-dev · **Status:** Active Development (honest A2UI restoration in progress)

The project lives in [`dsmanager/`](dsmanager/) — full documentation in [`dsmanager/README.md`](dsmanager/README.md).

---

## What This Is

An **A2UI (Agent-to-User Interface) workspace**: a single, stable three-column surface where every pixel is assembled at runtime by the AI from a trusted component catalog. No URL routing to surfaces; every navigation action is an AI command (`intent`) through one unified endpoint returning a spec-compliant v0.9.1 envelope.

**The product:** prompt *packages* — configuration + conversation history + execution trace + governance metadata, bundled as one versioned, shareable, contributor-owned unit.

## Docs of Record

| Doc | Content |
|-----|---------|
| [`dsmanager/SPECIFICATIONS.md`](dsmanager/SPECIFICATIONS.md) | A2UI Protocol v0.9.1 + Basic Catalog Guide + A2A Extension (verbatim from [a2ui.org](https://a2ui.org/)) |
| [`dsmanager/READ-ME/A2UI_TRUE_VS_FAKE_AUDIT.md`](dsmanager/READ-ME/A2UI_TRUE_VS_FAKE_AUDIT.md) | Live-verified ledger: what was real A2UI vs compliance theater, and the remediation that fixed it |
| [`dsmanager/CHANGELOG.md`](dsmanager/CHANGELOG.md) | Day-by-day build log |
| [`A2UI Validation Audit`](A2UI%20Validation%20Audit) | External validation review of the A2UI implementation |

## Verified Current State (2026-07-27)

- **Zero-trust catalog validation live** — 20-component catalog loads at startup; non-catalog components rejected with HTTP 503 `VALIDATION_FAILED`
- **Spec-shaped envelopes** — `version: v0.9.1`, catalog `$id` aligned, no custom keys, no executable code (`eval()`/raw `innerHTML` eliminated)
- **Package-first composer** — draft package row created on composer mount; chat package-scoped from keystroke one; console excludes unsaved drafts
- **Contributor model** — `session_permissions` (owner/editor/viewer) with owner-gated grant/revoke/transfer; permission-aware reads and writes; 36/36 owner coverage
- **Data layer** — local PostgreSQL `railway` (source of truth, 42 tables) + Zilliz Cloud vector memory (8 collections, 384-dim) + DeepSeek assembly — all connected and verified live

## Development

```bash
cd dsmanager
bash RESTART-LOCAL.sh         # boots backend on :5173 (verifies .env/.venv/Postgres first)
cd frontend && npm run build  # rebuild dist AFTER any frontend change (backend serves dist)
```

Health: `GET /api/health` → `{"database":"connected","milvus":"connected"}` · Access: PIN gate (dev) · Dev phase: global no-cache, long loads expected.

---

*"The interface never changes. The AI delivers different levels of access. That's the architecture."*
