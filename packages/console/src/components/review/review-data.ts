/**
 * Shared shapes and constants for the review surface (the home page). Split out
 * of the route so the page, list, and card components all read the same types
 * and query keys without re-declaring them.
 */

/** Centralized query keys, so the mutation can invalidate exactly these lists. */
export const reviewKeys = {
  // Keyed by sort so each ordering is its own cache entry and switching sort
  // refetches the server-ranked list (the popularity orders rank the whole
  // corpus — see /api/review/recent?sort=). Invalidations target the
  // ["review","recent"] prefix to clear every sort at once.
  recent: (sort: SortKey) => ["review", "recent", sort] as const,
  flagged: ["review", "flagged"] as const,
  search: (q: string) => ["review", "search", q] as const,
};

/** Mirrors the server's `ReviewRow` (packages/server/src/api/review.ts). */
export type ReviewRow = {
  id: string;
  title: string;
  situation: string;
  body: string;
  environment: string;
  repo: string;
  status: "active" | "retired";
  createdAt: number;
  authorName: string;
  confirms: number;
  flags: number;
  views: number;
};

/**
 * How the browse list is ordered. Mirrors the server's `PostSort`: the recent
 * list is ranked server-side (`/api/review/recent?sort=`) so the popularity
 * orders span the whole corpus, not just the fetched window. The matching
 * client comparators below are used only to re-rank the small, capped flagged
 * set; the recent list arrives already sorted.
 */
export type SortKey = "newest" | "views" | "confirms";

export const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "views", label: "Most viewed" },
  { key: "confirms", label: "Most confirmed" },
];

export const SORTERS: Record<SortKey, (a: ReviewRow, b: ReviewRow) => number> = {
  newest: (a, b) => b.createdAt - a.createdAt,
  views: (a, b) => b.views - a.views,
  confirms: (a, b) => b.confirms - a.confirms,
};
