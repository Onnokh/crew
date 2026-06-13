/**
 * Final ranking score — the pure function that turns a fused RRF score plus a
 * Post's trust signals into the number results are ordered by. Implements the
 * starting formula from TECH.md / issue 0005:
 *
 *   final = rrf_score × trust × recency × repo_boost
 *     trust      = 1 + confirms − 2·flags   (clamped; computed in trust/aggregate)
 *     recency    = exponential decay from last_confirmed (or created_at)
 *     repo_boost = ×1.5 if post.repo == query.repo, else ×1.0
 *
 * This module is pure — no SQL, no clock, no embedder; `now` is passed in — so
 * the ranking math is unit-tested without a database and ages score
 * deterministically (TECH.md "search + trust + guardrails are pure functions").
 * It is a tuning knob, not architecture: the weights and decay shape change here
 * without touching storage or retrieval.
 */

/** Same-repo Posts are multiplied by this; cross-repo Posts by 1.0. */
export const REPO_BOOST = 1.5;

/** No-boost multiplier — a query without a repo, or a cross-repo Post. */
export const NO_BOOST = 1.0;

/**
 * Recency half-life: a Post confirmed/created this many ms ago has recency 0.5.
 * 30 days — recent confirmations count for clearly more, but old-but-confirmed
 * Posts don't vanish. A tuning knob; the event log lets us change the curve.
 */
export const RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** The inputs the ranking formula needs about one fused candidate. */
export type ScoreInput = {
  /** The fused Reciprocal Rank Fusion score from `search/rrf`. */
  rrfScore: number;
  /** The trust multiplier from `trust/aggregate` (≥ a small ε). */
  trust: number;
  /**
   * The timestamp recency decays from: the Post's last Confirm time, or its
   * creation time when never confirmed (unix ms). A confirm refreshing
   * `last_confirmed` therefore lifts the Post's rank.
   */
  recencyAnchor: number;
  /** True iff the Post's repo equals the querying agent's repo. */
  sameRepo: boolean;
};

/**
 * Exponential recency decay in (0, 1]: 1.0 at `now`, halving every
 * {@link RECENCY_HALF_LIFE_MS}. Future anchors (clock skew) clamp to 1.0.
 */
export function recency(anchor: number, now: number): number {
  const ageMs = Math.max(0, now - anchor);
  return Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
}

/**
 * The same-repo multiplier: {@link REPO_BOOST} when the Post shares the query's
 * repo, else {@link NO_BOOST}. Repo boosts, never filters (see CONTEXT.md).
 */
export function repoBoost(sameRepo: boolean): number {
  return sameRepo ? REPO_BOOST : NO_BOOST;
}

/**
 * Compute one candidate's final ranking score: `rrf × trust × recency ×
 * repo_boost`. Higher is better. Pure and deterministic given `now`.
 */
export function finalScore(input: ScoreInput, now: number): number {
  return (
    input.rrfScore *
    input.trust *
    recency(input.recencyAnchor, now) *
    repoBoost(input.sameRepo)
  );
}
