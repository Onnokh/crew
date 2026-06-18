import type { Database } from "better-sqlite3";
import { BetterAuthAuthenticator } from "./auth/better-auth-authenticator.js";
import { createAuth, type Auth } from "./auth/better-auth.js";
import type { Deps } from "./deps.js";
import { FastEmbedder } from "./embedding/fastembed.js";
import { NanoidGen } from "./platform/nanoid-gen.js";
import { SystemClock } from "./platform/system-clock.js";
import { openDatabase } from "./store/db.js";
import { pinOrCheckEmbeddingModel } from "./store/meta.js";
import { SqliteRepository } from "./store/sqlite-repository.js";
import { buildServer } from "./server.js";

async function buildRealDeps(port: number): Promise<Deps> {
  const dbPath = process.env.CREW_DB_PATH ?? "crew.db";
  const { db, raw } = openDatabase(dbPath);
  const clock = new SystemClock();

  // All stored vectors must come from one model to be comparable: first boot
  // records the model name, a later boot with a different model refuses to start.
  const embedder = await FastEmbedder.create(process.env.CREW_MODEL_CACHE_DIR);
  pinOrCheckEmbeddingModel(raw, embedder.modelName);

  const repo = new SqliteRepository(db, raw, clock, new NanoidGen(), embedder);

  // better-auth shares the one better-sqlite3 handle, so its tables and ours
  // live in the same file and the `created_by` FKs into `user(id)` hold.
  const authInstance = createAuth(raw, {
    secret: requireSecret(),
    baseURL: process.env.CREW_BASE_URL ?? `http://localhost:${port}`,
    // Comma-separated extra origins (e.g. the Vite dev console).
    trustedOrigins: process.env.CREW_TRUSTED_ORIGINS?.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  });
  await seedFirstAdmin(authInstance, raw);

  return {
    auth: new BetterAuthAuthenticator(authInstance, repo),
    authInstance,
    repo,
    clock,
  };
}

// A missing or short secret makes sessions forgeable, so refuse to boot.
function requireSecret(): string {
  const secret = process.env.CREW_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "CREW_AUTH_SECRET must be set to a random string of at least 32 characters " +
        "(e.g. `openssl rand -hex 32`).",
    );
  }
  return secret;
}

// Seed the first admin on a fresh database. Idempotent; the first admin can't be
// promoted through the admin-gated API, so set the role directly on the row.
async function seedFirstAdmin(auth: Auth, raw: Database): Promise<void> {
  const email = process.env.CREW_ADMIN_EMAIL;
  const password = process.env.CREW_ADMIN_PASSWORD;
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
    return;
  }

  const result = await auth.api.signUpEmail({
    body: { email, password, name: process.env.CREW_ADMIN_NAME ?? "Admin" },
  });
  raw.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).run(result.user.id);
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
