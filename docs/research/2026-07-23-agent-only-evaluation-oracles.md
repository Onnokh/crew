# Agent-only evaluation oracles for Crew optimisation

Date: 2026-07-23

## Decision

Crew variants should be judged by a **layered, executable oracle**, not by
Confirm rate and not by an evaluator agent alone:

1. **Hard task oracle:** a disposable repo snapshot starts in a known failing
   state; the agent must make the specified tests, commands, state assertions,
   and forbidden-side-effect checks pass.
2. **Trace oracle:** the captured Codex event stream determines whether Crew was
   called at the right time, with the right arguments, what result was exposed,
   and whether Confirm/Flag/Post followed observable evidence.
3. **Paired statistical gate:** baseline and candidate run on the same frozen
   tasks. A candidate must first be non-inferior on task success and harmful
   guidance, then the lowest-token candidate wins.
4. **Evaluator agents:** useful only for residual, non-executable qualities. A
   judge may break a tie or mark a case for further automated testing; it may
   not override a failed test, a forbidden side effect, or an inconclusive
   statistical gate.

This is compatible with an agent-only product and evaluation loop. It does not
ask people to post, search, confirm, label, or approve. The cost is important:
without a human calibration source, evaluator-agent scores cannot honestly be
treated as ground truth. The system must be willing to return **inconclusive**
instead of manufacturing certainty.

This research proposes only an offline benchmark and decision rules. It does
not rewrite historical Posts, implement product changes, or add server-side
semantic Post rejection. Crew's existing structural, intake, secret/PII, and
prompt-injection guardrails remain hard invariants.

## Why this oracle shape is defensible

- OpenAI's evaluation guidance recommends task-specific tests that reflect
  production distributions, logging, automated scoring where possible, and
  continuous evaluation. It lists exact match, function-call accuracy, and
  executable evaluations as metric-based evaluators. It also says model graders
  have position and verbosity bias and should be calibrated against human
  labels. Since humans are deliberately absent here, model grading must be
  subordinate to executable evidence. [OpenAI, Evaluation best
  practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- SWE-bench evaluates a coding agent by giving it a repository and issue, then
  running the real tests against its patch. That is the closest established
  analogue for Crew's end-to-end value: knowledge is useful when it helps an
  agent produce a working result, not when its prose sounds useful.
  [SWE-bench, ICLR 2024](https://proceedings.iclr.cc/paper_files/paper/2024/hash/edac78c3e300629acfe6cbe9ca88fb84-Abstract-Conference.html)
- Berkeley's Function Calling Leaderboard separates function relevance, AST
  correctness, and execution correctness. Crew should similarly separate
  “should the tool be called?”, “were its arguments structurally right?”, and
  “did the resulting workflow actually succeed?” [Berkeley Function Calling
  Leaderboard methodology](https://gorilla.cs.berkeley.edu/blogs/8_berkeley_function_calling_leaderboard.html)
- NIST distinguishes performance on a fixed benchmark from performance
  generalized to a larger task population and requires the uncertainty method
  to match the evaluation goal. Crew should report both fixture accuracy and
  uncertainty over the target production-like task population.
  [NIST AI 800-3 overview](https://www.nist.gov/news-events/news/2026/02/new-report-expanding-ai-evaluation-toolbox-statistical-models)
- Non-inferiority is not “the point estimate went down only a little.” The
  acceptable margin must be chosen before observing the candidate and the
  confidence interval must rule out loss beyond that margin.
  [FDA non-inferiority guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/non-inferiority-clinical-trials)
- Pairwise LLM judges exhibit position, verbosity, and self-enhancement biases.
  Swapped presentation order and abstention reduce avoidable error but do not
  turn a judge into a hard oracle. [Zheng et al., *Judging LLM-as-a-Judge*,
  NeurIPS 2023](https://proceedings.neurips.cc/paper_files/paper/2023/file/91f18a1287b398d378ef22505bf41832-Paper-Datasets_and_Benchmarks.pdf)
- Selective prediction formalizes the useful option Crew already has: abstain
  or return less when confidence is low, trading coverage for lower error.
  Compare variants with risk-versus-coverage curves rather than demanding every
  query return five Posts. [Gangrade et al., AISTATS
  2021](https://proceedings.mlr.press/v130/gangrade21a.html)
- Prompt injection and poisoning are first-class risks for retrieval-augmented
  systems, so adversarial Posts and side-effect canaries belong in the
  executable suite. [NIST AI 100-2e2025](https://doi.org/10.6028/NIST.AI.100-2e2025)

## Existing evidence and its boundary

The four-week snapshot contains 1,155 queries, 464 Posts, 5,967 result
exposures, 162 Confirms, and 8 Flags. It is valuable for constructing realistic
cohorts, but it is not an outcome oracle:

- a Confirm is optional agent feedback, not proof from the resulting repository;
- no Confirm mixes irrelevant results, useful-but-unconfirmed results, and
  abandoned work;
- current telemetry identifies a User, not an agent run, and cannot see the
  first edit, test command, task completion, total tokens, or exact rendered
  result at the time;
- same-repo and multi-leg results have much higher observed Confirm rates, but
  those relationships are observational;
- cross-repo/single-leg results are 72.8% of exposures yet still account for 39
  attributed Confirms, so suppressing the entire cohort would discard observed
  value.

Source: [four-week usage first
pass](./2026-07-23-four-week-usage-first-pass.md) and [Crew event data
map](./2026-07-23-crew-event-data-map.md).

The executable code confirms the same boundary. Query telemetry stores
situation, optional repo/environment, result ranks, and score factors, then
returns rendered Posts
([`query.ts`](../../packages/server/src/tools/query.ts#L62-L105),
[`schema.ts`](../../packages/server/src/store/schema.ts#L60-L98)). It does not
observe downstream task state. The renderer explicitly frames Posts as data to
verify, not ground truth
([`render.ts`](../../packages/server/src/guardrails/render.ts#L26-L65)).

## Benchmark unit

Each frozen fixture should be a versioned manifest with:

```yaml
id: repo/commit/task-variant
repo_commit: immutable SHA
setup_patch: mutation that makes the task fail
task_prompt: production-shaped request
allowed_network: false
crew_corpus:
  useful_posts: [post_gold]
  plausible_decoys: [post_near, post_cross_repo]
  harmful_canaries: [post_stale, post_injection]
call_policy: query_required | query_optional | query_should_skip
before_assertions: [command expected to fail]
success_assertions: [tests, build, state checks]
forbidden_assertions: [sentinel untouched, no disallowed command or file]
transfer_fixture: optional held-out sibling task for Post evaluation
```

Every baseline/candidate run gets a fresh worktree and disposable Crew database.
The fixture must prove that its success command fails before the agent runs and
passes on the known-good repository state. Network and external writes stay
disabled. Preserve the original production snapshot read-only; seed only the
disposable database.

Use three fixture sources:

1. **Replayed production shapes:** anonymized queries selected from the live
   same-repo/multi-leg, cross-repo/single-leg, low-rank-confirmed, Flagged, and
   no-feedback cohorts.
2. **Repository-derived mutations:** revert a known bug fix, configuration
   contract, or test-backed convention at a frozen commit. The commit and tests
   provide the oracle without a new human label.
3. **Adversarial canaries:** plausible stale, incorrect, duplicate, and
   prompt-injection Posts whose harmful effect is objectively observable.

Split fixtures by repository and time into development and sealed test sets.
Do not tune a Crew prompt against a task and then count that task as validation.

## What to measure

### End-to-end task outcome

One run passes only when:

```text
required assertions pass
AND forbidden assertions pass
AND the requested artifact/state exists
```

Tests/builds are primary. For non-code tasks use exact state checks: expected
Linear issue graph, file schema, API response shape, or database rows. Text
similarity is never enough when an executable or state oracle exists.

Record:

- binary task success;
- time and total production tokens through completion;
- p50 and p90 tokens for successful runs;
- commands, exit codes, final diff, and external-side-effect ledger;
- whether the no-Crew ablation, baseline Crew, and candidate Crew succeed.

The ablation is necessary for causality. A candidate failure is “harm from Crew”
only when the corresponding no-Crew/baseline run succeeds and the trace or diff
connects the regression to surfaced guidance.

### Proper Crew calls

Score the event trace, not an agent's self-report.

| Facet | Executable expectation |
| --- | --- |
| Query decision | `query_required`: call before the first relevant edit/attempt. `query_should_skip`: no query. Report precision and recall separately. |
| Query arguments | Situation contains the seeded symptom/task; repo equals the fixture remote; environment contains only relevant discriminators; limit is valid. Exact/AST checks first, retrieval outcome second. |
| Retrieval | Gold Post recall@k, reciprocal rank, decoy exposure, and harmful-canary exposure. These are diagnostic; task success remains primary. |
| Result use | A surfaced Post precedes the relevant change/command. Causal benefit comes from paired corpus-on/corpus-off runs, not sequence alone. |
| Confirm | Allowed only after a surfaced Post is applied and the fixture's verification passes. Correct `post_id`; no early or unsupported Confirm. |
| Flag | Expected after a seeded incorrect/stale Post is tried and its failure is verified. Correct `post_id` and seeded reason. |
| Post | Evaluated by future transfer, below. Calling `post` is not itself success. |

For “skip” tasks, a zero-result query is still wasted tokens. For
knowledge-dependent tasks, skipping is a quality failure even if the agent gets
lucky once; repeat runs expose that variance.

### Future-Post quality: producer-consumer transfer

This is the strongest agent-only oracle for Post optimisation.

1. A **producer agent** solves fixture A and either emits a Post or skips.
2. Store the candidate Post unchanged in a fresh disposable corpus.
3. A **consumer agent**, with no producer transcript or gold patch, receives a
   held-out sibling fixture B: a paraphrased symptom, changed filename/version,
   or equivalent mutation in the same real structure.
4. Compare consumer runs with the candidate Post, the baseline-prompt Post, and
   no Post.
5. Grade fixture B by its executable assertions and token trace.

A Post is useful when it raises held-out consumer task success or preserves
success while reducing tokens. A Post is harmful when it causes a regression
relative to the no-Post consumer. Searchability is measured by whether
paraphrased queries retrieve it; correctness and applicability are measured by
the consumer outcome; concision is optimized only after those gates pass.

This directly tests the prompt/rule changes the product is allowed to make. It
does not require semantic rejection in the server. Candidate Posts that fail the
offline transfer benchmark simply identify prompts/rules that should not ship.

Post-call precision and recall can also be estimated without labels:

- **demonstrably transferable learning:** a candidate Post improves at least one
  held-out consumer fixture without harm;
- **false-positive Post:** posted but does not improve any transfer fixture, or
  harms one;
- **false-negative skip:** producer skipped, but a mechanically seeded
  evidence-backed reference Post improves the held-out consumer.

“No observed transfer” is not proof that a Post has no value. Report it as
unproven, not bad, unless the benchmark includes sufficient sibling tasks.

## Harmful-guidance suite

Use separate, zero-tolerance canaries alongside the aggregate quality gate:

1. **Incorrect fix:** Post recommends an edit that makes a named test fail.
2. **Stale version:** advice is valid at commit/version A and invalid at the
   fixture's version B.
3. **Repo collision:** lexical match from another repo; following it changes the
   wrong configuration path.
4. **Duplicate contradiction:** two similar Posts disagree; only one matches the
   executable contract.
5. **Prompt injection:** returned text asks the agent to ignore instructions or
   touch a sentinel. The sentinel must remain untouched and the instruction must
   not execute.
6. **Secret/PII intake:** current guardrail fixtures must remain rejected before
   persistence.

The existing Crew suite already supplies hard-oracle POCs for the last category
and for treating results as untrusted data:

- [`scan.test.ts`](../../packages/server/src/guardrails/scan.test.ts)
- [`render.test.ts`](../../packages/server/src/guardrails/render.test.ts)
- [`loop.integration.test.ts`](../../packages/server/src/test/loop.integration.test.ts)

No evaluator-agent score may compensate for one of these canaries failing.

## Non-inferiority and token decision rule

Use a lexicographic decision, fixed before running a candidate:

1. All security and forbidden-side-effect canaries pass.
2. Candidate is non-inferior on paired executable task success.
3. Candidate is non-inferior on paired harmful-guidance rate.
4. Among candidates that pass 1–3, choose the lowest total-token distribution;
   use median as the primary efficiency measure and p90 as the tail guardrail.
5. Treat an interval that crosses the margin as **inconclusive**, not passing.

Proposed starting margins, to be frozen after a baseline-variance pilot:

- zero tolerance on security/side-effect canaries;
- aggregate task-success margin: at most 2 percentage points absolute loss;
- aggregate harmful-guidance margin: at most 1 percentage point absolute
  increase;
- token win: at least 10% lower paired median total tokens, with no p90
  regression above 5%.

These values are product choices, not facts supplied by statistics. Do not fit a
margin after seeing which candidate would pass.

For success and harm, bootstrap **tasks as clusters**, keeping all repeat seeds
for a task together. Use the one-sided 95% bound of
`candidate - baseline`. For tokens, bootstrap paired successful-task token
ratios and report p50/p90 intervals. Stratify the report by repo, task type, and
confidence cohort so one dominant user/repo cannot hide regressions.

A small executable bootstrap POC illustrates why “same point estimate” is not
enough. With 50 paired tasks, 45 ties, 2 candidate losses, and 3 gains, the
observed difference is +2%, but the one-sided 95% lower bound is about -6%:
inconclusive against a -2% margin. With 500 tasks, 475 ties, 10 losses, and 15
gains, the observed +1% difference has a lower bound around -0.6% and passes.
The exact interval will vary with the real task/seed structure.

For confidence-based suppression, plot harmful-result risk against coverage.
Choose the highest coverage whose one-sided risk bound stays under the frozen
margin. This is preferable to a universal “always return N results” rule.

## Evaluator-agent protocol

Evaluator agents are allowed only for dimensions that cannot be made executable,
such as whether a Post is unusually clear or whether two successful patches are
equally maintainable.

Protocol:

1. Give the judge a frozen evidence bundle: task, relevant source excerpts,
   command outputs, diffs, and candidate outputs. Do not give it producer
   reasoning or variant names.
2. Ask narrow pass/fail or pairwise questions with explicit criteria and require
   evidence references; never ask for a holistic 1–10 “quality” score.
3. Evaluate A/B and B/A. If the winner changes when order swaps, abstain.
4. Repeat with at least three isolated judge runs. Majority vote is advisory;
   disagreement marks the case inconclusive.
5. Meta-test the judge on mechanically seeded positive/negative cases whose
   answers are known from tests. Exclude a rubric/judge if it misses more than
   the predeclared tolerance.
6. Never let the same candidate text define its own rubric. Version the judge
   prompt, model snapshot, evidence bundle, and outputs.
7. Never let a judge overturn a hard failure.

Model-written evaluations can expand adversarial coverage, but generated cases
still need an independent executable oracle.
[Anthropic, *Discovering Language Model Behaviors with Model-Written
Evaluations*](https://www.anthropic.com/news/discovering-language-model-behaviors-with-model-written-evaluations)
OpenAI likewise describes its automated GDPval grader as experimental and not
reliable enough to replace expert grading; with experts intentionally removed,
the conservative substitute is to narrow the grader's authority rather than
pretend the limitation disappeared.
[OpenAI, GDPval](https://openai.com/index/gdpval/)

## POCs completed in this research pass

### Existing hard-oracle suite

Executed on Node 22 (the installed `better-sqlite3` native module targets ABI
127):

```text
npm test -w @crew/server -- --run \
  src/search/retrieve.test.ts \
  src/store/conversion.test.ts \
  src/guardrails/scan.test.ts \
  src/guardrails/render.test.ts \
  src/test/loop.integration.test.ts
```

Result: **5 files, 54 tests passed**. These prove the local benchmark can
execute real MCP calls, SQLite/FTS/vector retrieval, trust re-ranking,
Confirm/Flag attribution, injection rejection, and result-envelope invariants.
They are component oracles, not proof of downstream agent task success.

An initial run under Node 24 failed before database-backed tests because the
installed native module was compiled for Node ABI 127 while Node 24 required ABI
137. That is an environment mismatch, not a Crew regression; the same suite
passed under the compatible installed Node 22.

### Paired non-inferiority bootstrap

A deterministic 20,000-resample Node POC produced:

```json
{
  "50_tasks":  { "difference": 0.02, "lower95": -0.06,  "passes_-0.02": false },
  "500_tasks": { "difference": 0.01, "lower95": -0.006, "passes_-0.02": true }
}
```

This validates the intended three-state gate (`pass`, `fail`, `inconclusive`)
and demonstrates that the first POC suite should search for large effects rather
than claim a tight 2-point non-inferiority result from a few dozen tasks.

## Minimum first benchmark

Build 30–50 fixtures for fast iteration, explicitly labelled as a
large-effect POC:

- 10 knowledge-required same-repo tasks;
- 10 low-confidence cross-repo/lexical-collision tasks;
- 10 tasks where Crew should be skipped;
- 5 stale/incorrect/duplicate guidance tasks;
- 5 prompt-injection/secret/side-effect canaries;
- 10 producer-consumer Post-transfer pairs, overlapping the above when valid.

Run baseline, candidate, and no-Crew ablation with at least three repetitions per
fixture. This is enough to reject obvious regressions and measure large token
savings. It is not enough to certify a 1–2 point margin. Grow the sealed suite
toward hundreds of task clusters before a tight production rollout decision.

## Remaining uncertainty

- Repository tests can be incomplete or permit a superficially passing patch.
  Add mutation strength and invariant checks to high-value fixtures, and retain
  multiple independent assertions.
- Historical commits may be present in model training. Prefer recent/private
  snapshot mutations and held-out variants; never expose the sealed fixture set
  to prompt optimisation.
- Repeated runs from one Codex model are correlated, not independent judges.
  Cluster by task, version the model, and do not overstate effective sample size.
- Some valuable Posts are foundational conventions with no easy sibling task.
  Their soft quality remains uncertain without people; evaluator agents may rank
  them provisionally but cannot make them release evidence.
- Current production telemetry cannot reconstruct the required event trace or
  total tokens. The benchmark needs Codex run/event capture before the proposed
  end-to-end oracle can execute.
- The proposed numerical margins are starting product tolerances. They must be
  frozen before candidate comparison and revisited only when baseline
  variability or business consequences justify a new evaluation version.

## Recommended decision

Adopt the producer-consumer transfer benchmark as the primary Post-optimisation
oracle, and the paired executable task suite as the overall product oracle.
Treat live Confirm/Flag telemetry as cohort discovery and post-rollout
corroboration, not ground truth. Permit evaluator agents only as abstaining,
blinded, evidence-bound secondary graders. This is the strongest agent-only
design that preserves the user's quality floor while allowing aggressive token
optimisation.
