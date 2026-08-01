import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Keep local marketing development aligned with the root .env file used by
  // the server and Docker Compose.
  envDir: "../..",
  plugins: [react()],
});
