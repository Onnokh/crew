/**
 * A PostEvent — one Confirm or Flag recorded against a Post (see CONTEXT.md).
 *
 * Confirms and flags are stored as **events**, never as bare counters: each row
 * records who acted, when, the verdict, an optional Note, and (for flags) a
 * reason. Counters and trust scores are derived from this log, so richer trust
 * math can be recomputed later without losing information (see TECH.md "Trust
 * mechanics"). This module is pure domain — it imports nothing.
 */
export type PostEvent = {
  /** Stable, prefixed id: `'evt_' + nanoid`. */
  id: string;
  /** The Post this event is recorded against. */
  postId: string;
  /** Whether the acting agent confirmed the Post worked or flagged it. */
  verdict: Verdict;
  /**
   * Why a Post was flagged. Present only on flags; null on confirms. The set is
   * closed so a future agent reading a Flag knows whether the Post was wrong,
   * out of date, or a duplicate of another Post.
   */
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

/**
 * The fields a caller supplies when recording an event. The repository derives
 * the id and timestamp; the tool supplies attribution and the verdict payload.
 */
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
