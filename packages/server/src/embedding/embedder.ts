/**
 * The embedding seam: turns text into a fixed-length, cosine-normalized vector
 * for semantic retrieval. All corpus vectors must come from one model to be
 * comparable, so an Embedder carries its {@link modelName} as identity.
 */
export type Embedder = {
  /** Pinned model identity; the server refuses to start on a mismatch. */
  readonly modelName: string;

  /** The dimensionality of the vectors this embedder produces (384 for bge-small). */
  readonly dimensions: number;

  /** Embed text into a cosine-normalized vector of length {@link dimensions}. */
  embed(text: string): Promise<number[]>;
};
