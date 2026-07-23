#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ZERO_USAGE = Object.freeze({
  input_tokens: 0,
  cached_input_tokens: 0,
  cache_write_input_tokens: 0,
  output_tokens: 0,
  reasoning_output_tokens: 0,
  total_tokens: 0,
});

function parseJsonl(text) {
  const events = [];
  let invalidLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      invalidLines += 1;
    }
  }
  return { events, invalidLines };
}

function normalizeUsage(value = {}) {
  const input = Number(value.input_tokens ?? 0);
  const output = Number(value.output_tokens ?? 0);
  return {
    input_tokens: input,
    cached_input_tokens: Number(value.cached_input_tokens ?? 0),
    cache_write_input_tokens: Number(value.cache_write_input_tokens ?? 0),
    output_tokens: output,
    reasoning_output_tokens: Number(value.reasoning_output_tokens ?? 0),
    total_tokens: Number(value.total_tokens ?? input + output),
  };
}

function subtractUsage(after, before) {
  return Object.fromEntries(
    Object.keys(ZERO_USAGE).map((key) => [
      key,
      Math.max(0, Number(after[key] ?? 0) - Number(before[key] ?? 0)),
    ]),
  );
}

function tokenSnapshot(event) {
  if (event?.type !== "event_msg" || event.payload?.type !== "token_count") {
    return null;
  }
  return normalizeUsage(event.payload.info?.total_token_usage);
}

function chooseRolloutTurn(events, requestedTurnId) {
  const starts = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event?.type === "event_msg" && event.payload?.type === "task_started");

  const selected = requestedTurnId
    ? starts.find(({ event }) => event.payload.turn_id === requestedTurnId)
    : starts.at(-1);
  if (!selected) return null;

  const turnId = selected.event.payload.turn_id;
  const completion = events
    .map((event, index) => ({ event, index }))
    .find(
      ({ event, index }) =>
        index >= selected.index &&
        event?.type === "event_msg" &&
        event.payload?.type === "task_complete" &&
        event.payload.turn_id === turnId,
    );

  return {
    turnId,
    startIndex: selected.index,
    endIndex: completion?.index ?? events.length - 1,
    complete: Boolean(completion),
    startedAt: selected.event.timestamp ?? null,
    completedAt: completion?.event.timestamp ?? null,
    finalMessage: completion?.event.payload.last_agent_message ?? null,
  };
}

function stringifyPayload(value) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function classifyCrewCall(name, input, output, directMcp) {
  const rawInput = stringifyPayload(input);
  const rawOutput = stringifyPayload(output);
  const combined = `${rawInput}\n${rawOutput}`;
  const directServer = directMcp?.invocation?.server ?? "";
  const directTool = directMcp?.invocation?.tool ?? "";
  const directCrew = /crew/i.test(directServer);
  const mayExecuteCrew =
    Boolean(directMcp) || name === "exec" || /^(query|post|confirm|flag)$/i.test(name);

  if (
    mayExecuteCrew &&
    (/namespace\s*:\s*["']crew_mcp["']/i.test(rawInput) ||
      /tools\.search\s*\(/i.test(rawInput) ||
      /tools\.describe\.tool\s*\(/i.test(rawInput))
  ) {
    return { category: "crew_discovery", verb: null };
  }

  const verbMatch =
    rawInput.match(/personalcrewmcp\.(query|post|confirm|flag)\b/i) ??
    rawInput.match(/crew_mcp[\s\S]{0,160}\.(query|post|confirm|flag)\b/i) ??
    (directCrew ? directTool.match(/^(query|post|confirm|flag)$/i) : null);

  if (mayExecuteCrew && verbMatch) {
    return { category: "crew_execute", verb: verbMatch[1].toLowerCase() };
  }
  if (/crew_mcp|personalcrewmcp|Shared agent knowledge/i.test(combined)) {
    return { category: "crew_related_context", verb: null };
  }
  return { category: "other", verb: null };
}

function toolCallsForTurn(events, startIndex, endIndex) {
  const slice = events.slice(startIndex, endIndex + 1);
  const outputs = new Map();
  const directMcp = new Map();

  for (const event of slice) {
    if (
      event?.type === "response_item" &&
      ["function_call_output", "custom_tool_call_output"].includes(event.payload?.type)
    ) {
      outputs.set(event.payload.call_id, event.payload.output);
    }
    if (event?.type === "event_msg" && event.payload?.type === "mcp_tool_call_end") {
      directMcp.set(event.payload.call_id, event.payload);
    }
  }

  const calls = [];
  for (const event of slice) {
    if (
      event?.type !== "response_item" ||
      !["function_call", "custom_tool_call"].includes(event.payload?.type)
    ) {
      continue;
    }
    const callId = event.payload.call_id;
    const input = event.payload.input ?? event.payload.arguments ?? "";
    const output = outputs.get(callId) ?? "";
    const mcp = directMcp.get(callId);
    const name = event.payload.name ?? mcp?.invocation?.tool ?? "unknown";
    const classification = classifyCrewCall(name, input, output, mcp);
    calls.push({
      timestamp: event.timestamp ?? null,
      call_id: callId ?? null,
      name,
      server: mcp?.invocation?.server ?? null,
      ...classification,
      input_chars: stringifyPayload(input).length,
      input_bytes: Buffer.byteLength(stringifyPayload(input)),
      output_chars: stringifyPayload(output).length,
      output_bytes: Buffer.byteLength(stringifyPayload(output)),
    });
  }

  const transportMcpCalls = [];
  for (const [callId, mcp] of directMcp) {
    const input = mcp.invocation?.arguments ?? "";
    const output = mcp.result ?? "";
    const name = mcp.invocation?.tool ?? "unknown";
    transportMcpCalls.push({
      timestamp: null,
      call_id: callId ?? null,
      name,
      server: mcp.invocation?.server ?? null,
      ...classifyCrewCall(name, input, output, mcp),
      input_chars: stringifyPayload(input).length,
      input_bytes: Buffer.byteLength(stringifyPayload(input)),
      output_chars: stringifyPayload(output).length,
      output_bytes: Buffer.byteLength(stringifyPayload(output)),
    });
  }

  const signatures = new Map();
  for (const call of calls) {
    const event = slice.find(
      (candidate) =>
        candidate?.type === "response_item" &&
        candidate.payload?.call_id === call.call_id &&
        ["function_call", "custom_tool_call"].includes(candidate.payload?.type),
    );
    const rawInput = stringifyPayload(event?.payload?.input ?? event?.payload?.arguments ?? "");
    const digest = createHash("sha256").update(rawInput).digest("hex");
    const signature = `${call.name}\0${digest}`;
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }

  return {
    calls,
    transportMcpCalls,
    exact_repeat_count: [...signatures.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    ),
  };
}

function summarizeCalls(result) {
  const sum = (calls, key) => calls.reduce((total, call) => total + call[key], 0);
  const crewExecutions = result.calls.filter((call) => call.category === "crew_execute");
  const crewDiscovery = result.calls.filter((call) => call.category === "crew_discovery");
  const transportCrew = result.transportMcpCalls.filter(
    (call) => call.category === "crew_execute",
  );
  return {
    model_visible_calls: result.calls.length,
    total_request_bytes: sum(result.calls, "input_bytes"),
    total_response_bytes: sum(result.calls, "output_bytes"),
    exact_repeat_count: result.exact_repeat_count,
    transport_mcp: {
      calls: result.transportMcpCalls.length,
      crew_execution_calls: transportCrew.length,
      crew_response_bytes: sum(transportCrew, "output_bytes"),
    },
    crew: {
      execution_calls: crewExecutions.length,
      discovery_calls: crewDiscovery.length,
      follow_up_execution_calls: Math.max(0, crewExecutions.length - 1),
      request_bytes: sum(crewExecutions, "input_bytes"),
      response_bytes: sum(crewExecutions, "output_bytes"),
      verbs: Object.fromEntries(
        ["query", "post", "confirm", "flag"].map((verb) => [
          verb,
          crewExecutions.filter((call) => call.verb === verb).length,
        ]),
      ),
    },
    calls: result.calls,
  };
}

function rolloutUsage(events, turn) {
  let baseline = ZERO_USAGE;
  for (let index = 0; index < turn.startIndex; index += 1) {
    baseline = tokenSnapshot(events[index]) ?? baseline;
  }

  const snapshots = [];
  for (let index = turn.startIndex; index <= turn.endIndex; index += 1) {
    const snapshot = tokenSnapshot(events[index]);
    if (snapshot) snapshots.push(snapshot);
  }

  const uniqueSnapshots = snapshots.filter(
    (snapshot, index) =>
      index === 0 || JSON.stringify(snapshot) !== JSON.stringify(snapshots[index - 1]),
  );
  const latest = uniqueSnapshots.at(-1) ?? baseline;
  const usage = subtractUsage(latest, baseline);
  return {
    ...usage,
    uncached_input_tokens: Math.max(0, usage.input_tokens - usage.cached_input_tokens),
    visible_output_tokens: Math.max(
      0,
      usage.output_tokens - usage.reasoning_output_tokens,
    ),
    model_response_count: uniqueSnapshots.length,
    duplicate_token_snapshots: snapshots.length - uniqueSnapshots.length,
    accounting_note:
      "cached_input_tokens is a subset of input_tokens; reasoning_output_tokens is a subset of output_tokens. Do not add either subset to total_tokens.",
  };
}

function execUsage(events) {
  const completed = events.filter((event) => event?.type === "turn.completed").at(-1);
  if (!completed) return null;
  const usage = normalizeUsage(completed.usage);
  return {
    ...usage,
    uncached_input_tokens: Math.max(0, usage.input_tokens - usage.cached_input_tokens),
    visible_output_tokens: Math.max(
      0,
      usage.output_tokens - usage.reasoning_output_tokens,
    ),
    accounting_note:
      "cached_input_tokens is a subset of input_tokens; reasoning_output_tokens is a subset of output_tokens. Do not add either subset to total_tokens.",
  };
}

export function analyzeCodexTrace(text, options = {}) {
  const { events, invalidLines } = parseJsonl(text);
  const turn = chooseRolloutTurn(events, options.turnId);
  if (!turn) {
    const usage = execUsage(events);
    if (!usage) throw new Error("No Codex task_started or turn.completed event found");
    return {
      format: "codex-exec-jsonl",
      invalid_lines_ignored: invalidLines,
      usage,
      limitation:
        "The codex exec JSONL stream gives exact turn totals and item events, but not a source-by-source input-token decomposition.",
    };
  }

  const calls = toolCallsForTurn(events, turn.startIndex, turn.endIndex);
  const finalText = turn.finalMessage ?? "";
  return {
    format: "codex-rollout-jsonl",
    invalid_lines_ignored: invalidLines,
    turn: {
      id: turn.turnId,
      complete: turn.complete,
      started_at: turn.startedAt,
      completed_at: turn.completedAt,
    },
    usage: rolloutUsage(events, turn),
    tools: summarizeCalls(calls),
    final_output: {
      chars: finalText.length,
      bytes: Buffer.byteLength(finalText),
      available: turn.complete,
    },
    limitation:
      "Rollout JSONL is a local Codex implementation artifact, not a stable public analytics API. It records exact aggregate usage and payloads, but not the fully rendered model request or per-source token attribution.",
  };
}

function parseArgs(argv) {
  const options = { staticFiles: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--rollout") options.rollout = argv[++index];
    else if (arg === "--turn-id") options.turnId = argv[++index];
    else if (arg === "--static") {
      const value = argv[++index];
      const separator = value.indexOf("=");
      if (separator < 1) throw new Error("--static expects label=path");
      options.staticFiles.push({
        label: value.slice(0, separator),
        path: value.slice(separator + 1),
      });
    } else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function usageText() {
  return [
    "Usage:",
    "  node scripts/research/codex-token-surface.mjs --rollout PATH [--turn-id ID]",
    "    [--static label=PATH ...]",
    "",
    "The report contains exact Codex aggregate token usage and byte-level source",
    "diagnostics. It intentionally does not estimate per-source tokens from characters.",
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.rollout) {
    console.log(usageText());
    process.exitCode = options.help ? 0 : 1;
    return;
  }

  const report = analyzeCodexTrace(readFileSync(options.rollout, "utf8"), options);
  report.source = options.rollout;
  report.static_sources = options.staticFiles.map(({ label, path }) => {
    const text = readFileSync(path, "utf8");
    return {
      label,
      path,
      chars: text.length,
      bytes: statSync(path).size,
      note: "Use a controlled Codex A/B run or the OpenAI input-token-count endpoint for tokens; character heuristics are deliberately omitted.",
    };
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
