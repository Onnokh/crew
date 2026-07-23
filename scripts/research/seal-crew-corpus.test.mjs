import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sealCrewCorpus } from "./seal-crew-corpus.mjs";

test("seals inputs and oracles into separate read-only directories", () => {
  const root = mkdtempSync(join(tmpdir(), "crew-corpus-"));
  const telemetry = join(root, "telemetry");
  const history = join(root, "history");
  mkdirSync(telemetry);
  mkdirSync(history);
  writeFileSync(join(telemetry, "retrieval-inputs.jsonl"), '{"caseId":"r1","split":"development"}\n');
  writeFileSync(join(telemetry, "retrieval-oracles.jsonl"), '{"caseId":"r1"}\n');
  writeFileSync(join(telemetry, "post-inputs.jsonl"), '{"caseId":"p1","split":"evaluation"}\n');
  writeFileSync(join(telemetry, "post-oracles.jsonl"), '{"caseId":"p1"}\n');
  writeFileSync(join(telemetry, "manifest.json"), "{}\n");
  writeFileSync(join(history, "history-inputs.jsonl"), '{"caseId":"h1","split":"evaluation"}\n');
  writeFileSync(join(history, "history-oracles.jsonl"), '{"caseId":"h1"}\n');
  writeFileSync(join(history, "history-manifest.json"), "{}\n");
  const output = join(root, "sealed");
  const manifest = sealCrewCorpus({ telemetry, history, output });
  assert.equal(manifest.files.length, 3);
  assert.equal(manifest.files[0].input.splits.development, 1);
  assert.equal(manifest.files[1].input.splits.evaluation, 1);
  assert.equal(
    statSync(join(output, "sealed-oracles", "telemetry-posts.jsonl")).mode & 0o777,
    0o400,
  );
  assert.equal(
    readFileSync(join(output, "candidate-inputs", "agent-history.jsonl"), "utf8"),
    '{"caseId":"h1","split":"evaluation"}\n',
  );
});
