/**
 * Reciprocal Rank Fusion: merge several independently ranked lists into one,
 * each list contributing `1 / (k + rank + 1)` per item. Rank-based on purpose —
 * fuses lists whose raw scores aren't comparable (bm25 vs. cosine distance)
 * without normalizing either.
 */

/** The conventional RRF damping constant; larger flattens the rank weighting. */
export const RRF_K = 60;

/** One ranked input list, best first; array position is the rank. Duplicates within a list count only at their first occurrence. */
export type RankedList = readonly string[];

export type FusedItem = {
  id: string;
  score: number;
};

/** Fuse ranked lists into one descending-by-score order; ties break by first appearance (stable). */
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
