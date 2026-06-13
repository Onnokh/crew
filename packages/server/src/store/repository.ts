import type { PostEvent, NewPostEvent } from "../core/post-event.js";
import type { NewPost, Post } from "../core/post.js";
import type { User } from "../core/user.js";
import type { Candidate, VecCandidate } from "./queries.js";

/**
 * The persistence seam for Posts and Users. The store knows SQL and nothing
 * about ranking: it persists Posts and returns them by id, but never ranks or
 * searches them — that lives in `search` (see TECH.md "Storage knows nothing
 * about ranking"). The real implementation is {@link SqliteRepository}; tests
 * use {@link FakePostRepository}.
 *
 * Slice 0002 added the write half: {@link createPost} plus the reads needed to
 * attribute a Post and assert it back in tests. Slice 0003 added keyword search
 * ({@link searchByKeyword}). Slice 0004 adds the vector leg: {@link createPost}
 * now also embeds and stores the Post's vectors (a write that fails to embed
 * fails loudly), and {@link searchByVector} returns nearest Posts by cosine
 * distance. Both search methods return raw candidates — ids + a per-leg signal,
 * no ranking; `search` fuses the two lists with RRF.
 *
 * Slice 0005 adds the trust loop: {@link recordEvent} appends a Confirm/Flag to
 * the event log (and refreshes `last_confirmed` on a Confirm), and
 * {@link getEventsForPosts} reads a batch of Posts' events back so `trust` can
 * aggregate them and the renderer can show recent Notes. The store still knows
 * no ranking — it stores and returns raw events; counting and scoring live in
 * `trust`/`search`.
 */
export type PostRepository = {
  /**
   * Persist a new Post, stamping its id, creation timestamp, and default
   * status, AND embed + store its situation/environment vectors in the same
   * step. Returns the fully-formed stored Post. If embedding fails, the whole
   * write fails (and rolls back) — a Post with no vector is invisible to half
   * of retrieval, so none is ever stored (see TECH.md "fail the write loudly").
   * The caller has already resolved attribution into `post.createdBy`.
   */
  createPost(post: NewPost): Promise<Post>;

  /** Fetch a Post by id, or null if none exists. Used by tests and later slices. */
  getPost(id: string): Promise<Post | null>;

  /**
   * Keyword (FTS5) search over situation + body. Returns raw candidates — the
   * matching active Post ids and their FTS rank, in relevance order, capped at
   * `limit`. No ranking, trust, or boosting: that lives in `search`. The caller
   * hydrates each candidate's Post via {@link getPost}.
   */
  searchByKeyword(query: string, limit: number): Promise<Candidate[]>;

  /**
   * Vector (sqlite-vec) search: embed `query` with the corpus's model and return
   * the nearest active Posts by cosine distance over their situation embedding,
   * capped at `limit`. Raw candidates only (ids + distance, nearest first); RRF
   * fusion and ranking live in `search`. The embedder is internal to the store
   * so both write-time and query-time embedding go through the one pinned model.
   */
  searchByVector(query: string, limit: number): Promise<VecCandidate[]>;

  /**
   * Append a Confirm or Flag to the event log, stamping its id and timestamp,
   * and return the stored event. A Confirm also refreshes the Post's
   * denormalized `last_confirmed` to the event time (so ranking recency lifts),
   * in the same transaction as the insert. Throws if the Post does not exist —
   * an event must anchor to a real Post. Counts and trust are derived on read;
   * the store stores the event verbatim, never a counter.
   */
  recordEvent(event: NewPostEvent): Promise<PostEvent>;

  /**
   * Fetch all events for the given Post ids, newest first within each Post.
   * Returns raw events — `trust/aggregate` collapses them into counts and a
   * trust multiplier, and the renderer takes the most recent few as Notes. One
   * batched read so a query over k Posts needs one events call, not k.
   */
  getEventsForPosts(postIds: readonly string[]): Promise<PostEvent[]>;

  /** Look up a User by the sha256 hash of their bearer token (for auth). */
  findUserByTokenHash(tokenHash: string): Promise<User | null>;

  /**
   * Look up a User by id, or null if none exists. Used to resolve a Post's
   * author into a display name for the rendered provenance line.
   */
  getUser(id: string): Promise<User | null>;
};
