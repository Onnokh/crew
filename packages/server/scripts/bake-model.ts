// Build-time model bake: download bge-small-en-v1.5 into the image's model cache
// so the container's first boot needs no outbound network for embeddings. Drives
// the same TransformersEmbedder the runtime uses, so model id and cache layout
// can't drift. CREW_MODEL_CACHE_DIR must be set here (unlike the runtime), or the
// model lands where the runtime won't find it and gets silently re-downloaded.
import { TransformersEmbedder } from "../src/embedding/transformers.js";

const cacheDir = process.env.CREW_MODEL_CACHE_DIR;
if (!cacheDir) {
  throw new Error(
    "CREW_MODEL_CACHE_DIR must be set so the baked model lands where the runtime looks for it",
  );
}

console.log(`Baking embedding model into ${cacheDir} …`);
// pipeline() fetches config/tokenizer, but the ONNX weights load lazily on the
// first inference — so embed once to force the full model into the cache.
const embedder = await TransformersEmbedder.create(cacheDir);
await embedder.embed("warm up the baked model cache");
console.log("Embedding model baked.");
