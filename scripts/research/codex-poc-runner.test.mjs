import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runBenchmarkFixture } from "./codex-poc-runner.mjs";

const FAKE_CODEX = `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const finalIndex = args.indexOf("--output-last-message");
const cwdIndex = args.indexOf("-C");
const finalPath = args[finalIndex + 1];
const workspace = args[cwdIndex + 1];
const failed = process.env.FAKE_FAIL === "1";

console.log(JSON.stringify({ type: "thread.started", thread_id: "thread_fake" }));
console.log(JSON.stringify({ type: "turn.started" }));
console.log(JSON.stringify({
  type: "item.completed",
  item: {
    id: "item_0",
    type: "command_execution",
    command: "write result.txt",
    aggregated_output: failed ? "failed" : "TRACE_OK",
    exit_code: failed ? 1 : 0,
    status: failed ? "failed" : "completed"
  }
}));
if (!failed) {
  writeFileSync(join(workspace, "result.txt"), "TRACE_OK\\n");
  writeFileSync(finalPath, "TRACE_DONE");
  console.log(JSON.stringify({
    type: "item.completed",
    item: { id: "item_1", type: "agent_message", text: "TRACE_DONE" }
  }));
}
console.log(JSON.stringify({
  type: "turn.completed",
  usage: {
    input_tokens: 100,
    cached_input_tokens: 80,
    output_tokens: 20,
    reasoning_output_tokens: 10
  }
}));
console.error(failed ? "fake failure" : "fake warning");
process.exit(failed ? 2 : 0);
`;

function fixture(command, source) {
  return {
    task_id: "fake-task",
    variant_id: "baseline",
    repetitions: 2,
    prompt: "Create the expected result",
    workspace: { source },
    codex: { command, args: [], timeout_ms: 10_000 },
    final: { exact: "TRACE_DONE" },
    checks: [
      {
        name: "result-file",
        command: [
          process.execPath,
          "-e",
          "const fs=require('node:fs'); process.stdout.write(fs.readFileSync('result.txt','utf8'))",
        ],
        stdout: { exact: "TRACE_OK\n" },
      },
    ],
  };
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "crew-codex-runner-test."));
  const template = join(root, "template");
  mkdirSync(template);
  writeFileSync(join(template, "seed.txt"), "seed\n");
  const fake = join(root, "fake-codex.mjs");
  writeFileSync(fake, FAKE_CODEX);
  chmodSync(fake, 0o700);
  return { root, template, fake };
}

test("runs repeated disposable traces and reports exact outcome and variance", () => {
  const { root, template, fake } = setup();
  try {
    const outputRoot = join(root, "evidence");
    const result = runBenchmarkFixture(
      fixture([process.execPath, fake], template),
      { outputRoot, fixtureBase: root, fixtureText: "{}" },
    );

    assert.equal(result.summary.runs, 2);
    assert.equal(result.summary.successful_runs, 2);
    assert.equal(result.summary.success_rate, 1);
    assert.equal(result.summary.run_variance.total_tokens.median, 120);
    assert.equal(result.summary.run_variance.model_visible_tool_calls.median, 1);
    assert.equal(result.runs[0].outcome.executable_checks[0].passed, true);
    assert.equal(result.runs[0].trace.analysis.errors.count, 0);
    assert.match(result.runs[0].trace.sha256, /^[a-f0-9]{64}$/);
    assert.equal(existsSync(join(template, "result.txt")), false);
    assert.equal(existsSync(join(outputRoot, "summary.json")), true);
    assert.equal(
      existsSync(join(outputRoot, "fake-task__baseline__r01", "trace.jsonl")),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("records Codex and step failure without treating it as a successful outcome", () => {
  const { root, template, fake } = setup();
  try {
    const broken = fixture([process.execPath, fake], template);
    broken.repetitions = 1;
    broken.env = { FAKE_FAIL: "1" };
    broken.checks = [];
    const result = runBenchmarkFixture(broken, {
      outputRoot: join(root, "failure-evidence"),
      fixtureBase: root,
    });

    assert.equal(result.summary.successful_runs, 0);
    assert.equal(result.runs[0].codex.exit_code, 2);
    assert.equal(result.runs[0].trace.analysis.errors.count, 1);
    assert.equal(result.runs[0].outcome.final.passed, false);
    const resolved = readFileSync(
      join(root, "failure-evidence", "fixture.resolved.json"),
      "utf8",
    );
    assert.doesNotMatch(resolved, /FAKE_FAIL": "1/);
    assert.match(resolved, /FAKE_FAIL": "<redacted>"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects runner-owned Codex arguments", () => {
  const { root, template, fake } = setup();
  try {
    const invalid = fixture([process.execPath, fake], template);
    invalid.codex.args = ["--json"];
    assert.throws(
      () =>
        runBenchmarkFixture(invalid, {
          outputRoot: join(root, "invalid-evidence"),
          fixtureBase: root,
        }),
      /runner-owned --json/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
