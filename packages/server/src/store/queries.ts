import type { Database } from "better-sqlite3";

/**
 * A raw keyword (FTS5) candidate: a Post id paired with its FTS5 rank. The store
 * returns these — ids and ranks only, never ranked Posts (see TECH.md "Storage
 * knows nothing about ranking"). The vector leg returns {@link VecCandidate}s
 * separately; `search` fuses the two ordered lists with RRF, the store never
 * mixes them.
 */
export type Candidate = {
  /** The candidate Post's id. */
  postId: string;
  /**
   * FTS5 relevance rank (its `rank` column — bm25, more-negative = better).
   * Raw signal only; the store does not order, weight, or trust it.
   */
  ftsRank: number;
};

/**
 * A raw vector (sqlite-vec) candidate: a Post id paired with its cosine distance
 * from the query vector (smaller = nearer). Same contract as {@link Candidate} —
 * a raw signal in the index's own order, never a ranked Post. `search` turns the
 * order into ranks and fuses it with the keyword list via RRF.
 */
export type VecCandidate = {
  /** The candidate Post's id. */
  postId: string;
  /** Cosine distance to the query vector (0 = identical, larger = farther). */
  distance: number;
};

/**
 * Keyword (FTS5) search over Posts' situation + body. Returns raw candidates —
 * the matching Post ids and their FTS5 rank — in the index's relevance order,
 * capped at `limit`. Active Posts only; retired Posts are invisible to search.
 *
 * This is raw SQL (not Drizzle) because FTS5 is a virtual table Drizzle does not
 * model. The query string is tokenized into a safe FTS5 MATCH expression so an
 * agent's freeform situation text can never be read as FTS5 query syntax.
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
 * Turn freeform query text into a safe FTS5 MATCH expression: extract word-ish
 * tokens, wrap each as a double-quoted FTS5 string literal (so punctuation and
 * FTS5 operators like AND/OR/NEAR/`*` can never be interpreted), and OR them so
 * any term can match. Returns null when nothing searchable remains.
 */
function toMatchExpression(query: string): string | null {
  const tokens = query.match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

/**
 * Store a Post's two embeddings in the `posts_vec` vec0 table, keyed by Post id.
 * Called by the repository at write time inside the same transaction as the row
 * insert — a Post and its vectors are written together, so a Post is never
 * visible to the keyword leg without also being visible to the vector leg
 * (see TECH.md "fail the write loudly"). Idempotent on re-embed: deletes any
 * prior row for the id first.
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
 * Vector (sqlite-vec) KNN over Posts. Ranks active Posts by cosine distance from
 * `queryEmbedding` against `situation_embedding` (the primary retrieval key) and
 * returns raw candidates — ids + distance, in nearest-first order, capped at
 * `limit`. No fusion, trust, or boosting: that lives in `search`. Active Posts
 * only; retired Posts are invisible to retrieval, exactly as for the keyword leg.
 *
 * Raw SQL because vec0 is a virtual table Drizzle does not model. sqlite-vec's
 * KNN requires the `k = ?` constraint in the WHERE clause; we over-fetch `k`
 * then drop retired rows via the join, so a retired neighbour can't shrink the
 * active result below what the caller asked for in the common case.
 */
export function vectorSearch(
  raw: Database,
  queryEmbedding: number[],
  limit: number,
): VecCandidate[] {
  const rows = raw
    .prepare(
      `SELECT v.post_id AS postId, v.distance AS distance
         FROM posts_vec v
         JOIN posts p ON p.id = v.post_id
        WHERE v.situation_embedding MATCH ?
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

/**
 * Serialize a JS number[] embedding to the little-endian Float32 byte buffer
 * sqlite-vec expects for a `FLOAT[N]` column / MATCH operand.
 */
function serialize(embedding: number[]): Uint8Array {
  return new Uint8Array(Float32Array.from(embedding).buffer);
}

/**
 * Fetch every PostEvent for the given Post ids, newest first within each Post.
 * Raw SQL (parameterized over a generated placeholder list) so trust
 * aggregation and recent-Notes rendering can be computed from one read per
 * query, without N round-trips. Returns rows grouped by caller; the order is
 * `created_at DESC` so the caller can take the most recent Notes directly.
 *
 * The store returns raw event rows — no counting, no trust math, no ranking.
 * `trust/aggregate` collapses them into counts and a multiplier; `search/score`
 * turns that into rank. The store knows SQL only.
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

/**
 * A row as stored in `post_events`. Mirrors the Drizzle table; declared here so
 * the raw-SQL read path types its result without importing the Drizzle schema
 * (which `queries.ts` deliberately does not, staying pure SQL).
 */
export type PostEventRow = {
  id: string;
  post_id: string;
  verdict: string;
  reason: string | null;
  note: string | null;
  created_by: string;
  created_at: number;
};
