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
  /** Of those, how many converted (last-touch Confirm by the same User in window). */
  converted: number;
  /** Per-retrieval verdicts, newest retrieval first. */
  byRetrieval: RetrievalConversion[];
};

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
 * Conversion attribution over Retrievals-with-results. For each retrieval in
 * `[from, to)` that returned ≥1 Post, a last-touch Confirm converts it iff: the
 * Confirm is by the SAME User who queried (`retrievals.user_id = pe.created_by`),
 * on one of the retrieval's returned Posts, recorded strictly AFTER the
 * retrieval (`pe.created_at > r.created_at`) and within the window
 * (`pe.created_at <= r.created_at + windowMs`). All thresholds are read-time
 * arguments over the raw rows — no stored attribution.
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
              ) AS converted
         FROM retrievals r
        WHERE r.created_at >= ?
          AND r.created_at < ?
          AND r.result_count > 0
        ORDER BY r.created_at DESC, r.id DESC`,
    )
    .all(window.windowMs, window.from, window.to) as Array<{
    retrievalId: string;
    converted: number;
  }>;

  const byRetrieval: RetrievalConversion[] = rows.map((row) => ({
    retrievalId: row.retrievalId,
    converted: row.converted === 1,
  }));
  const converted = byRetrieval.reduce((n, r) => n + (r.converted ? 1 : 0), 0);
  return { withResults: byRetrieval.length, converted, byRetrieval };
}
