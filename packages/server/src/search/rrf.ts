/**
 * Reciprocal Rank Fusion — the pure function that merges several independently
 * ranked candidate lists (keyword from FTS5, vector from sqlite-vec) into one
 * ordered result. Each list contributes `1 / (k + rank)` to an item's score per
 * the list it appears in; items appearing high in multiple lists rise to the
 * top (see TECH.md "Retrieval pipeline"). This module is pure — no SQL, no
 * embedder, no clock — so ranking is unit-tested without a database (TECH.md
 * "search + trust + guardrails are pure functions").
 *
 * RRF is rank-based on purpose: it fuses lists whose raw scores are not
 * comparable (FTS5's bm25 rank vs. cosine distance) without needing to
 * normalize either. The store hands `search` raw candidates; turning those into
 * per-list rank orders and fusing them lives here.
 */

/** The conventional RRF damping constant; larger flattens the rank weighting. */
export const RRF_K = 60;

/**
 * One ranked input list: an ordered array of item ids, best first. The position
 * in the array IS the rank (0-based here; the formula adds 1 so the top item
 * gets `1 / (k + 1)`, not a divide-by-`k` discontinuity). Ties should be broken
 * by the caller before fusing; duplicates within a single list are ignored
 * after their first (best) occurrence.
 */
export type RankedList = readonly string[];

/** A fused result: an item id and its summed reciprocal-rank score. */
export type FusedItem = {
  id: string;
  score: number;
};

/**
 * Fuse ranked lists into one descending-by-score order. An item's score is the
 * sum over every list it appears in of `1 / (k + rank + 1)`. Items are returned
 * highest-score first; score ties break by first appearance across the input
 * lists (stable), so the output order is deterministic.
 *
 * @param lists  the per-leg ranked id lists (e.g. `[keywordIds, vectorIds]`)
 * @param k      the RRF damping constant (defaults to {@link RRF_K})
 */
export function reciprocalRankFusion(
  lists: readonly RankedList[],
  k: number = RRF_K,
): FusedItem[] {
  const scores = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;

  for (const list of lists) {
    const seenInThisList = new Set<string>();
    list.forEach((id, rank) => {
      if (seenInThisList.has(id)) return; // first (best) rank per list only
      seenInThisList.add(id);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
      if (!firstSeen.has(id)) firstSeen.set(id, order++);
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return firstSeen.get(a.id)! - firstSeen.get(b.id)!;
    });
}
