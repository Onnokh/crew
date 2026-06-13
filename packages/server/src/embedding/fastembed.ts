import { EmbeddingModel, FlagEmbedding } from "fastembed";
import type { Embedder } from "./embedder.js";

/** The one pinned model for the whole corpus (see ADR 0001, TECH.md). */
export const MODEL_NAME = "bge-small-en-v1.5";
/** bge-small-en-v1.5 produces 384-dim, cosine-normalized vectors. */
export const MODEL_DIMENSIONS = 384;

/**
 * Real {@link Embedder}: fastembed running bge-small-en-v1.5 in-process (ONNX on
 * CPU, model baked into the image — no external AI service anywhere in the hot
 * path, see ADR 0001). Vectors are 384-dim and cosine-normalized (fastembed's
 * default; sqlite-vec's `vec_distance_cosine` assumes it — do not disable).
 *
 * Construction is async because the model loads (and, absent the baked cache,
 * downloads) lazily — so this is built via {@link FastEmbedder.create}, not a
 * constructor. Tests never reach here: they use {@link FakeEmbedder}, so CI does
 * not download the 30 MB model.
 */
export class FastEmbedder implements Embedder {
  readonly modelName = MODEL_NAME;
  readonly dimensions = MODEL_DIMENSIONS;

  private constructor(private readonly model: FlagEmbedding) {}

  static async create(cacheDir?: string): Promise<FastEmbedder> {
    const model = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallENV15,
      ...(cacheDir ? { cacheDir } : {}),
    });
    return new FastEmbedder(model);
  }

  async embed(text: string): Promise<number[]> {
    // queryEmbed returns a single normalized vector for one string; used the
    // same way at write and query time so both legs share one vector space.
    const vector = await this.model.queryEmbed(text);
    if (vector.length !== this.dimensions) {
      throw new Error(
        `Embedder produced ${vector.length} dims, expected ${this.dimensions}`,
      );
    }
    return Array.from(vector);
  }
}
