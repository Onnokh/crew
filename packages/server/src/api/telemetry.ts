import { Hono } from "hono";
import type { Deps } from "../deps.js";
import { DEFAULT_ATTRIBUTION_WINDOW_MS } from "../store/queries.js";
import type { PostRepository } from "../store/repository.js";

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
  const telemetry = new Hono<{ Variables: { teamId: string } }>();

  // Role gate: no session → 401, non-admin → 403 (mirrors api/admin.ts).
  telemetry.use("*", async (c, next) => {
    const session = await deps.authInstance.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) return c.json({ error: "Not signed in" }, 401);
    if (session.user.role !== "admin") {
      return c.json({ error: "Admin role required" }, 403);
    }
    const team = deps.controlPlane.getTeamForUser(session.user.id);
    if (team === null) {
      return c.json({ error: "Admin has no Team" }, 403);
    }
    c.set("teamId", team.id);
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
    const repo = teamRepoForSession(deps, c.get("teamId"));
    const details = await repo.listRecentRetrievalsDetailed(LIST_LIMIT);

    const verdicts = new Map<string, boolean>();
    if (details.length > 0) {
      const to = deps.clock.now();
      const oldest = Math.min(...details.map((d) => d.createdAt));
      const stats = await repo.conversionStats({
        from: oldest,
        to,
        windowMs: DEFAULT_ATTRIBUTION_WINDOW_MS,
      });
      for (const v of stats.byRetrieval) verdicts.set(v.retrievalId, v.converted);
    }

    // Resolve each querying User's id to a display name (control-plane lookup;
    // the corpus DB has no `user` table). Cache by id so repeat searchers cost
    // one lookup, and fall back to null when the User can't be resolved.
    const names = new Map<string, string | null>();
    const resolveUser = (id: string): string | null => {
      if (!names.has(id)) names.set(id, deps.controlPlane.getUser(id)?.name ?? null);
      return names.get(id) ?? null;
    };

    return c.json({
      retrievals: details.map((d) =>
        toRetrievalRow(d, verdicts.get(d.id) ?? false, resolveUser(d.userId)),
      ),
    });
  });

  // Query→Confirm conversion: the headline rate over the range plus a per-day
  // trend. Both figures come from the PLO-48 `conversionStats` helper — the
  // headline is one call over the whole range, each trend point one call over a
  // day-wide sub-range. This route is presentation glue, not its own join.
  telemetry.get("/conversion", async (c) => {
    const repo = teamRepoForSession(deps, c.get("teamId"));
    const { from, to } = await resolveRange(
      { from: numParam(c.req.query("from")), to: numParam(c.req.query("to")) },
      deps.clock.now(),
      repo,
    );
    const windowMs = DEFAULT_ATTRIBUTION_WINDOW_MS;

    const headlineStats = await repo.conversionStats({ from, to, windowMs });
    const prev = previousWindow(from, to);
    const prevStats = await repo.conversionStats({ ...prev, windowMs });
    const trend: ConversionPoint[] = [];
    for (const bucket of trendBuckets(from, to)) {
      const stats = await repo.conversionStats({
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
      flagged: headlineStats.flagged,
      previousConverted: prevStats.converted,
      previousWithResults: prevStats.withResults,
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
    const repo = teamRepoForSession(deps, c.get("teamId"));
    const { from, to } = await resolveRange(
      { from: numParam(c.req.query("from")), to: numParam(c.req.query("to")) },
      deps.clock.now(),
      repo,
    );

    const headline = await repo.coverageStats({ from, to });
    const prevStats = await repo.coverageStats(previousWindow(from, to));
    const trend: CoveragePoint[] = [];
    for (const bucket of trendBuckets(from, to)) {
      const stats = await repo.coverageStats({
        from: bucket.from,
        to: bucket.to,
      });
      trend.push({
        from: bucket.from,
        to: bucket.to,
        total: stats.total,
        zeroResults: stats.zeroResults,
        totalResults: stats.totalResults,
      });
    }

    const data: CoveragePanelData = {
      from,
      to,
      total: headline.total,
      zeroResults: headline.zeroResults,
      totalResults: headline.totalResults,
      previousTotal: prevStats.total,
      previousZeroResults: prevStats.zeroResults,
      trend,
    };
    return c.json(data);
  });

  // Activity feed: recent searches, new Posts, and Confirm/Flag verdicts merged
  // into one time-sorted list (the Events list). The repo returns raw user ids;
  // we resolve each to a display name via the control plane (cached per id).
  telemetry.get("/activity", async (c) => {
    const repo = teamRepoForSession(deps, c.get("teamId"));
    const rows = await repo.recentActivity(LIST_LIMIT);

    const names = new Map<string, string | null>();
    const resolveUser = (id: string): string | null => {
      if (!names.has(id)) names.set(id, deps.controlPlane.getUser(id)?.name ?? null);
      return names.get(id) ?? null;
    };

    const activity: ActivityItem[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      subject: r.subject,
      reason: r.reason,
      resultCount: r.resultCount,
      user: resolveUser(r.userId),
      createdAt: r.createdAt,
    }));
    return c.json({ activity });
  });

  // Posts created: how many Posts were added over the range, plus a per-day
  // trend (the bar chart beside Searches). One `postsCreatedStats` call over the
  // whole range for the headline, one per day-wide bucket for the trend. No
  // pre-aggregated counter; counted straight off `posts.created_at`.
  telemetry.get("/posts", async (c) => {
    const repo = teamRepoForSession(deps, c.get("teamId"));
    const { from, to } = await resolveRange(
      { from: numParam(c.req.query("from")), to: numParam(c.req.query("to")) },
      deps.clock.now(),
      repo,
    );

    const headline = await repo.postsCreatedStats({ from, to });
    const prevStats = await repo.postsCreatedStats(previousWindow(from, to));
    const trend: PostsCreatedPoint[] = [];
    for (const bucket of trendBuckets(from, to)) {
      const stats = await repo.postsCreatedStats({
        from: bucket.from,
        to: bucket.to,
      });
      trend.push({ from: bucket.from, to: bucket.to, created: stats.created });
    }

    const data: PostsCreatedPanelData = {
      from,
      to,
      total: headline.created,
      previousCreated: prevStats.created,
      trend,
    };
    return c.json(data);
  });

  // Top users: per-user usage (posts authored + searches run), ranked by combined
  // activity. The repo returns raw user ids; we resolve each to a display name via
  // the control plane (cached per id) and drop any that can't be resolved.
  telemetry.get("/users", async (c) => {
    const repo = teamRepoForSession(deps, c.get("teamId"));
    const stats = await repo.userActivityStats(LIST_LIMIT);

    const users: UserUsageItem[] = stats.map((s) => ({
      userId: s.userId,
      name: deps.controlPlane.getUser(s.userId)?.name ?? null,
      team: deps.controlPlane.getTeamForUser(s.userId)?.name ?? null,
      lastSeen: s.lastSeen,
      posts: s.posts,
      searches: s.searches,
      total: s.total,
    }));
    return c.json({ users });
  });

  app.route("/api/telemetry", telemetry);
}

function teamRepoForSession(deps: Deps, teamId: unknown) {
  if (typeof teamId !== "string" || teamId.length === 0) {
    throw new Error("Authenticated admin has no Team");
  }
  return deps.teams.getRepository(teamId);
}

const LIST_LIMIT = 50;

/** One day / hour in ms — the trend's bucket units. */
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Default range when the request carries no `from` (last 7 days). */
const DEFAULT_RANGE_DAYS = 7;

/** A half-open `[from, to)` slice of the range, for one trend point. */
type DayBucket = { from: number; to: number };

/**
 * The equal-length window immediately before `[from, to)`, for period-over-period
 * deltas. For "All time" (from clamped to earliest activity) this lands before
 * any data and reads 0 — the client hides the delta for that period anyway.
 */
function previousWindow(from: number, to: number): { from: number; to: number } {
  const span = to - from;
  return { from: from - span, to: from };
}

/** Parse a numeric query param, or undefined when absent/non-numeric. */
function numParam(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Resolve the panel range from `from`/`to` query params. `to` defaults to now.
 * A missing `from` falls back to the last {@link DEFAULT_RANGE_DAYS} days; a
 * `from` of 0 or less means "All time" and is clamped to the earliest activity.
 */
async function resolveRange(
  query: { from?: number; to?: number },
  now: number,
  repo: PostRepository,
): Promise<{ from: number; to: number }> {
  const to = query.to ?? now;
  if (query.from === undefined) return { from: to - DEFAULT_RANGE_DAYS * DAY_MS, to };
  if (query.from <= 0) return { from: (await repo.earliestActivityAt()) ?? to, to };
  return { from: query.from, to };
}

/**
 * Split `[from, to)` into trend buckets, choosing a unit that keeps the point
 * count bounded across every range: hourly up to 2 days, daily up to ~2 months,
 * weekly up to ~1 year, monthly beyond. The final bucket is clamped to `to`.
 */
export function trendBuckets(from: number, to: number): DayBucket[] {
  const span = to - from;
  if (span <= 2 * DAY_MS) return sliceBuckets(from, to, HOUR_MS);
  if (span <= 62 * DAY_MS) return sliceBuckets(from, to, DAY_MS);
  if (span <= 368 * DAY_MS) return sliceBuckets(from, to, 7 * DAY_MS);
  return monthBuckets(from, to);
}

/** Fixed-width buckets tiling `[from, to)`, last one clamped to `to`. */
function sliceBuckets(from: number, to: number, width: number): DayBucket[] {
  const buckets: DayBucket[] = [];
  for (let start = from; start < to; start += width) {
    buckets.push({ from: start, to: Math.min(start + width, to) });
  }
  return buckets;
}

/** Calendar-month buckets tiling `[from, to)`, last one clamped to `to`. */
function monthBuckets(from: number, to: number): DayBucket[] {
  const buckets: DayBucket[] = [];
  let start = from;
  while (start < to) {
    const d = new Date(start);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    buckets.push({ from: start, to: Math.min(next, to) });
    start = next;
  }
  return buckets;
}

/**
 * Split `[from, to)` into consecutive day-wide buckets. The final bucket is
 * clamped to `to` so the trend never reads past the requested range.
 */
export function dayBuckets(from: number, to: number): DayBucket[] {
  return sliceBuckets(from, to, DAY_MS);
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
  /** Of those, how many were flagged over the whole range. */
  flagged: number;
  /** Converted count over the preceding equal-length window (for the delta). */
  previousConverted: number;
  /** Retrievals-with-results over the preceding window (the previous rate's denominator). */
  previousWithResults: number;
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
  /** Total Posts returned by Retrievals that day. */
  totalResults: number;
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
  /** Total Posts returned over the range. */
  totalResults: number;
  /** Total searches over the preceding equal-length window (for the delta). */
  previousTotal: number;
  /** Zero-result searches over the preceding equal-length window (for the delta). */
  previousZeroResults: number;
  /** Per-day points across the range, oldest first. */
  trend: CoveragePoint[];
};

/** One point on the posts-created trend: a day's count of new Posts. */
export type PostsCreatedPoint = {
  from: number;
  to: number;
  /** Posts created that day. */
  created: number;
};

/**
 * What the posts-created panel renders: the headline total of Posts created over
 * the range plus a per-day trend. Read straight off `posts.created_at`.
 */
export type PostsCreatedPanelData = {
  /** Range start (inclusive), unix ms. */
  from: number;
  /** Range end (exclusive), unix ms — the server clock at request time. */
  to: number;
  /** Posts created over the whole range. */
  total: number;
  /** Posts created over the preceding equal-length window (for the delta). */
  previousCreated: number;
  /** Per-day points across the range, oldest first. */
  trend: PostsCreatedPoint[];
};

/** One row of the top-users list, with the User resolved to a name. */
export type UserUsageItem = {
  userId: string;
  /** Display name of the User, or null if it could not be resolved. */
  name: string | null;
  /** Name of the Team this User belongs to, or null if none could be resolved. */
  team: string | null;
  /** When this User was last active (newest post or search), unix ms; null if never. */
  lastSeen: number | null;
  /** Posts authored by this User. */
  posts: number;
  /** Searches run by this User. */
  searches: number;
  /** Combined activity (`posts + searches`), the ranking key. */
  total: number;
};

/** One row of the activity feed (the Events list), with the User resolved to a name. */
export type ActivityItem = {
  id: string;
  kind: "search" | "post" | "confirm" | "flag";
  /** Post title (post/confirm/flag) or the search situation. */
  subject: string;
  /** Flag reason; null for every other kind. */
  reason: string | null;
  /** Result count for a search; null for every other kind. */
  resultCount: number | null;
  /** Display name of the acting User, or null if it could not be resolved. */
  user: string | null;
  createdAt: number;
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
  /** Display name of the querying User, or null if it could not be resolved. */
  user: string | null;
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
  user: string | null,
): RetrievalRow {
  return {
    id: r.id,
    situation: r.situation,
    repo: r.repo,
    resultCount: r.resultCount,
    createdAt: r.createdAt,
    user,
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
