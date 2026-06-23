/** Shared shapes and constants for the review surface. */

/** Query keys for the review lists. */
export const reviewKeys = {
  // Keyed by sort so each ordering is its own cache entry; invalidate the
  // ["review","recent"] prefix to clear every sort at once.
  recent: (sort: SortKey) => ["review", "recent", sort] as const,
  flagged: ["review", "flagged"] as const,
  search: (q: string) => ["review", "search", q] as const,
};

/** Mirrors the server's `ReviewRow`. */
export type ReviewRow = {
  id: string;
  title: string;
  situation: string;
  body: string;
  environment: string;
  repo: string;
  status: "active" | "retired";
  createdBy: string;
  createdAt: number;
  authorName: string;
  confirms: number;
  flags: number;
  views: number;
};

/** How the browse list is ordered. The recent list is ranked server-side; the comparators below only re-rank the flagged set. */
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
