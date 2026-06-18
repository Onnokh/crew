// Dev launcher: `npm run dev` from the repo root.
// Everything is served off a single origin (:8087). Runs the server in watch
// mode (tsx watch) AND the console in build-watch mode (vite build --watch) so
// packages/console/dist is rebuilt on every save — the server streams those
// files off disk, so http://localhost:8087/ always reflects the latest build.
// Sets the same sane local defaults as start-server.mjs (only if you haven't
// set them yourself); override any by exporting the env var before running.
//
// Note: build-watch has no HMR. After a save, wait for the rebuild (~1-2s) and
// reload the page. If you want instant HMR instead, run the Vite dev server on
// :5173 with `npm run dev -w @crew/console` (add :5173 to CREW_TRUSTED_ORIGINS
// so better-auth accepts sign-in from that origin).
import { spawn } from "node:child_process";

process.env.CREW_AUTH_SECRET ||= "dev-only-insecure-auth-secret-change-me-please"; // ≥32 chars
process.env.CREW_ADMIN_EMAIL ||= "admin@example.com";
process.env.CREW_ADMIN_PASSWORD ||= "dev-admin-password"; // ≥8 chars
process.env.CREW_ADMIN_NAME ||= "Dev Admin";
process.env.PORT ||= "8087";
process.env.CREW_DB_PATH ||= "crew-dev.db"; // gitignored (*.db)

console.log(
  `Starting Crew (dev) — http://localhost:${process.env.PORT}` +
    ` (UI: /, /admin & /review, MCP: /mcp). Console rebuilds on save; reload to` +
    ` see changes. Sign in as ${process.env.CREW_ADMIN_EMAIL} to mint an agent API key.`,
);

const opts = { stdio: "inherit", shell: true, env: process.env };
const children = [
  spawn("npm", ["run", "dev", "-w", "@crew/server"], opts),
  spawn("npm", ["run", "build", "-w", "@crew/console", "--", "--watch"], opts),
];

let exiting = false;
const shutdown = (code) => {
  if (exiting) return;
  exiting = true;
  for (const child of children) child.kill();
  process.exit(code ?? 0);
};

for (const child of children) child.on("exit", (code) => shutdown(code));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => shutdown(0));
