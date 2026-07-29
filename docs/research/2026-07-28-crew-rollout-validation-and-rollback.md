# Crew rollout validation and rollback plan

Date: 2026-07-28  
Linear question: **Design Crew rollout validation and rollback**

## Decision

The eventual Crew optimization implementation should be validated in four
gates: preregistered benchmark replay, shadow evaluation, a feature-flagged
staged exposure, and only then broader exposure. The current Wayfinder remains
research-only; this report specifies the evidence required before a future
implementation is allowed to change production behavior.

The selected portfolio from PLO-292 is the evidence-derived selective
invocation direction, the current query and verified-evidence Post contracts,
the current retrieval/ranking behavior, direct-text MCP delivery, and
benchmark-owned observability. Literal-preserving Post wording and
preview/resource-link delivery remain gated candidates and must not be mixed
into a rollout without their own quality-gated evidence.

## Non-negotiable quality floor

The disposable benchmark defines the acceptance order:

1. setup, source hashes, and preconditions pass;
2. executable task outcomes and harmful-side-effect checks pass;
3. the baseline itself meets the 100% success floor;
4. the candidate has no baseline-only regression and no extra harmful failure;
5. only then are median and worst-case whole-task tokens compared.

These rules are implemented by the research benchmark and documented in
[`2026-07-23-disposable-crew-optimisation-benchmark.md`](./2026-07-23-disposable-crew-optimisation-benchmark.md#decision-rules-for-the-facet-pocs).
No candidate may advance because it is cheaper while failing an executable
outcome, safety check, or evidence-integrity check.

## Rollout sequence

| Gate | What runs | What is visible | Advance condition |
| --- | --- | --- | --- |
| 0. Frozen replay | Repeated paired runs on sealed development/evaluation cases, with alternating variant order and disposable workspaces | Nothing changes | Quality floor passes; token comparison is non-inferior; source and oracle hashes remain intact |
| 1. Shadow | Candidate decision and instrumentation run beside the baseline on a prospective holdout; candidate side effects and user-visible result are disabled | Baseline only | Complete mature cohort with no privacy, harmful, executable, or trace-integrity failure |
| 2. Staged exposure | Candidate is enabled behind one reversible variant flag for a small eligible cohort; baseline remains the fallback | Candidate for the flagged cohort, baseline elsewhere | Predeclared non-inferiority and token guardrails pass after outcome maturation |
| 3. Expansion | Increase exposure one cohort at a time, preserving the same variant and oracle definitions | Candidate | Every prior gate remains green; otherwise revert to baseline and investigate |

The shadow gate is important for selective invocation: it can measure whether
the candidate would have queried without allowing an experimental choice to
change the user-visible answer. Any Post creation, Confirm, Flag, network, or
other side effect in a shadow run is a failed precondition, not a useful
outcome.

## Cohorts and duration

Use an opaque benchmark/run identifier as the unit of paired analysis. Current
Crew telemetry is User-scoped and has no agent, session, conversation, or
Codex-turn identifier, so it cannot by itself join a production retrieval to a
whole-task token trace; this boundary is documented in the
[event data map](./2026-07-23-crew-event-data-map.md#caveats-that-affect-interpretation).

Each prospective stage should:

- include at least one complete weekday cycle and use a minimum seven-day
  observation window as the default, because the live workload is strongly
  weekday/business-hour concentrated;
- remain open for a further seven days before final scoring, so the formal
  seven-day Confirm/Flag attribution window is mature;
- keep the newest seven days provisional and out of acceptance decisions;
- stratify the report by local-abstention, same-repo/multi-leg, explicit recall,
  failure/convention, and cross-repo/single-leg cases rather than relying on a
  single aggregate conversion number;
- start with roughly 30–50 mature paired tasks to reject large regressions,
  then grow toward hundreds of task clusters before making a tight-margin
  rollout claim.

The seven-day maturation rule follows Crew's executable attribution semantics:
recent outcomes are right-censored, Confirm/Flag attribution is same-User and
last-touch, and a missing Confirm is unresolved rather than negative. See
[`queries.ts`](../../packages/server/src/store/queries.ts#L740-L819) and the
[usage first pass](./2026-07-23-four-week-usage-first-pass.md#data-and-definitions).

## Agent-only outcome signals

Primary gates must be executable and machine-checkable:

- task outcome or test assertions pass;
- no baseline-only regression;
- no harmful guidance, secret/PII disclosure, unauthorized network or
  filesystem access, repo collision, or forbidden Crew write;
- the required Crew-call ordering and abstention behavior are correct;
- whole-task input, output, and total token usage are captured from the pinned
  client trace, with median and worst-case usage reported only after the
  quality floor passes.

Secondary signals may describe the product loop but cannot overrule a primary
failure: mature Retrieval conversion, Confirm/Flag counts and reasons, result
rank, repo-match cohort, retrieval-leg membership, result count, and query
errors. The existing telemetry records the query and returned score breakdown
but not rendered text, latency, downstream tool calls, or exact client usage;
see [`schema.ts`](../../packages/server/src/store/schema.ts#L60-L98) and
[`query.ts`](../../packages/server/src/tools/query.ts#L78-L105).

Do not use zero-result rate as answer quality: the first-pass corpus had almost
no zero-result queries because the candidate floor is permissive. Do not treat
non-confirmation as failure, and do not use human labels or product feedback as
the release oracle.

## Stopping rules and rollback

Stop the current stage immediately and restore the baseline when any of these
occur:

- a confirmed harmful, security, secret, PII, side-effect, or repo-collision
  regression;
- any candidate-only executable failure or a baseline-only pair outside the
  predeclared non-inferiority margin;
- a privacy or oracle-leakage violation, including raw prompt/Post content in
  a shared artifact or access to sealed outcomes;
- a source-hash, variant assignment, client-version, or trace-integrity
  mismatch;
- telemetry loss or attribution ambiguity that prevents a mature comparison;
- median savings that are not accompanied by an acceptable worst-case result,
  according to the margin frozen before the stage.

Rollback must be one reversible configuration/feature-flag change to the
PLO-292 baseline: selective invocation disabled, current query contract,
current ranker, current verified-evidence Post behavior, and direct-text MCP
delivery. Do not delete or rewrite Posts, Confirms, Flags, or historical
telemetry during rollback. Preserve the candidate traces, variant assignment,
source hashes, and failure reason as a private research artifact, then rerun
the frozen baseline before attempting another exposure.

## Minimum telemetry and privacy boundary

Benchmark-owned traces should record only what is needed to join a decision to
an outcome:

- opaque run/task/variant identifiers and source hashes;
- pinned client family/version/model and timestamp;
- exact input, output, cached-input, reasoning-output, and total token fields;
- ordered Crew verb classes, retries/follow-ups, payload byte sizes and hashes;
- executable outcome, harmful-check outcome, error category, and rollback
  reason.

Raw prompts, Post bodies, environment text, repository paths/remotes, tool
arguments, and tool outputs stay in a private case workspace or are excluded
from the derived report. Candidate-level research already uses HMAC IDs,
separate trace/outcome files, seven-day censoring, and read-only frozen inputs;
see [`2026-07-27-candidate-retrieval-traces.md`](./2026-07-27-candidate-retrieval-traces.md).

If a future implementation needs production call telemetry, add only a
versioned variant id, opaque run/session id, client family/version, start/end,
success/error category, and aggregate token counters. Keep the existing
admin-only, Team-scoped telemetry boundary in
[`telemetry.ts`](../../packages/server/src/api/telemetry.ts#L17-L35). Do not
store full conversations or make telemetry writes capable of failing the
agent-facing query; the current query path deliberately swallows telemetry
write failures ([`query.ts`](../../packages/server/src/tools/query.ts#L78-L103)).

## Decision boundary

This plan is a future implementation handoff, not authorization to deploy or
modify production. The current map has no production route, rollout flag,
database migration, or Coolify task. The next Wayfinder ticket can consolidate
this plan with the selected portfolio into the final implementation-ready spec.
