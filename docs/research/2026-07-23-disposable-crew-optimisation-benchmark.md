# Disposable Crew optimisation benchmark

Date: 2026-07-23
Linear question: **Build the disposable Crew optimisation benchmark**

## Outcome

The benchmark infrastructure is executable and the full four-week evidence is
frozen. Prompt, skill, rule, query, MCP-delivery, and Post variants can now run
against disposable workspaces and database copies without modifying production
or rewriting historical evidence.

The acceptance order is fixed:

1. setup and preconditions must pass;
2. executable outcome and harmful-side-effect checks must pass;
3. the baseline itself must be valid;
4. a candidate must be non-inferior to the paired baseline;
5. only then may paired total-token deltas decide between candidates.

Matching baseline/candidate failures are not evidence of non-inferiority. The
runner returns no token comparison unless there is at least one comparable
successful pair and the configured baseline-success floor is met.

This is research tooling only. It does not add semantic Post rejection,
critique, or retry logic to the server. It does not edit any historical Post or
production event.

## Frozen evidence

The source is the immutable online-backup snapshot captured at
`2026-07-23T15:44:32Z`:

```text
/Users/onnokleinhofmeijer/.crew/research-snapshots/
  crew-production-20260723T154432Z/
```

The Team database is 6,447,104 bytes with SHA-256:

```text
c16f822c97609f7f5fcf5f2df3a5600a21b75696f53a59334f423f3be745cbe2
```

It contains 1,171 Retrievals, 464 Posts, 6,075 returned-result rows, 162
Confirms, and 8 Flags. The benchmark copied it before SQLite analysis because
the source has both `0400` permissions and the macOS `uchg` flag. The copy
matched the source hash before cohort generation.

The private derived corpus is:

```text
/Users/onnokleinhofmeijer/.crew/research-benchmarks/
  crew-benchmark-20260723-I0pqJE/sealed-corpus/
```

It is untracked, mode `0500`, and recursively marked `uchg`. Candidate inputs
and outcome oracles are separate `0400` files:

| Corpus | Development | Evaluation | Provisional | Total |
| --- | ---: | ---: | ---: | ---: |
| Retrieval inputs | 582 | 147 | 442 | 1,171 |
| Post inputs | 338 | 69 | 57 | 464 |
| Codex/Claude history inputs | 97 | 94 | — | 191 |

The telemetry split is time-based: development is before
`2026-07-14T00:00:00Z`, evaluation is the mature interval after that point,
and the newest seven days are provisional. Provisional outcomes cannot decide
acceptance. The history extractor found 191 unique root sessions across 40
currently discoverable `git.indicia` repositories: 9 Codex and 182 Claude
sessions, with a Crew query observed in 40.

Raw Crew query/Post content is present only in the private candidate-input
files. History task text, local paths, remotes, tool arguments, and tool
outputs are not emitted. A private random HMAC salt pseudonymizes identifiers
and was not persisted.

## Executable artifacts

- [`crew-benchmark.mjs`](../../scripts/research/crew-benchmark.mjs) prepares
  each case once, copies immutable resources into the prepared workspace,
  permits setup mutation only on that copy, verifies source hashes, interleaves
  variant order between repetitions, calls the Codex trace runner, and applies
  paired non-inferiority gates.
- [`crew-benchmark.test.mjs`](../../scripts/research/crew-benchmark.test.mjs)
  checks local-only mutation, sealed-oracle isolation, interleaved scheduling,
  success regression rejection, harmful-check rejection, invalid-baseline
  rejection, and paired token summaries.
- [`seal-crew-corpus.mjs`](../../scripts/research/seal-crew-corpus.mjs) creates
  distinct candidate-input and sealed-oracle directories with row counts,
  split counts, byte sizes, and SHA-256 hashes.
- [`seal-crew-corpus.test.mjs`](../../scripts/research/seal-crew-corpus.test.mjs)
  verifies file separation and read-only permissions.
- [`codex-poc-runner.mjs`](../../scripts/research/codex-poc-runner.mjs) now
  accepts an explicit repetition start so the orchestration layer can
  interleave variants while retaining matched repetition numbers.

The benchmark plan supports:

- a fixed baseline and one or more prompt/rule variants;
- repeated cases with alternating deterministic variant order;
- disposable workspace copies;
- immutable resources copied to case-local destinations;
- setup commands and exact preconditions;
- final-output and arbitrary executable checks;
- named harmful checks with a separately frozen margin;
- candidate-input and sealed-oracle hash verification before and after runs;
- exact Codex JSONL token/tool traces for every run.

Sealed oracle paths are never copied into agent workspaces. A plan attempting
to expose one as a resource is rejected before setup or Codex execution.

## Live end-to-end proof

The live smoke used an identical baseline and candidate prompt on a one-file
task. Before each Codex run, the harness:

1. copied the immutable 6.4 MB Team database into a prepared workspace;
2. created and populated a `benchmark_probe` table only in that copy;
3. verified the row with SQLite;
4. copied the prepared workspace again for each variant;
5. required an exact file-content assertion after Codex finished.

Evidence:

```text
/Users/onnokleinhofmeijer/.crew/research-benchmarks/
  crew-benchmark-20260723-I0pqJE/live-smoke-v3-20260723T1644Z/
```

Both runs passed the executable outcome and harmful check:

| Metric | Baseline | Identical candidate |
| --- | ---: | ---: |
| Codex build | 0.145.0-alpha.27 | 0.145.0-alpha.27 |
| Total tokens | 57,714 | 57,278 |
| Input tokens | 57,321 | 56,958 |
| Output tokens | 393 | 320 |
| Model-visible tool calls | 1 | 1 |
| Crew calls | 0 | 0 |
| Duration | 19.7 s | 18.3 s |
| Executable outcome | pass | pass |

The 436-token difference is **not optimization evidence**. It is a single pair
with identical prompts and demonstrates ordinary run variance. Facet POCs must
use multiple matched repetitions and the interleaved schedule.

The post-run source SHA-256 remained
`c16f822c97609f7f5fcf5f2df3a5600a21b75696f53a59334f423f3be745cbe2`.
The prepared database hash changed, proving that local mutation occurred
without touching the snapshot.

Two failed live attempts are intentionally preserved:

- the first proved that an untrusted disposable directory requires
  `--skip-git-repo-check`;
- the second proved that Homebrew Codex 0.141.0 could no longer invoke the
  configured `gpt-5.6-sol` model.

The passing evidence used the current desktop-bundled Codex
`0.145.0-alpha.27`. Every experiment must therefore pin and report the exact
Codex build; silently mixing these clients would invalidate a comparison.

## Verification

Standalone research suite:

```text
tests 15
pass 15
fail 0
```

Telemetry/history generator suite:

```text
test files 2 passed
tests 5 passed
```

`git diff --check` passes. The server-wide TypeScript command remains blocked
by the isolated worktree's dependency state: `fastmcp` is absent, causing
pre-existing module-resolution and downstream implicit-`any` errors in
`src/mcp/register.ts` and `src/server.ts`. The research TypeScript files load
and pass their five executable Vitest cases under Node 22.

## Decision rules for the facet POCs

Use development cases to construct candidates. Freeze the prompt/rule bundle
before running evaluation cases. A facet candidate may advance only when:

- the immutable source and corpus hashes still match;
- all security and forbidden-side-effect canaries pass;
- the paired executable-success floor passes;
- harmful guidance is within its predeclared margin;
- enough successful pairs exist for token comparison;
- its paired median token reduction survives repetitions without an
  unacceptable worst-case regression.

The first smoke defaults are deliberately strict: 100% baseline success, no
baseline-only pair, and zero extra harmful failures. The final research
comparison should use the predeclared margins from the oracle research after a
baseline-variance pilot and should bootstrap tasks as clusters.

Post optimization should use producer-consumer transfer cases: a producer
solves task A and emits or skips a Post; a fresh consumer receives a held-out
sibling task B with only the candidate Post available. Task B's executable
outcome decides usefulness, searchability comes from whether a paraphrased
query retrieves the Post, and tokens are compared only after non-inferiority.

## Remaining limitation

The mature telemetry holdout is small—147 Retrievals and 69 Posts from roughly
2.7 days. It is enough to catch regressions and exercise the benchmark, but not
enough by itself for a durable production decision. Preserve it, run the
facet POCs now, and add a prospective post-2026-07-23 window before shipping a
winner.
