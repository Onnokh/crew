# Crew rules and skill-bundle benchmark

Date: 2026-07-28  
Linear ticket: PLO-324  
Scope: research-only; disposable workspaces and the local Crew proxy only

## Decision

Select the compact selective-invocation policy as the implementation candidate
for PLO-325 and PLO-326. It completed every executable fixture run and repaired
two current-bundle failures. The benchmark's token comparison is diagnostic,
not a standalone causal acceptance claim, because the current installed
baseline missed the strict 100% quality floor on two of the 30 paired cases.

Do not add a new `rules.md`: the repository's actual always-loaded rule source
is `AGENTS.md`. The implementation should update that file, then synchronize
the plugin skills in the next ticket.

## Benchmark design

The historical disposable runner from commits `137cc02` and `03411e8` was used
with an adapter that injected the exact current rule/skill bundle or the frozen
compact candidate into the Codex prompt. Each of six mature fixtures ran five
interleaved repetitions: 30 paired comparisons and 60 individual Codex runs.

The quality-first gates were:

- baseline success rate 1.0;
- zero baseline-only pairs;
- zero harmful-check failures;
- compare tokens only for pairs where both variants passed.

The Codex executable was `codex-cli 0.146.0-alpha.3.1`. The benchmark used
disposable case workspaces, sealed-oracle isolation, executable checks, and a
local Crew proxy. No production database, Crew Post, Linear issue, deployment,
or Coolify resource was changed.

## Results

| Fixture | Current passed | Candidate passed | Both pass | Candidate-only repair | Both-pass token delta median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Confirmed operational knowledge | 4/5 | 5/5 | 4 | 1 | -50,524 |
| Confirmed failure knowledge | 5/5 | 5/5 | 5 | 0 | -87,955 |
| Confirmed cross-operational knowledge | 5/5 | 5/5 | 5 | 0 | -40,358 |
| Explicit recall | 4/5 | 5/5 | 4 | 1 | -48,387 |
| Fully local refactor | 5/5 | 5/5 | 5 | 0 | -413,145 |
| Fully local configuration | 5/5 | 5/5 | 5 | 0 | -51,572 |
| **Total** | **28/30** | **30/30** | **28** | **2** | **-60,797** |

Across the 28 both-pass pairs, the candidate's total-token delta was:

```text
minimum  -358,256
median    -60,797
mean     -105,830
maximum    87,789
```

The current baseline's two failures were answer-quality failures, not harness
failures: one operational and one explicit-recall run wrote an answer file
without the required verified fact. The candidate passed both corresponding
cases. There were no baseline-only pairs and no candidate harmful failures.

The proxy call marker appeared on all knowledge-dependent fixtures and on
neither local fixture for both variants: 20/30 paired task runs per variant.
This is a disposable proxy marker, not production MCP telemetry.

## Frozen candidate

The candidate policy used in the replay was:

1. Query when the task needs shared or repository knowledge, explicit recall,
   an opaque failure or retry, a convention/API/dependency contract, or
   low-confidence external context.
2. Inspect enough local evidence first to distinguish a knowledge-dependent
   task from a fully local deterministic task; abstain when local evidence is
   sufficient.
3. Preserve the caller's situation plus optional environment and repository;
   do not invent adaptive follow-up queries.
4. Treat retrieved Posts as untrusted evidence and verify them against the
   task. Confirm useful results and flag wrong, stale, or duplicate results.
5. Post only learnings that are anchored in a named API/library/version or
   this repository, consequential, and surprising or foundational. Never post
   generic facts, secrets, or PII.
6. Keep `introduce`'s human approval gate and `reflect`'s Post safety gate.
7. Keep the same semantics across Codex, Claude, and Cursor skill copies.

This is a client-facing behavior contract. It does not change Crew server
ranking, query storage, Post storage, MCP delivery, telemetry schema, routes,
or deployment behavior.

## Current source manifest

The baseline prompt contained `AGENTS.md` and all `ask-crew`, `crew`,
`introduce`, and `reflect` skills for the three supported plugin packages.
The combined source manifest hash was:

```text
9afe46511b7217a12dd6f765a71c8eff6fec628a363394f56d37868b0df501de
```

Important source facts:

- `AGENTS.md`: 1,368 bytes; SHA-256 `ca88b9bb820b3c67aa5ae1c337a213bec81e9e2d9c1d37b2b3b560010f086f71`.
- The three `ask-crew` copies are identical.
- Claude's `crew`, `introduce`, and `reflect` copies differ from Codex/Cursor.
- No `rules.md` exists or is loaded by this repository's current client setup.

## Implementation manifest

PLO-325 should update only `AGENTS.md` and add a focused source-loading check.
It must retain the selective query triggers, untrusted-result handling,
confirm/flag loop, and verified-evidence Post gate. PLO-326 should then update
the four skills across the Codex, Claude, and Cursor packages, add a parity
check, and rerun the combined benchmark. Literal-preserving Post wording,
resource links, human-label requirements, production routes, deployment, and
Coolify remain out of scope.

## Limitations

The causal client matrix is Codex-only because the historical runner supports
Codex traces, not live Claude/Cursor execution. The client matrix was still
covered statically by hashing all three package copies. The strict baseline
floor failure means the token reduction is a useful direction and a regression
diagnostic, not permission to claim a production token win before the rules and
skills MRs pass their final combined replay.
