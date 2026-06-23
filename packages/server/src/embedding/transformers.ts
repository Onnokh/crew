import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import type { Embedder } from "./embedder.js";

/** The one pinned model for the whole corpus. */
export const MODEL_NAME = "bge-small-en-v1.5";
/** The Transformers.js (ONNX) Hub repo that backs {@link MODEL_NAME}. */
const MODEL_REPO = "Xenova/bge-small-en-v1.5";
/** bge-small-en-v1.5 produces 384-dim, cosine-normalized vectors. */
export const MODEL_DIMENSIONS = 384;

/**
 * Real {@link Embedder}: Transformers.js running bge-small-en-v1.5 in-process on
 * onnxruntime-node. Tokenization is pure JS (no native binding) and ort-node
 * ships linux/arm64 prebuilts, so this builds and runs NATIVELY on arm64 —
 * unlike fastembed, whose Rust tokenizer (@anush008/tokenizers) has no
 * linux-arm64-gnu prebuilt. Vectors are mean-pooled + L2-normalized
 * (`normalize: true`), which sqlite-vec's `vec_distance_cosine` assumes — do not
 * disable. Built via {@link TransformersEmbedder.create} because the model loads
 * lazily.
 */
export class TransformersEmbedder implements Embedder {
  readonly modelName = MODEL_NAME;
  readonly dimensions = MODEL_DIMENSIONS;

  private constructor(private readonly extract: FeatureExtractionPipeline) {}

  static async create(cacheDir?: string): Promise<TransformersEmbedder> {
    // env.cacheDir is a global Transformers.js setting; point it at the
    // (build-time baked) model cache so the runtime resolves the model locally
    // and needs no outbound network. Unset => default cache, downloaded on first
    // use (local dev). The weights load lazily; the first embed() pulls them.
    if (cacheDir) env.cacheDir = cacheDir;
    const extract = await pipeline("feature-extraction", MODEL_REPO);
    return new TransformersEmbedder(extract);
  }

  async embed(text: string): Promise<number[]> {
    const output = await this.extract(text, {
      pooling: "mean",
      normalize: true,
    });
    const vector = Array.from(output.data as Float32Array);
    if (vector.length !== this.dimensions) {
      throw new Error(
        `Embedder produced ${vector.length} dims, expected ${this.dimensions}`,
      );
    }
    return vector;
  }
}
