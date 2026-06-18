/**
 * Final ranking score: `final = rrf_score × trust × recency × repo_boost`.
 * Pure; `now` is passed in so scoring ages deterministically in tests.
 */

/** Same-repo Posts are multiplied by this; cross-repo Posts by 1.0. */
export const REPO_BOOST = 1.5;

/** No-boost multiplier — a query without a repo, or a cross-repo Post. */
export const NO_BOOST = 1.0;

/** Recency half-life: a Post confirmed/created this many ms ago has recency 0.5. */
export const RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

export type ScoreInput = {
  rrfScore: number;
  /** The trust multiplier from `trust/aggregate` (≥ a small ε). */
  trust: number;
  /** Timestamp recency decays from: last Confirm time, or creation when never confirmed (unix ms). */
  recencyAnchor: number;
  /** True iff the Post's repo equals the querying agent's repo. */
  sameRepo: boolean;
};

/** Exponential recency decay in (0, 1]: 1.0 at `now`, halving every RECENCY_HALF_LIFE_MS. Future anchors clamp to 1.0. */
export function recency(anchor: number, now: number): number {
  const ageMs = Math.max(0, now - anchor);
  return Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
}

/** The same-repo multiplier: REPO_BOOST when sharing the query's repo, else NO_BOOST. Boosts, never filters. */
export function repoBoost(sameRepo: boolean): number {
  return sameRepo ? REPO_BOOST : NO_BOOST;
}

/** Compute one candidate's final ranking score: `rrf × trust × recency × repo_boost`. Higher is better. */
export function finalScore(input: ScoreInput, now: number): number {
  return (
    input.rrfScore *
    input.trust *
    recency(input.recencyAnchor, now) *
    repoBoost(input.sameRepo)
  );
}
