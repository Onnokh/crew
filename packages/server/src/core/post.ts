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
