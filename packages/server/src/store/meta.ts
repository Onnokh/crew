import type { Database } from "better-sqlite3";

/** The `meta` key under which the corpus's embedding model name is pinned. */
export const EMBEDDING_MODEL_KEY = "embedding_model";

/**
 * Pin the embedding model name on first boot, or throw on a later boot if it
 * differs. All stored vectors must come from one model to be comparable.
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
