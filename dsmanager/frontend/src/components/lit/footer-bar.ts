/**
 * <footer-bar> — side-effect registration shim (A2UI)
 *
 * Importing this module registers the <footer-bar> custom element.
 * The actual Lit implementation lives in control-bar.ts.
 *
 * This file exists solely so that:
 *   import "@/components/lit/footer-bar";
 * resolves for both main.tsx (global registry) and PromptWorkspace.tsx.
 */
import "./control-bar";