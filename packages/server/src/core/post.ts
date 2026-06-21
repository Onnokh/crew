/** One stored, searchable item of shared agent knowledge. */
export type Post = {
  /** Stable, prefixed id: `'post_' + randomUUID()`. */
  id: string;
  /** Short human-readable title; falls back to the Situation for legacy rows. */
  title: string;
  /** The circumstances the Post applies to — the primary retrieval key. */
  situation: string;
  /** The knowledge itself — what to know or do once the Situation matches. */
  body: string;
  /** Freeform summary of the stack/setup the Post was learned in. */
  environment: string;
  /** The git repository the Post originated from. */
  repo: string;
  status: PostStatus;
  /** The id of the User this Post is attributed to. */
  createdBy: string;
  /** Creation timestamp, unix milliseconds. */
  createdAt: number;
  /** Denormalized most-recent Confirm time, unix ms; null if never confirmed. */
  lastConfirmed: number | null;
  /** Display-only popularity counter; not a trust signal, never feeds ranking. */
  views: number;
};

export type PostStatus = "active" | "retired";

/**
 * Canonicalise a repo identifier to its `group/name` tail so every common
 * remote form (scheme://, ssh user@host:, port, trailing slash, .git) reduces
 * to the same value. Falls back to the trimmed input when there aren't two
 * segments to reduce to.
 */
export function normalizeRepo(repo: string): string {
  const cleaned = repo
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // strip scheme://
    .replace(/^[^@/]*@/, "") // strip ssh user@ / URL userinfo
    .replace(/:/g, "/") // scp colon and any port become path separators
    .replace(/\/+$/, "") // trailing slashes
    .replace(/\.git$/i, ""); // .git suffix
  const segments = cleaned.split("/").filter(Boolean);
  if (segments.length >= 2) return segments.slice(-2).join("/");
  return segments[0] ?? repo.trim();
}

/** The fields a caller supplies when creating a Post; the store stamps id/timestamp/status. */
export type NewPost = {
  /** Optional at this seam; the store falls back to {@link NewPost.situation}. */
  title?: string;
  situation: string;
  body: string;
  environment: string;
  repo: string;
  /** The id of the authenticated User the Post is attributed to. */
  createdBy: string;
};

/** One Confirm or Flag recorded against a Post. Stored as events, never bare counters. */
export type PostEvent = {
  /** Stable, prefixed id: `'evt_' + randomUUID()`. */
  id: string;
  /** The Post this event is recorded against. */
  postId: string;
  /** Whether the acting agent confirmed the Post worked or flagged it. */
  verdict: Verdict;
  /** Why a Post was flagged. Present only on flags; null on confirms. */
  reason: FlagReason | null;
  /** An optional one-line Note the agent attached to the verdict, or null. */
  note: string | null;
  /** The id of the User this event is attributed to. */
  createdBy: string;
  /** When the event was recorded, unix milliseconds. */
  createdAt: number;
};

/** A PostEvent is either a Confirm ("it worked") or a Flag ("it didn't"). */
export type Verdict = "confirm" | "flag";

/** The closed set of reasons a Flag must carry. */
export type FlagReason = "incorrect" | "stale" | "duplicate";

/** The fields a caller supplies when recording an event; the store stamps id/timestamp. */
export type NewPostEvent = {
  postId: string;
  verdict: Verdict;
  /** Required on flags, omitted on confirms. */
  reason?: FlagReason;
  /** Optional one-line Note attached to the verdict. */
  note?: string;
  /** The id of the authenticated User the event is attributed to. */
  createdBy: string;
};
