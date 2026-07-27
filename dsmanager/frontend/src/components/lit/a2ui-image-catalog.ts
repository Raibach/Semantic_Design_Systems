/**
 * A2UI Image Catalog — v0.9.1
 *
 * Trusted image registry for the A2UI component system.
 * AI agents can only reference images by their catalog ID — no arbitrary URLs.
 * Each entry maps a catalog ID to a Vite-bundled asset and accessibility metadata.
 *
 * Security: Whitelist-only. AI cannot request assets outside the 4 registered IDs.
 * WCAG 2.1 AA: All entries provide alt text; decorative images marked aria-hidden.
 */

// ── Asset imports (Vite-bundled, hashed for cache busting) ──────────────
import raibachLogo from '@/assets/raibach-logo.jpg';
import cardBgDesignSystem from '@/assets/5e6d8c1ff1f88eac724c57dccba01dde4c5a1bba.png';
import cardImgDefault from '@/assets/a0c698671eb795bc84024e87ad7c0b231c53115c.png';
import moleculeLogo from '@/assets/Molecule_fill.svg';
// Featured card images — Figma code layer exports (node 40000177:6875)
import imgImage394 from '@/assets/ba2436ee5372d105c51f0b68f69557ac6ffaf857.png';
import imgImage393 from '@/assets/3d4a23c7755a1d58477ec16d818b1a952073d1ff.png';
import imgImage360 from '@/assets/be4698e5a4ad3e0033bd6c1207e196e97db60b98.png';
import imgImage76 from '@/assets/cf07d05e472d0020bc137b1d13d67cbffa013be9.png';
import imgImage372 from '@/assets/1d1c6e47491f6726f6303aa8c515da81db485c50.png';

// ── Catalog entry type ────────────────────────────────────────────────────
export interface ImageCatalogEntry {
  id: string;
  url: string;
  alt: string;
  decorative: boolean;
  description: string;
}

// ── Catalog registry — single source of truth for all AI-addressable images ─
const CATALOG: Record<string, ImageCatalogEntry> = {
  'raibach-logo': {
    id: 'raibach-logo',
    url: raibachLogo,
    alt: 'Raibach',
    decorative: false,
    description: 'Raibach brand logo — displayed in the chat navigation bar and console header.',
  },
  'card-bg-design-system': {
    id: 'card-bg-design-system',
    url: cardBgDesignSystem,
    alt: '',
    decorative: true,
    description: 'Background image for Design System category cards. 278×359px, node 40000236:9156.',
  },
  'card-img-default': {
    id: 'card-img-default',
    url: cardImgDefault,
    alt: 'Design card preview',
    decorative: false,
    description: 'Default preview image for prompt cards. Used when no category-specific image is available.',
  },
  'molecule-logo': {
    id: 'molecule-logo',
    url: moleculeLogo,
    alt: 'Molecule',
    decorative: false,
    description: 'Molecule icon overlay for Design System cards. SVG, 28×27px.',
  },
  'card-img-394': {
    id: 'card-img-394',
    url: imgImage394,
    alt: '',
    decorative: true,
    description: 'Featured card image 394. Figma node 40000178:11257.',
  },
  'card-img-393': {
    id: 'card-img-393',
    url: imgImage393,
    alt: '',
    decorative: true,
    description: 'Featured card image 393. Figma node 40000177:10471.',
  },
  'card-img-360': {
    id: 'card-img-360',
    url: imgImage360,
    alt: '',
    decorative: true,
    description: 'Featured card image 360. Figma node (bottom avatar).',
  },
  'card-img-76': {
    id: 'card-img-76',
    url: imgImage76,
    alt: '',
    decorative: true,
    description: 'Featured card image 76. Figma node 40000225:14251.',
  },
  'card-img-372': {
    id: 'card-img-372',
    url: imgImage372,
    alt: '',
    decorative: true,
    description: 'Featured card image 372. Figma node 40000225:14274.',
  },
};

// ── Public API — used by Lit components and React wrappers ─────────────────

/** Resolve a catalog ID to its bundled asset URL. Returns empty string if ID not whitelisted. */
export function getImageUrl(catalogId: string): string {
  const entry = CATALOG[catalogId];
  if (!entry) {
    console.warn(`[a2ui-image-catalog] Rejected unknown catalog ID: "${catalogId}". Whitelist: ${Object.keys(CATALOG).join(', ')}`);
    return '';
  }
  return entry.url;
}

/** Get accessibility alt text for a catalog ID. Returns empty string if ID not whitelisted. */
export function getImageAlt(catalogId: string): string {
  const entry = CATALOG[catalogId];
  if (!entry) return '';
  return entry.alt;
}

/** Returns true if the image is decorative (should use aria-hidden). */
export function isImageDecorative(catalogId: string): boolean {
  const entry = CATALOG[catalogId];
  if (!entry) return true;
  return entry.decorative;
}

/** Export the full catalog for AI agent context injection. */
export function exportCatalog(): ImageCatalogEntry[] {
  return Object.values(CATALOG);
}

/** Get a single catalog entry by ID. */
export function getCatalogEntry(catalogId: string): ImageCatalogEntry | undefined {
  return CATALOG[catalogId];
}
