import { Hono } from "hono";
import type { Deps } from "../deps.js";
import { DEFAULT_ATTRIBUTION_WINDOW_MS } from "../store/queries.js";

/**
 * Retrieval-telemetry JSON API under `/api/telemetry/*`, role-gated to `admin`
 * (same gate as `/api/admin/*`). Backs the telemetry dashboard's panels. PLO-48
 * ships the recent-Retrievals read; PLO-49/50/51 add their own reads here
 * alongside it (conversion rate, zero-result/volume, tuning detail).
 *
 * Routes:
 *   GET /api/telemetry/recent      → { retrievals: RetrievalRow[] }   most recent queries
 *   GET /api/telemetry/conversion  → ConversionPanelData               Query→Confirm rate + trend
 */
export function mountTelemetry(app: Hono, deps: Deps): void {
  const telemetry = new Hono();

  // Role gate: no session → 401, non-admin → 403 (mirrors api/admin.ts).
  telemetry.use("*", async (c, next) => {
    const session = await deps.authInstance.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) return c.json({ error: "Not signed in" }, 401);
    if (session.user.role !== "admin") {
      return c.json({ error: "Admin role required" }, 403);
    }
    await next();
  });

  telemetry.get("/recent", async (c) => {
    const rows = await deps.repo.listRecentRetrievals(LIST_LIMIT);
    return c.json({ retrievals: rows.map(toRetrievalRow) });
  });

  // Query→Confirm conversion: the headline rate over the range plus a per-day
  // trend. Both figures come from the PLO-48 `conversionStats` helper — the
  // headline is one call over the whole range, each trend point one call over a
  // day-wide sub-range. This route is presentation glue, not its own join.
  telemetry.get("/conversion", async (c) => {
    const to = deps.clock.now();
    const from = to - TREND_DAYS * DAY_MS;
    const windowMs = DEFAULT_ATTRIBUTION_WINDOW_MS;

    const headlineStats = await deps.repo.conversionStats({ from, to, windowMs });
    const trend: ConversionPoint[] = [];
    for (const bucket of dayBuckets(from, to)) {
      const stats = await deps.repo.conversionStats({
        from: bucket.from,
        to: bucket.to,
        windowMs,
      });
      trend.push({
        from: bucket.from,
        to: bucket.to,
        withResults: stats.withResults,
        converted: stats.converted,
      });
    }

    const data: ConversionPanelData = {
      from,
      to,
      windowMs,
      withResults: headlineStats.withResults,
      converted: headlineStats.converted,
      trend,
    };
    return c.json(data);
  });

  app.route("/api/telemetry", telemetry);
}

const LIST_LIMIT = 50;

/** One day in ms — the trend's bucket width and the range's unit. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** How many trailing days the conversion panel's range and trend span. */
const TREND_DAYS = 14;

/** A half-open `[from, to)` day-wide slice of the range, for one trend point. */
type DayBucket = { from: number; to: number };

/**
 * Split `[from, to)` into consecutive day-wide buckets. The final bucket is
 * clamped to `to` so the trend never reads past the requested range. `from`
 * is expected to be `to - n*DAY_MS` (an exact day count), so buckets tile the
 * range without a remainder; the clamp covers any non-aligned caller.
 */
export function dayBuckets(from: number, to: number): DayBucket[] {
  const buckets: DayBucket[] = [];
  for (let start = from; start < to; start += DAY_MS) {
    buckets.push({ from: start, to: Math.min(start + DAY_MS, to) });
  }
  return buckets;
}

/** One point on the conversion trend: a day's converted-of-with-results counts. */
export type ConversionPoint = {
  from: number;
  to: number;
  withResults: number;
  converted: number;
};

/** What the conversion panel renders: the headline counts plus the day trend. */
export type ConversionPanelData = {
  /** Range start (inclusive), unix ms. */
  from: number;
  /** Range end (exclusive), unix ms — the server clock at request time. */
  to: number;
  /** Last-touch attribution window applied to every figure, ms. */
  windowMs: number;
  /** Retrievals-with-results over the whole range (the rate's denominator). */
  withResults: number;
  /** Of those, how many converted over the whole range. */
  converted: number;
  /** Per-day points across the range, oldest first. */
  trend: ConversionPoint[];
};

/** A Retrieval flattened to what the dashboard's recent-Retrievals panel renders. */
export type RetrievalRow = {
  id: string;
  situation: string;
  repo: string | null;
  resultCount: number;
  createdAt: number;
};

function toRetrievalRow(r: {
  id: string;
  situation: string;
  repo: string | null;
  resultCount: number;
  createdAt: number;
}): RetrievalRow {
  return {
    id: r.id,
    situation: r.situation,
    repo: r.repo,
    resultCount: r.resultCount,
    createdAt: r.createdAt,
  };
}
