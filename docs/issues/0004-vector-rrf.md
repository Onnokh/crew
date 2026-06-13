# 0004 · Vector leg — embeddings + sqlite-vec + RRF

**Milestone:** A — Working MCP · **Type:** AFK

## What to build

Add semantic retrieval. Embeddings are generated in-process at write time and query time (no external service, ever); a vector index sits alongside the keyword index, and the two ranked lists are fused with reciprocal rank fusion into a single ordered result. After this slice, a query phrased differently from the Post — with no shared keywords — still finds it.

The embedding model is generated behind an `Embedder` interface (real implementation + a deterministic fake for tests). The model identity is pinned and checked at startup, because all stored vectors must come from the same model to be comparable.

## Acceptance criteria

- [ ] Posting generates and stores an embedding for the Post; a write that fails to embed fails loudly (no vector-less Post is ever stored)
- [ ] Querying embeds the query and retrieves nearest Posts by vector similarity
- [ ] Keyword and vector candidate lists are merged via reciprocal rank fusion into one ranked result
- [ ] A paraphrased query with no keyword overlap finds the relevant Post
- [ ] The embedding model name is recorded; a mismatch at startup refuses to start
- [ ] Tests use a deterministic fake embedder — no model download in CI

## Blocked by

- [0003](./0003-keyword-query-render.md)
