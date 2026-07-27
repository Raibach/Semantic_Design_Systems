import path from "path"
import { execSync } from "child_process"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import figmaAssetPlugin from './vite-plugin-figma-asset'

// Git hash for Sentry release tracking
let releaseHash = "unknown";
try {
  releaseHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
} catch { /* not a git repo */ }

// https://vite.dev/config/
export default defineConfig({
  define: {
    "import.meta.env.VITE_RELEASE_VERSION": JSON.stringify(releaseHash),
  },
  plugins: [react(), figmaAssetPlugin()],
  esbuild: {
    // Target es2020 to force decorator transpilation for broader browser support
    target: 'es2020',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Generate hidden source maps — Sentry needs these to de-minify stack traces.
    // "hidden" means sourceMappingURL comments are omitted from the bundle so
    // end users never see them, but .map files are still emitted for upload.
    sourcemap: "hidden",
    // Increase chunk-size warning limit to avoid noise from large vendor bundles
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: true,
    hmr: false,
    allowedHosts: [
      'localhost',
      '.loca.lt',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.ngrok-free.app',
      '.trycloudflare.com',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
