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
};

export type PostStatus = "active" | "retired";

/**
 * The fields a caller supplies when creating a Post. The repository derives the
 * id, timestamp, and default status; the tool supplies attribution. Keeping this
 * distinct from {@link Post} keeps "what the agent provides" separate from "what
 * the store stamps on."
 */
export type NewPost = {
  situation: string;
  body: string;
  environment: string;
  repo: string;
  /** The id of the authenticated User the Post is attributed to. */
  createdBy: string;
};
