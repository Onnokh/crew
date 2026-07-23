#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rows(path) {
  const text = readFileSync(path, "utf8").trim();
  return text === "" ? [] : text.split("\n").map((line) => JSON.parse(line));
}

function splitCounts(items) {
  const counts = {};
  for (const item of items) {
    const split = item.split ?? "joined-by-case-id";
    counts[split] = (counts[split] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function copyEvidence(source, destination) {
  copyFileSync(source, destination);
  chmodSync(destination, 0o400);
  const content = readFileSync(destination);
  return {
    file: basename(destination),
    rows: rows(destination).length,
    splits: splitCounts(rows(destination)),
    bytes: content.length,
    sha256: sha256(content),
  };
}

export function sealCrewCorpus(options) {
  const output = resolve(options.output);
  if (existsSync(output)) throw new Error(`Output directory already exists: ${output}`);
  const inputDirectory = join(output, "candidate-inputs");
  const oracleDirectory = join(output, "sealed-oracles");
  mkdirSync(output, { recursive: true, mode: 0o700 });
  mkdirSync(inputDirectory, { mode: 0o700 });
  mkdirSync(oracleDirectory, { mode: 0o700 });

  const sources = [
    {
      label: "telemetry-retrievals",
      input: resolve(options.telemetry, "retrieval-inputs.jsonl"),
      oracle: resolve(options.telemetry, "retrieval-oracles.jsonl"),
    },
    {
      label: "telemetry-posts",
      input: resolve(options.telemetry, "post-inputs.jsonl"),
      oracle: resolve(options.telemetry, "post-oracles.jsonl"),
    },
    {
      label: "agent-history",
      input: resolve(options.history, "history-inputs.jsonl"),
      oracle: resolve(options.history, "history-oracles.jsonl"),
    },
  ];
  const files = sources.map((source) => ({
    label: source.label,
    input: copyEvidence(
      source.input,
      join(inputDirectory, `${source.label}.jsonl`),
    ),
    oracle: copyEvidence(
      source.oracle,
      join(oracleDirectory, `${source.label}.jsonl`),
    ),
  }));
  const sourceManifests = [
    resolve(options.telemetry, "manifest.json"),
    resolve(options.history, "history-manifest.json"),
  ].map((path) => {
    const contents = readFileSync(path);
    return {
      file: basename(path),
      bytes: contents.length,
      sha256: sha256(contents),
    };
  });
  const manifest = {
    schema_version: 1,
    policy: "crew-disposable-benchmark-corpus-v1",
    generated_at: new Date().toISOString(),
    source_manifests: sourceManifests,
    files,
    controls: [
      "Candidates receive only files in candidate-inputs.",
      "The evaluator joins sealed-oracles by caseId only after all variant runs finish.",
      "Development cases may shape candidates; evaluation cases decide non-inferiority.",
      "Provisional cases are descriptive and never decide acceptance.",
      "Files are chmod 0400; the enclosing corpus may additionally receive a platform immutable flag.",
      "No human labels or human confirmation are part of the benchmark.",
    ],
  };
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o400,
  });
  chmodSync(inputDirectory, 0o500);
  chmodSync(oracleDirectory, 0o500);
  chmodSync(output, 0o500);
  return manifest;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value, got ${key ?? "<end>"}`);
    }
    result[key.slice(2)] = value;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.telemetry || !args.history || !args.out) {
    throw new Error("Usage: seal-crew-corpus.mjs --telemetry DIR --history DIR --out DIR");
  }
  const manifest = sealCrewCorpus({
    telemetry: args.telemetry,
    history: args.history,
    output: args.out,
  });
  console.log(JSON.stringify(manifest, null, 2));
}
