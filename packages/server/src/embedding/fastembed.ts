import { EmbeddingModel, FlagEmbedding } from "fastembed";

/** The one pinned model for the whole corpus. */
export const MODEL_NAME = "bge-small-en-v1.5";
/** bge-small-en-v1.5 produces 384-dim, cosine-normalized vectors. */
export const MODEL_DIMENSIONS = 384;

/**
 * fastembed running bge-small-en-v1.5 in-process. Vectors are cosine-normalized
 * (sqlite-vec's `vec_distance_cosine` assumes it — do not disable).
 * Built via {@link FastEmbedder.create} because the model loads lazily.
 */
export class FastEmbedder {
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
    const vector = await this.model.queryEmbed(text);
    if (vector.length !== this.dimensions) {
      throw new Error(
        `Embedder produced ${vector.length} dims, expected ${this.dimensions}`,
      );
    }
    return Array.from(vector);
  }
}
