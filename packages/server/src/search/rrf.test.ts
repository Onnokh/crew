import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, RRF_K } from "./rrf.js";

describe("reciprocalRankFusion", () => {
  it("returns an empty result for no lists", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("preserves a single list's order and scores each by 1/(k+rank+1)", () => {
    const fused = reciprocalRankFusion([["a", "b", "c"]]);
    expect(fused.map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 1));
    expect(fused[1]!.score).toBeCloseTo(1 / (RRF_K + 2));
    expect(fused[2]!.score).toBeCloseTo(1 / (RRF_K + 3));
  });

  it("rewards items ranked high in multiple lists over a single list-topper", () => {
    // `x` is 2nd in both lists; `a` and `p` each top one list only.
    const keyword = ["a", "x", "b"];
    const vector = ["p", "x", "q"];
    const fused = reciprocalRankFusion([keyword, vector]);
    // x = 1/62 + 1/62 ≈ 0.03226 beats a = 1/61 ≈ 0.01639.
    expect(fused[0]!.id).toBe("x");
    expect(fused[0]!.score).toBeCloseTo(
      1 / (RRF_K + 2) + 1 / (RRF_K + 2),
    );
  });

  it("sums the reciprocal ranks across the lists an item appears in", () => {
    const fused = reciprocalRankFusion([
      ["a", "b"],
      ["b", "a"],
    ]);
    // Both score identically; tie breaks by first appearance (a before b).
    expect(fused.map((f) => f.id)).toEqual(["a", "b"]);
    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2));
    expect(fused[1]!.score).toBeCloseTo(fused[0]!.score);
  });

  it("counts only an item's best rank within a single list (dedup per list)", () => {
    const fused = reciprocalRankFusion([["a", "a", "b"]]);
    expect(fused.map((f) => f.id)).toEqual(["a", "b"]);
    expect(fused[0]!.score).toBeCloseTo(1 / (RRF_K + 1)); // not doubled
  });

  it("breaks score ties deterministically by first appearance", () => {
    // Two items, each top of one list → equal score; order follows the lists.
    const fused = reciprocalRankFusion([["a"], ["b"]]);
    expect(fused.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("honors a custom k", () => {
    const fused = reciprocalRankFusion([["a"]], 0);
    expect(fused[0]!.score).toBeCloseTo(1); // 1 / (0 + 0 + 1)
  });
});
