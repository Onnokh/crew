import { TokenAuthenticator, hashToken } from "./auth/token-authenticator.js";
import type { Deps } from "./deps.js";
import { FastEmbedder } from "./embedding/fastembed.js";
import { NanoidGen } from "./platform/nanoid-gen.js";
import { SystemClock } from "./platform/system-clock.js";
import { openDatabase } from "./store/db.js";
import { pinOrCheckEmbeddingModel } from "./store/meta.js";
import { users } from "./store/schema.js";
import { SqliteRepository } from "./store/sqlite-repository.js";
import { buildServer } from "./server.js";

/**
 * Real entry point: assemble real implementations, hand them to the single
 * composition root, and start the server over streamable HTTP in stateless
 * mode. This slice (0002) wires the SQLite store: migrations run on open, the
 * repository persists Posts and resolves Users for auth, and the platform
 * Clock/IdGen seams stamp ids and timestamps.
 *
 * Users are bootstrapped from the `SOA_TOKENS` env var ("token:UserName"
 * comma-separated) into the `users` table at startup so an operator can boot
 * with working tokens before any user-provisioning UI exists. The repository
 * itself is the authoritative {@link TokenStore} the authenticator reads.
 */
async function buildRealDeps(): Promise<Deps> {
  const dbPath = process.env.SOA_DB_PATH ?? "soa.db";
  const { db, raw } = openDatabase(dbPath);
  const clock = new SystemClock();

  // Load the pinned embedding model and reconcile it with the corpus: a first
  // boot records the model name, a later boot with a different model refuses to
  // start (all stored vectors must come from one model to be comparable).
  const embedder = await FastEmbedder.create(process.env.SOA_MODEL_CACHE_DIR);
  pinOrCheckEmbeddingModel(raw, embedder.modelName);

  const repo = new SqliteRepository(db, raw, clock, new NanoidGen(), embedder);

  seedUsersFromEnv(db);

  return {
    auth: new TokenAuthenticator(repo),
    repo,
    clock,
  };
}

/** Upsert env-provided bootstrap Users (`SOA_TOKENS`) into the `users` table. */
function seedUsersFromEnv(db: ReturnType<typeof openDatabase>["db"]): void {
  const raw = process.env.SOA_TOKENS ?? "";
  for (const pair of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const sep = pair.indexOf(":");
    if (sep === -1) continue;
    const token = pair.slice(0, sep).trim();
    const name = pair.slice(sep + 1).trim();
    if (!token || !name) continue;
    db.insert(users)
      .values({ id: `user_${name}`, name, tokenHash: hashToken(token) })
      .onConflictDoNothing()
      .run();
  }
}

const port = Number(process.env.PORT ?? 8080);
const server = buildServer(await buildRealDeps());

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
