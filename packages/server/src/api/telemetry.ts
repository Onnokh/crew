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
 *   GET /api/telemetry/coverage    → CoveragePanelData                 zero-result rate + query volume, with a per-day trend
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

  // Recent retrievals, enriched into the tuning view (PLO-51): each retrieval
  // carries its returned Posts (rank + full score breakdown) and a converted?
  // indicator. The converted? value comes from the PLO-48 `conversionStats`
  // helper, indexed by retrievalId — not a re-implemented join. We run
  // conversionStats once over a range that covers every listed retrieval (oldest
  // listed `created_at` → now), so each retrieval gets its full attribution
  // window; retrievals with zero results never appear in `byRetrieval` and stay
  // converted: false.
  telemetry.get("/recent", async (c) => {
    const details = await deps.repo.listRecentRetrievalsDetailed(LIST_LIMIT);

    const verdicts = new Map<string, boolean>();
    if (details.length > 0) {
      const to = deps.clock.now();
      const oldest = Math.min(...details.map((d) => d.createdAt));
      const stats = await deps.repo.conversionStats({
        from: oldest,
        to,
        windowMs: DEFAULT_ATTRIBUTION_WINDOW_MS,
      });
      for (const v of stats.byRetrieval) verdicts.set(v.retrievalId, v.converted);
    }

    return c.json({
      retrievals: details.map((d) => toRetrievalRow(d, verdicts.get(d.id) ?? false)),
    });
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

  // Coverage & volume: the zero-result rate (the coverage gap, tracked apart
  // from conversion) and the query volume, both over the range, plus a per-day
  // trend. Every figure is `coverageStats` over the raw `retrievals` rows — one
  // call over the whole range for the headline, one per day-wide bucket for the
  // trend. No pre-aggregated counter; the rate is `zeroResults / total`.
  telemetry.get("/coverage", async (c) => {
    const to = deps.clock.now();
    const from = to - TREND_DAYS * DAY_MS;

    const headline = await deps.repo.coverageStats({ from, to });
    const trend: CoveragePoint[] = [];
    for (const bucket of dayBuckets(from, to)) {
      const stats = await deps.repo.coverageStats({
        from: bucket.from,
        to: bucket.to,
      });
      trend.push({
        from: bucket.from,
        to: bucket.to,
        total: stats.total,
        zeroResults: stats.zeroResults,
      });
    }

    const data: CoveragePanelData = {
      from,
      to,
      total: headline.total,
      zeroResults: headline.zeroResults,
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

/** One point on the coverage/volume trend: a day's total + zero-result counts. */
export type CoveragePoint = {
  from: number;
  to: number;
  /** Retrievals that day, regardless of result count (the query volume). */
  total: number;
  /** Of those, how many returned zero Posts. */
  zeroResults: number;
};

/**
 * What the coverage & volume panels render: the headline counts over the range
 * plus a per-day trend. The zero-result rate is `zeroResults / total`; `total`
 * alone is the query volume. Both panels read this one payload.
 */
export type CoveragePanelData = {
  /** Range start (inclusive), unix ms. */
  from: number;
  /** Range end (exclusive), unix ms — the server clock at request time. */
  to: number;
  /** Retrievals over the whole range (the volume; the rate's denominator). */
  total: number;
  /** Of those, how many returned zero Posts (the rate's numerator). */
  zeroResults: number;
  /** Per-day points across the range, oldest first. */
  trend: CoveragePoint[];
};

/** One returned Post within a retrieval, as the tuning view renders it. */
export type RetrievalResultRow = {
  postId: string;
  /** The Post's current title, or null if it was retired/deleted (show postId). */
  postTitle: string | null;
  rank: number;
  rrfScore: number;
  trust: number;
  recency: number;
  repoBoost: number;
  final: number;
};

/**
 * A Retrieval flattened to what the tuning view renders: the situation, its
 * returned Posts (rank + score breakdown), and a converted? indicator (derived
 * from `conversionStats.byRetrieval`).
 */
export type RetrievalRow = {
  id: string;
  situation: string;
  repo: string | null;
  resultCount: number;
  createdAt: number;
  /** True iff the querying User later Confirmed a returned Post in window. */
  converted: boolean;
  results: RetrievalResultRow[];
};

function toRetrievalRow(
  r: {
    id: string;
    situation: string;
    repo: string | null;
    resultCount: number;
    createdAt: number;
    results: RetrievalResultRow[];
  },
  converted: boolean,
): RetrievalRow {
  return {
    id: r.id,
    situation: r.situation,
    repo: r.repo,
    resultCount: r.resultCount,
    createdAt: r.createdAt,
    converted,
    results: r.results.map((res) => ({
      postId: res.postId,
      postTitle: res.postTitle,
      rank: res.rank,
      rrfScore: res.rrfScore,
      trust: res.trust,
      recency: res.recency,
      repoBoost: res.repoBoost,
      final: res.final,
    })),
  };
}
