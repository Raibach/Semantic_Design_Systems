#!/usr/bin/env node
/**
 * Build-time manifest generator.
 * Reads the Zod tag-registry, exports the AI playground manifest as JSON.
 *
 * Run: node scripts/generate-manifest.mjs
 * Output: frontend/dist/manifest.json
 *
 * The FastAPI backend reads this file on startup to inject the component
 * catalog into the DeepSeek system prompt.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Dynamic import of TypeScript — requires tsx or ts-node in PATH.
// For production builds, Vite handles the TypeScript compilation.
// This script runs post-build when the registry is already compiled.
try {
  // Import the compiled tag-registry from Vite's dist output
  // During dev: we use tsx to run TypeScript directly
  const { getAiPlaygroundManifest } = await import('../src/shared/tag-registry.ts');
  const manifest = getAiPlaygroundManifest();

  const distDir = resolve(projectRoot, 'dist');
  mkdirSync(distDir, { recursive: true });

  const outPath = resolve(distDir, 'manifest.json');
  writeFileSync(outPath, manifest, 'utf-8');

  console.log(`[manifest] Written AI playground manifest (${manifest.length} bytes) → ${outPath}`);
} catch (err) {
  // If tsx isn't available (CI/production), generate a stub manifest
  // from the hardcoded TAG_REGISTRY in this file
  console.warn('[manifest] Could not import TypeScript directly. Generating stub from known registry.');
  const stubManifest = JSON.stringify({
    _note: 'Generated from stub — run with tsx for full registry',
    tags: ['ai-surface-sandbox', 'agent-card', 'chat-navigation-bar', 'status-indicator'],
  }, null, 2);
  const distDir = resolve(projectRoot, 'dist');
  mkdirSync(distDir, { recursive: true });
  writeFileSync(resolve(distDir, 'manifest.json'), stubManifest, 'utf-8');
  console.log('[manifest] Stub manifest written.');
}
