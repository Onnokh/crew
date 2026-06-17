// Build-time model bake: download bge-small-en-v1.5 into the image's model cache
// so the container's first boot needs NO outbound network for embeddings
// (issue 0009 acceptance criterion; see ADR 0001 / TECH.md).
//
// Run during `docker build` from inside packages/server so that `fastembed`
// resolves against this package's node_modules. The cache dir MUST match the
// CREW_MODEL_CACHE_DIR the running container reads (set in the Dockerfile), or the
// runtime would re-download. Kept in lockstep with embedding/fastembed.ts — the
// model id here mirrors MODEL_NAME there.
import { EmbeddingModel, FlagEmbedding } from "fastembed";

const cacheDir = process.env.CREW_MODEL_CACHE_DIR;
if (!cacheDir) {
  throw new Error(
    "CREW_MODEL_CACHE_DIR must be set so the baked model lands where the runtime looks for it",
  );
}

console.log(`Baking embedding model into ${cacheDir} …`);
// init() downloads + decompresses the model into cacheDir if absent. We discard
// the handle: the side effect (a populated cache) is the whole point.
await FlagEmbedding.init({
  model: EmbeddingModel.BGESmallENV15,
  cacheDir,
  showDownloadProgress: true,
});
console.log("Embedding model baked.");
