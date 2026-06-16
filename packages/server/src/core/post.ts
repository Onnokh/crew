/**
 * A Post — one stored, searchable item of shared agent knowledge: anything one
 * agent learned that would change what another agent does (see CONTEXT.md).
 *
 * A Post has exactly one Situation, one Body, one Environment, and one Repo, is
 * attributed to the User who created it, and carries a stable prefixed id and a
 * creation timestamp. This module is pure domain — it imports nothing.
 */
export type Post = {
  /** Stable, prefixed id: `'post_' + nanoid`. */
  id: string;
  /**
   * A short, scannable title — a human-readable label for the Post, distinct
   * from the Situation (which is the question / retrieval key). Always present:
   * the `post` tool requires it, and for legacy rows written before it existed
   * the store coalesces it to the Situation on read.
   */
  title: string;
  /**
   * The circumstances in which the Post applies — what a future agent would be
   * facing when it needs this knowledge. The primary retrieval key.
   */
  situation: string;
  /** The knowledge itself — what to know or do once the Situation matches. */
  body: string;
  /** Freeform LLM-written summary of the stack/setup the Post was learned in. */
  environment: string;
  /** The git repository the Post originated from. */
  repo: string;
  /** Lifecycle: `active` until retired from the review page. */
  status: PostStatus;
  /** The id of the User this Post is attributed to. */
  createdBy: string;
  /** Creation timestamp, unix milliseconds. */
  createdAt: number;
  /**
   * Denormalized timestamp of the most recent Confirm, unix ms, or null if the
   * Post has never been confirmed. Source of truth is the event log; this exists
   * purely so ranking avoids a per-query aggregate. Set by a later slice.
   */
  lastConfirmed: number | null;
  /**
   * How many times `query` has surfaced this Post — a display-only popularity
   * counter, incremented on each surfacing. Unlike Confirms/Flags it is a bare
   * counter, not derived from the event log: a view is not a trust signal and
   * never feeds ranking, so there is nothing richer to recompute from a log.
   */
  views: number;
};

export type PostStatus = "active" | "retired";

/**
 * Canonicalise a repo identifier to its `group/name` tail — the part that
 * actually disambiguates one repository from another. Drops the host and any
 * intermediate path, so every common remote form reduces to the same value:
 *
 *   git@github.com:Onnokh/crew.git              → Onnokh/crew
 *   https://github.com/Onnokh/crew.git          → Onnokh/crew
 *   github.com/Onnokh/crew                       → Onnokh/crew
 *   git.indicia.nl/online-concepts/sigi/sigi-frontend → sigi/sigi-frontend
 *
 * Tolerates a `scheme://` prefix, an SSH `user@host:` prefix, a port, a
 * trailing slash, and a `.git` suffix. Applied on write so the stored value is
 * canonical regardless of what a client sends, and on `query` so the same-repo
 * boost still matches. Falls back to the trimmed input when there aren't two
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

/**
 * The fields a caller supplies when creating a Post. The repository derives the
 * id, timestamp, and default status; the tool supplies attribution. Keeping this
 * distinct from {@link Post} keeps "what the agent provides" separate from "what
 * the store stamps on."
 */
export type NewPost = {
  /**
   * Short human title. Optional at the repository seam so test/legacy callers
   * can omit it (the store falls back to {@link NewPost.situation}); the `post`
   * tool requires it, so every agent-created Post carries a real one.
   */
  title?: string;
  situation: string;
  body: string;
  environment: string;
  repo: string;
  /** The id of the authenticated User the Post is attributed to. */
  createdBy: string;
};
