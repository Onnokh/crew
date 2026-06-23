import { describe, expect, it } from "vitest";
import { dayBuckets, trendBuckets } from "./telemetry.js";

const HOUR = 60 * 60 * 1000;
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

// trendBuckets keeps the point count bounded by widening the unit with the
// range: hourly for short spans, daily, weekly, then monthly.
describe("trendBuckets", () => {
  it("uses hourly buckets for a span up to 2 days", () => {
    const buckets = trendBuckets(0, 6 * HOUR);
    expect(buckets).toHaveLength(6);
    expect(buckets[0]).toEqual({ from: 0, to: HOUR });
  });

  it("uses daily buckets for a multi-week span", () => {
    const buckets = trendBuckets(0, 7 * DAY);
    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toEqual({ from: 0, to: DAY });
  });

  it("uses weekly buckets for a span up to ~1 year", () => {
    const buckets = trendBuckets(0, 70 * DAY);
    expect(buckets).toHaveLength(10);
    expect(buckets[0]).toEqual({ from: 0, to: 7 * DAY });
  });

  it("uses monthly buckets for a multi-year span", () => {
    // Two calendar years from 1970 → 24 month buckets.
    const twoYears = Date.UTC(1972, 0, 1) - Date.UTC(1970, 0, 1);
    const buckets = trendBuckets(0, twoYears);
    expect(buckets.length).toBeGreaterThanOrEqual(23);
    expect(buckets.length).toBeLessThanOrEqual(25);
  });
});
