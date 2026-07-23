# Benchmark cohorts from live Crew telemetry and agent histories

Date: 2026-07-23
Linear question: “Derive benchmark cohorts from live Crew telemetry”

## Decision

Use two linked but separately governed benchmark corpora:

1. **Crew event cases** measure invocation, query construction, retrieval, result
   delivery, and future-Post characteristics from the four-week production
   evidence.
2. **Agent-history cases** measure task, tool-call, executable-check, outcome,
   and token patterns from local Codex and Claude root sessions whose working
   directory belongs to a repository with a `git.indicia` origin.

The benchmark must not turn optional feedback into a false relevance label.
Confirm and Flag are useful outcome signals, but an unconfirmed result remains
**unresolved**, not irrelevant. Product decisions should use paired executable
replays as the quality oracle and use production feedback as a secondary slice.

The POC in this branch generates machine-checkable, privacy-preserving inputs
and separately sealed oracles. It does not change production code, edit a Post,
or write to a source database.

## Evidence boundary

The saved four-week analysis reports:

| Evidence | Four-week value |
| --- | ---: |
| Queries | 1,155 |
| Posts | 464 |
| Returned-result rows | 5,967 |
| Confirms / Flags | 162 / 8 |
| Active people | 12 |
| Queries with exact requested result count | 99.5% |
| Cross-repo, single-leg exposures | 4,346 (72.8% of exposures) |
| Confirm rate: same-repo / other-or-no-repo | 7.92% / 1.20% |
| Confirm rate: multi-leg / single-leg | 8.98% / 1.90% |
| Confirmed rows at ranks 1–5 | 97.5% |

Those figures come from the read-only four-week snapshot documented in
`docs/research/2026-07-23-four-week-usage-first-pass.md`, whose recorded Team
database SHA-256 is
`2b48a0b52fbf3129cad911613a411287d99f42be4ea1b501344b27c2d73fcec0`.
That exact database file is no longer present locally.

The remaining saved Team database overlaps the beginning of the study window:
83 queries and 97 Posts from 2026-06-23 through 2026-06-25. I used that
read-only prefix to execute the POC. This distinction is load-bearing:

- the full report supports population-level allocation decisions;
- the 83-query prefix proves that fixture generation works against real rows;
- exact 1,155-query case IDs cannot be frozen until the recorded snapshot is
  restored or a new immutable online backup is taken.

The source schema and executable semantics are the primary sources:

- retrieval and result fields:
  [`schema.ts`](../../packages/server/src/store/schema.ts);
- seven-day, same-user, last-touch attribution:
  [`queries.ts`](../../packages/server/src/store/queries.ts);
- the only absolute relevance threshold and the three retrieval legs:
  [`retrieve.ts`](../../packages/server/src/search/retrieve.ts);
- same-repo and recency multipliers:
  [`score.ts`](../../packages/server/src/search/score.ts).

## Cohort model

The benchmark unit is not just a query. Different facets require different
units and oracles.

| Facet | Unit | Representative cohort | Adversarial cohort | Low-value cohort | Regression cohort |
| --- | --- | --- | --- | --- | --- |
| Invocation | Root agent task/session | Stratify by client, task kind, repo, time, and whether Crew was called | Tool-error and retry-heavy traces; long/multi-turn tasks; query after work already completed | Successful executable replay where Crew adds tokens but changes no outcome | Tasks where removing or delaying Crew loses an executable pass or causes harmful guidance |
| Query construction | Retrieval | Situation-length quartile × repo present × Environment present × requested limit × time split | Missing repo; known lexical-collision Flags; failure-language prompts; underfilled/zero result | Queries whose surface is at least 80% cross-repo, single-leg results and has no verdict; label **unresolved low-confidence**, never “bad” | Confirmed and Flagged last-touch queries; cross-author Confirm; lower-rank Confirm; deleted-result and zero-result edge cases |
| Retrieval/ranking | Returned result | Rank, same-repo, single/multi-leg, author relation, trust/recency buckets | Flagged result; cross-repo lexical collision; rank inversion; deleted Post | Cross-repo, single-leg, unconfirmed exposure | Every attributed Confirm/Flag, especially same-repo multi-leg, cross-author Confirm, and ranks 6–7 |
| MCP delivery | Query response | Current requested-limit distribution and rank mix | Filled-to-limit low-confidence surfaces; very long Posts/Notes; deleted Post | Rendered results that add tokens without changing an executable replay | Any shorter response that loses an attributed Confirm or introduces a Flagged result |
| Future Post | Post plus downstream exposures | Body-length quartile × status × creation time; representative authors/repos remain pseudonymous | Flagged Posts; long/high-note candidates; retrieval collision candidates | Never-retrieved and high-exposure-unresolved Posts; still not negative labels | Cross-author attributed Confirm, direct Flag, and high-transfer Posts |

### Why these cohorts

The production data makes two signals worth preserving in every split:
same-repo match and multi-leg agreement. Their joint Confirm rates range from
12.03% for same-repo/multi-leg to 0.90% for cross-repo/single-leg. Rank must
also remain stratified: ranks 3–5 produced 35% of Confirmed rows, and one useful
operational Post was Confirmed at rank 7.

Zero-result rate is not a representative quality cohort. Only 1 of 1,155
queries returned nothing while 99.5% filled the requested limit. It belongs in
structural regression testing. The main low-confidence stress slice is the
4,346 cross-repo/single-leg exposures, but absence of feedback does not make
those rows a negative class.

Future-Post optimization needs both transfer wins and failure modes. Use
cross-author Confirms to represent demonstrated transfer, Flags to represent
harm, never-retrieved Posts to represent discoverability gaps, and
high-exposure-unresolved Posts to represent token cost with unknown value. Do
not rewrite historical Posts; feed immutable originals to candidate Post
prompts in private replay sandboxes.

## Agent-history corpus

The history extractor scanned root session files only; it excludes Claude
subagent files so one user task is not multiplied into many apparent cases. A
session qualifies only when its recorded working directory is contained by a
currently discoverable repository whose `origin` contains `git.indicia`.

Actual metadata-only POC result:

| Item | Value |
| --- | ---: |
| Discovered `git.indicia` repositories | 47 |
| Codex / Claude files scanned | 274 / 822 |
| Unique selected root sessions | 191 |
| Codex / Claude selected sessions | 9 / 182 |
| Sessions with a Crew query | 40 |
| Sessions with a Crew Post | 31 |
| Sessions with a Crew Confirm | 17 |
| Sessions with a Crew Flag | 1 |
| Sessions with an observed executable test command | 15 |
| Sessions with an observed tool error | 97 |
| Exact / keyed-band near matches to the 83-query Crew prefix | 0 / 0 |

These are trace counts, not success rates. Tool errors can be intentional probes
or harmless misses; a final response is not proof of a correct result; and the
two clients account for token usage differently. The extractor retains
separate input, cached-input, output, and reported-total fields for calibration
in the token-surface research ticket. Until then, token values are raw
observations rather than cross-client comparable measurements.

The 0 overlaps only means no match was found against the 83-query prefix. The
full 1,155-query fixture must be regenerated before concluding that Crew events
and history sessions are independent.

## POC artifacts

- [`telemetry-cohorts.ts`](../../packages/server/scripts/research/telemetry-cohorts.ts)
  reads a Team SQLite database in read-only mode and emits:
  `manifest.json`, `retrieval-inputs.jsonl`, `retrieval-oracles.jsonl`,
  `post-inputs.jsonl`, and `post-oracles.jsonl`.
- [`history-cohorts.ts`](../../packages/server/scripts/research/history-cohorts.ts)
  scans local Codex and Claude histories and emits:
  `history-manifest.json`, `history-inputs.jsonl`, and
  `history-oracles.jsonl`.
- [`task-fingerprint.ts`](../../packages/server/scripts/research/task-fingerprint.ts)
  creates exact keyed fingerprints and eight keyed minimum-hash bands for
  cross-source deduplication without emitting task text.
- [`telemetry-cohorts.test.ts`](../../packages/server/scripts/research/telemetry-cohorts.test.ts)
  verifies last-touch attribution, input/oracle separation, edge cohorts, and
  opt-in content.
- [`history-cohorts.test.ts`](../../packages/server/scripts/research/history-cohorts.test.ts)
  verifies `git.indicia` selection, Codex/Claude parsing, Crew overlap grouping,
  and exclusion of raw task text and paths.

The live-prefix run produced:

- 83 Retrieval inputs and oracles;
- 64 representative Retrievals;
- 49 low-confidence-surface Retrievals;
- 40 top-result-low-confidence Retrievals;
- 17 missing-repo Retrievals;
- 3 underfilled Retrievals and 1 zero-result Retrieval;
- 4 Confirmed Retrieval oracles, including 1 cross-author Confirm;
- 97 Post inputs and oracles;
- 8 never-retrieved Posts and 9 high-exposure-unresolved Posts;
- 3 attributed-confirm Posts, 1 cross-author-confirm Post, and 1 Flagged Post.

These counts agree with the saved prefix database and are not substituted for
the full-period counts.

## Leakage and privacy controls

1. **Freeze evidence.** Record an online-backup SHA-256 plus the generator
   version, interval, split time, and output hashes. The POC also hashes the
   logical rows visible through SQLite so uncheckpointed WAL data is covered.
2. **Separate inputs and oracles.** Candidate skills, prompts, and ranking rules
   may read only `*-inputs.jsonl`. Evaluation joins the oracle files after a
   run.
3. **Use time, not random rows, as the primary split.** Develop on Retrievals
   before 2026-07-14; evaluate only the mature interval from 2026-07-14 through
   the seven-day censor boundary; mark the newest seven days provisional.
4. **Keep cross-source duplicates together.** Exact task fingerprints and
   at-least-six-of-eight keyed band matches inherit the Crew case split. Treat
   an overlapping Crew Retrieval and agent-history session as one provenance
   group, not two observations.
5. **Never expose source text by default.** IDs, Users, repos, task text, and
   content use keyed pseudonyms/fingerprints. Event Notes, local paths, remotes,
   history tool arguments, and tool outputs are never emitted.
6. **Opt in to Crew content only inside a private replay directory.** The
   telemetry generator supports `--include-content` for Post/query prompt POCs.
   That output must remain untracked and access-controlled. The history
   extractor has no raw-text output mode.
7. **Do not label silence as failure.** `unresolved_low_confidence` and
   `high_exposure_unresolved` are sampling labels. They are not relevance or
   quality labels.
8. **Do not repeatedly tune on the final set.** Freeze candidate policies before
   prospective evaluation. Excessive adaptive reuse can overfit a holdout
   ([Feldman, Frostig, and Hardt, 2019](https://proceedings.mlr.press/v97/feldman19a.html)).
9. **Add fresh cases continuously.** Recent, automatically scored tasks reduce
   contamination risk; this is also the design principle behind
   [SWE-rebench](https://arxiv.org/abs/2505.20411) and
   [LiveBench](https://arxiv.org/abs/2406.19314).

The current mature evaluation interval after the proposed split is only about
two days. It is a smoke-test holdout, not enough evidence for a production
decision. Lock candidates now and add a prospective window of fresh tasks.

## Evaluation flow

For each candidate invocation/query/Post skill bundle:

1. Run paired, isolated Codex replays against the same repository snapshot and
   task case, with deterministic commands and the same tool availability.
2. Score executable task success first. A candidate failing the quality floor
   is rejected regardless of token savings.
3. For successful pairs, compare total production tokens, Crew call count,
   result count, rendered Crew tokens, retries, and task duration.
4. Join sealed oracles and report Confirm retention, Flag exposure, lower-rank
   Confirm loss, cross-author transfer, and cohort-specific regressions.
5. Run Post candidates as a knowledge-transfer chain: a solver produces a Post
   under the candidate prompt/rules; a fresh agent receives a related task,
   queries Crew if its policy chooses to, and must pass executable checks. This
   tests whether shorter Posts remain discoverable and sufficient without
   asking a human.
6. Select the lowest median and worst-case token policy among candidates that
   are non-inferior on executable success and harmful-guidance safeguards.

Trajectory-level diagnostics matter because final-answer success alone cannot
say whether the correct tool was selected, parameterized, or ordered; this is
the motivation of
[TRAJECT-Bench](https://arxiv.org/abs/2510.04550). In Crew, the relevant
trajectory fields are query/post/confirm/flag order, test execution, retries,
and result-delivery size.

## Reproduction

Use a task-specific secret salt and untracked output directories:

```sh
export CREW_COHORT_SALT='replace-with-a-private-random-value'
export CREW_TEAM_DB='/absolute/path/to/immutable-team-snapshot.db'
export CREW_FIXTURE_DIR='/private/tmp/crew-telemetry-fixtures'

node --import tsx packages/server/scripts/research/telemetry-cohorts.ts \
  --db "$CREW_TEAM_DB" \
  --out "$CREW_FIXTURE_DIR" \
  --from 2026-06-23T13:17:00Z \
  --to 2026-07-23T13:44:00Z \
  --analysis-time 2026-07-23T13:44:00Z \
  --split-at 2026-07-14T00:00:00Z
```

Then derive the history corpus with the same salt so deduplication keys match:

```sh
export CREW_HISTORY_DIR='/private/tmp/crew-history-fixtures'

node --import tsx packages/server/scripts/research/history-cohorts.ts \
  --codex-root /Users/onnokleinhofmeijer/.codex/sessions \
  --codex-root /Users/onnokleinhofmeijer/.codex/archived_sessions \
  --claude-root /Users/onnokleinhofmeijer/.claude/projects \
  --repo-search-root /Users/onnokleinhofmeijer/dev/sites \
  --crew-inputs "$CREW_FIXTURE_DIR/retrieval-inputs.jsonl" \
  --out "$CREW_HISTORY_DIR" \
  --split-at 2026-07-14T00:00:00Z
```

Verification:

```sh
npx vitest run packages/server/scripts/research/*.test.ts
npm run typecheck -w @crew/server
```

## Gaps before freezing the benchmark

- Restore the exact four-week Team database hash or take a new immutable online
  backup; the saved 83-query prefix cannot produce the full fixture IDs.
- Calibrate Codex and Claude token fields before comparing clients or declaring
  token savings.
- History coverage is conditional on repositories still discoverable locally;
  deleted/moved repositories and removed worktrees can be missed.
- The current telemetry does not record client, session, exact rendered MCP
  response, latency, candidate distances, or rejected Post attempts.
- Confirm/Flag attribution remains a seven-day, same-user, last-touch heuristic.
- The history corpus observes commands and tool outcomes, not repository state
  after the session. Executable replays are still required for objective
  success.
- The tiny Flag sample should stay an exhaustive regression set, not a rate to
  optimize statistically.

## Recommended handoff

Freeze these cohort definitions now, but do not freeze final case IDs until the
full immutable snapshot is available. Use the two generators to supply the
disposable benchmark ticket, then let the facet POCs consume inputs only.
Reserve the sealed oracle files and a prospective post-2026-07-23 window for the
final non-inferiority decision.
