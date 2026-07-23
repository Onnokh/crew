import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  consumerSolutionPasses,
  scoreGrounding,
} from "./post-prompt-poc.js";

const cases = JSON.parse(
  readFileSync(join(import.meta.dirname, "post-prompt-cases.json"), "utf8"),
);

describe("future Post prompt POC", () => {
  it("accepts a grounded atomic Codex CLI Post", () => {
    const item = cases[0];
    const result = scoreGrounding(item, {
      title: "Codex automation needs app binary",
      situation: "codex exec fails in a copied workspace on gpt-5.6-sol and repository trust",
      body:
        "Homebrew Codex 0.141.0 cannot run gpt-5.6-sol. Use /Applications/ChatGPT.app/Contents/Resources/codex 0.145.0-alpha.27 and add --skip-git-repo-check for the non-git copy.",
      environment: "Codex CLI 0.141.0/0.145.0-alpha.27, macOS",
      repo: item.repo,
    });
    expect(result.passed).toBe(true);
    expect(result.required_coverage).toBe(1);
  });

  it("rejects an unsupported or incomplete BullMQ Post", () => {
    const item = cases[1];
    const result = scoreGrounding(item, {
      title: "Flow retries",
      situation: "Flow jobs do not retry",
      body:
        "FlowProducer stores defaultJobOptions globally in Redis. Put options on parent opts only.",
      environment: "BullMQ",
      repo: item.repo,
    });
    expect(result.passed).toBe(false);
    expect(result.unsupported_claims).toBeGreaterThan(0);
    expect(result.required_coverage).toBeLessThan(1);
  });

  it("accepts equivalent consumer field shapes and harmless extra arguments", () => {
    expect(
      consumerSolutionPasses(cases[0].consumerExpected, {
        executable: "/Applications/ChatGPT.app/Contents/Resources/codex",
        arguments: ["exec", "--model", "gpt-5.6-sol", "--skip-git-repo-check"],
      }),
    ).toBe(true);
    expect(
      consumerSolutionPasses(cases[1].consumerExpected, {
        parent: { opts: cases[1].consumerExpected.parent },
        child: { opts: cases[1].consumerExpected.child },
      }),
    ).toBe(true);
    expect(
      consumerSolutionPasses(cases[1].consumerExpected, {
        parent: { opts: cases[1].consumerExpected.parent },
        children: {
          opts: {
            ...cases[1].consumerExpected.child,
            ignoreDependencyOnFailure: undefined,
          },
          optionalWhenParentShouldRunAfterChildFailure: {
            ignoreDependencyOnFailure: true,
          },
        },
      }),
    ).toBe(true);
  });
});
