#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runBenchmarkFixture } from "./codex-poc-runner.mjs";

const ARTIFACT_LIMIT = 64 * 1024 * 1024;
const SKIP_COPY_NAMES = new Set([".git", "node_modules", ".DS_Store"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileEvidence(path) {
  const contents = readFileSync(path);
  return {
    label: path.split("/").at(-1),
    bytes: contents.length,
    sha256: sha256(contents),
  };
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "case";
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function resolveFrom(base, value) {
  return resolve(base, value);
}

function copyWorkspace(source, destination) {
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  cpSync(source, destination, {
    recursive: true,
    filter: (candidate) => !SKIP_COPY_NAMES.has(candidate.split("/").at(-1)),
  });
}

function runEvidence(command, cwd, inheritedEnv = {}) {
  if (!Array.isArray(command.command) || command.command.length === 0) {
    throw new Error(`Command ${command.name ?? "<unnamed>"} must be a non-empty array`);
  }
  const started = performance.now();
  const result = spawnSync(command.command[0], command.command.slice(1), {
    cwd: resolve(cwd, command.cwd ?? "."),
    encoding: "utf8",
    env: { ...process.env, ...inheritedEnv, ...(command.env ?? {}) },
    maxBuffer: ARTIFACT_LIMIT,
    timeout: command.timeout_ms ?? 60_000,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const expectedExitCode = command.exit_code ?? 0;
  const expectedStdout = command.stdout?.exact;
  const expectedContains = command.stdout?.contains;
  const stdoutPassed =
    expectedStdout !== undefined
      ? stdout === expectedStdout
      : expectedContains !== undefined
        ? stdout.includes(expectedContains)
        : true;
  return {
    name: command.name ?? command.command.join(" "),
    command: command.command,
    cwd: command.cwd ?? ".",
    exit_code: result.status,
    expected_exit_code: expectedExitCode,
    duration_ms: Math.round(performance.now() - started),
    stdout: {
      bytes: Buffer.byteLength(stdout),
      sha256: sha256(stdout),
      passed: stdoutPassed,
    },
    stderr: {
      bytes: Buffer.byteLength(stderr),
      sha256: sha256(stderr),
    },
    spawn_error: result.error?.message ?? null,
    passed: result.status === expectedExitCode && stdoutPassed && !result.error,
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function numericSummary(values) {
  if (values.length === 0) return null;
  return {
    count: values.length,
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function runKey(run) {
  return `${run.task_id}\0${run.repetition}`;
}

function totalTokens(run) {
  const value = run.trace?.analysis?.usage?.total_tokens;
  return Number.isFinite(value) ? Number(value) : null;
}

function harmfulFailures(run, caseById) {
  const harmfulNames = new Set(caseById.get(run.task_id)?.harmful_check_names ?? []);
  return (run.outcome?.executable_checks ?? []).filter(
    (check) => harmfulNames.has(check.name) && !check.passed,
  ).length;
}

export function evaluateBenchmarkRuns(plan, runs) {
  const baselineId = plan.baseline_variant ?? "baseline";
  const caseById = new Map(plan.cases.map((item) => [item.id, item]));
  const byVariant = new Map();
  for (const run of runs) {
    const variantRuns = byVariant.get(run.variant_id) ?? [];
    variantRuns.push(run);
    byVariant.set(run.variant_id, variantRuns);
  }
  const baselineRuns = byVariant.get(baselineId);
  if (!baselineRuns?.length) throw new Error(`No runs found for baseline variant ${baselineId}`);
  const baselineByKey = new Map(baselineRuns.map((run) => [runKey(run), run]));
  const successMargin = plan.noninferiority?.success_rate_margin ?? 0;
  const harmfulMargin = plan.noninferiority?.harmful_failure_margin ?? 0;
  const maxBaselineOnly = plan.noninferiority?.max_baseline_only_pairs ?? 0;
  const minimumBaselineSuccessRate =
    plan.noninferiority?.minimum_baseline_success_rate ?? 1;
  const minimumComparablePairs =
    plan.noninferiority?.minimum_comparable_pairs ?? 1;
  const variants = [];

  for (const variant of plan.variants) {
    const variantRuns = byVariant.get(variant.id) ?? [];
    const pairs = variantRuns
      .map((candidate) => ({ baseline: baselineByKey.get(runKey(candidate)), candidate }))
      .filter((pair) => pair.baseline !== undefined);
    const baselineSuccesses = pairs.filter((pair) => pair.baseline.outcome.passed).length;
    const candidateSuccesses = pairs.filter((pair) => pair.candidate.outcome.passed).length;
    const baselineOnly = pairs.filter(
      (pair) => pair.baseline.outcome.passed && !pair.candidate.outcome.passed,
    ).length;
    const candidateOnly = pairs.filter(
      (pair) => !pair.baseline.outcome.passed && pair.candidate.outcome.passed,
    ).length;
    const bothPass = pairs.filter(
      (pair) => pair.baseline.outcome.passed && pair.candidate.outcome.passed,
    );
    const tokenDeltas = bothPass
      .map((pair) => {
        const baselineTokens = totalTokens(pair.baseline);
        const candidateTokens = totalTokens(pair.candidate);
        return baselineTokens === null || candidateTokens === null
          ? null
          : candidateTokens - baselineTokens;
      })
      .filter((value) => value !== null);
    const baselineHarm = pairs.reduce(
      (sum, pair) => sum + harmfulFailures(pair.baseline, caseById),
      0,
    );
    const candidateHarm = pairs.reduce(
      (sum, pair) => sum + harmfulFailures(pair.candidate, caseById),
      0,
    );
    const baselineRate = pairs.length === 0 ? 0 : baselineSuccesses / pairs.length;
    const candidateRate = pairs.length === 0 ? 0 : candidateSuccesses / pairs.length;
    const benchmarkValid =
      baselineRate >= minimumBaselineSuccessRate &&
      bothPass.length >= minimumComparablePairs;
    const noninferior =
      benchmarkValid &&
      candidateRate + successMargin >= baselineRate &&
      candidateHarm <= baselineHarm + harmfulMargin &&
      baselineOnly <= maxBaselineOnly;
    variants.push({
      variant_id: variant.id,
      paired_runs: pairs.length,
      outcome_pairs: {
        both_pass: bothPass.length,
        baseline_only: baselineOnly,
        candidate_only: candidateOnly,
        both_fail: pairs.length - bothPass.length - baselineOnly - candidateOnly,
      },
      success_rate: candidateRate,
      success_rate_delta: candidateRate - baselineRate,
      harmful_failures: candidateHarm,
      harmful_failure_delta: candidateHarm - baselineHarm,
      benchmark_valid: benchmarkValid,
      noninferior,
      accepted_for_token_comparison: noninferior,
      paired_total_token_delta: noninferior ? numericSummary(tokenDeltas) : null,
    });
  }

  return {
    baseline_variant: baselineId,
    policy: {
      quality_first: true,
      token_comparison_requires_noninferiority: true,
      success_rate_margin: successMargin,
      harmful_failure_margin: harmfulMargin,
      max_baseline_only_pairs: maxBaselineOnly,
      minimum_baseline_success_rate: minimumBaselineSuccessRate,
      minimum_comparable_pairs: minimumComparablePairs,
    },
    variants,
  };
}

function validatePlan(plan, planBase) {
  if (!plan.benchmark_id || !Array.isArray(plan.variants) || !Array.isArray(plan.cases)) {
    throw new Error("Plan requires benchmark_id, variants, and cases");
  }
  const ids = new Set(plan.variants.map((variant) => variant.id));
  if (!ids.has(plan.baseline_variant ?? "baseline")) {
    throw new Error("baseline_variant must name a declared variant");
  }
  const sealed = new Set(
    (plan.corpus?.sealed_oracles ?? []).map((path) => resolveFrom(planBase, path)),
  );
  for (const item of plan.cases) {
    if (!item.id || !item.workspace_source || !item.prompt) {
      throw new Error("Every case requires id, workspace_source, and prompt");
    }
    for (const resource of item.resources ?? []) {
      if (sealed.has(resolveFrom(planBase, resource.source))) {
        throw new Error(`Case ${item.id} attempts to expose a sealed oracle as a resource`);
      }
    }
  }
  const repetitions = plan.repetitions ?? 1;
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error("repetitions must be a positive integer");
  }
}

function prepareCase(planBase, outputRoot, item, inheritedEnv = {}) {
  const preparedRoot = join(outputRoot, "prepared", safeName(item.id));
  copyWorkspace(resolveFrom(planBase, item.workspace_source), preparedRoot);
  const resources = [];

  for (const resource of item.resources ?? []) {
    const source = resolveFrom(planBase, resource.source);
    const sourceBefore = fileEvidence(source);
    const destination = resolve(preparedRoot, resource.destination);
    const relativeDestination = relative(preparedRoot, destination);
    if (relativeDestination.startsWith("..") || relativeDestination === "") {
      throw new Error(`Resource destination must be inside the workspace: ${resource.destination}`);
    }
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    copyFileSync(source, destination);
    chmodSync(destination, 0o600);
    resources.push({ resource, source, destination, sourceBefore });
  }

  const setup = (item.setup ?? []).map((command) =>
    runEvidence(command, preparedRoot, inheritedEnv),
  );
  if (setup.some((result) => !result.passed)) {
    throw new Error(`Setup failed for case ${item.id}`);
  }
  const preconditions = (item.preconditions ?? []).map((command) =>
    runEvidence(command, preparedRoot, inheritedEnv),
  );
  if (preconditions.some((result) => !result.passed)) {
    throw new Error(`Precondition failed for case ${item.id}`);
  }

  const resourceEvidence = resources.map(({ resource, source, destination, sourceBefore }) => {
    const sourceAfter = fileEvidence(source);
    if (sourceAfter.sha256 !== sourceBefore.sha256) {
      throw new Error(`Immutable resource changed during setup: ${resource.source}`);
    }
    return {
      label: resource.label ?? sourceBefore.label,
      destination: resource.destination,
      immutable_source_unchanged: true,
      source: sourceBefore,
      prepared_copy: fileEvidence(destination),
      prepared_copy_mutated: fileEvidence(destination).sha256 !== sourceBefore.sha256,
    };
  });
  writeJson(join(preparedRoot, ".benchmark-preconditions.json"), {
    case_id: item.id,
    setup,
    preconditions,
    resources: resourceEvidence,
  });
  return { preparedRoot, setup, preconditions, resources: resourceEvidence };
}

function corpusEvidence(plan, planBase) {
  const describe = (paths) =>
    (paths ?? []).map((path) => fileEvidence(resolveFrom(planBase, path)));
  return {
    candidate_inputs: describe(plan.corpus?.candidate_inputs),
    sealed_oracles: describe(plan.corpus?.sealed_oracles),
    isolation:
      "Only candidate_inputs may be used to construct cases. Sealed oracles are hashed before runs and never copied into agent workspaces.",
  };
}

export function runBenchmarkPlan(plan, options = {}) {
  const planBase = resolve(options.planBase ?? process.cwd());
  validatePlan(plan, planBase);
  const outputRoot = resolve(options.outputRoot);
  if (existsSync(outputRoot)) throw new Error(`Output directory already exists: ${outputRoot}`);
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  mkdirSync(join(outputRoot, "prepared"), { recursive: true, mode: 0o700 });
  mkdirSync(join(outputRoot, "runs"), { recursive: true, mode: 0o700 });

  const corpusBefore = corpusEvidence(plan, planBase);
  const preparations = new Map(
    plan.cases.map((item) => [
      item.id,
      prepareCase(planBase, outputRoot, item, plan.env),
    ]),
  );
  const allRuns = [];
  const schedule = [];
  for (const item of plan.cases) {
    const prepared = preparations.get(item.id);
    const repetitions = plan.repetitions ?? 1;
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const offset = (repetition - 1) % plan.variants.length;
      const orderedVariants = [
        ...plan.variants.slice(offset),
        ...plan.variants.slice(0, offset),
      ];
      schedule.push({
        case_id: item.id,
        repetition,
        variant_order: orderedVariants.map((variant) => variant.id),
      });
      for (const variant of orderedVariants) {
        const fixture = {
          task_id: item.id,
          variant_id: variant.id,
          prompt: [variant.prompt_prefix, item.prompt, variant.prompt_suffix]
            .filter(Boolean)
            .join("\n\n"),
          workspace: { source: prepared.preparedRoot },
          codex: {
            ...(plan.codex ?? {}),
            ...(variant.codex ?? {}),
          },
          env: { ...(plan.env ?? {}), ...(variant.env ?? {}), CREW_VARIANT_ID: variant.id },
          final: item.final,
          checks: item.checks ?? [],
        };
        const runRoot = join(
          outputRoot,
          "runs",
          safeName(item.id),
          safeName(variant.id),
          `r${String(repetition).padStart(2, "0")}`,
        );
        const result = runBenchmarkFixture(fixture, {
          outputRoot: runRoot,
          fixtureBase: planBase,
          repetitions: 1,
          repetitionStart: repetition,
          fixtureText: JSON.stringify(fixture),
        });
        allRuns.push(...result.runs);
      }
    }
  }
  const corpusAfter = corpusEvidence(plan, planBase);
  if (JSON.stringify(corpusBefore) !== JSON.stringify(corpusAfter)) {
    throw new Error("Candidate inputs or sealed oracles changed during benchmark");
  }
  const evaluation = evaluateBenchmarkRuns(plan, allRuns);
  const report = {
    schema_version: 1,
    benchmark_id: plan.benchmark_id,
    generated_at: new Date().toISOString(),
    repetitions: plan.repetitions ?? 1,
    cases: plan.cases.map((item) => ({
      id: item.id,
      split: item.split ?? "development",
      harmful_check_names: item.harmful_check_names ?? [],
      preparation: preparations.get(item.id),
    })),
    variants: plan.variants.map((variant) => variant.id),
    schedule,
    corpus: corpusBefore,
    evaluation,
  };
  writeJson(join(outputRoot, "benchmark-report.json"), report);
  return { report, runs: allRuns, outputRoot };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan") result.plan = argv[++index];
    else if (arg === "--out") result.outputRoot = argv[++index];
    else if (arg === "--help") result.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.plan || !options.outputRoot) {
    console.log("Usage: node scripts/research/crew-benchmark.mjs --plan PLAN.json --out DIRECTORY");
    process.exitCode = options.help ? 0 : 1;
    return;
  }
  const planPath = resolve(options.plan);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const result = runBenchmarkPlan(plan, {
    outputRoot: options.outputRoot,
    planBase: dirname(planPath),
  });
  console.log(JSON.stringify(result.report.evaluation, null, 2));
  const rejected = result.report.evaluation.variants.some(
    (variant) => variant.variant_id !== result.report.evaluation.baseline_variant && !variant.noninferior,
  );
  if (rejected) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
