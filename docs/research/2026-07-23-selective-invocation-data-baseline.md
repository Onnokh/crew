# PLO-286: selective invocation — data baseline

Date: 2026-07-23

## Decision-relevant read

Use the gathered evidence to improve **what happens when Crew is called** and
to construct realistic evaluation cases. Do **not** derive a new invocation
policy directly from it: the telemetry only contains calls that occurred, not
the tasks on which Crew was skipped, nor an objective task-success label.

The existing instruction already names `setup`, `config`, `build`, `deploy`,
`dependency`, and `integration` as proactive call situations. That is a useful
starting population, not evidence that every call in those categories was
necessary. The safest PLO-286 experiment is therefore a paired replay of the
current instruction against a narrower candidate, scored first by executable
task outcome and harmful guidance, then by calls/tokens.

## What the production snapshot says

The original four-week read-only Team snapshot (2026-06-23 through
2026-07-23) contains **1,155 queries**, **464 Posts**, **5,967 returned-result
rows**, **162 Confirms**, and **8 Flags**. It is the appropriate population for
retrieval-quality slices; the later immutable benchmark snapshot contains 1,171
Retrievals and is the frozen source for repeatable evaluation.

| Signal | Observed value | Implication for PLO-286 |
| --- | ---: | --- |
| Queries with an explicit failure word | 91 / 1,155 (7.9%) | A real failure-shaped cohort exists, but it is not annotated as first failure, opaque failure, or retry. |
| Same-repo result exposure | 104 / 1,313 Confirmed (7.92%) | Retaining repo context is higher priority than suppressing calls by category. |
| Other/no-repo result exposure | 56 / 4,654 Confirmed (1.20%) | Broad calls can create a large low-confidence surface; improve result delivery rather than calling a result useless. |
| Multi-leg retrieval exposure | 59 / 657 Confirmed (8.98%) | Agreement is a strong preservation/sorting signal. |
| Single-leg retrieval exposure | 101 / 5,310 Confirmed (1.90%) | Single-leg results should be a controlled low-confidence slice. |
| Cross-repo + single-leg exposure | 4,346 rows (72.8%); 39 Confirmed | Do not erase this cohort: it is low-yield but has demonstrated value. Test collapse/ordering before suppression. |
| Result rows at ranks 1–5 | 97.5% of Confirmed rows | The default five results preserves almost all observed Confirmed value; lower ranks remain a regression slice. |
| Flags | 5 stale, 3 incorrect | Too few for a rate optimization; retain every Flag as a qualitative/canary regression case. |

The snapshot also contains an operational counterexample to category-based
abstention: a local-development setup query retrieved a runtime-cache caveat
that was later Confirmed. This supports keeping setup/configuration/deployment
work in the benchmark, not treating it as automatically unnecessary.

## What can and cannot be cohorted today

`retrievals.situation` is verbatim free text. It permits a privacy-reviewed,
manual or frozen lexical cohort for terms such as failure, setup/configuration,
build/deploy, dependency/integration, and recall-shaped questions. It has **no
stored task-kind, invocation-trigger, attempt number, or “unclear” field**.
The reported 91 failure-language prompts is a lexical count; it is not a
failure/retry outcome cohort.

Likewise, neither the production telemetry nor the local history extract can
tell whether a call was made before work, after a failed attempt, because a
user explicitly asked for recall, or automatically by an instruction. These
categories are appropriate *strata for replay fixtures*, but are not labels
already present in the data.

The recommended PLO-286 fixture set is consequently:

- preserve the telemetry-derived confidence slices: same-repo/multi-leg,
  same-repo/single-leg, cross-repo/multi-leg, and cross-repo/single-leg;
- include all 8 Flag events and lower-rank Confirmed results as regressions;
- sample failure-language and operational-keyword situations only after private
  review, with their label recorded as an analyst/fixture decision, not as a
  fact inferred from the query row;
- add paired repository mutations for setup/config/build/deploy/dependency and
  integration tasks. Mark the required/optional/skip call decision in the
  fixture manifest, and let executable checks determine whether a proposed
  abstention harms success.

## Confirm and Flag semantics

A Confirm is useful evidence that a returned Post helped, but not a task-quality
label. Attribution is **same User, within seven days, last touch**: if a user
retrieves the same Post again before a verdict, the later retrieval gets credit.
There is no `retrieval_id` on a Confirm or Flag. Non-confirmation means an
unknown mixture of irrelevant result, useful-but-unconfirmed result, abandoned
work, and skipped feedback. A Flag is a high-value harm signal, but eight rows
cannot support estimating a stable rate.

This means PLO-286 must not call unconfirmed queries “wasted,” nor call a
candidate better merely because it avoids them. Compare paired task success;
use Confirm retention, Flag exposure, rank, repository match, and retrieval-leg
agreement as secondary diagnostic guardrails.

## Source of truth and limitations

Primary executable sources:

- `packages/server/src/tools/query.ts` — current query-tool instruction, query
  write path, and intentionally swallowed telemetry-write errors.
- `packages/server/src/store/schema.ts` and
  `packages/server/migrations/team/0007_retrievals.sql` — fields actually
  stored for a call and its result rows.
- `packages/server/src/store/queries.ts` — seven-day last-touch Confirm/Flag
  attribution and retrieval-result persistence.
- `packages/server/src/search/retrieve.ts` and
  `packages/server/src/search/score.ts` — retrieval legs, repository boost,
  and score composition.
- `docs/research/2026-07-23-four-week-usage-first-pass.md` — aggregate counts
  and the privacy-reviewed four-week analysis.
- `docs/research/2026-07-23-crew-event-data-map.md` — event semantics and
  telemetry caveats.
- `docs/research/2026-07-23-live-telemetry-benchmark-cohorts.md` — frozen
  benchmark cohort design and the distinction between production signals and
  evaluation oracles.

Important limits:

1. No record exists for tasks where Crew was not called, so call precision and
   recall cannot be estimated from live telemetry alone.
2. There are no task-success, changed-file, test-result, latency, exact
   rendered-response, client, agent-run/session, or trigger-reason labels.
3. Current history traces are observational too: tool errors are not necessarily
   failed tasks, and final prose is not proof of success.
4. Retrieval telemetry writes are best-effort; a successful call can be absent
   from the dataset if the telemetry insert fails.
5. The full original snapshot must remain immutable. The benchmark's derived
   inputs/oracles, not its raw prompts or Posts, are the safe artifact for
   candidate-policy work.

## Recommended next action

Do not ask people to specify abstract “should call” rules. Run the frozen
baseline and one small candidate on the existing disposable benchmark. Hold the
data-derived confidence and failure/operational cohorts fixed, and advance a
candidate only if it is non-inferior on executable success and harmful-guidance
checks. Calls and tokens then decide only between candidates that preserve
outcomes.

## Initial paired replay

On the private disposable benchmark generated from the frozen telemetry inputs,
the current instruction was paired with one evidence-derived candidate. The
candidate retained the two data-backed call surfaces (a Confirmed same-repo /
multi-leg operational case and a Confirmed same-repo / multi-leg failure case)
and was compared with a locally inspectable refactor control.

| Variant | Executable outcomes | Crew proxy calls | Total tokens | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Current broad | 4 / 4 | 2 / 4 | 886,385 | Baseline passes the quality floor. |
| Evidence-derived | 4 / 4 | 2 / 4 | 508,931 | Candidate also passes and preserves both confirmed call surfaces. |

The benchmark runner reported paired token deltas of **−77,638.5** and
**−111,088.5** tokens for the candidate in the two two-case quick replays.
These are not a production optimization claim: each replay has one matched
repetition per case, and the Codex whole-task surface has substantial run
variance. The robust result so far is qualitative: the candidate did not
abstain on the confirmed operational or failure knowledge, and did not query
the locally inspectable refactor. More repetitions and prospective cases are
required before changing the installed skill.
