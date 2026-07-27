/**
 * Storybook Doc Loader
 * 
 * Uses Vite's import.meta.glob to bundle all storybook markdown
 * files at build time. Docs are loaded as raw strings and can be
 * displayed or edited in the Lexical Editor.
 */

// Glob imports — Vite bundles these at build time
const docModules = import.meta.glob<string>(
  '/src/storybook/**/*.{md,mdx}',
  { query: '?raw', import: 'default', eager: true }
);

/**
 * Load a storybook doc by its relative path (from storybook root).
 * Returns the raw markdown content, or null if not found.
 */
export function loadStorybookDoc(relativePath: string): string | null {
  const fullPath = `/src/storybook/${relativePath}`;
  const content = docModules[fullPath];
  return typeof content === 'string' ? content : null;
}

/**
 * Get a list of all available storybook doc paths.
 */
export function getAllDocPaths(): string[] {
  return Object.keys(docModules).map((p) =>
    p.replace('/src/storybook/', '')
  );
}
