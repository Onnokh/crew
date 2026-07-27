#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const defaultRoot = "/Users/onnokleinhofmeijer/.crew/research-benchmarks/crew-benchmark-20260723-ob8gOp";
const root = process.argv[2] ?? defaultRoot;
const requestedSplit = process.argv[3] ?? "evaluation";

const inputs = readJsonl(join(root, "telemetry/retrieval-inputs.jsonl"));
const oracles = new Map(
  readJsonl(join(root, "telemetry/retrieval-oracles.jsonl")).map((item) => [item.caseId, item]),
);
const cases = inputs.filter((item) => item.split === requestedSplit);

const policies = [
  { id: "baseline", label: "Current returned set", keep: () => true },
  { id: "top-2", label: "Top 2 only", keep: (row) => row.rank <= 2 },
  { id: "top-3", label: "Top 3 only", keep: (row) => row.rank <= 3 },
  { id: "top-5", label: "Top 5 only", keep: (row) => row.rank <= 5 },
  { id: "top-7", label: "Top 7 only", keep: (row) => row.rank <= 7 },
  {
    id: "high-confidence",
    label: "Same-repo or multi-leg only",
    keep: (row) => row.sameRepo || row.multiLeg,
  },
  {
    id: "high-confidence-plus-top-2",
    label: "High-confidence rows plus top 2",
    keep: (row) => row.sameRepo || row.multiLeg || row.rank <= 2,
  },
  {
    id: "multi-leg-only",
    label: "Multi-leg only",
    keep: (row) => row.multiLeg,
  },
];

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function evaluate(policy) {
  let observedRows = 0;
  let keptRows = 0;
  let confirmedRows = 0;
  let retainedConfirmedRows = 0;
  let flaggedRows = 0;
  let retainedFlaggedRows = 0;
  let casesWithConfirmedLoss = 0;
  let casesWithFlagLoss = 0;
  let casesWithAnyRows = 0;
  let casesWithKeptRows = 0;

  for (const item of cases) {
    const oracle = oracles.get(item.caseId) ?? {};
    const confirmed = new Set(oracle.confirmedPostIds ?? []);
    const flagged = new Set(oracle.flaggedPostIds ?? []);
    const rows = item.resultSignals ?? [];
    const kept = rows.filter(policy.keep);
    const confirmedInRows = rows.filter((row) => confirmed.has(row.postId));
    const flaggedInRows = rows.filter((row) => flagged.has(row.postId));
    const confirmedKept = kept.filter((row) => confirmed.has(row.postId));
    const flaggedKept = kept.filter((row) => flagged.has(row.postId));

    observedRows += rows.length;
    keptRows += kept.length;
    confirmedRows += confirmedInRows.length;
    retainedConfirmedRows += confirmedKept.length;
    flaggedRows += flaggedInRows.length;
    retainedFlaggedRows += flaggedKept.length;
    if (confirmedKept.length < confirmedInRows.length) casesWithConfirmedLoss += 1;
    if (flaggedKept.length < flaggedInRows.length) casesWithFlagLoss += 1;
    if (rows.length > 0) casesWithAnyRows += 1;
    if (kept.length > 0) casesWithKeptRows += 1;
  }

  return {
    id: policy.id,
    label: policy.label,
    cases: cases.length,
    observedRows,
    keptRows,
    rowReduction: observedRows === 0 ? 0 : 1 - keptRows / observedRows,
    confirmedRows,
    retainedConfirmedRows,
    confirmedRetention: confirmedRows === 0 ? null : retainedConfirmedRows / confirmedRows,
    flaggedRows,
    retainedFlaggedRows,
    flaggedRetention: flaggedRows === 0 ? null : retainedFlaggedRows / flaggedRows,
    casesWithConfirmedLoss,
    casesWithFlagLoss,
    casesWithAnyRows,
    casesWithKeptRows,
  };
}

console.log(JSON.stringify({
  root,
  split: requestedSplit,
  policy: "Known confirmed/flagged result rows are outcome oracles; missing feedback is unresolved, never negative.",
  results: policies.map(evaluate),
}, null, 2));
