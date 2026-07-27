# Retrieval confidence and ranking prototype

Date: 2026-07-27

Linear question: **Prototype Crew retrieval confidence and ranking**

## Decision

Do not hard-filter cross-repo single-leg results, multi-leg results, or the
tail of the current result set based on this telemetry alone. Every material
token-saving filter tested removed confirmed knowledge. A top-seven cap is the
only tested cap with no known confirmed-result loss across the development,
evaluation, and provisional splits, but it removes only 1.1% of observed rows
on the evaluation split and is not a meaningful optimization by itself.

The next optimization step is better evidence, not a ranking rewrite: capture
candidate vector distance, keyword rank, retrieval-leg membership, threshold
decisions, and the originating retrieval id. Then test confidence-aware
ordering and adaptive rendering against prospective outcomes. Keep the current
ranking as the quality-floor baseline until that evidence exists.

## Existing baseline

The server currently combines keyword, vector, and optional environment-vector
legs with reciprocal-rank fusion. Vector candidates beyond cosine distance
0.65 are dropped. The fused candidates are then ranked by:

```text
rrf_score × trust × recency × same_repo_boost
```

The production implementation is in `packages/server/src/search/retrieve.ts`,
`packages/server/src/search/rrf.ts`, and `packages/server/src/search/score.ts`.

## Method

The prototype replayed the private, frozen retrieval cohort at:

```text
/Users/onnokleinhofmeijer/.crew/research-benchmarks/crew-benchmark-20260723-ob8gOp
```

The evaluation split contains 147 retrieval inputs, 720 observed result rows,
24 confirmed result rows, and one flagged result row. Confirmed and flagged
post ids came from the separated outcome oracle. Missing feedback was treated
as unresolved, never as a negative outcome.

The prototype compared current output, rank caps, and confidence filters. A
row is treated as high-confidence when it is same-repository or was found by
more than one retrieval leg.

## Evaluation results

| Policy | Rows removed | Confirmed rows retained | Confirmed-loss cases |
| --- | ---: | ---: | ---: |
| Current returned set | 0.0% | 100.0% (24/24) | 0 |
| Top 2 only | 59.2% | 45.8% (11/24) | 10 |
| Top 3 only | 38.9% | 62.5% (15/24) | 7 |
| Top 5 only | 2.2% | 95.8% (23/24) | 1 |
| Top 7 only | 1.1% | 100.0% (24/24) | 0 |
| Same-repo or multi-leg only | 85.4% | 70.8% (17/24) | 3 |
| High-confidence rows plus top 2 | 50.7% | 87.5% (21/24) | 2 |
| Multi-leg only | 93.5% | 29.2% (7/24) | 10 |

The same conclusion held on the other splits: top seven retained 100% of
known confirmed rows, while top five retained 96.4% on development and 98.8%
on provisional. The more aggressive confidence filters lost confirmed rows
in every split.

The top-five loss was a rank-seven confirmation for a local development setup
query. The high-confidence-plus-top-two policy also removed confirmed results
at ranks four and seven for a Payload page-creation and local-development
query. These are concrete counterexamples to treating cross-repo single-leg or
lower-ranked results as disposable.

## Interpretation

The historical data supports confidence as a ranking signal, not yet as a
hard deletion rule. Same-repository and multi-leg cohorts have much higher
confirmation rates, but low-confidence rows still contain useful knowledge.
The observed cohort also cannot tune the 0.65 vector floor because it does
not include distances or dropped candidates.

The only defensible near-term behavior change is an optional top-seven render
cap, guarded by prospective telemetry; its measured token benefit is too small
to justify calling it the optimization winner. A material optimization needs
candidate-level traces and an outcome that distinguishes unresolved results
from results that were not used.

## Reproduction

From the prototype worktree:

```text
node scripts/research/retrieval-ranking-prototype.mjs
node scripts/research/retrieval-ranking-prototype.mjs <benchmark-root> development
node scripts/research/retrieval-ranking-prototype.mjs <benchmark-root> provisional
```

The prototype is disposable research code. It does not touch production data
or server ranking code.
