#!/usr/bin/env node
/**
 * Figma → Lit Design Sync Script
 *
 * Fetches the Figma spec for node 40000717:17091 and generates a static CSS
 * module. This is a DESIGN-TIME operation — run it when the Figma design
 * changes, then rebuild the app. The component does NOT call Figma at runtime.
 *
 * Usage:
 *   node frontend/scripts/sync-figma-card.mjs
 *   cd frontend && npm run build
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_ENDPOINT = 'http://localhost:5173/api/figma/spec/20UPR2KQMsbAxlo5NJb1se/40000717:17091?refresh=true';
const OUTPUT_FILE = join(__dirname, '../src/components/lit/agent-card-styles.css.ts');

// ── Fetch spec ─────────────────────────────────────────────────────────────

async function fetchSpec() {
  const res = await fetch(SPEC_ENDPOINT);
  if (!res.ok) {
    throw new Error(`Figma spec HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.spec) {
    throw new Error('Response missing "spec" field');
  }
  return data.spec;
}

// ── Recursive spec → CSS converter ─────────────────────────────────────────

function sanitizeClass(name) {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function hexWithAlpha(hex, alpha) {
  if (alpha >= 1) return hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

function specToCss(node, selectorPrefix = '') {
  const className = sanitizeClass(node.name);
  const sel = selectorPrefix ? `${selectorPrefix} .${className}` : `.${className}`;
  const rules = [];
  const decls = [];

  // Geometry
  if (node.bounds) {
    decls.push(`width: ${node.bounds.width}px;`);
    decls.push(`height: ${node.bounds.height}px;`);
  }

  // Background (first visible SOLID fill)
  const fill = (node.fills || []).find(f => f.type === 'SOLID' && f.color?.hex);
  if (fill?.color) {
    const alpha = fill.opacity !== undefined ? fill.opacity : (fill.color.alpha ?? 1);
    decls.push(`background: ${hexWithAlpha(fill.color.hex, alpha)};`);
  }

  // Border (strokes)
  const stroke = (node.strokes || []).find(s => s.type === 'SOLID' && s.color);
  if (stroke) {
    const w = node.strokeWeight ?? 1;
    decls.push(`border: ${w}px solid ${stroke.color.hex};`);
    if (node.strokeAlign === 'INSIDE') {
      decls.push(`box-sizing: border-box;`);
    }
  }

  // Corner radius
  if (node.cornerRadius !== undefined && node.cornerRadius !== null) {
    decls.push(`border-radius: ${node.cornerRadius}px;`);
  }
  if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    decls.push(`border-radius: ${tl}px ${tr}px ${br}px ${bl}px;`);
  }

  // Effects (drop shadows)
  const shadows = (node.effects || [])
    .filter(e => e.type === 'DROP_SHADOW' && e.color)
    .map(e => `${e.x}px ${e.y}px ${e.radius}px ${e.spread ?? 0}px ${hexWithAlpha(e.color.hex, e.color.alpha ?? 1)}`);
  if (shadows.length) {
    decls.push(`box-shadow: ${shadows.join(', ')};`);
  }

  // Layout (auto-layout → flexbox)
  const layout = node.layout || {};
  if (layout.layoutMode) {
    decls.push(`display: flex;`);
    decls.push(`flex-direction: ${layout.layoutMode === 'VERTICAL' ? 'column' : 'row'};`);
    if (layout.primaryAxisAlignItems) {
      const map = {
        MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end',
        SPACE_BETWEEN: 'space-between', SPACE_AROUND: 'space-around',
      };
      decls.push(`justify-content: ${map[layout.primaryAxisAlignItems] || layout.primaryAxisAlignItems};`);
    }
    if (layout.counterAxisAlignItems) {
      const map = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end' };
      decls.push(`align-items: ${map[layout.counterAxisAlignItems] || layout.counterAxisAlignItems};`);
    }
    if (layout.itemSpacing !== undefined) {
      decls.push(`gap: ${layout.itemSpacing}px;`);
    }
    const padTop = layout.paddingTop ?? 0;
    const padRight = layout.paddingRight ?? 0;
    const padBottom = layout.paddingBottom ?? 0;
    const padLeft = layout.paddingLeft ?? 0;
    if (padTop || padRight || padBottom || padLeft) {
      decls.push(`padding: ${padTop}px ${padRight}px ${padBottom}px ${padLeft}px;`);
    }
    if (layout.layoutGrow !== undefined) {
      decls.push(`flex-grow: ${layout.layoutGrow};`);
    }
  }

  // Typography
  const text = node.text;
  if (text) {
    if (text.fontFamily) decls.push(`font-family: '${text.fontFamily}', sans-serif;`);
    if (text.fontWeight !== undefined) decls.push(`font-weight: ${text.fontWeight};`);
    if (text.fontSize !== undefined) decls.push(`font-size: ${text.fontSize}px;`);
    if (text.lineHeightPx !== undefined) decls.push(`line-height: ${text.lineHeightPx}px;`);
    if (text.letterSpacing !== undefined) decls.push(`letter-spacing: ${text.letterSpacing}px;`);
    if (text.textAlignHorizontal) {
      const map = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
      decls.push(`text-align: ${map[text.textAlignHorizontal] || text.textAlignHorizontal.toLowerCase()};`);
    }
    if (text.textDecoration === 'UNDERLINE') decls.push(`text-decoration: underline;`);
  }

  // Text color from fills
  if (node.type === 'TEXT' && fill?.color) {
    decls.push(`color: ${fill.color.hex};`);
  }

  // Text truncation
  if (node.type === 'TEXT') {
    decls.push(`overflow: hidden;`);
    decls.push(`white-space: nowrap;`);
    decls.push(`text-overflow: ellipsis;`);
  }

  if (decls.length) {
    rules.push(`${sel} { ${decls.join(' ')} }`);
  }

  // Recurse
  for (const child of (node.children || [])) {
    rules.push(specToCss(child, sel));
  }

  return rules.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[sync-figma-card] Fetching Figma spec...');
  const spec = await fetchSpec();
  console.log('[sync-figma-card] Converting to CSS...');
  const css = specToCss(spec);
  console.log('[sync-figma-card] Writing output...');

  const lines = [
    '/**',
    ' * AUTO-GENERATED from Figma node 40000717:17091',
    ' * DO NOT EDIT MANUALLY — run `node scripts/sync-figma-card.mjs` to regenerate',
    ' */',
    "import { css } from 'lit';",
    '',
    'export const agentCardStyles = css`',
    css,
    '`;',
    '',
  ];
  writeFileSync(OUTPUT_FILE, lines.join('\n'));
  console.log(`[sync-figma-card] Wrote ${OUTPUT_FILE} (${css.length} chars of CSS)`);
}

main().catch(err => {
  console.error('[sync-figma-card] FAILED:', err.message);
  process.exit(1);
});