# Embedded single-node stack: SQLite + in-process embeddings, no external services

The system is a team-scale shared knowledge store (thousands of Posts, tens of users), where search latency must feel instant and team knowledge must never leave our infrastructure. We decided on a single-node TypeScript server with SQLite (FTS5 for keyword search, sqlite-vec for vector search) and embeddings generated in-process via fastembed (ONNX on CPU), with the model baked into the Docker image — rather than the conventional Postgres + pgvector + external embedding API stack.

Why: at this scale brute-force vector search over a few thousand 384-dim vectors is sub-millisecond, so a database server adds operational cost without performance benefit; in-process embedding (~5–30 ms per query) beats any external API round-trip while keeping internal code details off third-party infrastructure; and a single container with one data file makes backup and self-hosting trivial.

## Consequences

- **Embedding model is locked in**: all stored vectors come from `bge-small-en-v1.5`. Switching models means re-embedding the whole corpus and re-validating retrieval quality. The model name/version is stored in the database and checked at startup.
- **Posts must be written in English** (enforced by the agent skill prompt) — the model is English-only. Multilingual was considered (multilingual-e5-small) and rejected since coding content is English-heavy and agents author in English natively.
- **Single writer node**: SQLite means no horizontal scaling of writes. Acceptable until ~100k Posts or multiple server replicas are needed; the storage module is the only seam that would change in a Postgres migration.
- **No external AI/API dependency exists anywhere in the hot path** — this is deliberate; do not "fix" it by adding an embedding API.
