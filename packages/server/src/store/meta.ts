import type { Database } from "better-sqlite3";

/** The `meta` key under which the corpus's embedding model name is pinned. */
export const EMBEDDING_MODEL_KEY = "embedding_model";

/**
 * Pin the embedding model name on first boot, or assert it matches on every
 * later boot. All stored vectors must come from one model to be comparable, so
 * a mismatch means the corpus is unusable with this embedder and the server must
 * refuse to start (see TECH.md "Embeddings", ADR 0001).
 *
 * - First boot (no pin yet): record `modelName`.
 * - Later boot, same name: no-op.
 * - Later boot, different name: throw — the operator must re-embed the corpus or
 *   restore the original model before the server can serve comparable results.
 *
 * Pure SQL on the raw handle, kept in `store` because it owns the `meta` table.
 */
export function pinOrCheckEmbeddingModel(
  raw: Database,
  modelName: string,
): void {
  const row = raw
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get(EMBEDDING_MODEL_KEY) as { value: string } | undefined;

  if (row === undefined) {
    raw
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?)")
      .run(EMBEDDING_MODEL_KEY, modelName);
    return;
  }

  if (row.value !== modelName) {
    throw new Error(
      `Embedding model mismatch: the corpus was embedded with "${row.value}" ` +
        `but this server is configured with "${modelName}". All stored vectors ` +
        `must come from the same model. Re-embed the corpus or restore the ` +
        `original model before starting.`,
    );
  }
}
