import { describe, expect, it } from "vitest";
import type { PostEvent } from "../core/post-event.js";
import {
  aggregateEvents,
  FLAG_WEIGHT,
  MIN_TRUST,
  trustFromCounts,
} from "./aggregate.js";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function event(overrides: Partial<PostEvent> = {}): PostEvent {
  return {
    id: "evt_1",
    postId: "post_1",
    verdict: "confirm",
    reason: null,
    note: null,
    createdBy: "user_alice",
    createdAt: NOW,
    ...overrides,
  };
}

describe("trustFromCounts", () => {
  it("is 1.0 for an unconfirmed, unflagged Post", () => {
    expect(trustFromCounts(0, 0)).toBe(1);
  });

  it("rises by one per Confirm", () => {
    expect(trustFromCounts(3, 0)).toBe(4);
  });

  it("subtracts FLAG_WEIGHT per Flag (flags weigh double)", () => {
    // 1 + 3 − 2·1 = 2 (stays above the clamp).
    expect(trustFromCounts(3, 1)).toBe(1 + 3 - FLAG_WEIGHT);
    // one flag cancels two confirms: 1 + 2 − 2·1 = 1
    expect(trustFromCounts(2, 1)).toBe(1);
  });

  it("clamps to MIN_TRUST so a heavily-flagged Post never zeroes the product", () => {
    expect(trustFromCounts(0, 5)).toBe(MIN_TRUST);
    expect(trustFromCounts(0, 100)).toBe(MIN_TRUST);
  });
});

describe("aggregateEvents", () => {
  it("counts confirms and flags and derives trust", () => {
    const agg = aggregateEvents([
      event({ verdict: "confirm" }),
      event({ verdict: "confirm" }),
      event({ verdict: "flag", reason: "stale" }),
    ]);
    expect(agg.confirms).toBe(2);
    expect(agg.flags).toBe(1);
    expect(agg.trust).toBe(trustFromCounts(2, 1));
  });

  it("reports the most recent Confirm time as lastConfirmedAt, order-independent", () => {
    const agg = aggregateEvents([
      event({ createdAt: NOW - 3 * DAY }),
      event({ createdAt: NOW - 1 * DAY }),
      event({ createdAt: NOW - 5 * DAY }),
    ]);
    expect(agg.lastConfirmedAt).toBe(NOW - 1 * DAY);
  });

  it("ignores Flag times when computing lastConfirmedAt", () => {
    const agg = aggregateEvents([
      event({ verdict: "confirm", createdAt: NOW - 4 * DAY }),
      event({ verdict: "flag", reason: "incorrect", createdAt: NOW }),
    ]);
    expect(agg.lastConfirmedAt).toBe(NOW - 4 * DAY);
  });

  it("returns null lastConfirmedAt for a Post with no Confirms", () => {
    const agg = aggregateEvents([
      event({ verdict: "flag", reason: "duplicate" }),
    ]);
    expect(agg.confirms).toBe(0);
    expect(agg.flags).toBe(1);
    expect(agg.lastConfirmedAt).toBeNull();
  });

  it("returns a neutral aggregate for an empty log", () => {
    const agg = aggregateEvents([]);
    expect(agg).toEqual({
      confirms: 0,
      flags: 0,
      trust: 1,
      lastConfirmedAt: null,
    });
  });
});
