import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCodexTrace } from "./codex-token-surface.mjs";

function line(value) {
  return JSON.stringify(value);
}

test("measures a rollout turn without double-counting cached or reasoning tokens", () => {
  const trace = [
    {
      timestamp: "2026-07-23T10:00:00Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 80,
            output_tokens: 10,
            reasoning_output_tokens: 4,
            total_tokens: 110,
          },
        },
      },
    },
    {
      timestamp: "2026-07-23T10:01:00Z",
      type: "event_msg",
      payload: { type: "task_started", turn_id: "turn_1" },
    },
    {
      timestamp: "2026-07-23T10:01:01Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 130,
            cached_input_tokens: 100,
            output_tokens: 14,
            reasoning_output_tokens: 5,
            total_tokens: 144,
          },
        },
      },
    },
    {
      timestamp: "2026-07-23T10:01:02Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 130,
            cached_input_tokens: 100,
            output_tokens: 14,
            reasoning_output_tokens: 5,
            total_tokens: 144,
          },
        },
      },
    },
    {
      timestamp: "2026-07-23T10:01:03Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        call_id: "call_1",
        name: "exec",
        input:
          'await tools.crew_mcp.user.personalcrewmcp.query({ situation: "x" })',
      },
    },
    {
      timestamp: "2026-07-23T10:01:04Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "call_1",
        output: [{ type: "input_text", text: "Shared result" }],
      },
    },
    {
      timestamp: "2026-07-23T10:01:05Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 180,
            cached_input_tokens: 140,
            output_tokens: 20,
            reasoning_output_tokens: 7,
            total_tokens: 200,
          },
        },
      },
    },
    {
      timestamp: "2026-07-23T10:01:06Z",
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn_1",
        last_agent_message: "Done",
      },
    },
  ]
    .map(line)
    .join("\n");

  const report = analyzeCodexTrace(trace);
  assert.equal(report.usage.input_tokens, 80);
  assert.equal(report.usage.cached_input_tokens, 60);
  assert.equal(report.usage.uncached_input_tokens, 20);
  assert.equal(report.usage.output_tokens, 10);
  assert.equal(report.usage.reasoning_output_tokens, 3);
  assert.equal(report.usage.visible_output_tokens, 7);
  assert.equal(report.usage.total_tokens, 90);
  assert.equal(report.usage.model_response_count, 2);
  assert.equal(report.usage.duplicate_token_snapshots, 1);
  assert.equal(report.tools.crew.execution_calls, 1);
  assert.equal(report.tools.crew.verbs.query, 1);
  assert.equal(report.final_output.bytes, 4);
});

test("reads exact usage from codex exec JSONL", () => {
  const report = analyzeCodexTrace(
    [
      line({ type: "thread.started", thread_id: "thread_1" }),
      "a warning written into a captured combined stream",
      line({
        type: "turn.completed",
        usage: {
          input_tokens: 1000,
          cached_input_tokens: 800,
          output_tokens: 100,
          reasoning_output_tokens: 70,
        },
      }),
    ].join("\n"),
  );

  assert.equal(report.format, "codex-exec-jsonl");
  assert.equal(report.invalid_lines_ignored, 1);
  assert.equal(report.usage.total_tokens, 1100);
  assert.equal(report.usage.uncached_input_tokens, 200);
  assert.equal(report.usage.visible_output_tokens, 30);
});

test("distinguishes Crew discovery from execution", () => {
  const trace = [
    line({
      type: "event_msg",
      payload: { type: "task_started", turn_id: "turn_2" },
    }),
    line({
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        call_id: "discover",
        name: "exec",
        input: 'tools.search({ namespace: "crew_mcp", query: "query" })',
      },
    }),
    line({
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "discover",
        output: "crew_mcp.user.personalcrewmcp.query",
      },
    }),
    line({
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn_2",
        last_agent_message: "",
      },
    }),
  ].join("\n");

  const report = analyzeCodexTrace(trace);
  assert.equal(report.tools.crew.discovery_calls, 1);
  assert.equal(report.tools.crew.execution_calls, 0);
});

test("captures public codex exec steps, payload hashes, errors, and final output", () => {
  const trace = [
    line({ type: "thread.started", thread_id: "thread_1" }),
    line({ type: "turn.started" }),
    line({
      type: "item.completed",
      item: {
        id: "item_0",
        type: "command_execution",
        command: "/bin/zsh -lc 'printf trace-probe'",
        aggregated_output: "trace-probe",
        exit_code: 0,
        status: "completed",
      },
    }),
    line({
      type: "item.completed",
      item: {
        id: "item_1",
        type: "mcp_tool_call",
        server: "crew",
        tool: "query",
        arguments: { situation: "trace probe" },
        result: "Shared agent knowledge",
        status: "completed",
      },
    }),
    line({
      type: "item.completed",
      item: { id: "item_2", type: "agent_message", text: "DONE" },
    }),
    line({
      type: "turn.completed",
      usage: {
        input_tokens: 1000,
        cached_input_tokens: 800,
        output_tokens: 100,
        reasoning_output_tokens: 70,
      },
    }),
  ].join("\n");

  const report = analyzeCodexTrace(trace);
  assert.equal(report.tools.model_visible_calls, 2);
  assert.equal(report.tools.crew.execution_calls, 1);
  assert.equal(report.tools.crew.verbs.query, 1);
  assert.equal(report.steps.length, 3);
  assert.equal(report.errors.count, 0);
  assert.equal(report.final_output.bytes, 4);
  assert.match(report.tools.calls[0].input_sha256, /^[a-f0-9]{64}$/);
  assert.match(report.tools.calls[1].output_sha256, /^[a-f0-9]{64}$/);
});

test("marks failed public codex exec steps", () => {
  const trace = [
    line({
      type: "item.completed",
      item: {
        id: "item_0",
        type: "command_execution",
        command: "false",
        aggregated_output: "",
        exit_code: 1,
        status: "failed",
      },
    }),
    line({
      type: "turn.completed",
      usage: { input_tokens: 10, output_tokens: 1 },
    }),
  ].join("\n");

  const report = analyzeCodexTrace(trace);
  assert.equal(report.errors.count, 1);
  assert.equal(report.errors.failed_steps[0].exit_code, 1);
  assert.equal(report.final_output.available, false);
});

test("marks item.completed error records as failed steps", () => {
  const trace = [
    line({
      type: "item.completed",
      item: {
        id: "item_0",
        type: "error",
        message: "event stream lagged",
      },
    }),
    line({
      type: "turn.completed",
      usage: { input_tokens: 10, output_tokens: 1 },
    }),
  ].join("\n");

  const report = analyzeCodexTrace(trace);
  assert.equal(report.errors.count, 1);
  assert.equal(report.errors.failed_steps[0].type, "error");
});
