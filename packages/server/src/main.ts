import type { Database } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { BetterAuthAuthenticator } from "./auth/better-auth-authenticator.js";
import { createAuth, type Auth } from "./auth/better-auth.js";
import type { Deps } from "./deps.js";
import { TransformersEmbedder } from "./embedding/transformers.js";
import { NanoidGen } from "./platform/nanoid-gen.js";
import { SystemClock } from "./platform/system-clock.js";
import { ensureDefaultOrgAndTeam } from "./store/bootstrap.js";
import { ControlPlaneRepository } from "./store/control-plane-repository.js";
import { openDatabase } from "./store/db.js";
import { createTeamRepositoryResolver } from "./store/team-repository-resolver.js";
import { buildServer } from "./server.js";

async function buildRealDeps(port: number): Promise<Deps> {
  // Tenancy split (ADR 0007/0008): one control-plane DB for identity/tenancy,
  // and a directory of one corpus DB file per Team.
  const controlPlanePath =
    process.env.CREW_CONTROL_PLANE_DB_PATH ?? "crew-control-plane.db";
  const teamsDir = process.env.CREW_TEAMS_DIR ?? "teams";
  mkdirSync(teamsDir, { recursive: true });

  const { raw } = openDatabase(controlPlanePath, "control-plane");
  const clock = new SystemClock();
  const idGen = new NanoidGen();

  // One shared embedding model, loaded once per host: every team connection the
  // resolver opens reuses this embedder (only the corpus vectors are per-team).
  const embedder = await TransformersEmbedder.create(
    process.env.CREW_MODEL_CACHE_DIR,
  );

  const controlPlane = new ControlPlaneRepository(raw);
  const teams = createTeamRepositoryResolver({
    teamsDir,
    embedder,
    clock,
    idGen,
  });

  // better-auth shares the control-plane better-sqlite3 handle, so identity lives
  // beside org/team/membership in one file.
  const authInstance = createAuth(raw, {
    secret: requireSecret(),
    baseURL: envValue("CREW_BASE_URL") ?? `http://localhost:${port}`,
    // Comma-separated extra origins (e.g. the Vite dev console).
    trustedOrigins: envValue("CREW_TRUSTED_ORIGINS")?.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  });

  // Fresh deploy: auto-create the default Org + Team, then seed the first admin
  // as a member of it (keeping the global `admin` role).
  const defaultTeamId = ensureDefaultOrgAndTeam(controlPlane, idGen, clock);
  await seedFirstAdmin(authInstance, raw, controlPlane, defaultTeamId, clock.now());
  // Open (and pin the model on) the default Team's corpus so a fresh deploy is
  // immediately queryable.
  teams.getRepository(defaultTeamId);

  return {
    auth: new BetterAuthAuthenticator(authInstance, controlPlane),
    authInstance,
    controlPlane,
    teams,
    clock,
    idGen,
  };
}

// A missing or short secret makes sessions forgeable, so refuse to boot.
function requireSecret(): string {
  const secret = envValue("CREW_AUTH_SECRET");
  if (!secret || secret.length < 32) {
    throw new Error(
      "CREW_AUTH_SECRET must be set to a random string of at least 32 characters " +
        "(e.g. `openssl rand -hex 32`).",
    );
  }
  return secret;
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

// Seed the first admin on a fresh database. Idempotent; the first admin can't be
// promoted through the admin-gated API, so set the role directly on the row. Also
// makes the admin a member of the default Team so its keys route (ADR 0008).
async function seedFirstAdmin(
  auth: Auth,
  raw: Database,
  controlPlane: ControlPlaneRepository,
  defaultTeamId: string,
  now: number,
): Promise<void> {
  const email = envValue("CREW_ADMIN_EMAIL");
  const password = envValue("CREW_ADMIN_PASSWORD");
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.warn(
      "No CREW_ADMIN_EMAIL/CREW_ADMIN_PASSWORD set — skipping first-admin seed.",
    );
    return;
  }

  const existing = raw
    .prepare(`SELECT id, role FROM "user" WHERE email = ?`)
    .get(email) as { id: string; role: string | null } | undefined;
  if (existing) {
    if (existing.role !== "admin") {
      raw.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).run(existing.id);
    }
    controlPlane.addMembership(existing.id, defaultTeamId, now);
    return;
  }

  const result = await auth.api.signUpEmail({
    body: { email, password, name: process.env.CREW_ADMIN_NAME ?? "Admin" },
  });
  raw.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).run(result.user.id);
  controlPlane.addMembership(result.user.id, defaultTeamId, now);
  // eslint-disable-next-line no-console
  console.log(`Seeded first admin: ${email}`);
}

// 8087 is the canonical local port, matching the claude-plugin connect URL.
const port = Number(process.env.PORT ?? 8087);
const server = buildServer(await buildRealDeps(port));

await server.start({
  transportType: "httpStream",
  httpStream: {
    port,
    stateless: true,
    enableJsonResponse: true,
  },
});

// eslint-disable-next-line no-console
console.log(`MCP server listening on http://localhost:${port}/mcp`);
