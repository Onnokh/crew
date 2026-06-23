---
status: accepted (amends ADR 0001) — not yet implemented
---

# Multi-team tenancy: one host runs a control plane plus one SQLite DB per team

ADR 0001 chose an embedded single-node stack (SQLite + in-process embeddings) for a single team-scale knowledge store, with one data file per deployment. We are extending — not replacing — that design to host **multiple isolated teams from a single deployment**. One host runs a thin **control plane** (which team a request belongs to) in front of **N independent per-team data planes**, where **each team gets its own SQLite database**. The per-team store keeps ADR 0001's design exactly: FTS5 + sqlite-vec + the in-process `bge-small-en-v1.5` model, one file per team. There is no shared multi-tenant corpus and no row-level tenant column — isolation is **physical, one file per team**.

Crew's knowledge is project-scoped (a Post auto-captures its git-origin repo), and a team is the natural boundary that owns a set of projects. Pooling unrelated teams into one corpus would mix confidential per-repo knowledge and pollute retrieval; the repo-boost-without-filtering design (ADR 0001) is meant to surface a team's *own* repos against *its own* corpus, not arbitrate between strangers. A file per team gives that boundary for free while leaving the proven single-node core untouched.

## Considered options

- **Shared multi-tenant database with an `org_id`/`team_id` column on every row** — rejected for now. It forces row-level isolation through every query, the FTS5/vec tables, and the auth model (likely a SQLite→Postgres+pgvector migration), and a single isolation bug leaks one team's knowledge into another's. High blast radius for no benefit at our scale.
- **A separate container per team (instance-per-tenant orchestration)** — rejected as the primary model. The embedding model costs hundreds of MB of RAM resident in *every* container, which is wasteful when one host can open many lightweight SQLite files against a single shared model in memory.
- **One host, control plane + one SQLite file per team (chosen)** — keeps the embedding model resident once, keeps each team's corpus a clean isolatable unit, and changes only the storage-open seam rather than the retrieval/trust internals.

## Consequences

- **The storage seam becomes team-aware.** The module that opens the database (ADR 0001's "only seam that would change") now resolves a team to its SQLite file and opens/caches a connection per team. Retrieval, trust, and ingestion code operate against whatever connection they are handed and stay unchanged.
- **The embedding model is loaded once per host, shared across all team DBs.** Vectors are still per-team (stored in each file); only the ONNX model weights are shared in memory.
- **Per-team files are created on team creation** and are individually backup-able. Backup/restore granularity is now per team, which is a feature.
- **ADR 0001's single-writer limit is now per team**, not per deployment — each team independently has plenty of headroom before the ~100k-Post ceiling. The host scales by adding teams (more files), not by scaling any one corpus.
- **Routing must be unambiguous before any DB is opened** — how a request resolves to a team is specified in ADR 0008.
