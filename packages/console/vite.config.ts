import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `tanstackRouter` must precede the React plugin. The dev server proxies `/api`
// and `/mcp` to the backend; set `CREW_SERVER_URL` to point at a non-default one.
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
