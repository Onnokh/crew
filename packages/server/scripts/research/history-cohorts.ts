import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { taskBands, taskFingerprint } from "./task-fingerprint.js";

type Client = "codex" | "claude";

type SessionTrace = {
  client: Client;
  sourcePath: string;
  sessionId: string;
  cwd: string;
  startedAt: number;
  endedAt: number;
  firstTask: string;
  userTurns: number;
  toolSequence: string[];
  toolErrors: number;
  testCalls: number;
  testFailures: number;
  finalResponse: boolean;
  totalTokens: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

type CrewCase = {
  caseId: string;
  split: string;
  taskFingerprint: string;
  taskBands: string[];
};

function hmac(salt: string, kind: string, value: string): string {
  return createHmac("sha256", salt).update(`${kind}\0${value}`).digest("hex");
}

function jsonLines(root: string, skipSubagents = false): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) {
        if (skipSubagents && entry.name === "subagents") continue;
        visit(child);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        result.push(child);
      }
    }
  };
  visit(root);
  return result.sort();
}

function gitRemote(path: string): string | null {
  try {
    return execFileSync("git", ["-C", path, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function discoverIndiciaRepos(root: string, maxDepth = 3): Array<{ root: string; remote: string }> {
  const repos: Array<{ root: string; remote: string }> = [];
  const visit = (path: string, depth: number): void => {
    if (depth > maxDepth || !existsSync(path)) return;
    if (existsSync(resolve(path, ".git"))) {
      const remote = gitRemote(path);
      if (remote?.includes("git.indicia")) repos.push({ root: path, remote });
    }
    if (depth === maxDepth) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (!entry.isDirectory() || [".git", "node_modules", ".next", "vendor"].includes(entry.name)) {
        continue;
      }
      visit(resolve(path, entry.name), depth + 1);
    }
  };
  visit(resolve(root), 0);
  return repos.sort((a, b) => b.root.length - a.root.length);
}

function repoForCwd(
  cwd: string,
  repos: ReadonlyArray<{ root: string; remote: string }>,
): { root: string; remote: string } | null {
  const absolute = resolve(cwd);
  return (
    repos.find((repo) => {
      const child = relative(repo.root, absolute);
      return child === "" || (!child.startsWith("..") && !isAbsolute(child));
    }) ?? null
  );
}

function toolFamily(name: string, argumentsValue?: unknown): string {
  const lower = name.toLowerCase();
  if (lower.includes("crew") || ["query", "post", "confirm", "flag"].includes(lower)) {
    if (lower.includes("confirm")) return "crew.confirm";
    if (lower.includes("flag")) return "crew.flag";
    if (lower.includes("post")) return "crew.post";
    if (lower.includes("query")) return "crew.query";
  }
  if (lower.includes("linear")) return "issue.linear";
  if (lower.includes("browser") || lower.includes("playwright")) return "browser";
  if (lower.includes("askuser") || lower.includes("request_user")) return "human.prompt";
  if (lower === "agent" || lower.includes("spawn_agent") || lower.includes("taskcreate")) {
    return "agent.spawn";
  }
  if (lower === "wait" || lower.includes("wait_agent")) return "agent.wait";
  if (lower === "skill" || lower.includes("skill")) return "skill";
  if (lower.includes("apply_patch") || lower.includes("write") || lower.includes("edit")) {
    return "file.write";
  }
  if (lower.includes("read") || lower.includes("glob") || lower.includes("grep")) return "file.read";
  if (
    lower.includes("exec") ||
    lower === "bash" ||
    lower.includes("shell") ||
    lower.includes("terminal")
  ) {
    const serialized =
      typeof argumentsValue === "string" ? argumentsValue : JSON.stringify(argumentsValue ?? "");
    if (/\b(vitest|jest|pytest|phpunit|npm (run )?test|pnpm (run )?test|cargo test)\b/i.test(serialized)) {
      return "shell.test";
    }
    if (/\bgit\s+commit\b/i.test(serialized)) return "git.commit";
    if (/\bgit\s+push\b/i.test(serialized)) return "git.push";
    return "shell";
  }
  if (lower.includes("git")) return "git";
  if (lower.startsWith("mcp") || lower.includes(".mcp.")) return "mcp.other";
  return `other.${lower.replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 48)}`;
}

function taskKind(value: string): string {
  const lower = value.toLowerCase();
  if (/\b(debug\w*|diagnos\w*|bugs?|errors?|fail\w*|fix\w*)\b/.test(lower)) return "debug";
  if (/\b(review\w*|audit\w*|inspect\w*)\b/.test(lower)) return "review";
  if (/\b(research\w*|investigat\w*|find out|look up)\b/.test(lower)) return "research";
  if (/\b(deploy\w*|releas\w*|publish\w*)\b/.test(lower)) return "deploy";
  if (/\b(test\w*|specs?|coverage)\b/.test(lower)) return "test";
  if (/\b(plan\w*|design\w*|architect\w*|strateg\w*)\b/.test(lower)) return "plan";
  if (/\b(build\w*|implement\w*|creat\w*|add\w*|chang\w*|updat\w*|refactor\w*)\b/.test(lower)) return "implementation";
  return "other";
}

function outputFailed(value: unknown): boolean {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return (
    /"isError"\s*:\s*true/i.test(text) ||
    /"exit_code"\s*:\s*[1-9]/i.test(text) ||
    /process exited with code [1-9]/i.test(text)
  );
}

async function parseCodex(path: string): Promise<SessionTrace | null> {
  const trace: SessionTrace = {
    client: "codex",
    sourcePath: path,
    sessionId: basename(path, ".jsonl"),
    cwd: "",
    startedAt: Number.POSITIVE_INFINITY,
    endedAt: 0,
    firstTask: "",
    userTurns: 0,
    toolSequence: [],
    toolErrors: 0,
    testCalls: 0,
    testFailures: 0,
    finalResponse: false,
    totalTokens: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
  };
  const toolsByCall = new Map<string, string>();
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of lines) {
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const timestamp = Date.parse(row.timestamp ?? "");
    if (Number.isFinite(timestamp)) {
      trace.startedAt = Math.min(trace.startedAt, timestamp);
      trace.endedAt = Math.max(trace.endedAt, timestamp);
    }
    if (row.type === "session_meta") {
      trace.cwd = row.payload?.cwd ?? trace.cwd;
      trace.sessionId = row.payload?.id ?? trace.sessionId;
    }
    if (row.type === "event_msg" && row.payload?.type === "user_message") {
      const message = typeof row.payload.message === "string" ? row.payload.message : "";
      if (message !== "") {
        trace.userTurns++;
        if (trace.firstTask === "") trace.firstTask = message;
      }
    }
    if (row.type === "event_msg" && row.payload?.type === "agent_message") {
      trace.finalResponse = true;
    }
    if (row.type === "event_msg" && row.payload?.type === "token_count") {
      const usage = row.payload.info?.total_token_usage;
      if (usage !== undefined) {
        trace.inputTokens = usage.input_tokens ?? trace.inputTokens;
        trace.cachedInputTokens = usage.cached_input_tokens ?? trace.cachedInputTokens;
        trace.outputTokens = usage.output_tokens ?? trace.outputTokens;
        trace.totalTokens = usage.total_tokens ?? trace.totalTokens;
      }
    }
    if (row.type === "response_item" && /call$/.test(row.payload?.type ?? "")) {
      const family = toolFamily(row.payload?.name ?? "unknown", row.payload?.arguments);
      trace.toolSequence.push(family);
      if (family === "shell.test") trace.testCalls++;
      if (row.payload?.call_id) toolsByCall.set(row.payload.call_id, family);
    }
    if (row.type === "response_item" && /call_output$/.test(row.payload?.type ?? "")) {
      const failed = outputFailed(row.payload?.output);
      if (failed) {
        trace.toolErrors++;
        if (toolsByCall.get(row.payload?.call_id) === "shell.test") trace.testFailures++;
      }
    }
  }
  if (
    trace.cwd === "" ||
    trace.firstTask === "" ||
    !Number.isFinite(trace.startedAt) ||
    trace.endedAt === 0
  ) {
    return null;
  }
  return trace;
}

function claudeText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

async function parseClaude(path: string): Promise<SessionTrace | null> {
  const trace: SessionTrace = {
    client: "claude",
    sourcePath: path,
    sessionId: basename(path, ".jsonl"),
    cwd: "",
    startedAt: Number.POSITIVE_INFINITY,
    endedAt: 0,
    firstTask: "",
    userTurns: 0,
    toolSequence: [],
    toolErrors: 0,
    testCalls: 0,
    testFailures: 0,
    finalResponse: false,
    totalTokens: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
  };
  const toolsByCall = new Map<string, string>();
  const usageByRequest = new Map<
    string,
    { input: number; cached: number; output: number }
  >();
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of lines) {
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    trace.cwd ||= row.cwd ?? "";
    trace.sessionId = row.sessionId ?? trace.sessionId;
    const timestamp = Date.parse(row.timestamp ?? "");
    if (Number.isFinite(timestamp)) {
      trace.startedAt = Math.min(trace.startedAt, timestamp);
      trace.endedAt = Math.max(trace.endedAt, timestamp);
    }
    if (row.type === "user") {
      const message = claudeText(row.message?.content);
      if (message !== "") {
        trace.userTurns++;
        if (trace.firstTask === "") trace.firstTask = message;
      }
      for (const item of Array.isArray(row.message?.content) ? row.message.content : []) {
        if (item?.type === "tool_result" && item.is_error === true) {
          trace.toolErrors++;
          if (toolsByCall.get(item.tool_use_id) === "shell.test") trace.testFailures++;
        }
      }
    }
    if (row.type === "assistant") {
      const content = Array.isArray(row.message?.content) ? row.message.content : [];
      if (content.some((item: any) => item?.type === "text" && item.text?.trim() !== "")) {
        trace.finalResponse = true;
      }
      for (const item of content) {
        if (item?.type !== "tool_use") continue;
        const family = toolFamily(item.name ?? "unknown", item.input);
        trace.toolSequence.push(family);
        if (family === "shell.test") trace.testCalls++;
        if (item.id) toolsByCall.set(item.id, family);
      }
      const usage = row.message?.usage;
      if (usage !== undefined) {
        const requestId = row.requestId ?? row.uuid;
        usageByRequest.set(requestId, {
          input: usage.input_tokens ?? 0,
          cached: (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
          output: usage.output_tokens ?? 0,
        });
      }
    }
  }
  if (
    trace.cwd === "" ||
    trace.firstTask === "" ||
    !Number.isFinite(trace.startedAt) ||
    trace.endedAt === 0
  ) {
    return null;
  }
  trace.inputTokens = [...usageByRequest.values()].reduce((sum, usage) => sum + usage.input, 0);
  trace.cachedInputTokens = [...usageByRequest.values()].reduce(
    (sum, usage) => sum + usage.cached,
    0,
  );
  trace.outputTokens = [...usageByRequest.values()].reduce((sum, usage) => sum + usage.output, 0);
  trace.totalTokens = trace.inputTokens + trace.cachedInputTokens + trace.outputTokens;
  return trace;
}

function readCrewCases(path: string | undefined): CrewCase[] {
  if (path === undefined || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CrewCase);
}

function bandOverlap(a: readonly string[], b: readonly string[]): number {
  return a.reduce((count, band, index) => count + (band === b[index] ? 1 : 0), 0);
}

function writeJsonl(path: string, rows: ReadonlyArray<Record<string, unknown>>): void {
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

type HistoryOptions = {
  codexRoots: string[];
  claudeRoot: string;
  repoSearchRoots: string[];
  crewInputs?: string;
  out: string;
  salt: string;
  splitAt: number;
};

export async function buildHistoryCohorts(options: HistoryOptions): Promise<Record<string, unknown>> {
  if (options.salt.length < 16) throw new Error("salt must contain at least 16 characters");
  const repos = options.repoSearchRoots.flatMap((root) => discoverIndiciaRepos(root));
  const dedupedRepos = [...new Map(repos.map((repo) => [repo.root, repo])).values()];
  const codexFiles = options.codexRoots.flatMap((root) => jsonLines(root));
  const claudeFiles = jsonLines(options.claudeRoot, true);
  const crewCases = readCrewCases(options.crewInputs);
  const traces: SessionTrace[] = [];
  for (const file of codexFiles) {
    const trace = await parseCodex(file);
    if (trace !== null && repoForCwd(trace.cwd, dedupedRepos) !== null) traces.push(trace);
  }
  for (const file of claudeFiles) {
    const trace = await parseClaude(file);
    if (trace !== null && repoForCwd(trace.cwd, dedupedRepos) !== null) traces.push(trace);
  }

  const inputs: Array<Record<string, unknown>> = [];
  const oracles: Array<Record<string, unknown>> = [];
  const seenSessionIds = new Set<string>();
  let skippedDuplicateFiles = 0;
  for (const trace of traces.sort((a, b) => a.startedAt - b.startedAt || a.sessionId.localeCompare(b.sessionId))) {
    const repo = repoForCwd(trace.cwd, dedupedRepos)!;
    const sessionKey = `${trace.client}:${trace.sessionId}`;
    if (seenSessionIds.has(sessionKey)) {
      skippedDuplicateFiles++;
      continue;
    }
    seenSessionIds.add(sessionKey);
    const caseId = hmac(options.salt, "history-session", sessionKey).slice(0, 20);
    const fingerprint = taskFingerprint(options.salt, trace.firstTask);
    const bands = taskBands(options.salt, trace.firstTask);
    const exactCrew = crewCases.filter((crewCase) => crewCase.taskFingerprint === fingerprint);
    const nearCrew = exactCrew.length > 0
      ? []
      : crewCases.filter((crewCase) => bandOverlap(crewCase.taskBands, bands) >= 6);
    const overlap = exactCrew.length > 0 ? "exact" : nearCrew.length > 0 ? "near" : null;
    const matchedCrew = exactCrew.length > 0 ? exactCrew : nearCrew;
    const split =
      matchedCrew[0]?.split ??
      (trace.startedAt < options.splitAt ? "development" : "evaluation");
    const cohorts = [
      "git_indicia",
      trace.client,
      overlap === null ? "history_only" : `crew_${overlap}_overlap`,
    ];
    inputs.push({
      caseId,
      split,
      client: trace.client,
      startedAt: trace.startedAt,
      repoId: hmac(options.salt, "repo", repo.remote).slice(0, 20),
      taskKind: taskKind(trace.firstTask),
      taskLength: trace.firstTask.length,
      userTurns: trace.userTurns,
      taskFingerprint: fingerprint,
      taskBands: bands,
      crewOverlap: overlap,
      crewCaseIds: matchedCrew.map((crewCase) => crewCase.caseId).sort(),
      cohorts,
    });
    const crewCalls = trace.toolSequence.filter((tool) => tool.startsWith("crew."));
    oracles.push({
      caseId,
      sourceFingerprint: hmac(
        options.salt,
        "source-file",
        createHash("sha256").update(readFileSync(trace.sourcePath)).digest("hex"),
      ).slice(0, 20),
      endedAt: trace.endedAt,
      toolSequence: trace.toolSequence,
      toolCalls: trace.toolSequence.length,
      toolErrors: trace.toolErrors,
      testCalls: trace.testCalls,
      testFailures: trace.testFailures,
      finalResponse: trace.finalResponse,
      crewCalls: {
        query: crewCalls.filter((tool) => tool === "crew.query").length,
        post: crewCalls.filter((tool) => tool === "crew.post").length,
        confirm: crewCalls.filter((tool) => tool === "crew.confirm").length,
        flag: crewCalls.filter((tool) => tool === "crew.flag").length,
      },
      tokens: {
        input: trace.inputTokens,
        cachedInput: trace.cachedInputTokens,
        output: trace.outputTokens,
        total: trace.totalTokens,
      },
      outcome: trace.finalResponse && trace.toolErrors === 0 ? "completed_without_observed_tool_error" : "indeterminate",
      cohorts: [
        trace.toolSequence.some((tool) => tool === "crew.query") ? "crew_query_called" : "crew_query_skipped",
        trace.testCalls > 0 ? "executable_check_observed" : "no_executable_check_observed",
        trace.toolErrors > 0 ? "tool_error_observed" : "no_tool_error_observed",
      ],
    });
  }

  mkdirSync(options.out, { recursive: true });
  writeJsonl(resolve(options.out, "history-inputs.jsonl"), inputs);
  writeJsonl(resolve(options.out, "history-oracles.jsonl"), oracles);
  const manifest = {
    schemaVersion: 1,
    policy: "git-indicia-agent-history-cohorts-v1",
    sources: {
      clients: ["codex", "claude"],
      selectedBy: "session cwd contained by a local repository whose origin includes git.indicia",
      rawFilesReadOnly: true,
      rawTextEmitted: false,
      subagentFilesExcluded: true,
    },
    privacy: {
      identifiers: "HMAC-SHA256 pseudonyms; salt is not written",
      taskTextIncluded: false,
      toolArgumentsIncluded: false,
      toolOutputsIncluded: false,
      pathsIncluded: false,
      remotesIncluded: false,
    },
    leakageControls: [
      "History inputs and observed tool/outcome traces are separate files.",
      "Exact and keyed-band near duplicates inherit the matching Crew case split.",
      "Overlapping Crew/history cases are one provenance group, never independent observations.",
      "Candidate strategies must not read history-oracles.jsonl.",
      "History completion is not a product-quality label; executable checks are observational signals only.",
    ],
    counts: {
      indiciaRepos: dedupedRepos.length,
      scannedCodexFiles: codexFiles.length,
      scannedClaudeFiles: claudeFiles.length,
      selectedSessions: inputs.length,
      skippedDuplicateFiles,
      byClient: {
        codex: inputs.filter((row) => row.client === "codex").length,
        claude: inputs.filter((row) => row.client === "claude").length,
      },
      crewOverlap: {
        exact: inputs.filter((row) => row.crewOverlap === "exact").length,
        near: inputs.filter((row) => row.crewOverlap === "near").length,
      },
      crewInvocation: {
        queryCalled: oracles.filter((row) =>
          (row.cohorts as string[]).includes("crew_query_called"),
        ).length,
        querySkipped: oracles.filter((row) =>
          (row.cohorts as string[]).includes("crew_query_skipped"),
        ).length,
      },
    },
  };
  writeFileSync(resolve(options.out, "history-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function parseArgs(argv: readonly string[]): Map<string, string[]> {
  const values = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value, got ${key ?? "<end>"}`);
    }
    const name = key.slice(2);
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  return values;
}

async function runCli(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const one = (name: string): string => {
    const value = args.get(name)?.[0];
    if (value === undefined) throw new Error(`Missing --${name}`);
    return value;
  };
  const manifest = await buildHistoryCohorts({
    codexRoots: args.get("codex-root") ?? [],
    claudeRoot: one("claude-root"),
    repoSearchRoots: args.get("repo-search-root") ?? [],
    crewInputs: args.get("crew-inputs")?.[0],
    out: resolve(one("out")),
    salt: args.get("salt")?.[0] ?? process.env.CREW_COHORT_SALT ?? "",
    splitAt: Date.parse(one("split-at")),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("history-cohorts.ts")) {
  await runCli(process.argv.slice(2));
}
