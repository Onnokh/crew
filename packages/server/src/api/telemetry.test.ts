import { describe, expect, it } from "vitest";
import { dayBuckets } from "./telemetry.js";

const DAY = 24 * 60 * 60 * 1000;

// The conversion panel's trend reads `conversionStats` once per day-wide bucket,
// so the bucketing must tile the range exactly and never read past its end.
describe("dayBuckets", () => {
  it("tiles an exact day-count range into consecutive half-open buckets", () => {
    const buckets = dayBuckets(0, 3 * DAY);
    expect(buckets).toEqual([
      { from: 0, to: DAY },
      { from: DAY, to: 2 * DAY },
      { from: 2 * DAY, to: 3 * DAY },
    ]);
  });

  it("clamps the final bucket to `to` for a non-day-aligned range", () => {
    const buckets = dayBuckets(0, DAY + 5);
    expect(buckets).toEqual([
      { from: 0, to: DAY },
      { from: DAY, to: DAY + 5 },
    ]);
  });

  it("returns no buckets for an empty range", () => {
    expect(dayBuckets(100, 100)).toEqual([]);
  });
});
