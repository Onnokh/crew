import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  evaluateBenchmarkRuns,
  runBenchmarkPlan,
} from "./crew-benchmark.mjs";

function fakeRun({
  task = "case-a",
  variant = "baseline",
  repetition = 1,
  passed = true,
  tokens = 100,
  harmfulPassed = true,
}) {
  return {
    task_id: task,
    variant_id: variant,
    repetition,
    outcome: {
      passed,
      executable_checks: [{ name: "no-harm", passed: harmfulPassed }],
    },
    trace: { analysis: { usage: { total_tokens: tokens } } },
  };
}

test("quality regressions block token comparisons", () => {
  const plan = {
    baseline_variant: "baseline",
    variants: [{ id: "baseline" }, { id: "candidate" }],
    cases: [{ id: "case-a", harmful_check_names: ["no-harm"] }],
    noninferiority: {
      success_rate_margin: 0,
      harmful_failure_margin: 0,
      max_baseline_only_pairs: 0,
    },
  };
  const result = evaluateBenchmarkRuns(plan, [
    fakeRun({ variant: "baseline", repetition: 1, tokens: 100 }),
    fakeRun({ variant: "baseline", repetition: 2, tokens: 110 }),
    fakeRun({ variant: "candidate", repetition: 1, tokens: 50 }),
    fakeRun({ variant: "candidate", repetition: 2, tokens: 40, passed: false }),
  ]);
  const candidate = result.variants.find((variant) => variant.variant_id === "candidate");
  assert.equal(candidate.noninferior, false);
  assert.equal(candidate.accepted_for_token_comparison, false);
  assert.equal(candidate.paired_total_token_delta, null);
});

test("matching failures are not accepted as non-inferior evidence", () => {
  const plan = {
    baseline_variant: "baseline",
    variants: [{ id: "baseline" }, { id: "candidate" }],
    cases: [{ id: "case-a", harmful_check_names: ["no-harm"] }],
  };
  const result = evaluateBenchmarkRuns(plan, [
    fakeRun({ variant: "baseline", passed: false }),
    fakeRun({ variant: "candidate", passed: false }),
  ]);
  const candidate = result.variants.find((variant) => variant.variant_id === "candidate");
  assert.equal(candidate.benchmark_valid, false);
  assert.equal(candidate.noninferior, false);
  assert.equal(candidate.paired_total_token_delta, null);
});

test("non-inferior candidates are compared with paired token deltas", () => {
  const plan = {
    baseline_variant: "baseline",
    variants: [{ id: "baseline" }, { id: "candidate" }],
    cases: [{ id: "case-a", harmful_check_names: ["no-harm"] }],
  };
  const result = evaluateBenchmarkRuns(plan, [
    fakeRun({ variant: "baseline", repetition: 1, tokens: 100 }),
    fakeRun({ variant: "baseline", repetition: 2, tokens: 120 }),
    fakeRun({ variant: "candidate", repetition: 1, tokens: 80 }),
    fakeRun({ variant: "candidate", repetition: 2, tokens: 90 }),
  ]);
  const candidate = result.variants.find((variant) => variant.variant_id === "candidate");
  assert.equal(candidate.noninferior, true);
  assert.deepEqual(candidate.paired_total_token_delta, {
    count: 2,
    min: -30,
    median: -25,
    max: -20,
    mean: -25,
  });
});

test("sealed oracles cannot be copied into an agent workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "crew-benchmark-oracle-"));
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  writeFileSync(join(workspace, "seed.txt"), "seed\n");
  const oracle = join(root, "oracle.jsonl");
  writeFileSync(oracle, "{}\n");
  assert.throws(
    () =>
      runBenchmarkPlan(
        {
          benchmark_id: "leak",
          variants: [{ id: "baseline" }],
          cases: [
            {
              id: "case-a",
              workspace_source: workspace,
              prompt: "test",
              resources: [{ source: oracle, destination: "oracle.jsonl" }],
            },
          ],
          corpus: { sealed_oracles: [oracle] },
        },
        { outputRoot: join(root, "out"), planBase: root },
      ),
    /sealed oracle/,
  );
});

test("disposable resources may mutate while their source remains unchanged", () => {
  const root = mkdtempSync(join(tmpdir(), "crew-benchmark-plan-"));
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  writeFileSync(join(workspace, "seed.txt"), "seed\n");
  const sourceDb = join(root, "team.db");
  writeFileSync(sourceDb, "immutable-production-evidence\n");
  const fakeCodex = join(root, "fake-codex.mjs");
  writeFileSync(
    fakeCodex,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
const finalIndex = process.argv.indexOf("--output-last-message") + 1;
writeFileSync(process.argv[finalIndex], "done\\n");
const variant = process.env.CREW_VARIANT_ID;
const tokens = variant === "candidate" ? 80 : 100;
process.stdout.write(JSON.stringify({type:"thread.started",thread_id:"fake"})+"\\n");
process.stdout.write(JSON.stringify({type:"turn.completed",usage:{input_tokens:tokens-10,cached_input_tokens:0,output_tokens:10}})+"\\n");
`,
    { mode: 0o755 },
  );
  const plan = {
    benchmark_id: "disposable-smoke",
    repetitions: 2,
    baseline_variant: "baseline",
    codex: { command: [process.execPath, fakeCodex], timeout_ms: 10_000 },
    variants: [{ id: "baseline" }, { id: "candidate" }],
    cases: [
      {
        id: "case-a",
        workspace_source: workspace,
        prompt: "finish the fixture",
        resources: [{ source: sourceDb, destination: "data/team.db", label: "team.db" }],
        setup: [
          {
            name: "mutate disposable database",
            command: [
              process.execPath,
              "-e",
              "require('fs').appendFileSync('data/team.db','local-only-mutation\\n')",
            ],
          },
        ],
        preconditions: [
          {
            name: "local mutation is visible",
            command: [
              process.execPath,
              "-e",
              "process.exit(require('fs').readFileSync('data/team.db','utf8').includes('local-only-mutation')?0:1)",
            ],
          },
        ],
        final: { exact: "done\n" },
      },
    ],
  };
  const result = runBenchmarkPlan(plan, {
    outputRoot: join(root, "out"),
    planBase: root,
  });
  assert.equal(readFileSync(sourceDb, "utf8"), "immutable-production-evidence\n");
  assert.equal(result.runs.length, 4);
  assert.equal(result.runs.every((run) => run.outcome.passed), true);
  assert.deepEqual(
    result.report.schedule.map((entry) => entry.variant_order),
    [
      ["baseline", "candidate"],
      ["candidate", "baseline"],
    ],
  );
  const preparation = result.report.cases[0].preparation;
  assert.equal(preparation.resources[0].immutable_source_unchanged, true);
  assert.equal(preparation.resources[0].prepared_copy_mutated, true);
  const candidate = result.report.evaluation.variants.find(
    (variant) => variant.variant_id === "candidate",
  );
  assert.equal(candidate.noninferior, true);
  assert.equal(candidate.paired_total_token_delta.median, -20);
});
