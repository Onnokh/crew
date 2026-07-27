import test from "node:test";
import assert from "node:assert/strict";
import {
  CallToolResultSchema,
  ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  SAMPLE_RESULTS,
  buildStrategies,
  compareStrategies,
} from "./mcp-result-delivery.mjs";

test("all strategies preserve the same canonical result set", () => {
  const strategies = buildStrategies(SAMPLE_RESULTS);
  const fullText = strategies.text.initialResponse.content[0].text;

  assert.match(fullText, /Fastembed model cache must be shared/);
  assert.match(strategies["embedded-resource"].initialResponse.content[0].resource.text, /Console API routes/);
  assert.deepEqual(
    strategies["resource-link"].resourceRead.contents[0].text,
    fullText,
  );
  assert.equal(strategies["preview-resource-link"].resourceRead.contents[0].text, fullText);
});

test("MCP SDK schemas accept the tool and resource payloads", () => {
  const strategies = buildStrategies();

  for (const strategy of [
    strategies.text,
    strategies.structured,
    strategies["embedded-resource"],
    strategies["resource-link"],
    strategies["preview-resource-link"],
  ]) {
    assert.doesNotThrow(() => CallToolResultSchema.parse(strategy.initialResponse));
  }
  assert.doesNotThrow(() =>
    ReadResourceResultSchema.parse(strategies["resource-link"].resourceRead),
  );
});

test("structured output duplicates authored result data alongside compatibility text", () => {
  const strategies = buildStrategies();
  const textBytes = strategies.text.metrics.initialResponseBytes;
  const structured = strategies.structured;

  assert.ok(structured.initialResponse.structuredContent.results.length === SAMPLE_RESULTS.length);
  assert.ok(structured.metrics.initialResponseBytes > textBytes);
  assert.match(structured.qualityNote, /repeats/);
});

test("resource link minimizes initial context but requires a follow-up read", () => {
  const strategies = buildStrategies();
  const direct = strategies.text.metrics.initialResponseBytes;
  const linked = strategies["resource-link"];

  assert.ok(linked.metrics.initialResponseBytes < direct);
  assert.equal(linked.requiresFollowUp, true);
  assert.ok(linked.metrics.fullReadBytes > direct);
  assert.equal(linked.initialResponse.content[0].type, "resource_link");
});

test("stream-content is explicitly marked as a FastMCP extension", () => {
  const streamed = buildStrategies()["stream-content"];

  assert.equal(streamed.standardMcp, false);
  assert.equal(streamed.events.length, SAMPLE_RESULTS.length);
  assert.match(streamed.events[0].method, /streamContent/);
  assert.deepEqual(streamed.initialResponse.content, []);
});

test("comparison exposes byte counts without pretending they are token counts", () => {
  const rows = compareStrategies();
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => Number.isInteger(row.initialResponseBytes)));
  assert.ok(rows.find((row) => row.strategy === "preview-resource-link").requiresFollowUp);
});
