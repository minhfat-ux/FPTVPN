import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev: Vite serves the UI on 5173 and proxies the API to the local server.
 * Prod: `vite build` emits web/dist, which the Express server serves itself.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7790",
        changeOrigin: true,
        // SSE must not be buffered by the dev proxy.
        ws: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
