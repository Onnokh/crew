-- 0003 · Vector search over Posts (sqlite-vec vec0) + the embedding-model pin.
-- Hand-written SQL because drizzle-kit cannot model vec0 virtual tables (see
-- TECH.md "Virtual-table migrations are hand-written SQL"). This slice (0004)
-- adds the semantic-retrieval leg alongside the FTS5 keyword leg from 0003.
--
-- Two 384-dim vectors per Post: `situation_embedding` is the primary retrieval
-- key, `environment_embedding` a secondary fuzzy-match signal. Both come from
-- bge-small-en-v1.5 and are cosine-normalized, so `vec_distance_cosine` ranks
-- them directly. The vectors are written by the app at post time (no triggers —
-- a vec0 table cannot read embeddings out of a TEXT column the way FTS5 reads
-- text), keyed by the Post's TEXT id rather than the implicit rowid.

CREATE VIRTUAL TABLE IF NOT EXISTS posts_vec USING vec0(
  post_id TEXT PRIMARY KEY,
  situation_embedding FLOAT[384],
  environment_embedding FLOAT[384]
);

-- The model identity lives in `meta`. All stored vectors must come from one
-- model to be comparable, so the server records the model name on first boot
-- and refuses to start if a later boot's embedder reports a different name
-- (see TECH.md "Embeddings"). `schema_version` is reserved for a future ledger.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
