// Dev convenience launcher: `pnpm start` from the repo root.
// Sets sane local defaults (only if you haven't set them yourself), then runs
// the server. Port 8087 + token match the agent-plugin config in
// packages/agent-plugin (.mcp.json / the user-scope settings.json env), so the
// installed plugin connects with no extra wiring. Override any of these by
// exporting the env var before running.
import { spawn } from "node:child_process";

process.env.SOA_TOKENS ||= "reviewer-secret-123:Reviewer"; // token:UserName
process.env.PORT ||= "8087";
process.env.SOA_DB_PATH ||= "soa-dev.db"; // gitignored (*.db)

console.log(
  `Starting Stack Overflow for Agents on http://localhost:${process.env.PORT}` +
    ` (review UI: /review, MCP: /mcp)`,
);

const child = spawn("pnpm", ["--filter", "@soa/server", "start"], {
  stdio: "inherit",
  shell: true, // resolve `pnpm` via PATH on Windows
});
child.on("exit", (code) => process.exit(code ?? 0));
