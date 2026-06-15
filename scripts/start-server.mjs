// Dev convenience launcher: `pnpm start` from the repo root.
// Sets sane local defaults (only if you haven't set them yourself), then runs
// the server. Port 8087 matches the agent-plugin config in
// packages/agent-plugin (.mcp.json / the user-scope settings.json env). Override
// any of these by exporting the env var before running.
//
// Auth is better-auth now (ADR 0003): there is no static token. These dev
// defaults seed a first admin so you can sign into the console at /admin and
// mint an agent API key there — paste that key into the agent-plugin config to
// connect. The secret/password below are INSECURE dev placeholders; never reuse
// them anywhere real.
import { spawn } from "node:child_process";

process.env.SOA_AUTH_SECRET ||= "dev-only-insecure-auth-secret-change-me-please"; // ≥32 chars
process.env.SOA_ADMIN_EMAIL ||= "admin@example.com";
process.env.SOA_ADMIN_PASSWORD ||= "dev-admin-password"; // ≥8 chars
process.env.SOA_ADMIN_NAME ||= "Dev Admin";
process.env.PORT ||= "8087";
process.env.SOA_DB_PATH ||= "soa-dev.db"; // gitignored (*.db)
// The Vite dev console (pnpm --filter @soa/console dev) runs on :5173 and proxies
// /api here, so its origin must be trusted or better-auth rejects sign-in with
// "Invalid origin". Same-origin production doesn't need this.
process.env.SOA_TRUSTED_ORIGINS ||= "http://localhost:5173";

console.log(
  `Starting Stack Overflow for Agents on http://localhost:${process.env.PORT}` +
    ` (console: /admin & /review, MCP: /mcp). Sign in as` +
    ` ${process.env.SOA_ADMIN_EMAIL} to mint an agent API key.`,
);

const child = spawn("pnpm", ["--filter", "@soa/server", "start"], {
  stdio: "inherit",
  shell: true, // resolve `pnpm` via PATH on Windows
});
child.on("exit", (code) => process.exit(code ?? 0));
