# Codex + Crew token surface

Date: 2026-07-23  
Linear question: **Measure the Codex and Crew token surface**  
Reference client: Codex only (`codex-cli 0.141.0`)

## Answer

A repeatable whole-task measurement is feasible now, without changing Crew's
production application:

1. Run each benchmark task with `codex exec --json`.
2. Treat `turn.completed.usage.input_tokens + output_tokens` as the exact
   whole-task token total. `cached_input_tokens` is already inside
   `input_tokens`; `reasoning_output_tokens` is already inside `output_tokens`.
3. Capture the ordered tool events and payload byte sizes as diagnostics.
4. Attribute token changes to Crew facets with controlled A/B runs, not by
   dividing characters by four.
5. Judge variants on executable task outcomes first; compare tokens only among
   non-inferior variants.

Codex exposes exact aggregate usage, but it does **not** expose an exact
source-by-source decomposition of its rendered input. The prompt/context,
AGENTS rules, skill catalog, loaded skill bodies, tool schemas, conversation
history, and tool results are combined before the model request. The local
rollout records messages and payloads, not the exact final request or a
token-to-source map. Therefore the defensible design is:

> exact total measurement + byte-level trace + causal A/B attribution

The executable POC is
[`scripts/research/codex-token-surface.mjs`](../../scripts/research/codex-token-surface.mjs),
with tests in
[`scripts/research/codex-token-surface.test.mjs`](../../scripts/research/codex-token-surface.test.mjs).

## What is measurable

| Surface | Exact now? | Measurement |
| --- | --- | --- |
| Whole-task input, cached input, cache-write input, output, reasoning output | Yes | `codex exec --json` → `turn.completed.usage`; persisted rollout → cumulative `token_count` delta |
| Number/order of model-visible tool calls | Yes | JSONL `item.*` or rollout `response_item` call/output pairs |
| Crew query/post/confirm/flag calls through executor | Yes | Classify executor code by the invoked `crew_mcp` path and verb |
| Request/result payload size | Exact bytes/chars | Serialize the recorded call input/output; do not call this a token count |
| Retries and follow-up calls | Yes with a defined rule | Exact repeated call inputs; ordered Crew calls after the first |
| Final answer size | Exact bytes; output tokens aggregate | `task_complete.last_agent_message` or `item.completed` |
| AGENTS/skill/tool-schema contribution | Causally exact, not directly attributed | Identical A/B runs with only that surface changed |
| Exact token count for an isolated arbitrary payload | Yes if the full Responses request is available | OpenAI's input-token-count endpoint |
| Per-source tokens inside a normal Codex Desktop model request | No | Codex does not persist the fully rendered request with component boundaries |
| Join from Crew's four-week DB to Codex run/session tokens | No | Crew has no client, run, session, or Codex-turn identifier |

OpenAI documents `codex exec --json` as a JSONL event stream and includes
`turn.completed.usage` with input, cached-input, output, and reasoning-output
tokens. The open-source Codex event type defines the same fields, including
cache-write input tokens. [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable),
[Codex `Usage` source](https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs#L976-L1000).

OpenAI's input-token-count endpoint accepts the same input, tools, schemas, and
instructions as a Responses request and includes structural formatting tokens.
The documentation explicitly warns that local tokenizers and character
heuristics are insufficient for tools and schemas. That endpoint becomes useful
only if the harness owns the full request; Codex Desktop does not currently
export that request. [OpenAI token counting](https://developers.openai.com/api/docs/guides/token-counting).

## POC 1: exact whole-task accounting

The POC parses both supported evidence shapes:

- public `codex exec --json` output, using `turn.completed.usage`;
- local persisted rollout JSONL, using the cumulative usage snapshot immediately
  before a `task_started` event and the last snapshot before its matching
  `task_complete`.

It collapses duplicate cumulative snapshots rather than summing
`last_token_usage`, which prevents double counting. It reports:

- total, input, cached input, uncached input, cache-write input, output,
  reasoning output, and visible output;
- model-response count;
- model-visible call sequence;
- transport-level MCP calls;
- Crew discovery versus execution;
- Crew verbs, follow-ups, exact repeated calls, and payload bytes;
- final-output bytes;
- static source-file bytes when requested.

The accounting identity is:

```text
whole_task_tokens = input_tokens + output_tokens
uncached_input_tokens = input_tokens - cached_input_tokens
visible_output_tokens = output_tokens - reasoning_output_tokens
```

Do not add cached or reasoning tokens again. OpenAI describes cached tokens as
reads from the input prefix and reasoning tokens as an output-token detail.
Prompt caching changes price and latency but not the total-token objective.
[OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

### Verification

```bash
node --test scripts/research/codex-token-surface.test.mjs
```

Result:

```text
tests 3
pass 3
fail 0
```

The tests cover cumulative-delta accounting, duplicate token snapshots,
cached/reasoning subset semantics, Crew query detection, discovery-versus-call
classification, payload size, final output, and the public `codex exec` stream.

## POC 2: static Crew rule cost

Two equal-length temporary working directories were created. One was empty; the
other contained only the repository's 1,368-byte
[`AGENTS.md`](../../AGENTS.md). The process itself started in the selected
directory, avoiding the inconsistent agent-file discovery observed when `-C`
pointed away from the shell's working directory.

Each condition was run twice with a persisted Codex task:

```bash
codex exec --json --ignore-user-config --skip-git-repo-check \
  'Reply exactly OK.'
```

| Condition | Run 1 input tokens | Run 2 input tokens |
| --- | ---: | ---: |
| Empty directory | 16,899 | 16,899 |
| Crew `AGENTS.md` only | 17,255 | 17,255 |
| Difference | **+356** | **+356** |

This is an exact total-input difference for this model/client build and prompt,
not a universal tokenizer constant. It isolates the repository rule better than
a local tokenizer would, because it includes Codex's formatting around the
agent instructions.

The consequence is multiplicative: the rule is part of each model request in a
multi-step task. Prompt caching can make repeated prefix tokens cheaper, but
Codex still reports them as input tokens. For the stated north star—total tokens
per successful task—the always-loaded rule is therefore worth optimizing, even
though 356 tokens is small compared with a large query result.

The full Codex plugin's four Crew skill bodies total 13,011 bytes:

| Static source | Bytes | Loading behavior |
| --- | ---: | --- |
| `crew/SKILL.md` | 6,646 | Loaded when the Crew workflow is invoked |
| `ask-crew/SKILL.md` | 1,655 | Loaded when explicitly selected |
| `reflect/SKILL.md` | 2,266 | Loaded when explicitly selected |
| `introduce/SKILL.md` | 2,444 | Loaded when explicitly selected |

These bodies should not be treated as always-loaded. Codex advertises the skill
catalog first and loads a chosen skill's body later. Each body's causal cost
should be measured as its own A/B once the benchmark harness is in place.

## POC 3: live Crew result payload through executor

A real Crew query in this research session returned the following **aggregate
shape**; no Post text is committed:

| Layer | Size |
| --- | ---: |
| Useful Crew result text (`content[0].text`) | 12,227 characters |
| Duplicated `structuredContent` serialization | 12,212 characters |
| Model-visible executor output | 25,358 characters / 25,502 UTF-8 bytes |
| Executor request that caused the Crew query | 512 bytes |

The outer executor result carried both the MCP text `content` and an almost
identical `structuredContent` representation. This is consistent with MCP's
backward-compatibility rule: when structured content is returned, a serialized
text content block should also be present. The combination is valid protocol,
but a client/executor that places both copies in model context pays for both.
[MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

The captured result was then replayed as additional input to identical minimal
Codex tasks. Three sequential sets were run:

| Input variant | Added input tokens versus its empty-input control |
| --- | ---: |
| Useful Crew text only | 2,833–3,797 |
| Full executor-visible envelope | 6,396–7,360 |
| Additional wrapper/duplicate overhead | 3,185–3,941 |

There was hidden baseline variation between process launches, so ranges are
reported instead of a false single-point estimate. The direction is stable:
the executor-visible representation cost roughly twice the useful text in this
sample.

This result is directly actionable as a research target for **Prototype Crew
MCP result delivery strategies**:

- compare direct Crew MCP delivery with executor delivery;
- verify whether the client can consume one canonical representation;
- test compact top candidates or selective expansion;
- measure the full downstream task, because a result stays in context and can
  be counted again on later model calls.

It is not yet a production recommendation. The sample had a larger-than-default
result set and was selected for instrumentation, not randomly sampled.

## Live Crew data boundary

The existing four-week local analysis reports 1,155 queries, 464 Posts, 5,967
result rows, and 170 verdicts. It also reports:

- mean 5.17 results per query;
- average Post title 35 characters;
- average Situation 147 characters;
- average Body 658 characters;
- average Environment 94 characters;
- only one zero-result query;
- 97.5% of Confirmed result rows at ranks 1–5.

Source: the existing local artifact
`docs/research/2026-07-23-four-week-usage-first-pass.md`, based on the preserved
read-only production snapshot with Team DB SHA-256
`2b48a0b52fbf3129cad911613a411287d99f42be4ea1b501344b27c2d73fcec0`.

These numbers explain where result tokens come from: Body text dominates each
rendered Post, while the renderer also includes title, Situation, Environment,
provenance, and up to three Notes. The current renderer's exact shape is in
[`render.ts`](../../packages/server/src/guardrails/render.ts).

However, Crew's database cannot answer whole-task token questions. Its
`retrievals` and `retrieval_results` tables store the query and ranking evidence
but no client, Codex thread, turn, tool payload, model usage, retry, or final
outcome. [`schema.ts`](../../packages/server/src/store/schema.ts),
[`ADR 0009`](../adr/0009-retrieval-telemetry-raw-rows-per-team-db.md).

The benchmark harness should therefore join the two worlds outside production:

```text
Codex run trace
  run/variant/task/model/version
  exact token usage
  ordered Crew/tool calls
  payload hashes + byte sizes
  executable outcome

        ↕ benchmark-owned case id

Disposable Crew DB
  frozen Posts/events as-of task time
  query inputs
  ranked result ids/scores
  no historical evidence rewritten
```

## Tool-schema surface through executor

The connected executor exposes Crew lazily. Crew's four schemas are not four
always-present Codex tools; the model first searches/describes the integration,
then executes the returned path. A live executor metadata read produced:

| Crew verb | Description chars | Input type chars | Generic output type chars | Total exposed chars |
| --- | ---: | ---: | ---: | ---: |
| `query` | 448 | 75 | 1,541 | 2,069 |
| `post` | 941 | 86 | 1,541 | 2,572 |
| `confirm` | 403 | 35 | 1,541 | 1,986 |
| `flag` | 405 | 80 | 1,541 | 2,030 |
| **Total** | **2,197** | **276** | **6,164** | **8,657** |

These are serialized-character diagnostics, not token counts. The repeated
1,541-character output type is the executor's generic MCP result union. Because
metadata is lazy, the main questions for the benchmark are:

- Can Crew's skill provide a compact stable call contract that avoids repeated
  search/describe calls?
- Does that saving outweigh the always-loaded skill wording?
- Can query/post use a compact, typed result instead of the generic output
  envelope without losing safe provenance and feedback handles?

The repository currently puts autonomy in both MCP descriptions and agent
instructions by design. [`ADR 0006`](../adr/0006-autonomy-via-mcp-descriptions-not-hooks.md),
[`query.ts`](../../packages/server/src/tools/query.ts),
[`post.ts`](../../packages/server/src/tools/post.ts). The measurement result
does not decide which wording to remove; it makes that duplication testable.

## Benchmark protocol

Use the following protocol for every prompt/rule/MCP candidate:

1. Freeze one repository snapshot and one disposable Crew database snapshot.
2. Define an executable task and its pass/fail commands before running an agent.
3. Run baseline and candidate in randomized order, at least three times each.
4. Keep model, Codex version, reasoning effort, permissions, working-directory
   path length, task prompt, and initial git state identical.
5. Capture `codex exec --json` and run the POC parser.
6. Record:
   - exact input/output/total tokens;
   - cached and cache-write input separately for cost analysis;
   - model-response count;
   - Crew discovery/execution/follow-up/retry counts;
   - query/post/confirm/flag payload hashes and bytes;
   - final-output bytes;
   - test/command outcome and harmful-guidance outcome.
7. Reject any candidate that fails the quality floor. Among non-inferior
   candidates, compare median and worst-case total tokens.
8. Preserve raw traces privately; publish only redacted aggregates and hashes.

Suggested run record:

```json
{
  "run_id": "opaque",
  "task_id": "benchmark-case",
  "variant": "baseline",
  "codex_version": "0.141.0",
  "model": "configured-reference-model",
  "crew_snapshot_sha256": "opaque",
  "usage": {
    "input_tokens": 0,
    "cached_input_tokens": 0,
    "cache_write_input_tokens": 0,
    "output_tokens": 0,
    "reasoning_output_tokens": 0,
    "total_tokens": 0
  },
  "crew_calls": {
    "discovery": 0,
    "query": 0,
    "post": 0,
    "confirm": 0,
    "flag": 0,
    "follow_ups": 0,
    "exact_retries": 0
  },
  "outcome": {
    "commands_passed": true,
    "harmful_guidance": false
  }
}
```

No human label belongs in this record. The executable oracle and agent-only
evaluator provide the quality decision.

## Commands

Analyze a persisted Codex Desktop turn:

```bash
node scripts/research/codex-token-surface.mjs \
  --rollout /absolute/path/to/rollout.jsonl \
  --turn-id TURN_ID \
  --static crew-agents=AGENTS.md \
  --static crew-skill=packages/codex-plugin/skills/crew/SKILL.md
```

Analyze `codex exec` output:

```bash
codex exec --json 'TASK' > /private/research/run.jsonl
node scripts/research/codex-token-surface.mjs \
  --rollout /private/research/run.jsonl
```

Keep private traces outside the repository: tool outputs can contain source
code, paths, Posts, URLs, and other sensitive context.

## Limitations

- Local rollout JSONL is an implementation artifact, not a stable public
  analytics API. Pin the Codex version and keep parser fixtures.
- `codex exec --json` is the stable measurement surface, but it still gives
  aggregate usage rather than per-source attribution.
- The current research turn inherited a very large parent conversation and
  spawned from Codex Desktop. Its multi-million-token partial total proves the
  parser works on a live trace but is not a production Crew baseline.
- A/B process launches showed hidden prompt variation when the shell working
  directory and `-C` target differed. Start the process in the actual benchmark
  directory and use repeated randomized runs.
- Payload bytes diagnose likely token pressure but are not a substitute for
  model-reported usage.
- Cached-input optimization and total-token optimization are related but not
  identical. Report both.
- The live Crew DB does not store rejected Post attempts, query latency/errors,
  exact rendered results, or downstream Codex outcomes.
- The captured 25.5-kB result is one real query, not a representative
  distribution. The disposable benchmark must sample short, median, and
  long-tail result sets.

## Decision-ready conclusions

1. **Use `codex exec --json` as the benchmark source of truth.** It measures the
   requested north star exactly at the whole-task level.
2. **Use A/B runs for prompt, rule, skill, and schema attribution.** Current
   traces cannot truthfully assign aggregate input tokens to those components.
3. **Treat cached and reasoning tokens as subsets.** Adding them again
   materially overstates usage.
4. **Prioritize result delivery as a token POC.** The observed executor envelope
   duplicated a real Crew result and added roughly another result's worth of
   input tokens.
5. **Measure always-loaded wording per model response.** The current Crew
   `AGENTS.md` cost 356 input tokens in the replicated minimal-task A/B.
6. **Keep POC observability outside production.** The benchmark can log all
   required joins without adding application logic or altering historical
   evidence.
