# Crew event data map for a four-week prompt study

Date: 2026-07-23

## Bottom line

Crew already records enough raw data for a useful first pass over four weeks of real use:

- every successfully instrumented `query` call, including the freeform situation, optional environment/repo, requested limit, result count, User, and timestamp;
- every Post's full authored content, origin repo, author, status, and timestamp;
- every returned Post for each query, including rank and the complete ranking-score breakdown;
- every Confirm and Flag, including Post, User, timestamp, optional Note, and the Flag reason.

The important boundary is that **“used” is not directly observed**. Crew treats a later Confirm by the same User as evidence that a returned Post was used successfully, and a later Flag as evidence that it misled. That link is calculated later with a seven-day, last-touch heuristic; there is no stored retrieval-to-verdict foreign key, agent-session id, prompt/response transcript, tool-call duration, or generic “Post was applied” event.

Primary sources: [`schema.ts`](../../packages/server/src/store/schema.ts#L13-L98), [`query.ts`](../../packages/server/src/tools/query.ts#L62-L105), [`confirm.ts`](../../packages/server/src/tools/confirm.ts#L26-L45), [`flag.ts`](../../packages/server/src/tools/flag.ts#L31-L51), [`queries.ts`](../../packages/server/src/store/queries.ts#L740-L819).

## What is recorded

| Research question | Source of truth | Recorded fields / semantics |
| --- | --- | --- |
| When was Crew queried, by whom, and with what prompt? | `retrievals` | `id`, `user_id`, normalized optional `repo`, verbatim `situation`, optional `environment`, requested `limit`, `result_count`, `created_at`. A row is intended for every query, including zero-result queries. [`schema.ts`](../../packages/server/src/store/schema.ts#L60-L77), [`0007_retrievals.sql`](../../packages/server/migrations/team/0007_retrievals.sql#L1-L23) |
| What did the query return and why did it rank there? | `retrieval_results` | One row per returned Post with `retrieval_id`, `post_id`, 1-based `rank`, `rrf_score`, `trust`, `recency`, `repo_boost`, and `final`. [`schema.ts`](../../packages/server/src/store/schema.ts#L79-L98) |
| What exactly was posted? | `posts` | Title, situation, body, environment, verbatim repo remote, status, author, created time, last-confirmed time, and aggregate views. [`schema.ts`](../../packages/server/src/store/schema.ts#L13-L40); the Post tool validates then persists all five authored fields under the authenticated User. [`post.ts`](../../packages/server/src/tools/post.ts#L47-L98) |
| What feedback happened? | `post_events` | Append-only Confirm/Flag rows: `post_id`, verdict, Flag reason (`incorrect`, `stale`, or `duplicate`), optional Note, User, timestamp. [`post-event.ts`](../../packages/server/src/core/post-event.ts#L1-L37), [`0004_post_events.sql`](../../packages/server/migrations/team/0004_post_events.sql#L1-L28) |
| Was a surfaced Post seen? | `posts.views` | A lifetime aggregate increments once whenever `query` surfaces the Post. It is display-only, has no timestamp/User/retrieval linkage, and never affects ranking. [`0005_post_views.sql`](../../packages/server/migrations/team/0005_post_views.sql#L1-L14), [`query.ts`](../../packages/server/src/tools/query.ts#L99-L105) |
| Was a surfaced Post actually useful? | Derived, not stored | A query “converts” when the same User later Confirms one of its returned Posts, strictly after the query and within seven days. Attribution is last-touch: a later retrieval of the same Post before the Confirm takes credit instead. Flags are derived by the same rule. [`queries.ts`](../../packages/server/src/store/queries.ts#L235-L255), [`queries.ts`](../../packages/server/src/store/queries.ts#L740-L819) |

## Write and read flow

1. `query` authenticates a User, resolves that User's Team database, normalizes the optional repo, and runs retrieval. [`query.ts`](../../packages/server/src/tools/query.ts#L62-L76)
2. Retrieval searches situation text by FTS and vector similarity, optionally searches environment similarity, fuses the candidate lists, then multiplies relevance by trust, recency, and same-repo boost before returning the requested slice. [`retrieve.ts`](../../packages/server/src/search/retrieve.ts#L75-L145)
3. `query` writes one Retrieval plus its result rows in a single transaction, then separately increments each surfaced Post's view counter and renders the Posts to the agent. [`query.ts`](../../packages/server/src/tools/query.ts#L78-L105), [`queries.ts`](../../packages/server/src/store/queries.ts#L543-L598)
4. `post` writes a Post and its two embeddings atomically after the intake and ingestion guardrails pass. [`post.ts`](../../packages/server/src/tools/post.ts#L69-L98), [`sqlite-repository.ts`](../../packages/server/src/store/sqlite-repository.ts#L63-L97)
5. `confirm` and `flag` append `post_events`; a Confirm also refreshes the denormalized `posts.last_confirmed`, while the event log remains authoritative. [`confirm.ts`](../../packages/server/src/tools/confirm.ts#L33-L45), [`flag.ts`](../../packages/server/src/tools/flag.ts#L38-L51), [`sqlite-repository.ts`](../../packages/server/src/store/sqlite-repository.ts#L122-L169)

Corpus and telemetry are isolated per Team in `<CREW_TEAMS_DIR>/<teamId>.db`; identity and Team membership live in the separate control-plane database. [`main.ts`](../../packages/server/src/main.ts#L15-L39), [`team-repository-resolver.ts`](../../packages/server/src/store/team-repository-resolver.ts#L11-L19).

## First-pass study

Use one explicit half-open UTC interval `[from, to)` for the four-week cohort and preserve the raw extracts before analysis. A good first report is:

1. **Adoption:** queries, Posts, Confirms, and Flags by day and User; active Users; query-to-Post ratio.
2. **Prompt behaviour:** qualitative coding of `retrievals.situation` (task type, specificity, failure text vs. broad question), plus environment/repo completion rates. Do not expose raw prompt text outside the research group before reviewing it for client names, URLs, paths, or other sensitive material.
3. **Coverage:** zero-result rate, mean/median result count, repeated or near-duplicate queries, and zero-result themes that suggest missing Posts. The existing coverage read computes total, zero-result count, and total returned Posts directly from raw Retrieval rows. [`queries.ts`](../../packages/server/src/store/queries.ts#L289-L333)
4. **Ranking quality:** Confirm/Flag rate by returned rank, score-factor distributions, and examples where rank and outcome disagree. The stored score breakdown makes this possible without rerunning today's ranker. [`retrieve.ts`](../../packages/server/src/search/retrieve.ts#L49-L68), [`schema.ts`](../../packages/server/src/store/schema.ts#L79-L98)
5. **Knowledge value:** Post exposures from `retrieval_results`, distinct querying Users, Confirms, Flags/reasons, time-to-first retrieval, and time-to-Confirm. Use result rows for time-bounded exposures; `posts.views` is lifetime-only.
6. **Outcome funnel:** queries → queries with results → Confirm-attributed queries; report Flags separately. Keep zero-result queries out of the conversion denominator, matching the application definition. [`queries.ts`](../../packages/server/src/store/queries.ts#L258-L277), [`queries.ts`](../../packages/server/src/store/queries.ts#L740-L819)

The current admin console already exposes a useful visual sanity check: Performance supports a rolling 30-day period and shows volume, zero-result rate, Posts, and Confirm conversion; Retrievals expands each query into returned Posts and score factors; Activity merges searches, Posts, Confirms, and Flags. [`usage-dashboard.tsx`](../../packages/console/src/components/feature/usage-dashboard/usage-dashboard.tsx#L37-L115), [`usage-dashboard.tsx`](../../packages/console/src/components/feature/usage-dashboard/usage-dashboard.tsx#L178-L218), [`retrievals-dashboard.tsx`](../../packages/console/src/components/feature/retrievals-dashboard/retrievals-dashboard.tsx#L24-L44), [`activity-dashboard.tsx`](../../packages/console/src/components/feature/activity-dashboard/activity-dashboard.tsx#L15-L65). The telemetry API is admin-only and scoped to the signed-in admin's Team. [`telemetry.ts`](../../packages/server/src/api/telemetry.ts#L17-L35)

## Caveats that affect interpretation

- **Recent outcomes are right-censored.** Because a Confirm/Flag may arrive up to seven days after a query, queries in the last seven days have not had a full conversion opportunity. Freeze the mature cohort at `analysis_time - 7 days`, or label the newest week provisional. [`queries.ts`](../../packages/server/src/store/queries.ts#L235-L248)
- **A Confirm is evidence, not ground truth.** It records that the agent says it applied the Post and observed it work; non-confirmation can mean “unused,” “used but feedback skipped,” or “still unresolved.” The tool wording makes this explicit, but telemetry cannot distinguish those cases. [`confirm.ts`](../../packages/server/src/tools/confirm.ts#L9-L20), [`confirm.ts`](../../packages/server/src/tools/confirm.ts#L26-L45)
- **Attribution is heuristic and last-touch.** The retrieval id is deliberately not stored on a Confirm/Flag, so repeated retrievals of the same Post by the same User shift credit to the most recent touch. [`queries.ts`](../../packages/server/src/store/queries.ts#L740-L819), [`ADR 0009`](../adr/0009-retrieval-telemetry-raw-rows-per-team-db.md#L15-L16)
- **Telemetry can be missing without a failed query.** The Retrieval write is caught and swallowed so a telemetry failure does not fail the query. Check server error logs for `Failed to record retrieval telemetry`; aggregate lifetime views may provide only a rough cross-check because they have no timestamps. [`query.ts`](../../packages/server/src/tools/query.ts#L78-L103)
- **The data is per human User, not per agent/key/session.** Multiple API keys belonging to one User collapse to the same identity, so this dataset cannot compare Claude vs. Codex vs. Cursor, distinguish concurrent agents, or reconstruct a conversation. [`CONTEXT.md`](../../CONTEXT.md#L38-L44)
- **The exact returned text is not snapshotted.** `retrieval_results` retains Post id and ranking numbers, while the tuning read joins to the Post's current title and falls back to a bare id if it was deleted. It does not retain the rendered Markdown, response envelope, Notes shown at query time, latency, errors, or downstream tool calls. [`queries.ts`](../../packages/server/src/store/queries.ts#L638-L725), [`repository.ts`](../../packages/server/src/store/repository.ts#L91-L104)
- **Deletion changes what can be reconstructed.** Deleting a Post removes its content and verdict log but deliberately leaves telemetry result ids behind. [`repository.ts`](../../packages/server/src/store/repository.ts#L91-L97), [`sqlite-repository.ts`](../../packages/server/src/store/sqlite-repository.ts#L330-L339)
- **The ADR header is stale.** ADR 0009 still says “not yet implemented,” but the schema, migration, write path, reads, API, tests, and console are present. Treat executable code/migrations as the current source of truth. [`ADR 0009`](../adr/0009-retrieval-telemetry-raw-rows-per-team-db.md#L1-L7), [`schema.ts`](../../packages/server/src/store/schema.ts#L60-L98)
- **Some type comments are stale.** `ConversionStats.converted` still describes “any-touch,” while the SQL and the function-level documentation implement last-touch with `NOT EXISTS`. Use the SQL semantics. [`queries.ts`](../../packages/server/src/store/queries.ts#L258-L277), [`queries.ts`](../../packages/server/src/store/queries.ts#L740-L819)

## Documentation convention

The repository currently keeps durable technical decisions under `docs/adr/` and has no established research-note directory. This note therefore starts `docs/research/` and uses a dated, descriptive filename; it does not amend an ADR or application code.
