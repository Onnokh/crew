---
status: accepted (amends ADR 0001) — not yet implemented
---

# Retrieval telemetry: raw relational rows in the per-team DB, analytical linkage, no OTEL export

We need to know whether retrieval actually works — does an agent query and get back the Post that helps it — both as a quality bar and as the raw material for tuning ranking. Today the query path is fire-and-forget: it runs `retrieve()`, bumps a display-only `views` counter, and returns markdown, leaving no trace of what was asked or what came back. We are adding **Retrieval telemetry**: every query is recorded as a **Retrieval** plus one row per returned Post (carrying rank and the full score breakdown — `rrfScore`, `trust`, `recency`, `repoBoost`, `final`), written **synchronously into the same per-team SQLite** as raw, un-aggregated rows named by OpenTelemetry semantic conventions. Whether a query "converted" (a returned Post was later Confirmed) is computed **analytically** by joining the Confirm's existing `post_id` to the Retrieval's result rows (same User, within a time window) — the agent protocol does not change.

The motivating constraint: a Confirm arrives minutes-to-days after the query that surfaced the Post, in a separate request. The link between them is inherently a cross-time relational join, not a live trace.

## Considered options

- **Ship telemetry as OpenTelemetry signals to a collector (no local relational store)** — rejected. OTEL metrics are pre-aggregated (the individual queries, needed for tuning, are gone) and traces are sampled with short retention (expired before the days-later Confirm arrives), so the cross-time query→Confirm join the quality bar depends on cannot be reconstructed. It would also require an external collector in the hot path, violating ADR 0001's "no external services." We keep the *cheap half* — conventional naming, so raw rows export mechanically later — without building the pipe.
- **A separate (per-team) telemetry database** — rejected for now. Under ADR 0007 (one SQLite file per team) a separate store must also be per-team, doubling files to 2N and forcing `ATTACH DATABASE` for every metrics join, to solve write contention that does not exist at team scale (WAL mode, sub-ms local inserts). Because the rows are raw and conventionally named, splitting telemetry out later — if cloud-scale query volume ever makes it contend with the corpus — is a mechanical migration.
- **Round-trip a query id through the agent (agent passes it back on Confirm)** — rejected. It adds protocol coupling and is impossible to do without inventing agent-side plumbing; the Confirm already carries the `post_id`, which is a sufficient join key.
- **Materialize the query→Confirm link at Confirm time (stamp a `query_id` on the event row)** — rejected. It puts a lookup on the core Confirm write path and bakes a fuzzy heuristic into a migration, giving false precision to a link that has no ground truth. Keeping raw rows + a read-time join rule lets the window and attribution logic change with zero re-instrumentation.

## Consequences

- **The query path takes one extra synchronous write** (a Retrieval + its result rows) into the team's own DB. It is wrapped so a telemetry write failure logs and is swallowed — it must never fail the query. `recordViews` keeps running alongside it.
- **Every metric definition is a read-time parameter, not a stored decision.** The attribution window (default 7-day last-touch), the conversion denominator (default: ÷ queries-with-results, with zero-result tracked separately), and any future metric are computed from the raw rows at dashboard time and revisable without migration.
- **The `views` counter stays permanently** as a hot-path materialized aggregate for the agent-facing provenance render. View counts are NOT derived from telemetry rows on the query path — that would scan the unbounded `retrieval_results` table per result per query. Telemetry rows are read only on the cold dashboard path.
- **Retrievals are kept indefinitely** for now; a retention/purge knob and raw-query-text privacy controls are deferred to the cloud phase (where one operator holds many teams' DBs).
- **A lightweight admin dashboard** (console) reads these rows directly: conversion rate, zero-result rate, query volume, and a browsable list of recent Retrievals with score drill-down. Deeper analysis stays ad-hoc SQL against the raw rows.
