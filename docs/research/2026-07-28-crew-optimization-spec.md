# Crew optimization specification

Date: 2026-07-28  
Wayfinder map: [PLO-280](https://linear.app/plowski-inc/issue/PLO-280/chart-crew-token-efficiency-and-result-quality-optimisation)

## Status and boundary

This is the destination research artifact for the Crew optimization Wayfinder.
It is decision-complete for the evidence available today and is an
implementation handoff, not an implementation. No production route, rollout
flag, migration, Coolify action, or historical-data rewrite is authorized by
this document.

## Objective

Minimize total whole-task tokens per objectively successful task across Crew's
full shared agent-knowledge loop:

```text
client invocation → query contract → Post creation → retrieval/ranking
→ MCP result delivery → agent outcome → feedback and measurement
```

The optimization portfolio is a set of choices for that loop, not a winner for
one isolated component. Codex is the reference benchmark client, not the scope
boundary; Codex-specific observations must not be generalized to every Crew
client without evidence.

## Quality guardrails

The quality floor is evaluated before token savings:

1. setup, preconditions, immutable source hashes, and sealed-oracle boundaries
   pass;
2. the baseline has a valid executable outcome;
3. the candidate has no baseline-only executable regression;
4. no harmful guidance, security/secret/PII disclosure, unauthorized network
   or filesystem access, repo collision, or forbidden Crew write occurs;
5. only non-inferior candidates are compared on median and worst-case total
   tokens.

Primary outcomes are executable and agent-only. Confirm/Flag telemetry is
secondary evidence, not a human quality label. A missing Confirm is unresolved,
not a negative result.

The reusable benchmark infrastructure, frozen corpus, paired scheduling,
sealed outcomes, and acceptance order are documented in
[`2026-07-23-disposable-crew-optimisation-benchmark.md`](./2026-07-23-disposable-crew-optimisation-benchmark.md).

## Selected portfolio

| Surface | Selected behavior | Evidence decision |
| --- | --- | --- |
| Client invocation | Evidence-derived selective invocation: query when the task needs shared/repo knowledge, explicit recall, failure/convention/API evidence, or low-confidence external context; abstain when local evidence is sufficient. | PLO-286 repeated replay: 8/8 paired outcomes, zero harmful failures, and non-inferior usage. |
| Query construction | Preserve the caller's situation plus optional environment and repo; normalize transport details and repo identity only. | The query-construction prototype was orientation-only; omission of environment and adaptive follow-up have no causal quality evidence. |
| Future Posts | Keep `Anchored AND Consequential AND (Surprising OR Foundational)` and verified-evidence, agent-only creation. Keep all load-bearing operational literals in the Body; treat the literal-preserving wording as a gated candidate, not a winner. | PLO-288 improved one Post's body grounding/size but failed held-out transfer. |
| Retrieval and ranking | Keep the current FTS/vector/RRF ranker and repo boost. Do not hard-filter cross-repo/single-leg or lower-ranked results. | PLO-289 found material confirmed-result loss for tighter filters; top-seven is only a low-impact optional cap, not the optimization winner. |
| MCP delivery | Keep direct text as the live fallback. Preview plus authenticated resource link is the only delivery candidate worth another causal experiment. | PLO-290/PLO-291 show fixture promise but no live executor proof of follow, single insertion, or quality preservation. |
| Observability | Keep benchmark-owned exact client traces and disposable candidate traces; use existing Team telemetry for mature cohort discovery and corroboration. | PLO-281/PLO-282/PLO-283/PLO-284/PLO-321 establish the measurement boundary. |

## Behavioral contracts

### Invocation contract

The selective policy may skip Crew only when local evidence is sufficient and
the task does not require shared knowledge. It must query for explicit recall,
known failures, repo conventions, API/dependency contracts, cross-repo
knowledge, or other cases where another agent's evidence can change the
answer. A local abstention is a valid outcome and must be included in the
benchmark cohort rather than treated as a missing call.

The policy must not silently convert a failed local approach into an
unsupported answer. If a task is knowledge-dependent, the query is required
before retrying or changing direction.

### Query contract

The current server contract remains the baseline:

- `situation`: the future agent's error, symptom, or task; it is the primary
  retrieval key;
- `environment`: optional concise stack/setup facts; it improves ranking and
  never filters;
- `repo`: optional repository identity; normalize it to the canonical form and
  use it as a boost, never as a hard filter;
- `limit`: bounded integer with the current default and maximum.

This matches the live schema and normalization in
[`query.ts`](../../packages/server/src/tools/query.ts#L1-L59). Do not add a
follow-up query for zero/underfilled results or remove `environment` until a
paired executable benchmark proves the change.

### Future-Post contract

The eligibility gate remains evidence-first:

```text
Anchored AND Consequential AND (Surprising OR Foundational)
```

Do not Post an inferred fix. The learning must be verified by a command, test,
state assertion, or authoritative source. When a Post is eligible:

1. `situation` states one future search-shaped error/question using component,
   operation, and failure terms; it does not contain the answer;
2. `body` contains the action/invariant, why the default assumption fails, and
   the applicability boundary;
3. every load-bearing command, path, option, version, number, and value stays
   literal in the Body;
4. `environment` contains only applicability facts and is not an escape hatch
   for answer-bearing values.

The literal-preserving rule is a next POC hypothesis, not a production prompt
change. No server-side semantic rejection, critique/retry loop, blind word
cap, or online dedupe query belongs in this portfolio.

### Retrieval and ranking contract

Keep the current ranking as the quality-floor baseline. Same-repo boosting and
multi-leg agreement are useful evidence signals, but they are not permission
to remove cross-repo or single-leg results. The ranking POC showed that top-two,
top-three, and top-five caps lose confirmed rows; top-seven preserves known
confirmed rows but saves too little to be the optimization winner.

Candidate-level tracing remains disposable and read-only. It may capture vector
and keyword ranks, distances, leg membership, threshold decisions, rendered
rank, and pseudonymized outcomes without changing
[`retrieve.ts`](../../packages/server/src/search/retrieve.ts) or production
telemetry.

### MCP result contract

Direct full-text MCP delivery remains the compatibility path. Do not select
structured-plus-text because it duplicates authored data; do not select an
embedded resource as a selective-expansion mechanism; do not select
`streamContent` without portable executor evidence.

Preview plus an authenticated, short-lived resource link remains a research
candidate only. Before any future selection it must prove, against real client
traces:

- the client preserves and follows the handle;
- the read is authorized to the same User and Team;
- the content is injected exactly once;
- selective expansion preserves the quality floor and improves whole-task
  tokens across matched cases.

The local resource-read seam is evidence only. The live deployment/trace work
was explicitly removed from this Wayfinder because it is infrastructure work,
not required optimization research.

## Measurement and telemetry

The benchmark owns the causal join between a task and client usage. Each private
run record should retain:

- opaque task, run, variant, and source identifiers;
- pinned client family/version/model and timestamp;
- exact input, cached-input, output, reasoning-output, and total tokens;
- ordered Crew verb classes, retries/follow-ups, payload sizes/hashes;
- executable outcome, harmful-check outcome, and error/rollback category.

Raw prompts, Post bodies, environment text, repository paths/remotes, tool
arguments, and tool outputs stay private or are excluded from derived reports.
Candidate traces use HMAC identifiers, separate candidate/outcome files,
seven-day censoring, and read-only frozen sources; see
[`2026-07-27-candidate-retrieval-traces.md`](./2026-07-27-candidate-retrieval-traces.md).

Existing Crew telemetry is Team-scoped and admin-only. It records retrieval
inputs and returned score breakdowns, plus Confirm/Flag events, but cannot join
an agent session to Codex usage or reconstruct the rendered response. The
server deliberately swallows telemetry-write failure so a query remains usable;
see [`schema.ts`](../../packages/server/src/store/schema.ts#L60-L98),
[`query.ts`](../../packages/server/src/tools/query.ts#L78-L105), and
[`telemetry.ts`](../../packages/server/src/api/telemetry.ts#L17-L35).

Do not use zero-result rate as answer quality. Do not interpret missing Confirm
as failure. Mature the newest seven days before using Confirm/Flag attribution;
the current attribution is same-User, last-touch, and seven-day bounded.

## Validation, rollout, and rollback

The eventual implementation follows PLO-293's four gates:

1. **Frozen replay:** repeated, interleaved, sealed benchmark cases.
2. **Shadow:** candidate decision runs beside the baseline, but baseline stays
   visible and candidate side effects are disabled.
3. **Staged exposure:** one reversible flag enables the candidate for a small
   cohort while baseline remains the fallback.
4. **Expansion:** grow one cohort at a time only after mature evidence passes.

Default timing is a seven-day observation window plus a further seven-day
outcome-maturation window. Keep the newest seven days provisional. Start with
roughly 30–50 mature paired tasks to reject large regressions, then grow toward
hundreds of task clusters for tight claims. Exact sample counts and
non-inferiority margins must be preregistered from the baseline-variance and
effect-size pilot.

Stop immediately for harmful/security/secret/PII/side-effect or repo-collision
regression, candidate-only executable failure, privacy/oracle leakage,
source/variant/client trace mismatch, unusable telemetry, or unacceptable
worst-case token regression.

Rollback is a single reversible configuration change to this baseline:

```text
selective invocation disabled
current query contract
current verified-evidence Post behavior
current retrieval/ranking
direct-text MCP delivery
```

Rollback does not delete or rewrite Posts, Confirms, Flags, or historical
telemetry. Preserve private failure traces and rerun the frozen baseline before
another exposure.

## Migration boundaries

The following are deliberately not part of this research handoff:

- production implementation of the selected policy;
- changing MCP routes, resource templates, or result envelopes;
- ranking/filter changes or historical Post cleanup;
- new semantic Post rejection, critique, or retry logic;
- production database/schema migrations;
- production rollout flags, Coolify configuration, deployments, or monitoring;
- human labels, human product feedback, or human-in-the-loop approval.

If a future implementation needs production call telemetry, add only a
versioned variant id, opaque run/session id, client family/version, start/end,
success/error category, and aggregate counters. Revisit that migration only
after the implementation plan names a concrete data consumer and retention
boundary.

## Rejected or gated alternatives

| Alternative | Decision | Reason |
| --- | --- | --- |
| Broad Crew invocation everywhere | Rejected as portfolio winner | Selective invocation was non-inferior and materially cheaper in repeated frozen replay. |
| Remove `environment` or add adaptive follow-up | Gated | Offline query prototype had no causal quality evidence. |
| Ship literal-preserving Post wording now | Gated | One case improved grounding/size, but held-out transfer failed. |
| Hard-filter cross-repo/single-leg results | Rejected | Confirmed results are lost; cross-repo knowledge is part of Crew's purpose. |
| Top-two/three/five result cap | Rejected | Known confirmed rows are lost. |
| Structured output plus compatibility text | Rejected | Duplicates the result body. |
| Embedded resource or streamContent | Rejected for now | No selective client proof; stream is non-standard. |
| Preview/resource link as universal default | Gated | Requires live executor follow/single-insertion/quality proof that was not obtained. |
| Server semantic rejection/critique/retry | Rejected | Conflicts with the agent-only, pre-call quality boundary and map scope. |
| Coolify/disposable executor deployment | Out of scope | Infrastructure work is not required to choose the optimization strategy. |

## Ordered future implementation handoff

When implementation is separately authorized, execute in this order:

1. Freeze the portfolio, client matrix, baseline variant, quality margins,
   source hashes, privacy/retention policy, and rollback flag.
2. Implement the selective invocation policy in the client-facing skill/MCP
   contract without changing server ranking or Post storage.
3. Add benchmark-owned trace capture and run the frozen replay plus shadow
   holdout; do not expose the candidate on failure.
4. Run the staged cohort and mature outcomes for the preregistered window.
5. Expand only after executable/harmful gates and median/worst-case token
   criteria pass; retain direct text and the baseline flag.
6. Treat any literal-preserving Post or resource-link change as a separate
   versioned candidate with its own quality-gated benchmark.

## Evidence index

- PLO-281 — agent-only evaluation oracles (closed Linear decision)
- PLO-282 — Codex/Crew token surface (closed Linear decision)
- PLO-285 — disposable benchmark (closed Linear decision)
- PLO-286 — selective invocation (closed Linear decision)
- PLO-288 — future Post prompts (closed Linear decision)
- [PLO-289 — retrieval/ranking](https://linear.app/plowski-inc/issue/PLO-289/prototype-crew-retrieval-confidence-and-ranking)
- [PLO-290 — MCP delivery](https://linear.app/plowski-inc/issue/PLO-290/prototype-crew-mcp-result-delivery-strategies)
- [PLO-291 — combined flows](https://linear.app/plowski-inc/issue/PLO-291/prototype-combined-end-to-end-crew-flows)
- [PLO-292 — selected portfolio](https://linear.app/plowski-inc/issue/PLO-292/choose-the-non-inferior-crew-optimisation-portfolio)
- [PLO-293 — rollout validation and rollback](https://linear.app/plowski-inc/issue/PLO-293/design-crew-rollout-validation-and-rollback)
