# Candidate-level retrieval traces

Date: 2026-07-27

## Decision

Keep candidate tracing disposable and local. The extractor in
[`candidate-traces.ts`](../../packages/server/src/research/candidate-traces.ts)
opens a frozen Team SQLite database read-only, replays the existing FTS5 and
sqlite-vec legs, and writes research artifacts outside the server's production
query path. It does not change ranking, telemetry tables, MCP responses, Post
events, or the source database.

## Captured fields

`retrieval-traces.jsonl` contains one pseudonymized row per current candidate,
plus a `historical-result-only` row when a previously rendered result is no
longer searchable. Each row records:

- vector rank and cosine distance for the situation leg;
- environment-vector rank and distance when an environment was supplied;
- keyword rank and the FTS5 BM25 score (`ftsRank` in the source query);
- retrieval-leg membership, per-vector threshold decisions, and fused
  eligibility;
- the historical final rendered rank, or null when the candidate was not
  rendered.

`retrieval-outcomes.jsonl` is a separate, explicitly linked oracle. It contains
the pseudonymized retrieval id, Post id, event id, verdict, safe Flag reason,
and event time. The SQL uses Crew's existing seven-day, same-user, last-touch
semantics; missing feedback remains unresolved rather than negative.

## Privacy and split safeguards

- IDs are HMAC-SHA256 pseudonyms. The salt is required, used only in memory, and
  represented in the manifest by a fingerprint.
- Query, environment, repo, Post content, and event notes are excluded by
  default. `--include-content` is an explicit local-only opt-in and output
  directories are created mode `0700` with files mode `0600`.
- Candidate traces and outcome oracles are separate files so a candidate can be
  replayed without seeing its verdicts.
- The time split is development before `--split-at`, mature evaluation through
  `analysis-time - 7 days`, and a provisional newest-seven-day slice. The
  provisional slice must not decide acceptance because outcomes are
  right-censored.
- The manifest records both the source file hash and a logical hash of rows
  visible through SQLite, which covers WAL-visible data without checkpointing
  or mutating the source.

## Reproduction

Use a copied/frozen Team database and a private output directory:

```bash
npm run research:candidate-traces -w @crew/server -- \
  --db /private/frozen/team.db \
  --out /private/research-output/candidate-traces-20260727 \
  --salt "$CREW_RESEARCH_TRACE_SALT" \
  --from 2026-06-23T00:00:00Z \
  --to 2026-07-27T00:00:00Z \
  --split-at 2026-07-14T00:00:00Z \
  --analysis-time 2026-07-27T00:00:00Z
```

The extractor requires the same pinned `bge-small-en-v1.5` model used by the
corpus. Its source query helpers are
[`queries.ts`](../../packages/server/src/store/queries.ts), and the production
retrieval semantics are in
[`retrieve.ts`](../../packages/server/src/search/retrieve.ts). Historical
retrieval/result storage and the existing attribution contract are defined by
[`0007_retrievals.sql`](../../packages/server/migrations/team/0007_retrievals.sql)
and the read-time conversion query in
[`queries.ts`](../../packages/server/src/store/queries.ts).

## Verification boundary

The fixture tests verify leg membership, BM25/vector signals, threshold drops,
rendered rank, last-touch retrieval linkage, identifier pseudonymization,
content opt-in, and provisional split labeling. No live or private production
database is included in this repository artifact.
