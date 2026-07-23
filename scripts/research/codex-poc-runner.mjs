#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { analyzeCodexTrace } from "./codex-token-surface.mjs";

const ARTIFACT_LIMIT = 64 * 1024 * 1024;
const SKIP_COPY_NAMES = new Set([".git", "node_modules", ".DS_Store"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function textEvidence(value = "") {
  const text = String(value);
  return {
    bytes: Buffer.byteLength(text),
    sha256: sha256(text),
  };
}

function writeText(path, value) {
  writeFileSync(path, value, { encoding: "utf8", mode: 0o600 });
}

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "check";
}

function hashTree(root) {
  if (!root || !existsSync(root)) return null;
  const digest = createHash("sha256");
  const walk = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (SKIP_COPY_NAMES.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      const name = relative(root, absolute);
      digest.update(`${entry.isDirectory() ? "d" : "f"}\0${name}\0`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) digest.update(readFileSync(absolute));
    }
  };
  walk(root);
  return digest.digest("hex");
}

function copyWorkspace(source, destination) {
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  if (!source) return;
  cpSync(source, destination, {
    recursive: true,
    filter: (candidate) => !SKIP_COPY_NAMES.has(candidate.split("/").at(-1)),
  });
}

function evaluateText(expectation, actual) {
  if (!expectation) return { passed: true, rule: "none" };
  if (Object.hasOwn(expectation, "exact")) {
    return {
      passed: actual === expectation.exact,
      rule: "exact",
      expected_sha256: sha256(expectation.exact),
    };
  }
  if (Object.hasOwn(expectation, "contains")) {
    return {
      passed: actual.includes(expectation.contains),
      rule: "contains",
      expected_sha256: sha256(expectation.contains),
    };
  }
  if (Object.hasOwn(expectation, "pattern")) {
    return {
      passed: new RegExp(expectation.pattern, expectation.flags ?? "").test(actual),
      rule: "pattern",
      pattern: expectation.pattern,
      flags: expectation.flags ?? "",
    };
  }
  throw new Error("Text expectation must define exact, contains, or pattern");
}

function runChecks(checks, workspace, runDirectory, inheritedEnv) {
  const results = [];
  const checkDirectory = join(runDirectory, "checks");
  mkdirSync(checkDirectory, { recursive: true, mode: 0o700 });

  for (const [index, check] of checks.entries()) {
    if (!Array.isArray(check.command) || check.command.length === 0) {
      throw new Error(`Check ${check.name ?? index} must provide a command array`);
    }
    const started = performance.now();
    const result = spawnSync(check.command[0], check.command.slice(1), {
      cwd: resolve(workspace, check.cwd ?? "."),
      encoding: "utf8",
      env: { ...inheritedEnv, ...(check.env ?? {}) },
      maxBuffer: ARTIFACT_LIMIT,
      timeout: check.timeout_ms ?? 60_000,
    });
    const durationMs = performance.now() - started;
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const label = `${String(index + 1).padStart(2, "0")}-${safeName(check.name ?? "check")}`;
    writeText(join(checkDirectory, `${label}.stdout.txt`), stdout);
    writeText(join(checkDirectory, `${label}.stderr.txt`), stderr);
    const expectedExitCode = check.exit_code ?? 0;
    const stdoutResult = evaluateText(check.stdout, stdout);
    const stderrResult = evaluateText(check.stderr, stderr);
    results.push({
      name: check.name ?? label,
      command: check.command,
      cwd: check.cwd ?? ".",
      exit_code: result.status,
      expected_exit_code: expectedExitCode,
      signal: result.signal ?? null,
      duration_ms: Math.round(durationMs),
      stdout: { ...textEvidence(stdout), ...stdoutResult },
      stderr: { ...textEvidence(stderr), ...stderrResult },
      passed:
        result.status === expectedExitCode && stdoutResult.passed && stderrResult.passed,
      spawn_error: result.error?.message ?? null,
    });
  }
  return results;
}

function numericStats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return {
    count: values.length,
    min: sorted[0],
    median,
    max: sorted.at(-1),
    mean,
    population_stddev: Math.sqrt(variance),
  };
}

function summarizeRuns(runs) {
  const analyzed = runs.filter((run) => run.trace.analysis);
  const usage = (key) =>
    analyzed.map((run) => Number(run.trace.analysis.usage[key] ?? 0));
  return {
    runs: runs.length,
    successful_runs: runs.filter((run) => run.outcome.passed).length,
    success_rate:
      runs.length === 0
        ? 0
        : runs.filter((run) => run.outcome.passed).length / runs.length,
    run_variance: {
      total_tokens: numericStats(usage("total_tokens")),
      input_tokens: numericStats(usage("input_tokens")),
      output_tokens: numericStats(usage("output_tokens")),
      model_visible_tool_calls: numericStats(
        analyzed.map((run) => run.trace.analysis.tools.model_visible_calls),
      ),
      crew_execution_calls: numericStats(
        analyzed.map((run) => run.trace.analysis.tools.crew.execution_calls),
      ),
      duration_ms: numericStats(runs.map((run) => run.codex.duration_ms)),
    },
  };
}

function resolveCommandVersion(command) {
  if (command.length !== 1 || !/(^|\/)codex$/.test(command[0])) return null;
  const result = spawnSync(command[0], ["--version"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function redactedFixture(fixture) {
  return {
    ...fixture,
    env: fixture.env
      ? Object.fromEntries(Object.keys(fixture.env).map((key) => [key, "<redacted>"]))
      : undefined,
    checks: (fixture.checks ?? []).map((check) => ({
      ...check,
      env: check.env
        ? Object.fromEntries(Object.keys(check.env).map((key) => [key, "<redacted>"]))
        : undefined,
    })),
  };
}

function validateFixture(fixture) {
  for (const key of ["task_id", "variant_id", "prompt"]) {
    if (typeof fixture[key] !== "string" || !fixture[key]) {
      throw new Error(`Fixture requires non-empty ${key}`);
    }
  }
  const command = fixture.codex?.command ?? ["codex"];
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error("codex.command must be a non-empty array");
  }
  for (const forbidden of ["--json", "--ephemeral", "--output-last-message", "-C", "--cd"]) {
    if ((fixture.codex?.args ?? []).includes(forbidden)) {
      throw new Error(`codex.args must not include runner-owned ${forbidden}`);
    }
  }
}

export function runBenchmarkFixture(fixture, options = {}) {
  validateFixture(fixture);
  const outputRoot = resolve(options.outputRoot);
  if (existsSync(outputRoot)) {
    throw new Error(`Output directory already exists: ${outputRoot}`);
  }
  mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
  const fixtureBase = resolve(options.fixtureBase ?? process.cwd());
  const workspaceSource = fixture.workspace?.source
    ? resolve(fixtureBase, fixture.workspace.source)
    : null;
  const repetitions = options.repetitions ?? fixture.repetitions ?? 1;
  const repetitionStart = options.repetitionStart ?? 1;
  const command = fixture.codex?.command ?? ["codex"];
  const commandVersion = resolveCommandVersion(command);
  const sourceTreeSha256 = hashTree(workspaceSource);
  writeText(
    join(outputRoot, "fixture.resolved.json"),
    `${JSON.stringify(redactedFixture(fixture), null, 2)}\n`,
  );

  const runs = [];
  for (
    let repetition = repetitionStart;
    repetition < repetitionStart + repetitions;
    repetition += 1
  ) {
    const runId = `${safeName(fixture.task_id)}__${safeName(fixture.variant_id)}__r${String(repetition).padStart(2, "0")}`;
    const runDirectory = join(outputRoot, runId);
    const workspace = join(runDirectory, "workspace");
    mkdirSync(runDirectory, { recursive: false, mode: 0o700 });
    copyWorkspace(workspaceSource, workspace);
    const tracePath = join(runDirectory, "trace.jsonl");
    const stderrPath = join(runDirectory, "codex.stderr.log");
    const finalPath = join(runDirectory, "final.txt");
    const args = [
      ...command.slice(1),
      "exec",
      "--json",
      "--ephemeral",
      "--output-last-message",
      finalPath,
      "-C",
      workspace,
      ...(fixture.codex?.args ?? []),
      fixture.prompt,
    ];
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const result = spawnSync(command[0], args, {
      cwd: workspace,
      encoding: "utf8",
      env: { ...process.env, ...(fixture.env ?? {}) },
      maxBuffer: ARTIFACT_LIMIT,
      timeout: fixture.codex?.timeout_ms ?? 300_000,
    });
    const durationMs = performance.now() - started;
    const trace = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    writeText(tracePath, trace);
    writeText(stderrPath, stderr);
    const finalText = existsSync(finalPath) ? readFileSync(finalPath, "utf8") : "";
    if (!existsSync(finalPath)) writeText(finalPath, finalText);
    else chmodSync(finalPath, 0o600);
    let analysis = null;
    let analysisError = null;
    try {
      analysis = analyzeCodexTrace(trace);
    } catch (error) {
      analysisError = error instanceof Error ? error.message : String(error);
    }
    const checkResults = runChecks(
      fixture.checks ?? [],
      workspace,
      runDirectory,
      process.env,
    );
    const finalResult = evaluateText(fixture.final, finalText);
    const codexPassed = result.status === 0 && !result.error && Boolean(analysis);
    const outcome = {
      passed:
        codexPassed &&
        finalResult.passed &&
        checkResults.every((check) => check.passed),
      codex_passed: codexPassed,
      final: { ...textEvidence(finalText), ...finalResult },
      executable_checks: checkResults,
    };
    const runReport = {
      run_id: runId,
      task_id: fixture.task_id,
      variant_id: fixture.variant_id,
      repetition,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      prompt: textEvidence(fixture.prompt),
      workspace: {
        source_tree_sha256: sourceTreeSha256,
        disposable_copy: true,
      },
      codex: {
        command: command[0],
        version: commandVersion,
        args: fixture.codex?.args ?? [],
        exit_code: result.status,
        signal: result.signal ?? null,
        duration_ms: Math.round(durationMs),
        spawn_error: result.error?.message ?? null,
      },
      trace: {
        ...textEvidence(trace),
        invalid_or_missing_analysis: analysisError,
        analysis,
      },
      stderr: textEvidence(stderr),
      outcome,
    };
    writeText(join(runDirectory, "run.json"), `${JSON.stringify(runReport, null, 2)}\n`);
    runs.push(runReport);
  }

  const summary = {
    schema_version: 1,
    task_id: fixture.task_id,
    variant_id: fixture.variant_id,
    prompt: textEvidence(fixture.prompt),
    fixture_sha256: options.fixtureText ? sha256(options.fixtureText) : null,
    workspace_source_tree_sha256: sourceTreeSha256,
    codex_version: commandVersion,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    ...summarizeRuns(runs),
    run_ids: runs.map((run) => run.run_id),
  };
  writeText(join(outputRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return { summary, runs, outputRoot };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") options.fixture = argv[++index];
    else if (arg === "--out") options.outputRoot = argv[++index];
    else if (arg === "--repetitions") options.repetitions = Number(argv[++index]);
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function usageText() {
  return [
    "Usage:",
    "  node scripts/research/codex-poc-runner.mjs --fixture FIXTURE.json --out DIRECTORY",
    "    [--repetitions N]",
    "",
    "Each repetition gets a disposable workspace copy. Raw Codex JSONL, stderr,",
    "final output, executable-check evidence, a run report, and aggregate variance",
    "are written under the output directory. Production data is never modified.",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.fixture || !options.outputRoot) {
    console.log(usageText());
    process.exitCode = options.help ? 0 : 1;
    return;
  }
  if (options.repetitions !== undefined && (!Number.isInteger(options.repetitions) || options.repetitions < 1)) {
    throw new Error("--repetitions must be a positive integer");
  }
  const fixturePath = resolve(options.fixture);
  const fixtureText = readFileSync(fixturePath, "utf8");
  const fixture = JSON.parse(fixtureText);
  const result = runBenchmarkFixture(fixture, {
    outputRoot: options.outputRoot,
    repetitions: options.repetitions,
    fixtureBase: dirname(fixturePath),
    fixtureText,
  });
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.summary.successful_runs !== result.summary.runs) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
