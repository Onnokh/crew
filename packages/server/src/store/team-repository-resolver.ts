import { join } from "node:path";
import type { Embedder } from "../embedding/embedder.js";
import type { Clock } from "../platform/clock.js";
import type { IdGen } from "../platform/id-gen.js";
import { openDatabase } from "./db.js";
import { pinOrCheckEmbeddingModel } from "./meta.js";
import type { PostRepository } from "./repository.js";
import { SqliteRepository } from "./sqlite-repository.js";

/**
 * Resolves a Team's opaque id to its {@link PostRepository}, opening the per-team
 * corpus DB on first use and caching the connection thereafter (ADR 0007). All
 * teams share ONE embedder (the ONNX model is loaded once per host); each team
 * DB independently pins/verifies that model name via {@link pinOrCheckEmbeddingModel}.
 *
 * The team file path is `<teamsDir>/<teamId>.db`. The opaque team id names the
 * file, so the agent path never passes a path or a team parameter — the resolver
 * is the only place a team id becomes a connection.
 */
export type TeamRepositoryResolver = {
  /** Open-or-reuse the corpus repository for a Team id. */
  getRepository(teamId: string): PostRepository;
  /** Close every cached connection (test teardown / shutdown). */
  closeAll(): void;
};

/** How a team id maps to a corpus database handle. Files in prod; overridable in tests. */
export type TeamDbOpener = (teamId: string) => {
  raw: import("better-sqlite3").Database;
  db: import("drizzle-orm/better-sqlite3").BetterSQLite3Database;
};

/**
 * Build the resolver. By default each team is a real SQLite file under
 * `teamsDir`; tests can pass a custom `open` (e.g. shared in-memory handles) so
 * the two-team isolation test runs without touching disk for the control plane.
 */
export function createTeamRepositoryResolver(opts: {
  teamsDir: string;
  embedder: Embedder;
  clock: Clock;
  idGen: IdGen;
  /** Override how a team's DB handle is obtained; defaults to a file per team. */
  open?: TeamDbOpener;
}): TeamRepositoryResolver {
  const { embedder, clock, idGen } = opts;
  const open: TeamDbOpener =
    opts.open ?? ((teamId) => openDatabase(teamFilePath(opts.teamsDir, teamId), "team"));

  const cache = new Map<
    string,
    { repo: PostRepository; raw: import("better-sqlite3").Database }
  >();

  return {
    getRepository(teamId: string): PostRepository {
      const existing = cache.get(teamId);
      if (existing) return existing.repo;

      const { raw, db } = open(teamId);
      // Each team DB pins/verifies the shared model name (vectors must be
      // comparable within a corpus; the model itself is loaded once per host).
      pinOrCheckEmbeddingModel(raw, embedder.modelName);
      const repo = new SqliteRepository(db, raw, clock, idGen, embedder);
      cache.set(teamId, { repo, raw });
      return repo;
    },
    closeAll(): void {
      for (const { raw } of cache.values()) raw.close();
      cache.clear();
    },
  };
}

/** `<teamsDir>/<teamId>.db` — the opaque team id is the filename. */
function teamFilePath(teamsDir: string, teamId: string): string {
  return join(teamsDir, `${teamId}.db`);
}
