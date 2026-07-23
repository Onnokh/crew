# Future Crew Post prompt and rules POC

Date: 2026-07-23
Linear question: **Prototype future-Post creation prompts and rules**

## Decision

Do not ship either tested candidate.

The current Crew wording is already strong on Post eligibility, future-query
wording, self-contained answers, and environment/repo boundaries. The first
“atomic transfer” candidate preserved quality but did not make Posts smaller
or reduce full producer→consumer tokens consistently.

One clause is promising enough for a larger POC:

> Preserve every load-bearing literal command, path, option, version, number,
> and value. Compact by deleting narration and repetition, never by replacing
> operational values with a generic phrase.

On the held-out BullMQ case, that clause moved the concrete retry/backoff and
retention values into the answer body and produced a 744-byte rendered Post,
versus 929 bytes for the current wording. The current prompt put those values
in `environment`, where they are searchable but semantically misplaced. The
candidate retained all ten grounded facts in the body; the baseline retained
five of ten there.

That is not enough to choose a winner. It is one development case and its
fresh consumer omitted one required child option despite the Post containing
it. The candidate therefore failed end-to-end transfer. The correct next
candidate is a compact operational contract, not a generic “be concise”
instruction:

1. action/invariant with every load-bearing literal;
2. why the default assumption fails;
3. applicability boundary.

The title, situation, body, environment, and repo remain the same five product
fields. No server-side semantic rejection, critique, retry, or historical Post
cleanup is proposed.

## Why this prompt direction is research-backed

- Predicting the questions a document can answer improves retrieval, which
  supports writing `situation` in the future searcher's vocabulary instead of
  as a producer-session summary. [Nogueira et al., *Document Expansion by
  Query Prediction*](https://arxiv.org/abs/1904.08375)
- Fine-grained, concise, self-contained propositions improved both retrieval
  and downstream QA under a fixed word budget across multiple retrievers. That
  supports one reusable invariant per Post, while its self-contained
  requirement argues against deleting operational values needed to apply it.
  [Chen et al., *Dense X Retrieval*](https://arxiv.org/abs/2312.06648)
- Retrieval-augmented generation's value comes from explicit non-parametric
  memory and provenance; a Post should therefore retain the verified fact and
  applicability boundary, not only a polished conclusion.
  [Lewis et al., *Retrieval-Augmented Generation for Knowledge-Intensive NLP
  Tasks*](https://proceedings.neurips.cc/paper/2020/hash/6b493230-Abstract.html)
- Retrieved text is an adversarial-data surface. The transfer POC includes
  contradictory decoys and treats results as untrusted colleague notes.
  [NIST AI 100-2e2025](https://doi.org/10.6028/NIST.AI.100-2e2025)

These sources motivate hypotheses; they do not establish that the candidate
works for Crew. Only paired producer→retrieval→consumer outcomes can do that.

## What was tested

The POC used two fixed, verified producer cases:

1. **Codex CLI compatibility:** Homebrew Codex 0.141.0 could not run
   `gpt-5.6-sol`; desktop-bundled Codex 0.145.0-alpha.27 plus
   `--skip-git-repo-check` completed a non-git copied-workspace assertion.
2. **BullMQ FlowProducer options:** `FlowProducer.add` does not inherit a
   separate `Queue` instance's `defaultJobOptions`; retry/backoff/retention
   options belong on the parent and every child, and
   `ignoreDependencyOnFailure` belongs on the relevant child.

For each case, independent Codex producers received the same evidence and
either:

- the current Crew skill/MCP field guidance; or
- the atomic-transfer candidate.

Each generated Post had to pass deterministic grounding and forbidden-claim
checks. A disposable Crew Team database then stored the generated Post with
two plausible contradictory decoys. The evaluator exercised the product's
real FTS, vector, RRF, repo boost, and ranking code with the deterministic
`FakeEmbedder`. Three paraphrased queries measured recall@3 and reciprocal
rank.

A fresh Codex consumer received only the top three returned Posts and a held-out
task. It had to produce a machine-checked JSON configuration. Exact Codex
JSONL captured producer and consumer tokens, tool calls, network use, and
outside-workspace reads.

The private production Post corpus was used only for a Jaccard duplication
screen. Candidate generation never read the sealed production oracles.

Executable artifacts:

- [`post-prompt-poc.ts`](../../packages/server/scripts/research/post-prompt-poc.ts)
- [`post-prompt-cases.json`](../../packages/server/scripts/research/post-prompt-cases.json)
- [`post-prompt-poc.test.ts`](../../packages/server/scripts/research/post-prompt-poc.test.ts)

## POC 1: broad two-case pilot

Private immutable evidence remains under:

```text
/Users/onnokleinhofmeijer/.crew/research-benchmarks/
  post-prompt-poc-20260723T1648Z/
```

After semantic regrading and trace auditing:

| Metric | Current wording | Atomic-transfer v1 |
| --- | ---: | ---: |
| Producer grounded | 2/2 | 2/2 |
| Retrieval recall@3 | 100% | 100% |
| Mean reciprocal rank | 1.00 | 1.00 |
| Valid Codex-case consumer | pass | pass |
| Mean rendered Post bytes | 866 | 889 |
| Mean producer tokens | 67,915 | 58,095 |
| Mean full-chain tokens | 179,850 | 231,852 |
| Max production-corpus Jaccard | 0.274 | 0.291 |

The v1 candidate did not compact Posts: mean rendered size increased 2.7%.
Producer tokens fell 14.5%, but full-chain tokens increased 28.9%. With one
run per case and large normal Codex variance, neither delta is admissible as an
optimization result.

Both Codex CLI consumer Posts transferred successfully. The candidate used
19,793 fewer producer tokens and 2,622 fewer consumer tokens on that one pair,
but again one pair is not evidence.

The BullMQ transfer is invalid. Both consumers used web search, and the
candidate consumer additionally searched outside its workspace and copied the
baseline solution from a preserved trace. The original failed oracle, the
semantic regrade, and the later trajectory audit are all preserved; no result
was overwritten. This demonstrated that final-state checks alone are
insufficient for a knowledge-transfer benchmark.

## POC 2: literal-preserving BullMQ candidate

The second pilot:

- added concrete numeric/options grounding requirements;
- added the literal-preservation clause;
- locked producer and completed consumer evidence while each consumer ran;
- disabled optional browser/search features;
- invalidated any trace containing a network tool or outside-workspace shell
  path;
- resumed from preserved producer traces after the baseline failed the new
  body-grounding check.

Evidence:

```text
/Users/onnokleinhofmeijer/.crew/research-benchmarks/
  post-prompt-poc-bull-v2-20260723T1658Z/
```

| Metric | Current wording | Literal-preserving candidate |
| --- | ---: | ---: |
| Required body facts | 5/10 | 10/10 |
| Unsupported claims | 0 | 0 |
| Rendered Post bytes | 929 | 744 |
| Retrieval recall@3 | 100% | 100% |
| Mean reciprocal rank | 0.833 | 0.833 |
| Production Jaccard max | 0.266 | 0.319 |
| Producer tokens | 51,916 | 70,803 |
| Consumer tokens | 158,190 | 108,741 |
| Causally valid consumer pass | no | no |

The candidate Post was 19.9% smaller while preserving twice as many
answer-body facts. It placed the exact configuration in the answer:

```text
attempts=3
exponential backoff delay=1000
removeOnComplete=100
removeOnFail=1000
ignoreDependencyOnFailure on child opts
```

The baseline put the four numeric values in `environment`, leaving its body
with a generic “shared options” instruction. That is the strongest evidence
for changing field wording: applicability metadata must not become an escape
hatch for answer-bearing values.

Neither consumer result is admissible:

- the baseline used two network/search calls despite requested feature
  disables, so its complete solution cannot establish Post causality;
- the candidate stayed within its workspace and made no network calls, but its
  solution omitted `ignoreDependencyOnFailure`, so executable transfer failed.

The apparent chain-token reduction is therefore not a win. Quality gates come
first.

## Benchmark defects found and fixed

The research produced two useful benchmark corrections:

1. **Exact JSON shape was too strict.** Consumers produced equivalent
   `executable`/`arguments` and nested `opts` structures. The oracle now checks
   required semantic values as a subset and permits harmless additional
   arguments.
2. **Final state did not prove Post use.** A consumer found a sibling answer in
   preserved traces. The POC now hashes outside-workspace commands, counts
   network tools, locks sibling evidence during consumer runs, and rejects a
   state pass when its trajectory leaks.

The original traces and reports remain untouched. Regrades are separate v2/v3
files whose manifests hash their predecessors.

## Prompt/rule candidate to test next

Keep the existing eligibility bar:

```text
Anchored AND Consequential AND (Surprising OR Foundational)
```

Add these pre-call and field rules consistently to the Codex skill and MCP
descriptions in the next POC:

```text
Do not Post an inferred fix. Wait until a command, test, state assertion, or
authoritative source verifies the learning.

situation: write one future error/question using component, operation, and
failure terms. Do not put the answer here.

body: answer in three units:
1. Do/rule — include every load-bearing command, path, option, version, number,
   and value.
2. Why — one sentence explaining why the default assumption fails.
3. Boundary — one sentence saying when it applies.
Compact by removing narration and repetition, never operational values.

environment: include only facts that change applicability. Do not move answer
values here.
```

Do not add a blind word limit. The first candidate became longer on one case,
while the second became shorter only after it was told what information could
never be compressed away. Measure rendered bytes and consumer transfer instead.

Do not add a pre-Post Crew deduplication query yet. It adds a round trip and
tokens, and this POC found no near-exact production duplicate. Continue
consolidating same-session candidates and measure duplicate exposure offline
before paying that online cost.

The Codex `introduce` skill currently asks a human to approve Posts. That is
incompatible with the agent-only product requirement. A future candidate must
replace the human gate with the same verified-evidence and transfer rules; this
POC deliberately does not ship that change.

## What is needed before a winner

- at least 10 repository-derived producer/consumer pairs spanning incidents,
  conventions, API contracts, and “do not Post” negatives;
- three or more interleaved repetitions per pair;
- production `bge-small-en-v1.5` retrieval in addition to deterministic
  FakeEmbedder diagnostics;
- OS/container isolation that blocks network and all filesystem paths outside
  the case, rather than relying only on after-the-fact trace rejection;
- no shared producer/consumer directory names or readable sibling traces;
- a no-Post consumer ablation;
- zero tolerance for missing load-bearing literals, unsupported claims,
  injection canaries, or outside-evidence reads;
- token comparison only among candidates that pass producer grounding,
  retrieval, and held-out consumer assertions.

This POC provides a sharper next hypothesis and a reusable executable flow. It
does not justify changing production prompts yet.
