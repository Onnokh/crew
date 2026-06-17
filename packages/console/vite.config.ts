import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite build for the console SPA (see ADR 0004). The output (`dist/`) is served
 * statically by the server's Hono app — there is no separate frontend server in
 * production, so this config is a pure asset pipeline plus a dev convenience.
 *
 * - `tanstackRouter` runs first (it must precede the React plugin) and generates
 *   `src/routeTree.gen.ts` from the files under `src/routes/`, so routing is
 *   file-based — adding a page is adding a file (see `src/routes/`).
 * - The dev server proxies `/api/auth` (better-auth) and `/mcp` (agent transport)
 *   to the running MCP server, so `pnpm dev` here talks to a real backend over
 *   the same-origin paths the production single-port deployment uses. Set
 *   `CREW_SERVER_URL` to point at a non-default backend.
 */
const serverUrl = process.env.CREW_SERVER_URL ?? "http://localhost:8080";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
  ],
  server: {
    proxy: {
      "/api": { target: serverUrl, changeOrigin: true },
      "/mcp": { target: serverUrl, changeOrigin: true },
    },
  },
});
