import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const clients = ["codex", "claude", "cursor"];
const skills = ["ask-crew", "crew", "introduce", "reflect"];

function readSkill(client, skill) {
  return readFileSync(
    join(repoRoot, `packages/${client}-plugin/skills/${skill}/SKILL.md`),
    "utf8",
  );
}

for (const skill of skills) {
  test(`${skill} is semantically synchronized across clients`, () => {
    const contents = clients.map((client) => readSkill(client, skill));
    assert.ok(contents.every((content) => content === contents[0]), `${skill} differs between supported clients`);
  });
}

test("the synchronized bundle preserves the selected safety contract", () => {
  const bundle = skills.map((skill) => readSkill("codex", skill)).join("\n");
  assert.match(bundle, /shared or repository knowledge/);
  assert.match(bundle, /fully local deterministic work/);
  assert.match(bundle, /colleague note to verify/);
  assert.match(bundle, /confirm/);
  assert.match(bundle, /flag/);
  assert.match(bundle, /Anchored/);
  assert.match(bundle, /Consequential/);
  assert.match(bundle, /human approval|approval/);
});
