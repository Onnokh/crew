# Combined Crew flows: smallest 2x2x2 factorial

Date: 2026-07-27  
Question: **Prototype combined end-to-end Crew flows**

## Decision-relevant result

The live causal factorial is not complete and should not be represented as
complete. The current Codex executor can perform a real read-only Crew query,
but the repository has no implemented resource-link/read-resource delivery path
to test against it. The eight-cell result below is therefore an executable
offline adapter factorial, not a production invocation or MCP transport win.

The adapter factorial is still useful: all eight combinations passed the local
producer-to-consumer semantic floor, the literal-preserving diagnostic was
8/8, and both safety ablations correctly abstained. It does not discriminate
the three proposed changes because the fixture supplies complete local evidence
and the invocation arm is deliberately kept offline.

## Factors and executed cells

The cells were:

- invocation: current broad policy vs selective policy;
- Post contract: current five-field wording vs literal-preserving wording;
- delivery: direct full text vs preview plus a local resource-link adapter.

The prototype used the verified BullMQ FlowProducer case from the historical
Post POC. Its evidence and candidate Post were read from the private immutable
artifacts; the sealed benchmark oracles were not copied or read. The adapter
used the same Post either as full direct content or as a preview with a
crew://fixture/bullmq-flow-options link and a separate local resource file.

| Cell | Accounted tokens* | Duration | Crew queries | Outcome |
| --- | ---: | ---: | ---: | --- |
| current / current / direct | 95,492 | 54.1s | 0 | pass |
| current / current / preview-link | 92,304 | 47.2s | 0 | pass |
| current / literal / direct | 86,166 | 49.3s | 0 | pass |
| current / literal / preview-link | 114,380 | 61.9s | 0 | pass |
| selective / current / direct | 90,629 | 44.9s | 0 | pass |
| selective / current / preview-link | 133,205 | 59.2s | 0 | pass |
| selective / literal / direct | 85,664 | 47.4s | 0 | pass |
| selective / literal / preview-link | 86,051 | 41.8s | 0 | pass |

*Codex reported input and output usage separately in these traces; “accounted
tokens” is their sum, not a claim about uncached billing tokens.*

Aggregate: 8/8 executable outcomes, 0 baseline-only pairs, 0 harmful failures,
0 forbidden Crew writes, 0 network calls, 8/8 grounded Post drafts, and 8/8
solution subsets passed. Accounted usage was 783,891 tokens (mean 97,986;
median 91,467; min 85,664; max 133,205).

The offline factor means are diagnostic only:

| Factor arm | Mean accounted tokens |
| --- | ---: |
| current invocation | 97,086 |
| selective invocation | 98,887 |
| current Post wording | 102,908 |
| literal-preserving wording | 93,065 |
| direct text | 89,488 |
| preview/resource-link adapter | 106,485 |

The apparent preview penalty is consistent with the model reading the second
local file; it is not evidence about MCP resource-link behavior. Every arm
placed all required literals in the body, so this fixture did not reproduce the
historical baseline-vs-literal placement distinction.

## Documented ablations

Two safety ablations ran after the factorial:

| Ablation | Result |
| --- | --- |
| no-Post consumer | pass: wrote status=insufficient-evidence rather than guessing |
| unfollowed preview/resource link | pass: wrote status=insufficient-evidence rather than inventing the answer |

These are safe-abstention checks. They do not establish that following a real
MCP resource link works. The historical POC also requires no network or
outside-workspace evidence, zero missing load-bearing literals, zero
unsupported claims, and a no-Post consumer ablation; those gates are retained
in the plan for the live run. See the [future-Post POC](https://github.com/Onnokh/crew/blob/b259585/docs/research/2026-07-23-future-post-prompt-poc.md).

## Quality-floor gates

The acceptance order is fixed by the disposable benchmark:

1. setup and preconditions pass;
2. executable outcome and harmful-side-effect checks pass;
3. the baseline passes the 100% success floor;
4. each candidate has no baseline-only pair and no extra harmful failure;
5. only non-inferior candidates may be compared on tokens.

The first live comparison should keep the strict margins used by the existing
benchmark: baseline success 1.0, maximum baseline-only pairs 0, and harmful
failure margin 0. The benchmark source documents this order and the sealed
oracle isolation rules in the [disposable benchmark](https://github.com/Onnokh/crew/blob/137cc02/docs/research/2026-07-23-disposable-crew-optimisation-benchmark.md).
The repeated selective-invocation replay applies the same floor and reports
8/8 paired outcomes with zero harmful failures in its frozen fixture
[here](https://github.com/Onnokh/crew/blob/03411e8/docs/research/2026-07-23-selective-invocation-data-baseline.md).

## Live Codex boundary and blocker

Environment: Codex CLI 0.145.0, Node 24.13.1, macOS arm64. A real isolated
smoke used the configured desktop Codex path and a read-only Crew query with no
Post, Confirm, or Flag call. The trace completed with input_tokens 323,893,
output_tokens 1,219, and final answer NO-RELEVANT-NOTE. The executor discovery
and query response were much larger than the task itself; one live query is
therefore not a reproducible eight-cell token comparison.

The exact blocker for a causal live delivery arm is transport support: the
current Crew result is direct text, while the existing delivery prototype only
constructs MCP-shaped fixtures. It does not add an authenticated
resources/read route, retrieval-id authorization, or an executor proof that a
resource_link is followed and injected once. The existing delivery comparison
explicitly marks preview/resource-link as a client-dependent candidate and
requires real Codex executor traces; see
[MCP result delivery strategies](2026-07-27-mcp-result-delivery-strategies.md).
Until that seam exists, claiming a live direct-vs-resource-link result would
fake the missing part of the experiment.

## Reproduction artifacts and integrity

The disposable report was written outside the repository at:

/var/folders/72/3ml8jqm920lg0s4nz_34b8f40000gn/T/crew-combined-factorial-agq1da/combined-factorial-report.json

Its SHA-256 is
53dabaf70d14eae5c859cde6e41d89432795006f4f184127f53a7ae7f8022ade.

The frozen candidate-input hashes were unchanged:

- agent-history.jsonl: 7b4936755b12b92272e9e105d6892948c0be82652285b282f5b6e4b647b50f34
- telemetry-posts.jsonl: 2a6ab49dfa217942aca9a739d73ce9109e6041e1eb274112d0622363b2757ae2
- telemetry-retrievals.jsonl: 7bcf14dc75d31dae10ae37d2100610cb8fc7141feb1289b867bb1a8e92cf805c

The PPO input artifacts were:

/Users/onnokleinhofmeijer/.crew/research-benchmarks/post-prompt-poc-bull-v2-20260723T1658Z/producer-workspaces/bullmq-flow-options/evidence.json

and the candidate Post at:

/Users/onnokleinhofmeijer/.crew/research-benchmarks/post-prompt-poc-bull-v2-20260723T1658Z/producer-runs/runs/bullmq-flow-options/candidate-atomic-transfer/r01/bullmq-flow-options__candidate-atomic-transfer__r01/workspace/post.json

The disposable harness was deleted after execution. No repository production
code, frozen corpus, Crew Post, Confirm, Flag, or Linear issue was mutated.

## Next executable step

Implement the delivery seam only in a disposable benchmark adapter first:

1. expose a short-lived, team-authorized resource identifier for an existing
   retrieval result;
2. replay the same eight cells with real Codex executor traces;
3. add at least two matched repetitions and interleave variant order;
4. retain direct-text fallback and run the no-Post and unfollowed-link
   ablations;
5. accept token differences only if the live quality floor remains intact.

Until step 1 and an executor follow-up trace exist, this task has an honest
adapter result and a blocked causal live plan, not a shippable winner.
