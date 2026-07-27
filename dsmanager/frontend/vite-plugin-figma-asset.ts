import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs';

/**
 * Vite plugin to handle `figma:asset/` imports from Figma-generated code.
 * 
 * Figma exports components with imports like:
 *   import svg0y9e0 from "figma:asset/5c252cfa168d20d3cd4d92f4b10cd851ae7c2092.png"
 * 
 * This plugin resolves these imports to actual file paths in the assets directory.
 */
export default function figmaAssetPlugin(): Plugin {
  return {
    name: 'vite-plugin-figma-asset',
    
    /**
     * Resolve figma:asset/ imports to actual file paths
     */
    resolveId(source: string, importer?: string) {
      // Match figma:asset/ imports
      const figmaAssetMatch = source.match(/^figma:asset\/(.+)$/);
      if (!figmaAssetMatch) {
        return null;
      }
      
      const assetFileName = figmaAssetMatch[1];
      
      // Try to find the asset in various locations
      const possiblePaths = [
        // First check in the same directory as the importer
        importer ? path.join(path.dirname(importer), assetFileName) : null,
        // Check in src/assets relative to project root
        path.resolve(process.cwd(), 'src', 'assets', assetFileName),
        // Check in assets directory relative to project root
        path.resolve(process.cwd(), 'assets', assetFileName),
        // Check in public directory
        path.resolve(process.cwd(), 'public', assetFileName),
      ].filter(Boolean) as string[];
      
      // Find the first path that exists
      for (const assetPath of possiblePaths) {
        if (fs.existsSync(assetPath)) {
          return assetPath;
        }
      }
      
      // If not found, return a virtual module ID that will be handled in load()
      return `\0figma-asset:${assetFileName}`;
    },
    
    /**
     * Load virtual modules for assets that weren't found
     */
    load(id: string) {
      const virtualMatch = id.match(/^\0figma-asset:(.+)$/);
      if (!virtualMatch) {
        return null;
      }
      
      const assetFileName = virtualMatch[1];
      
      // For development, we can return a placeholder or try to find the asset
      // In a real implementation, you might want to copy assets or handle them differently
      console.warn(`[vite-plugin-figma-asset] Asset not found: ${assetFileName}`);
      
      // Return an empty module for now
      return `export default '';`;
    },
    
    /**
     * Transform imports in the code
     */
    transform(code: string, id: string) {
      // Only process TypeScript/JavaScript files
      if (!id.match(/\.(ts|tsx|js|jsx)$/)) {
        return null;
      }
      
      // Replace figma:asset/ imports with resolved paths
      const updatedCode = code.replace(
        /from\s+["']figma:asset\/([^"']+)["']/g,
        (_match, assetName) => {
          // Construct the actual import path
          // We'll use a relative path to the assets directory
          const assetPath = `../assets/${assetName}`;
          return `from "${assetPath}"`;
        }
      );
      
      if (updatedCode !== code) {
        return {
          code: updatedCode,
          map: null, // Source maps not needed for this simple transformation
        };
      }
      
      return null;
    },
  };
}