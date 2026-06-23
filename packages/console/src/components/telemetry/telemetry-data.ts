/** Shared shapes and query keys for the retrieval-telemetry dashboard. */

/** Query keys for the telemetry reads. */
export const telemetryKeys = {
  conversion: ["telemetry", "conversion"] as const,
  coverage: ["telemetry", "coverage"] as const,
  posts: ["telemetry", "posts"] as const,
  activity: ["telemetry", "activity"] as const,
  recent: ["telemetry", "recent"] as const,
  users: ["telemetry", "users"] as const,
};

/** Mirrors the server's `UserUsageItem` (api/telemetry.ts) — one top-users row. */
export type UserUsageItem = {
  userId: string;
  name: string | null;
  /** Name of the team this user belongs to, or null if none. */
  team: string | null;
  /** When this user was last active (newest post or search), unix ms; null if never. */
  lastSeen: number | null;
  posts: number;
  searches: number;
  total: number;
};

/** Mirrors the server's `/api/telemetry/activity` payload — one page of the feed. */
export type ActivityPanelData = {
  activity: ActivityItem[];
  /** Total rows across the whole feed, for the paginated view's page count. */
  total: number;
};

/** Mirrors the server's `ActivityItem` (api/telemetry.ts) — one feed row. */
export type ActivityItem = {
  id: string;
  kind: "search" | "post" | "confirm" | "flag";
  subject: string;
  reason: string | null;
  resultCount: number | null;
  user: string | null;
  /** Team this happened in; only set on the org-wide Teams-overview feed. */
  team?: string | null;
  createdAt: number;
};

/** Mirrors the server's `/api/telemetry/recent` payload — one page of Retrievals. */
export type RetrievalsPanelData = {
  retrievals: RetrievalRow[];
  /** Total Retrievals matching the current filter, for the pager's page count. */
  total: number;
};

/** Mirrors the server's `RetrievalRow` (api/telemetry.ts) — one Retrieval + its results. */
export type RetrievalRow = {
  id: string;
  /** The freeform query text the agent searched with. */
  situation: string;
  repo: string | null;
  resultCount: number;
  createdAt: number;
  /** Display name of the querying User, or null if it could not be resolved. */
  user: string | null;
  /** True iff the querying User later Confirmed a returned Post in the window. */
  converted: boolean;
  /** Returned Posts with rank + score breakdown; empty for a zero-result query. */
  results: RetrievalResultRow[];
};

/** Mirrors the server's `RetrievalResultRow` — one returned Post's score breakdown. */
export type RetrievalResultRow = {
  postId: string;
  /** The Post's current title, or null if it was retired/deleted (show postId). */
  postTitle: string | null;
  rank: number;
  rrfScore: number;
  trust: number;
  recency: number;
  repoBoost: number;
  final: number;
  /** True iff this is the Post the querying User later Confirmed (in window). */
  confirmed: boolean;
};

/** One row of the org-wide Teams overview (`/api/admin/teams/overview`). */
export type TeamOverviewItem = {
  id: string;
  /** Total Posts ever created in this Team's corpus. */
  posts: number;
};

/** Mirrors the server's `RepoPostCount` (store/queries.ts) — one project row. */
export type ProjectPostCount = {
  /** The git repo a Post was authored from. */
  repo: string;
  /** Posts in this team's corpus that carry this repo. */
  posts: number;
};

/** Mirrors the server's `ConversionPoint` (api/telemetry.ts) — one day's counts. */
export type ConversionPoint = {
  from: number;
  to: number;
  withResults: number;
  converted: number;
};

/** Mirrors the server's `ConversionPanelData` (api/telemetry.ts). */
export type ConversionPanelData = {
  from: number;
  to: number;
  windowMs: number;
  withResults: number;
  converted: number;
  flagged: number;
  previousConverted: number;
  previousWithResults: number;
  trend: ConversionPoint[];
};

/** Mirrors the server's `CoveragePoint` (api/telemetry.ts) — one day's counts. */
export type CoveragePoint = {
  from: number;
  to: number;
  total: number;
  zeroResults: number;
  totalResults: number;
};

/** Mirrors the server's `CoveragePanelData` (api/telemetry.ts). */
export type CoveragePanelData = {
  from: number;
  to: number;
  total: number;
  zeroResults: number;
  totalResults: number;
  previousTotal: number;
  previousZeroResults: number;
  trend: CoveragePoint[];
};

/** Mirrors the server's `PostsCreatedPoint` (api/telemetry.ts) — one day's count. */
export type PostsCreatedPoint = {
  from: number;
  to: number;
  created: number;
};

/** Mirrors the server's `PostsCreatedPanelData` (api/telemetry.ts). */
export type PostsCreatedPanelData = {
  from: number;
  to: number;
  total: number;
  previousCreated: number;
  trend: PostsCreatedPoint[];
};
