/** Shared shapes and constants for the review surface. */

/** Query keys for the review lists. */
export const reviewKeys = {
  // Keyed by sort AND project so each ordering/filter pairing is its own cache
  // entry; invalidate the ["review"] prefix to clear every list at once.
  recent: (sort: SortKey, repo: string | null) =>
    ["review", "recent", sort, repo] as const,
  flagged: (repo: string | null) => ["review", "flagged", repo] as const,
  search: (q: string) => ["review", "search", q] as const,
  projects: ["review", "projects"] as const,
};

/** One project (repo) the team has Posts in — mirrors the server's `RepoPostCount`. */
export type ProjectOption = {
  /** Normalized `group/name`; the value sent as `?repo=`. */
  repo: string;
  /** Posts in this project. */
  posts: number;
};

/** The short display label for a project: the trailing path segment of its repo. */
export function repoLabel(repo: string): string {
  const parts = repo.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? repo;
}

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
