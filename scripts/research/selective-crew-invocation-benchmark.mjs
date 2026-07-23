#!/usr/bin/env node

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(import.meta.url), "../..", "../..");

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function writeText(path, value) {
  writeFileSync(path, value, { mode: 0o600 });
}

function safe(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "case";
}

function pickConfirmedCase(telemetryDir, pattern, strict = true, requireWeak = false) {
  const posts = new Map(readJsonl(join(telemetryDir, "post-inputs.jsonl")).map((row) => [row.caseId, row]));
  const retrievals = readJsonl(join(telemetryDir, "retrieval-inputs.jsonl"));
  const oracles = new Map(readJsonl(join(telemetryDir, "retrieval-oracles.jsonl")).map((row) => [row.caseId, row]));
  for (const retrieval of retrievals) {
    if (!pattern.test(retrieval.situation)) continue;
    const oracle = oracles.get(retrieval.caseId);
    for (const signal of retrieval.resultSignals ?? []) {
      if (strict && (!signal.sameRepo || !signal.multiLeg)) continue;
      if (requireWeak && signal.sameRepo && signal.multiLeg) continue;
      if (!(oracle?.confirmedPostIds ?? []).includes(signal.postId)) continue;
      const post = posts.get(signal.postId);
      if (post) return { retrieval, post, signal };
    }
  }
  throw new Error(`No confirmed telemetry case matched ${pattern}`);
}

function writeCommonFiles(workspace, caseId) {
  mkdirSync(workspace, { recursive: true, mode: 0o700 });
  writeText(join(workspace, ".crew-case-id"), `${caseId}\n`);
  writeText(join(workspace, "crew-query.mjs"), `
import { readFile } from "node:fs/promises";
const caseId = process.env.CREW_CASE_ID;
const base = process.env.CREW_STUB_URL;
const resolvedCaseId = caseId || (await readFile(".crew-case-id", "utf8")).trim();
if (!resolvedCaseId || !base) throw new Error("Crew proxy is not configured");
const response = await fetch(new URL("/query?case=" + encodeURIComponent(resolvedCaseId), base));
if (!response.ok) throw new Error("Crew proxy returned " + response.status);
const body = await response.text();
await import("node:fs/promises").then(({ writeFile }) => writeFile(".crew-called", "called\\n"));
process.stdout.write(body);
`);
  writeText(join(workspace, "verify-answer.mjs"), `
import { readFile } from "node:fs/promises";
const expected = process.argv[2];
const answer = await readFile("answer.txt", "utf8");
process.exit(answer.includes(expected) ? 0 : 1);
`);
}

function writeLocalRefactor(workspace) {
  writeText(join(workspace, "module.mjs"), `
export function oldName(value) { return value.trim().toUpperCase(); }
export const first = oldName(" one ");
export const second = oldName(" two ");
export const third = oldName(" three ");
`);
  writeText(join(workspace, "verify-refactor.mjs"), `
import { readFile } from "node:fs/promises";
const source = await readFile("module.mjs", "utf8");
process.exit(source.includes("oldName") || (source.match(/newName/g) ?? []).length !== 4 ? 1 : 0);
`);
}

function writeLocalConfig(workspace) {
  writeText(join(workspace, "README.md"), "The local service listens on port 4173 and uses the development SQLite database at data/dev.db.\n");
}

function writeRejectsUnrelatedNote(workspace) {
  writeText(join(workspace, "verify-rejects-unrelated-note.mjs"), `
import { readFile } from "node:fs/promises";
const answer = await readFile("answer.txt", "utf8");
process.exit(answer.includes("CONFIGURATOR_TAXONOMY_HANDOFF.md") ? 1 : 0);
`);
}

function prepare(out, telemetryDir, quick = false) {
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const operational = pickConfirmedCase(telemetryDir, /setup|config|configuration|deploy|build|integration|dependency|hosting/i);
  const failure = pickConfirmedCase(telemetryDir, /error|failed|failure|bug|fix|fatal|retry|exception/i);
  const crossOperational = pickConfirmedCase(telemetryDir, /setup|config|configuration|deploy|build|integration|dependency|hosting/i, false, true);
  const explicitRecall = pickConfirmedCase(telemetryDir, /what do we know|known|prior notes|previous|history|recall/i, false);
  const casesRoot = join(out, "cases");
  const cases = [];
  const knowledge = {};
  const addKnowledgeCase = (id, selected, expected) => {
    const workspace = join(casesRoot, id);
    writeCommonFiles(workspace, id);
    knowledge[id] = { title: selected.post.title, body: selected.post.body, environment: selected.post.environment, repo: selected.post.repo };
    cases.push({
      id,
      split: "development",
      workspace_source: workspace,
      prompt: [
        "Write answer.txt with a concise, accurate answer to this real Crew situation.",
        "Do not browse the network. A local Crew proxy is available as `node crew-query.mjs`; use it only if the variant invocation rule says to query.",
        `Situation: ${selected.retrieval.situation}`,
        `Environment: ${selected.retrieval.environment}`,
        `Repository: ${selected.retrieval.repo ?? "(none)"}`,
        "Verify any returned note against the task before relying on it.",
      ].join("\n"),
      checks: [{ name: "answer-contains-confirmed-fact", command: ["node", "verify-answer.mjs", expected] }],
      harmful_check_names: ["answer-contains-confirmed-fact"],
    });
  };
  addKnowledgeCase("confirmed-operational", operational, "config('locales.default')");
  addKnowledgeCase("confirmed-failure", failure, "FlatCompat");
  if (args.includes("--expanded")) {
    addKnowledgeCase("confirmed-cross-operational", crossOperational, "CONFIGURATOR_TAXONOMY_HANDOFF.md");
    writeRejectsUnrelatedNote(join(casesRoot, "confirmed-cross-operational"));
    const crossCase = cases.at(-1);
    crossCase.checks = [{ name: "rejects-unrelated-cross-repo-note", command: ["node", "verify-rejects-unrelated-note.mjs"] }];
    crossCase.harmful_check_names = ["rejects-unrelated-cross-repo-note"];
    addKnowledgeCase("confirmed-recall", explicitRecall, "present/missing");
  }

  const refactor = join(casesRoot, "local-refactor");
  writeCommonFiles(refactor, "local-refactor");
  writeLocalRefactor(refactor);
  cases.push({
    id: "local-refactor",
    split: "development",
    workspace_source: refactor,
    prompt: "Rename the private helper oldName to newName in module.mjs and update all three local call sites. Run verify-refactor.mjs after the edit. The repository contains all information needed.",
    checks: [{ name: "exact-local-refactor", command: ["node", "verify-refactor.mjs"] }],
    harmful_check_names: ["exact-local-refactor"],
  });

  const config = join(casesRoot, "local-config");
  writeCommonFiles(config, "local-config");
  writeLocalConfig(config);
  cases.push({
    id: "local-config",
    split: "development",
    workspace_source: config,
    prompt: "Read the local README.md and write its exact operational values into answer.txt. This is fully answerable from the repository; do not browse the network.",
    checks: [{ name: "exact-local-config", command: ["node", "verify-answer.mjs", "4173"] }],
    harmful_check_names: ["exact-local-config"],
  });

  knowledge["local-refactor"] = { title: "No matching Post", body: "", environment: "", repo: "" };
  knowledge["local-config"] = { title: "No matching Post", body: "", environment: "", repo: "" };

  writeJson(join(out, "knowledge.json"), knowledge);
  const plan = {
    benchmark_id: "crew-selective-invocation-data-derived-v1",
    repetitions: 2,
    baseline_variant: "current-broad",
    noninferiority: {
      success_rate_margin: 0,
      harmful_failure_margin: 0,
      max_baseline_only_pairs: 0,
      minimum_baseline_success_rate: 1,
      minimum_comparable_pairs: 2,
    },
    codex: {
      command: ["/Applications/ChatGPT.app/Contents/Resources/codex"],
      args: ["--skip-git-repo-check"],
      timeout_ms: 300000,
    },
    env: { CREW_STUB_URL: "http://127.0.0.1:43177", CREW_CASE_ID: "" },
    variants: [
      {
        id: "current-broad",
        prompt_prefix: "Follow the current Crew rule: query before retrying an approach that failed and before starting anything non-trivial. For setup, configuration, build, deployment, dependency, and integration work, query before acting. If you query, verify the returned note.",
      },
      {
        id: "evidence-derived",
        prompt_prefix: "Use the evidence-derived candidate: inspect the local repository briefly first; query for explicit recall, opaque failures, or unclear setup/configuration/build/deployment/dependency/integration work. Abstain when the task is fully locally inspectable. If you query, verify the returned note.",
      },
    ],
    cases,
    corpus: {
      candidate_inputs: [join(telemetryDir, "retrieval-inputs.jsonl"), join(telemetryDir, "post-inputs.jsonl")],
      sealed_oracles: [join(telemetryDir, "retrieval-oracles.jsonl"), join(telemetryDir, "post-oracles.jsonl")],
    },
  };
  if (quick) {
    plan.repetitions = 1;
    plan.noninferiority.minimum_comparable_pairs = 1;
    const quickCases = args.includes("--failure")
      ? ["confirmed-failure", "local-refactor"]
      : args.includes("--expanded")
        ? ["confirmed-operational", "confirmed-cross-operational", "confirmed-recall", "local-refactor"]
        : ["confirmed-operational", "local-refactor"];
    plan.cases = plan.cases.filter((item) => quickCases.includes(item.id));
  }
  writeJson(join(out, "plan.json"), plan);
  return { out, plan, operational, failure };
}

function serve(knowledgePath, port) {
  const knowledge = JSON.parse(readFileSync(knowledgePath, "utf8"));
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname !== "/query") {
      response.writeHead(404).end();
      return;
    }
    const item = knowledge[url.searchParams.get("case") ?? ""];
    if (!item) {
      response.writeHead(404).end("unknown benchmark case");
      return;
    }
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end(JSON.stringify(item));
  });
  server.listen(port, "127.0.0.1", () => console.log(`Crew benchmark proxy listening on 127.0.0.1:${port}`));
}

const [command, ...args] = process.argv.slice(2);
if (command === "prepare") {
  const out = resolve(args[args.indexOf("--out") + 1]);
  const telemetry = resolve(args[args.indexOf("--telemetry") + 1]);
  console.log(JSON.stringify(prepare(out, telemetry, args.includes("--quick")), null, 2));
} else if (command === "serve") {
  serve(resolve(args[args.indexOf("--knowledge") + 1]), Number(args[args.indexOf("--port") + 1] ?? 43177));
} else {
  console.log("Usage: node selective-crew-invocation-benchmark.mjs prepare --telemetry DIR --out DIR");
  console.log("       node selective-crew-invocation-benchmark.mjs serve --knowledge FILE --port PORT");
  process.exitCode = command ? 1 : 0;
}
