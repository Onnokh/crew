/**
 * The embedding seam: turns text into a fixed-length, cosine-normalized vector
 * for semantic retrieval. All vectors in the corpus must come from one model to
 * be comparable, so an Embedder carries its {@link modelName} as identity — the
 * server pins it in `meta` and refuses to start on a mismatch (see TECH.md
 * "Embeddings", ADR 0001).
 *
 * The real implementation is {@link FastEmbedder} (fastembed / bge-small-en-v1.5,
 * in-process, no external service); tests use {@link FakeEmbedder}, a
 * deterministic stand-in that never downloads the 30 MB model. This is the seam
 * the integration test swaps — same `buildServer(deps)`, no model in CI.
 */
export type Embedder = {
  /**
   * The pinned model identity (e.g. `bge-small-en-v1.5`). Recorded in
   * `meta.embedding_model` on first boot and checked on every later boot; a
   * mismatch means the stored vectors are incomparable and the server must not
   * start. The fake reports a distinct name so it can never be confused with a
   * corpus embedded by the real model.
   */
  readonly modelName: string;

  /** The dimensionality of the vectors this embedder produces (384 for bge-small). */
  readonly dimensions: number;

  /**
   * Embed a single piece of text into a cosine-normalized vector of length
   * {@link dimensions}. Used at write time (Post situation + environment) and
   * query time (the query situation + environment). Rejects if embedding fails
   * — the caller fails the write loudly rather than storing a vector-less Post.
   */
  embed(text: string): Promise<number[]>;
};
