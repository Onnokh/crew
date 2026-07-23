import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHistoryCohorts } from "./history-cohorts.js";
import { taskBands, taskFingerprint } from "./task-fingerprint.js";

const SALT = "history-fixture-salt-long-enough";
const TASK = "Fix the build error";
let root: string;

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "crew-history-cohort-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function jsonl(path: string, rows: unknown[]): void {
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

describe("git.indicia history cohort POC", () => {
  it("emits metadata-only Codex and Claude patterns and groups Crew overlaps", async () => {
    const repo = resolve(root, "repos", "demo");
    mkdirSync(repo, { recursive: true });
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", [
      "-C",
      repo,
      "remote",
      "add",
      "origin",
      "git@git.indicia.nl:team/demo.git",
    ]);

    const codexRoot = resolve(root, "codex");
    const claudeRoot = resolve(root, "claude");
    const out = resolve(root, "out");
    mkdirSync(codexRoot);
    mkdirSync(claudeRoot);
    jsonl(resolve(codexRoot, "codex.jsonl"), [
      {
        timestamp: "2026-07-01T10:00:00Z",
        type: "session_meta",
        payload: { id: "codex-session", cwd: repo },
      },
      {
        timestamp: "2026-07-01T10:00:01Z",
        type: "event_msg",
        payload: { type: "user_message", message: TASK },
      },
      {
        timestamp: "2026-07-01T10:00:02Z",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call-1",
          name: "mcp__crew__query",
          arguments: "{}",
        },
      },
      {
        timestamp: "2026-07-01T10:00:03Z",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call-1", output: "{}" },
      },
      {
        timestamp: "2026-07-01T10:00:04Z",
        type: "event_msg",
        payload: { type: "agent_message", message: "done" },
      },
      {
        timestamp: "2026-07-01T10:00:05Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 20,
              output_tokens: 10,
              total_tokens: 130,
            },
          },
        },
      },
    ]);
    jsonl(resolve(claudeRoot, "claude.jsonl"), [
      {
        timestamp: "2026-07-02T10:00:00Z",
        type: "user",
        sessionId: "claude-session",
        cwd: repo,
        message: { content: TASK },
      },
      {
        timestamp: "2026-07-02T10:00:01Z",
        type: "assistant",
        sessionId: "claude-session",
        requestId: "request-1",
        cwd: repo,
        message: {
          usage: { input_tokens: 80, cache_read_input_tokens: 40, output_tokens: 12 },
          content: [{ type: "tool_use", id: "tool-1", name: "Bash", input: { command: "npm test" } }],
        },
      },
      {
        timestamp: "2026-07-02T10:00:02Z",
        type: "user",
        sessionId: "claude-session",
        cwd: repo,
        message: { content: [{ type: "tool_result", tool_use_id: "tool-1", is_error: false }] },
      },
      {
        timestamp: "2026-07-02T10:00:03Z",
        type: "assistant",
        sessionId: "claude-session",
        requestId: "request-2",
        cwd: repo,
        message: {
          usage: { input_tokens: 20, output_tokens: 5 },
          content: [{ type: "text", text: "done" }],
        },
      },
    ]);

    const crewInputs = resolve(root, "crew-inputs.jsonl");
    jsonl(crewInputs, [
      {
        caseId: "crew-case",
        split: "evaluation",
        taskFingerprint: taskFingerprint(SALT, TASK),
        taskBands: taskBands(SALT, TASK),
      },
    ]);

    const manifest = await buildHistoryCohorts({
      codexRoots: [codexRoot],
      claudeRoot,
      repoSearchRoots: [resolve(root, "repos")],
      crewInputs,
      out,
      salt: SALT,
      splitAt: Date.parse("2026-07-10T00:00:00Z"),
    });
    const inputs = readFileSync(resolve(out, "history-inputs.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const oracles = readFileSync(resolve(out, "history-oracles.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(manifest.counts).toMatchObject({
      selectedSessions: 2,
      byClient: { codex: 1, claude: 1 },
      crewOverlap: { exact: 2 },
    });
    expect(inputs.every((row) => row.split === "evaluation")).toBe(true);
    expect(inputs.every((row) => row.crewCaseIds.includes("crew-case"))).toBe(true);
    expect(JSON.stringify(inputs)).not.toContain(TASK);
    expect(JSON.stringify(inputs)).not.toContain(repo);
    expect(oracles.find((row) => row.toolSequence.includes("crew.query"))).toBeDefined();
    expect(oracles.find((row) => row.toolSequence.includes("shell.test"))).toBeDefined();
  });
});
