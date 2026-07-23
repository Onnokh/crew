# Repeatable Codex token and outcome tracing

Date: 2026-07-23
Linear question: **Build repeatable Codex token and outcome tracing**
Reference client: Codex CLI 0.141.0

## Answer

The minimum useful tracing setup is a fixture-driven wrapper around
`codex exec --json` that gives every repetition a disposable workspace and
captures four distinct evidence layers:

1. exact whole-turn usage from `turn.completed.usage`;
2. ordered model-visible steps and tool calls from `item.completed`;
3. raw JSONL, stderr, final output, and payload hashes/byte sizes;
4. executable post-run assertions and aggregate run variance.

The implementation is
[`scripts/research/codex-poc-runner.mjs`](../../scripts/research/codex-poc-runner.mjs).
It builds on the token parser from
[`scripts/research/codex-token-surface.mjs`](../../scripts/research/codex-token-surface.mjs).
The smoke fixture is
[`scripts/research/fixtures/codex-trace-smoke.json`](../../scripts/research/fixtures/codex-trace-smoke.json).

This is research instrumentation, not production application logic. It does
not connect to or modify the production Crew database.

## One-command rerun

From the repository root:

```bash
node scripts/research/codex-poc-runner.mjs \
  --fixture scripts/research/fixtures/codex-trace-smoke.json \
  --out /tmp/crew-codex-tracing-evidence-$(date -u +%Y%m%dT%H%M%SZ)
```

The fixture defines the task, variant, repetitions, disposable workspace
template, Codex flags, final-answer assertion, and executable checks. The
runner owns `--json`, `--ephemeral`, `--output-last-message`, and `-C` so a
fixture cannot accidentally disable comparable capture.

## Evidence contract

Each repetition produces:

```text
<run>/
  workspace/                  disposable task workspace
  trace.jsonl                 raw Codex event stream
  codex.stderr.log            warnings and process diagnostics
  final.txt                   final assistant message
  checks/*.stdout.txt         executable outcome evidence
  checks/*.stderr.txt
  run.json                    normalized evidence and verdict
```

The output root also contains a redacted resolved fixture and `summary.json`.
Environment-variable values are never copied into the resolved fixture.

`run.json` records:

- task, variant, repetition, timestamps, Codex version, flags, duration, exit
  code, signal, and spawn errors;
- prompt, trace, stderr, final-output, tool-input, tool-output, and check-output
  byte counts plus SHA-256 hashes;
- exact input, cached input, cache-write input, output, reasoning output, and
  total tokens when Codex emitted them;
- ordered completed steps, tool type, Crew verb classification, status, exit
  code, exact-repeat count, and failed steps;
- final-output assertion and arbitrary executable checks;
- source-workspace tree hash proving repetitions began from the same fixture.

Raw arguments and outputs stay in the raw trace and check artifacts. The
normalized reports store hashes and sizes, which is enough for equality,
repeat, and payload-cost analysis without spraying task content into aggregate
reports.

`summary.json` records success rate and min/median/max/mean/population standard
deviation for total/input/output tokens, model-visible tool calls, Crew calls,
and duration.

OpenAI's executable event types expose `item.*` and `turn.completed` as the
machine-readable seam. The official Codex source defines command, file-change,
MCP, agent-message, error, and usage event shapes; the TypeScript SDK likewise
consumes the CLI JSONL stream. Sources:
[Codex exec event exports](https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs),
[Codex TypeScript SDK](https://github.com/openai/codex/blob/main/sdk/typescript/README.md).

## Live proof

The checked-in smoke fixture was run twice against real Codex 0.141.0. Both
runs:

- started from separate copies of the same one-file workspace;
- created the expected file;
- returned the exact expected final answer;
- passed the executable file-content check;
- exited successfully with no failed trace steps;
- made two model-visible shell calls and zero Crew calls.

Evidence directory:

```text
/tmp/crew-codex-tracing-evidence-20260723T161600Z
```

| Metric | Run 1 | Run 2 |
| --- | ---: | ---: |
| Outcome | pass | pass |
| Total tokens | 51,008 | 66,628 |
| Input tokens | 50,823 | 66,428 |
| Cached input tokens | 25,728 | 56,832 |
| Output tokens | 185 | 200 |
| Model-visible tool calls | 2 | 2 |
| Duration | 11.4 s | 12.9 s |

The 15,620-token total spread on an identical tiny task is material. The calls
and outcome were stable, but startup/context/cache accounting was not. A single
run is therefore inadmissible for token decisions. Candidate comparisons must
use repeated, matched fixtures and interleave variant order; report the paired
distribution instead of treating one trace as a baseline constant.

## Verification

```bash
node --test \
  scripts/research/codex-token-surface.test.mjs \
  scripts/research/codex-poc-runner.test.mjs
```

Result:

```text
tests 9
pass 9
fail 0
```

Coverage includes:

- cumulative and public-exec usage accounting;
- cached/reasoning subset handling;
- public command/MCP step capture;
- Crew discovery versus query/post/confirm/flag execution;
- payload hashes and exact byte sizes;
- trace and executable outcome failures;
- two-run aggregation and variance;
- disposable workspace isolation;
- environment-value redaction;
- rejection of fixture attempts to override capture flags.

The repository TypeScript command was not applicable to these standalone
`.mjs` scripts in the isolated worktree because that worktree intentionally had
no installed `node_modules`; the native Node test suite above is the executable
verification for this artifact.

## Benchmark rules unlocked by this POC

1. Every benchmark case is a fixture with an immutable source hash.
2. Every run receives a new workspace and, when Crew data is needed, a new copy
   of the immutable database snapshot.
3. Task success and harmful outcomes are decided before tokens are compared.
4. Aggregate reports contain hashes and sizes; raw traces remain private local
   evidence because tool arguments and outputs can contain secrets.
5. Codex exit code alone is insufficient: final assertions and executable
   checks must also pass.
6. Stderr warnings are retained but do not fail a run unless the process,
   trace, or executable outcome fails.
7. Variants use the same Codex build, model/config, workspace source, fixture,
   and repetition schedule.
8. Candidate order is interleaved or randomized by the benchmark orchestration
   layer to reduce cache and time-order bias.

## Limits

- `turn.completed.usage` is exact for fields Codex emits, but Codex does not
  expose a source-by-source rendered-prompt token map.
- A raw trace is sensitive evidence. It must not be committed when it contains
  production query text, Post content, repository paths, or credentials.
- This runner handles one task/variant fixture per invocation. The disposable
  benchmark ticket must add case selection, paired variant scheduling, sealed
  train/holdout splits, and database-copy lifecycle.
- The two live repetitions prove the tracer, not any Crew optimization.
