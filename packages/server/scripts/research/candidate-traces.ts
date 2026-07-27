#!/usr/bin/env node

import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as sqliteVec from "sqlite-vec";
import { TransformersEmbedder } from "../../src/embedding/transformers.js";
import {
  buildCandidateTraceBundle,
  writeCandidateTraceManifestSource,
} from "../../src/research/candidate-traces.js";
import { EMBEDDING_MODEL_KEY } from "../../src/store/meta.js";

function parseArgs(argv: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (key === "--include-content") {
      values.set("include-content", "true");
      continue;
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`Missing value for ${key}`);
    values.set(key.slice(2), value);
  }
  return values;
}

function parseTime(args: Map<string, string>, name: string): number {
  const value = args.get(name);
  if (value === undefined) throw new Error(`Missing --${name}`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${value}`);
  return parsed;
}

function writeJsonl(path: string, rows: ReadonlyArray<Record<string, unknown>>): void {
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const dbPath = resolve(args.get("db") ?? "");
  const outDir = resolve(args.get("out") ?? "");
  const salt = args.get("salt") ?? process.env.CREW_RESEARCH_TRACE_SALT ?? "";
  if (dbPath === resolve("")) throw new Error("Missing --db");
  if (outDir === resolve("")) throw new Error("Missing --out");
  if (!salt) {
    throw new Error("Missing --salt or CREW_RESEARCH_TRACE_SALT");
  }
  if (existsSync(outDir)) {
    throw new Error(`Refusing to overwrite existing output directory: ${outDir}`);
  }

  const raw = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    // sqlite-vec is required by the read-only KNN helpers. No migration or
    // pragma that writes to the source database is performed here.
    sqliteVec.load(raw);
    const embedder = await TransformersEmbedder.create(args.get("model-cache-dir"));
    const modelRow = raw
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(EMBEDDING_MODEL_KEY) as { value: string } | undefined;
    if (modelRow?.value !== embedder.modelName) {
      throw new Error(
        `Embedding model mismatch: source=${modelRow?.value ?? "<missing>"}, ` +
          `trace=${embedder.modelName}`,
      );
    }
    const bundle = await buildCandidateTraceBundle(raw, embedder, {
      from: parseTime(args, "from"),
      to: parseTime(args, "to"),
      analysisTime: parseTime(args, "analysis-time"),
      splitAt: parseTime(args, "split-at"),
      salt,
      includeContent: args.get("include-content") === "true",
      maxVectorDistance: args.has("max-vector-distance")
        ? Number(args.get("max-vector-distance"))
        : undefined,
    });

    mkdirSync(outDir, { mode: 0o700 });
    const manifest = writeCandidateTraceManifestSource(
      bundle.manifest,
      dbPath,
      sha256File(dbPath),
    );
    writeFileSync(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    writeJsonl(`${outDir}/retrieval-traces.jsonl`, bundle.traces);
    writeJsonl(`${outDir}/retrieval-summaries.jsonl`, bundle.summaries);
    writeJsonl(`${outDir}/retrieval-outcomes.jsonl`, bundle.outcomes);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    raw.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli(process.argv.slice(2));
}
