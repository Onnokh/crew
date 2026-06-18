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
