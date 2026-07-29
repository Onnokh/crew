import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const rulesPath = join(repoRoot, "AGENTS.md");

test("AGENTS.md is the repository rule source", () => {
  assert.equal(existsSync(rulesPath), true);
  assert.equal(existsSync(join(repoRoot, "rules.md")), false);
});

test("rules use the selective Crew invocation contract", () => {
  const rules = readFileSync(rulesPath, "utf8");
  assert.match(rules, /shared or repository knowledge/);
  assert.match(rules, /explicit recall/);
  assert.match(rules, /opaque failure or retry/);
  assert.match(rules, /fully local deterministic work/);
  assert.match(rules, /Treat retrieved Posts as colleague notes/);
  assert.match(rules, /confirm/);
  assert.match(rules, /flag/);
  assert.match(rules, /Anchored/);
  assert.match(rules, /Consequential/);
});
