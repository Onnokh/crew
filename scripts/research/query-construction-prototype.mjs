#!/usr/bin/env node

/**
 * PROTOTYPE — PLO-287: query construction strategies.
 *
 * Question: should Codex preserve the caller's situation and optional context,
 * normalize only transport details, omit environment, or add an adaptive
 * follow-up? This terminal shell makes the candidate argument shapes and their
 * request-cost / underfilled-case tradeoffs visible without touching Crew.
 */

import { existsSync, readFileSync } from "node:fs";
import { createInterface, emitKeypressEvents } from "node:readline";
import { resolve } from "node:path";
import { STRATEGIES, renderState } from "./query-construction-logic.mjs";

const defaultInputs = resolve(
  process.env.CREW_QUERY_PROTOTYPE_INPUTS ??
    "scripts/research/fixtures/query-construction-samples.jsonl",
);

function loadRecords(path) {
  if (!existsSync(path)) throw new Error(`Input file not found: ${path}`);
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function dim(value) {
  return `\x1b[2m${value}\x1b[0m`;
}

function bold(value) {
  return `\x1b[1m${value}\x1b[0m`;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function render(records, strategyIndex, caseIndex) {
  console.clear();
  const { strategy, summary, row } = renderState(records, strategyIndex, caseIndex);
  console.log(bold("PLO-287 — query construction prototype"));
  console.log(dim("Throwaway artifact. No Crew calls or production data are changed."));
  console.log();
  console.log(`${bold("Strategy")}: ${strategy.label}`);
  console.log(`${bold("Question")}: ${strategy.description}`);
  console.log(`${bold("Cases")}: ${summary.cases}`);
  console.log(`${bold("Mean request")}: ${summary.meanRequestBytes} bytes`);
  console.log(`${bold("Repo field")}: ${percent(summary.repoRate)}`);
  console.log(`${bold("Environment")}: ${percent(summary.environmentRate)}`);
  console.log(`${bold("Underfilled / zero")}: ${summary.underfilled} / ${summary.zeroResult}`);
  console.log(`${bold("Adaptive follow-ups")}: ${summary.followUpEligible}`);
  console.log();
  console.log(bold("Current case"));
  console.log(`${bold("id")}: ${row.caseId}`);
  console.log(`${bold("situation")}: ${row.args.situation}`);
  console.log(`${bold("environment")}: ${row.args.environment ?? dim("<omitted>")}`);
  console.log(`${bold("repo")}: ${row.args.repo ?? dim("<omitted>")}`);
  console.log(`${bold("limit")}: ${row.args.limit}`);
  console.log(`${bold("request bytes")}: ${row.request.bytes}`);
  console.log(`${bold("observed results")}: ${row.observedResultCount}/${row.requestedLimit}`);
  console.log();
  console.log(dim("[s] next strategy  [n] next case  [j] show JSON  [q] quit"));
}

const records = loadRecords(defaultInputs);
let strategyIndex = 0;
let caseIndex = 0;
render(records, strategyIndex, caseIndex);

emitKeypressEvents(process.stdin);
const input = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
if (process.stdin.isTTY) process.stdin.setRawMode(true);
input.input.on("keypress", (_value, key) => {
  if (key?.name === "q" || (key?.ctrl && key.name === "c")) {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    input.close();
    return;
  }
  if (key?.name === "s") strategyIndex = (strategyIndex + 1) % STRATEGIES.length;
  if (key?.name === "n") caseIndex = (caseIndex + 1) % records.length;
  if (key?.name === "j") {
    const state = renderState(records, strategyIndex, caseIndex);
    console.log(JSON.stringify(state.row.args, null, 2));
  }
  render(records, strategyIndex, caseIndex);
});
