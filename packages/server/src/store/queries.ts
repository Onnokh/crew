import type { Database } from "better-sqlite3";

/** A keyword (FTS5) candidate: a Post id paired with its FTS5 rank. */
export type Candidate = {
  postId: string;
  /** FTS5 relevance rank (bm25, more-negative = better). */
  ftsRank: number;
};

/** A vector (sqlite-vec) candidate: a Post id paired with its cosine distance. */
export type VecCandidate = {
  postId: string;
  /** Cosine distance to the query vector (0 = identical, larger = farther). */
  distance: number;
};

/**
 * Keyword (FTS5) search over Posts' situation + body, active only, capped at
 * `limit`. The query is tokenized into a safe FTS5 MATCH expression so freeform
 * text can never be read as FTS5 query syntax.
 */
export function keywordSearch(
  raw: Database,
  query: string,
  limit: number,
): Candidate[] {
  const match = toMatchExpression(query);
  if (match === null) return [];

  const rows = raw
    .prepare(
      `SELECT p.id AS postId, posts_fts.rank AS ftsRank
         FROM posts_fts
         JOIN posts p ON p.rowid = posts_fts.rowid
        WHERE posts_fts MATCH ?
          AND p.status = 'active'
        ORDER BY posts_fts.rank
        LIMIT ?`,
    )
    .all(match, limit) as Array<{ postId: string; ftsRank: number }>;

  return rows.map((r) => ({ postId: r.postId, ftsRank: r.ftsRank }));
}

/**
 * Turn freeform query text into a safe FTS5 MATCH expression: word-ish tokens,
 * each double-quoted (so FTS5 operators can't be interpreted), OR'd together.
 * Returns null when nothing searchable remains.
 */
function toMatchExpression(query: string): string | null {
  const tokens = query.match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

/**
 * Store a Post's two embeddings in the `posts_vec` vec0 table, keyed by Post id.
 * Idempotent on re-embed: deletes any prior row for the id first.
 */
export function insertEmbeddings(
  raw: Database,
  postId: string,
  situationEmbedding: number[],
  environmentEmbedding: number[],
): void {
  raw.prepare("DELETE FROM posts_vec WHERE post_id = ?").run(postId);
  raw
    .prepare(
      `INSERT INTO posts_vec (post_id, situation_embedding, environment_embedding)
       VALUES (?, ?, ?)`,
    )
    .run(postId, serialize(situationEmbedding), serialize(environmentEmbedding));
}

/**
 * Vector (sqlite-vec) KNN over active Posts by cosine distance against
 * `situation_embedding`, nearest-first, capped at `limit`. sqlite-vec's KNN
 * requires the `k = ?` constraint; retired rows are dropped via the join.
 */
export function vectorSearch(
  raw: Database,
  queryEmbedding: number[],
  limit: number,
): VecCandidate[] {
  return vectorSearchByColumn(raw, "situation_embedding", queryEmbedding, limit);
}

/**
 * Vector (sqlite-vec) KNN over active Posts by cosine distance against
 * `environment_embedding`, nearest-first, capped at `limit`.
 */
export function environmentVectorSearch(
  raw: Database,
  queryEmbedding: number[],
  limit: number,
): VecCandidate[] {
  return vectorSearchByColumn(raw, "environment_embedding", queryEmbedding, limit);
}

function vectorSearchByColumn(
  raw: Database,
  column: "situation_embedding" | "environment_embedding",
  queryEmbedding: number[],
  limit: number,
): VecCandidate[] {
  const rows = raw
    .prepare(
      `SELECT v.post_id AS postId, v.distance AS distance
         FROM posts_vec v
         JOIN posts p ON p.id = v.post_id
        WHERE v.${column} MATCH ?
          AND v.k = ?
          AND p.status = 'active'
        ORDER BY v.distance`,
    )
    .all(serialize(queryEmbedding), limit) as Array<{
    postId: string;
    distance: number;
  }>;

  return rows.map((r) => ({ postId: r.postId, distance: r.distance }));
}

/** Serialize an embedding to the little-endian Float32 buffer sqlite-vec expects. */
function serialize(embedding: number[]): Uint8Array {
  return new Uint8Array(Float32Array.from(embedding).buffer);
}

/**
 * Fetch every PostEvent for the given Post ids in one read, ordered
 * `created_at DESC` so callers can take the most recent Notes directly.
 */
export function eventsForPosts(
  raw: Database,
  postIds: readonly string[],
): PostEventRow[] {
  if (postIds.length === 0) return [];
  const placeholders = postIds.map(() => "?").join(", ");
  const rows = raw
    .prepare(
      `SELECT id, post_id, verdict, reason, note, created_by, created_at
         FROM post_events
        WHERE post_id IN (${placeholders})
        ORDER BY created_at DESC, id DESC`,
    )
    .all(...postIds) as PostEventRow[];
  return rows;
}

/** A row as stored in `post_events`, for typing the raw-SQL read path. */
export type PostEventRow = {
  id: string;
  post_id: string;
  verdict: string;
  reason: string | null;
  note: string | null;
  created_by: string;
  created_at: number;
};

/** One returned Post's score breakdown, as captured into `retrieval_results`. */
export type NewRetrievalResult = {
  postId: string;
  /** 1-based position in the returned list. */
  rank: number;
  rrfScore: number;
  trust: number;
  recency: number;
  repoBoost: number;
  final: number;
};

/** The fields a caller supplies to record a Retrieval; the store stamps ids/time. */
export type NewRetrieval = {
  userId: string;
  repo: string | null;
  situation: string;
  environment: string | null;
  limit: number;
  /** The ranked results' score breakdowns; empty for a zero-result query. */
  results: NewRetrievalResult[];
};

/** A Retrieval row flattened for the recent-Retrievals dashboard panel. */
export type RecentRetrievalRow = {
  id: string;
  userId: string;
  repo: string | null;
  situation: string;
  environment: string | null;
  limit: number;
  resultCount: number;
  createdAt: number;
};

/**
 * One returned Post within a Retrieval, as the tuning view (PLO-51) renders it:
 * the rank, a human-readable label for the Post (its current `title`, or null if
 * the Post has since been retired/deleted — callers fall back to `postId`), and
 * the full captured score breakdown so a row can explain why it ranked here.
 */
export type RecentRetrievalResultRow = {
  postId: string;
  /** The Post's current title, or null if the Post no longer exists. */
  postTitle: string | null;
  /** 1-based position in the returned list. */
  rank: number;
  rrfScore: number;
  trust: number;
  recency: number;
  repoBoost: number;
  final: number;
};

/**
 * A Retrieval plus its returned Posts (rank + score breakdown), for the tuning
 * view. The retrieval-level fields mirror {@link RecentRetrievalRow}; `results`
 * carries one {@link RecentRetrievalResultRow} per returned Post, by rank. The
 * converted? verdict is NOT here — it is derived in the API handler from the
 * PLO-48 `conversionStats` helper, never re-joined in SQL.
 */
export type RecentRetrievalDetail = RecentRetrievalRow & {
  results: RecentRetrievalResultRow[];
};

/**
 * The read-time parameters for {@link conversionStats}: the half-open range
 * `[from, to)` over a retrieval's `created_at`, and the attribution window in ms
 * (default 7 days) a Confirm must fall within after the retrieval. All three are
 * read-time only — no stored FK, no migration changes them.
 */
export type ConversionWindow = {
  from: number;
  to: number;
  windowMs: number;
};

/** Default attribution window: a Confirm within 7 days of the retrieval converts. */
export const DEFAULT_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** One Retrieval's conversion verdict, for PLO-51's "did THIS retrieval convert?". */
export type RetrievalConversion = {
  retrievalId: string;
  converted: boolean;
  /** Whether a returned Post was Flagged by the same User within the window. */
  flagged: boolean;
};

/**
 * Conversion attribution over Retrievals-with-results: the denominator (count of
 * retrievals in range that returned ≥1 Post), the converted count, and the
 * per-retrieval verdicts. PLO-49 reads `converted`/`withResults` for a rate;
 * PLO-51 reads `byRetrieval` to ask about one retrieval.
 */
export type ConversionStats = {
  /** Retrievals in `[from, to)` that returned at least one Post. */
  withResults: number;
  /**
   * Of those, how many converted: a returned Post was Confirmed by the same User
   * within the window (any-touch — a single Confirm credits every retrieval in
   * the window that returned that Post, so re-querying for the same Post before
   * confirming can count more than once).
   */
  converted: number;
  /** Of those, how many were Flagged by the same User within the window. */
  flagged: number;
  /** Per-retrieval verdicts, newest retrieval first. */
  byRetrieval: RetrievalConversion[];
};

/**
 * A half-open `[from, to)` range over a retrieval's `created_at`, unix ms. The
 * read-time window for {@link coverageStats} — no stored range, no migration.
 */
export type CoverageWindow = {
  from: number;
  to: number;
};

/**
 * Coverage counts over the raw `retrievals` rows in `[from, to)`: how many
 * queries ran in total and how many returned nothing (`result_count = 0`). The
 * zero-result rate is `zeroResults / total` — the coverage gap, read straight
 * from the log with no pre-aggregated counter. `total` is also the query volume
 * over the range, so this one read backs both the coverage and volume figures.
 */
export type CoverageStats = {
  /** Retrievals in `[from, to)`, regardless of result count (the query volume). */
  total: number;
  /** Of those, how many returned zero Posts (`result_count = 0`). */
  zeroResults: number;
  /** Total Posts returned across all Retrievals in the range. */
  totalResults: number;
};

/**
 * Count total Retrievals and zero-result Retrievals in `[from, to)` over the raw
 * rows in one pass. `zeroResults` filters on `result_count = 0`; `total` counts
 * every row. Both come from a single scan so a per-day series (one call per
 * bucket) stays cheap. No materialized counter — read directly from the log.
 */
export function coverageStats(
  raw: Database,
  window: CoverageWindow,
): CoverageStats {
  const row = raw
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN result_count = 0 THEN 1 ELSE 0 END), 0) AS zeroResults,
              COALESCE(SUM(result_count), 0) AS totalResults
         FROM retrievals
        WHERE created_at >= ?
          AND created_at < ?`,
    )
    .get(window.from, window.to) as {
    total: number;
    zeroResults: number;
    totalResults: number;
  };
  return {
    total: row.total,
    zeroResults: row.zeroResults,
    totalResults: row.totalResults,
  };
}

/** How many Posts were created in a `[from, to)` range — see {@link postsCreatedStats}. */
export type PostsCreatedStats = {
  /** Posts whose `created_at` falls in the range. */
  created: number;
};

/**
 * Count Posts created in `[from, to)` over the raw `posts` rows. One call over
 * the whole range gives the headline; one per day-wide bucket builds the trend.
 * No materialized counter — read directly from `posts.created_at`.
 */
export function postsCreatedStats(
  raw: Database,
  window: CoverageWindow,
): PostsCreatedStats {
  const row = raw
    .prepare(
      `SELECT COUNT(*) AS created
         FROM posts
        WHERE created_at >= ?
          AND created_at < ?`,
    )
    .get(window.from, window.to) as { created: number };
  return { created: row.created };
}

/** One repo's Post tally (see {@link postsByRepo}). */
export type RepoPostCount = {
  /** The git repo a Post was authored from (`posts.repo`). */
  repo: string;
  /** Posts in the corpus that carry this repo. */
  posts: number;
};

/**
 * Posts grouped by their originating `repo`, busiest first. A plain
 * `GROUP BY repo` over every Post in the corpus — no time window, no status
 * filter — backing the team detail page's per-project breakdown.
 */
export function postsByRepo(raw: Database): RepoPostCount[] {
  return raw
    .prepare(
      `SELECT repo, COUNT(*) AS posts
         FROM posts
        GROUP BY repo
        ORDER BY posts DESC, repo`,
    )
    .all() as RepoPostCount[];
}

/**
 * The earliest `created_at` across all activity logs (retrievals, posts,
 * post_events), or null when every log is empty. Backs the "All time" range —
 * the dashboard clamps its `from` to this so the trend starts at real data.
 */
export function earliestActivityAt(raw: Database): number | null {
  const row = raw
    .prepare(
      `SELECT MIN(at) AS earliest FROM (
              SELECT MIN(created_at) AS at FROM retrievals
        UNION SELECT MIN(created_at) FROM posts
        UNION SELECT MIN(created_at) FROM post_events
       )`,
    )
    .get() as { earliest: number | null };
  return row.earliest;
}

/** One user's lifetime usage tally (see {@link userActivityStats}). */
export type UserActivityStat = {
  /** The acting User's id; resolved to a name at the API. */
  userId: string;
  /** Posts authored by this User. */
  posts: number;
  /** Searches run by this User. */
  searches: number;
  /** Combined activity (`posts + searches`), the ranking key. */
  total: number;
  /** When this User was last active (newest post or search), unix ms. */
  lastSeen: number;
};

/**
 * Per-user usage since `sinceMs`: posts authored (`posts.created_by`) and
 * searches run (`retrievals.user_id`), tallied per User and ranked by combined
 * activity, newest-busiest first, capped at `limit`. Only activity at or after
 * `sinceMs` counts, so the ranking is a rolling window, not a lifetime tally. A
 * `UNION ALL` over the two logs grouped by user id — no materialized counter.
 * User-id → name resolution is the API's job (the corpus DB has no `user` table).
 */
export function userActivityStats(
  raw: Database,
  limit: number,
  sinceMs: number,
): UserActivityStat[] {
  const rows = raw
    .prepare(
      `SELECT userId,
              COALESCE(SUM(isPost), 0) AS posts,
              COALESCE(SUM(isSearch), 0) AS searches,
              MAX(ts) AS lastSeen
         FROM (
                SELECT created_by AS userId, 1 AS isPost, 0 AS isSearch, created_at AS ts FROM posts
          UNION ALL
                SELECT user_id AS userId, 0 AS isPost, 1 AS isSearch, created_at AS ts FROM retrievals
         )
        WHERE ts >= ?
        GROUP BY userId
        ORDER BY posts + searches DESC, userId
        LIMIT ?`,
    )
    .all(sinceMs, limit) as Array<{
    userId: string;
    posts: number;
    searches: number;
    lastSeen: number;
  }>;
  return rows.map((r) => ({
    userId: r.userId,
    posts: r.posts,
    searches: r.searches,
    total: r.posts + r.searches,
    lastSeen: r.lastSeen,
  }));
}

/** One row of the unified recent-activity feed (see {@link recentActivity}). */
export type ActivityRow = {
  id: string;
  /** What happened: a search, a new Post, or a verdict against a Post. */
  kind: "search" | "post" | "confirm" | "flag";
  /** The Post title (for post/confirm/flag) or the search situation. */
  subject: string;
  /** Flag reason (incorrect | stale | duplicate); null for every other kind. */
  reason: string | null;
  /** Result count for a search; null for every other kind. */
  resultCount: number | null;
  /** The acting User's id (searcher or event author); resolved to a name at the API. */
  userId: string;
  /** When it happened, unix ms. */
  createdAt: number;
};

/**
 * The unified activity feed: recent searches, new Posts, and Confirm/Flag
 * verdicts merged into one time-sorted list. A `UNION ALL` across `retrievals`,
 * `posts`, and `post_events` (joined to `posts` for the title), newest first,
 * capped at `limit`. User-id → name resolution is the API's job (the corpus DB
 * has no `user` table). No materialized feed — read straight off the logs.
 */
export function recentActivity(raw: Database, limit: number): ActivityRow[] {
  const rows = raw
    .prepare(
      `SELECT id, 'search' AS kind, situation AS subject,
              NULL AS reason, result_count AS resultCount,
              user_id AS userId, created_at AS createdAt
         FROM retrievals
        UNION ALL
       SELECT id, 'post' AS kind, COALESCE(title, situation) AS subject,
              NULL AS reason, NULL AS resultCount,
              created_by AS userId, created_at AS createdAt
         FROM posts
        UNION ALL
       SELECT pe.id, pe.verdict AS kind, COALESCE(p.title, p.situation) AS subject,
              pe.reason AS reason, NULL AS resultCount,
              pe.created_by AS userId, pe.created_at AS createdAt
         FROM post_events pe
         JOIN posts p ON p.id = pe.post_id
        ORDER BY createdAt DESC
        LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    kind: ActivityRow["kind"];
    subject: string;
    reason: string | null;
    resultCount: number | null;
    userId: string;
    createdAt: number;
  }>;
  return rows;
}

/**
 * Insert one Retrieval and its result rows in a single transaction. `id` and
 * `resultIds` are minted by the caller (the repo's IdGen) so this helper stays a
 * pure writer. Result rows are skipped for a zero-result query.
 */
export function insertRetrieval(
  raw: Database,
  row: {
    id: string;
    userId: string;
    repo: string | null;
    situation: string;
    environment: string | null;
    limit: number;
    createdAt: number;
  },
  results: Array<{ id: string } & NewRetrievalResult>,
): void {
  raw.transaction(() => {
    raw
      .prepare(
        `INSERT INTO retrievals
           (id, user_id, repo, situation, environment, "limit", result_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.userId,
        row.repo,
        row.situation,
        row.environment,
        row.limit,
        results.length,
        row.createdAt,
      );

    const insertResult = raw.prepare(
      `INSERT INTO retrieval_results
         (id, retrieval_id, post_id, rank, rrf_score, trust, recency, repo_boost, final)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of results) {
      insertResult.run(
        r.id,
        row.id,
        r.postId,
        r.rank,
        r.rrfScore,
        r.trust,
        r.recency,
        r.repoBoost,
        r.final,
      );
    }
  })();
}

/** The most recent Retrievals, newest first, capped at `limit`. */
export function recentRetrievals(
  raw: Database,
  limit: number,
): RecentRetrievalRow[] {
  const rows = raw
    .prepare(
      `SELECT id, user_id, repo, situation, environment, "limit", result_count, created_at
         FROM retrievals
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    user_id: string;
    repo: string | null;
    situation: string;
    environment: string | null;
    limit: number;
    result_count: number;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    repo: r.repo,
    situation: r.situation,
    environment: r.environment,
    limit: r.limit,
    resultCount: r.result_count,
    createdAt: r.created_at,
  }));
}

/**
 * The most recent Retrievals, newest first, capped at `limit`, each carrying its
 * returned Posts (rank + full score breakdown) for the tuning view. Two reads:
 * the retrieval rows, then their result rows in one batched query, left-joined to
 * `posts` for a human-readable title (a retired/deleted Post yields a null
 * title, which the caller renders as the bare `post_id`). Results are grouped
 * back onto their retrieval and ordered by rank. The converted? verdict is left
 * to the caller — it comes from `conversionStats`, not from this read.
 */
export function recentRetrievalsDetailed(
  raw: Database,
  limit: number,
): RecentRetrievalDetail[] {
  const retrievals = recentRetrievals(raw, limit);
  if (retrievals.length === 0) return [];

  const placeholders = retrievals.map(() => "?").join(", ");
  const resultRows = raw
    .prepare(
      `SELECT rr.retrieval_id AS retrievalId,
              rr.post_id AS postId,
              p.title AS postTitle,
              rr.rank AS rank,
              rr.rrf_score AS rrfScore,
              rr.trust AS trust,
              rr.recency AS recency,
              rr.repo_boost AS repoBoost,
              rr.final AS final
         FROM retrieval_results rr
         LEFT JOIN posts p ON p.id = rr.post_id
        WHERE rr.retrieval_id IN (${placeholders})
        ORDER BY rr.retrieval_id, rr.rank`,
    )
    .all(...retrievals.map((r) => r.id)) as Array<
    { retrievalId: string } & RecentRetrievalResultRow
  >;

  const byRetrieval = new Map<string, RecentRetrievalResultRow[]>();
  for (const row of resultRows) {
    const list = byRetrieval.get(row.retrievalId) ?? [];
    list.push({
      postId: row.postId,
      postTitle: row.postTitle,
      rank: row.rank,
      rrfScore: row.rrfScore,
      trust: row.trust,
      recency: row.recency,
      repoBoost: row.repoBoost,
      final: row.final,
    });
    byRetrieval.set(row.retrievalId, list);
  }

  return retrievals.map((r) => ({
    ...r,
    results: byRetrieval.get(r.id) ?? [],
  }));
}

/**
 * Conversion attribution over Retrievals-with-results. For each retrieval in
 * `[from, to)` that returned ≥1 Post, a Confirm converts it iff: the Confirm is
 * by the SAME User who queried (`retrievals.user_id = pe.created_by`), on one of
 * the retrieval's returned Posts, recorded strictly AFTER the retrieval
 * (`pe.created_at > r.created_at`) and within the window
 * (`pe.created_at <= r.created_at + windowMs`). All thresholds are read-time
 * arguments over the raw rows — no stored attribution.
 *
 * This is ANY-TOUCH, not last-touch: there is no `retrieval_id` on a Confirm, so
 * the join can match one Confirm to several retrievals. A single Confirm credits
 * EVERY retrieval in the window that returned that Post — re-querying for the
 * same Post before confirming counts more than once. Last-touch would add a
 * `NOT EXISTS (a later retrieval of the Post before the Confirm)` clause.
 */
export function conversionStats(
  raw: Database,
  window: ConversionWindow,
): ConversionStats {
  const rows = raw
    .prepare(
      `SELECT r.id AS retrievalId,
              EXISTS (
                SELECT 1
                  FROM retrieval_results rr
                  JOIN post_events pe ON pe.post_id = rr.post_id
                 WHERE rr.retrieval_id = r.id
                   AND pe.verdict = 'confirm'
                   AND pe.created_by = r.user_id
                   AND pe.created_at > r.created_at
                   AND pe.created_at <= r.created_at + ?
              ) AS converted,
              EXISTS (
                SELECT 1
                  FROM retrieval_results rr
                  JOIN post_events pe ON pe.post_id = rr.post_id
                 WHERE rr.retrieval_id = r.id
                   AND pe.verdict = 'flag'
                   AND pe.created_by = r.user_id
                   AND pe.created_at > r.created_at
                   AND pe.created_at <= r.created_at + ?
              ) AS flagged
         FROM retrievals r
        WHERE r.created_at >= ?
          AND r.created_at < ?
          AND r.result_count > 0
        ORDER BY r.created_at DESC, r.id DESC`,
    )
    .all(window.windowMs, window.windowMs, window.from, window.to) as Array<{
    retrievalId: string;
    converted: number;
    flagged: number;
  }>;

  const byRetrieval: RetrievalConversion[] = rows.map((row) => ({
    retrievalId: row.retrievalId,
    converted: row.converted === 1,
    flagged: row.flagged === 1,
  }));
  const converted = byRetrieval.reduce((n, r) => n + (r.converted ? 1 : 0), 0);
  const flagged = byRetrieval.reduce((n, r) => n + (r.flagged ? 1 : 0), 0);
  return { withResults: byRetrieval.length, converted, flagged, byRetrieval };
}
