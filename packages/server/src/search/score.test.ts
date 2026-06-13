import { describe, expect, it } from "vitest";
import {
  finalScore,
  NO_BOOST,
  recency,
  RECENCY_HALF_LIFE_MS,
  repoBoost,
  REPO_BOOST,
  type ScoreInput,
} from "./score.js";

const NOW = 1_700_000_000_000;

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    rrfScore: 0.02,
    trust: 1,
    recencyAnchor: NOW,
    sameRepo: false,
    ...overrides,
  };
}

describe("recency", () => {
  it("is 1.0 for a just-now anchor", () => {
    expect(recency(NOW, NOW)).toBe(1);
  });

  it("halves every half-life", () => {
    expect(recency(NOW - RECENCY_HALF_LIFE_MS, NOW)).toBeCloseTo(0.5);
    expect(recency(NOW - 2 * RECENCY_HALF_LIFE_MS, NOW)).toBeCloseTo(0.25);
  });

  it("clamps future anchors (clock skew) to 1.0", () => {
    expect(recency(NOW + 10_000, NOW)).toBe(1);
  });

  it("is strictly decreasing in age", () => {
    const recent = recency(NOW - 1000, NOW);
    const older = recency(NOW - 1_000_000, NOW);
    expect(recent).toBeGreaterThan(older);
  });
});

describe("repoBoost", () => {
  it("boosts same-repo Posts and leaves cross-repo Posts at 1.0", () => {
    expect(repoBoost(true)).toBe(REPO_BOOST);
    expect(repoBoost(false)).toBe(NO_BOOST);
  });
});

describe("finalScore = rrf × trust × recency × repo_boost", () => {
  it("equals the product of its four factors", () => {
    const score = finalScore(
      { rrfScore: 0.02, trust: 4, recencyAnchor: NOW, sameRepo: true },
      NOW,
    );
    expect(score).toBeCloseTo(0.02 * 4 * 1 * REPO_BOOST);
  });

  it("a confirmed Post outranks an equal-relevance unconfirmed one", () => {
    const confirmed = finalScore(input({ trust: 2 }), NOW); // 1 confirm
    const unconfirmed = finalScore(input({ trust: 1 }), NOW);
    expect(confirmed).toBeGreaterThan(unconfirmed);
  });

  it("flags sink a Post below an equal-relevance clean one", () => {
    const flagged = finalScore(input({ trust: 0.01 }), NOW); // clamped after flags
    const clean = finalScore(input({ trust: 1 }), NOW);
    expect(flagged).toBeLessThan(clean);
  });

  it("a more recently confirmed Post outranks an older-but-equal one", () => {
    const fresh = finalScore(input({ recencyAnchor: NOW }), NOW);
    const stale = finalScore(
      input({ recencyAnchor: NOW - 2 * RECENCY_HALF_LIFE_MS }),
      NOW,
    );
    expect(fresh).toBeGreaterThan(stale);
  });

  it("a same-repo Post outranks an equal cross-repo one", () => {
    const same = finalScore(input({ sameRepo: true }), NOW);
    const cross = finalScore(input({ sameRepo: false }), NOW);
    expect(same).toBeCloseTo(cross * REPO_BOOST);
  });
});
