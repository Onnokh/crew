import type { PostEvent, NewPostEvent } from "../core/post-event.js";
import type { NewPost, Post } from "../core/post.js";
import type { User } from "../core/user.js";
import type { Candidate, VecCandidate } from "./queries.js";

/**
 * The persistence seam for Posts and Users. Search methods return raw candidates
 * (ids + a per-leg signal); ranking lives in `search`, never here. Implemented
 * by {@link SqliteRepository}; tests exercise it over an in-memory database.
 */

/**
 * How {@link PostRepository.listRecentPosts} orders the browse list. `"newest"`
 * is creation time (default); `"views"` and `"confirms"` are popularity orders
 * ranked across the whole corpus. Confirms are counted from the event log.
 */
export type PostSort = "newest" | "views" | "confirms";

export type PostRepository = {
  /**
   * Persist a new Post (stamping id, timestamp, default status) and embed +
   * store its situation/environment vectors in the same step. If embedding
   * fails the whole write rolls back, so no Post is stored without a vector.
   */
  createPost(post: NewPost): Promise<Post>;

  /** Fetch a Post by id, or null if none exists. */
  getPost(id: string): Promise<Post | null>;

  /** Keyword (FTS5) search over situation + body; raw active candidates, capped at `limit`. */
  searchByKeyword(query: string, limit: number): Promise<Candidate[]>;

  /**
   * Vector (sqlite-vec) search: embed `query` and return nearest active Posts by
   * cosine distance, capped at `limit`. The embedder is internal so write-time
   * and query-time embedding share the one pinned model.
   */
  searchByVector(query: string, limit: number): Promise<VecCandidate[]>;

  /**
   * Append a Confirm or Flag to the event log and return the stored event. A
   * Confirm also refreshes the Post's denormalized `last_confirmed` in the same
   * transaction. Throws if the Post does not exist.
   */
  recordEvent(event: NewPostEvent): Promise<PostEvent>;

  /** Fetch all events for the given Post ids, newest first, in one batched read. */
  getEventsForPosts(postIds: readonly string[]): Promise<PostEvent[]>;

  /**
   * Increment the display-only `views` counter for each given Post. Writes no
   * event and never affects ranking; a no-op for unknown ids and an empty list.
   */
  recordViews(postIds: readonly string[]): Promise<void>;

  /**
   * The browse list for the review page, capped at `limit`, ordered by `sort`
   * (default `"newest"`). Unlike the search legs this returns Posts of EVERY
   * status, so the human review page can see and restore retired Posts.
   */
  listRecentPosts(limit: number, sort?: PostSort): Promise<Post[]>;

  /**
   * Posts that carry at least one Flag, newest-flagged first, capped at `limit`.
   * Returns Posts of every status so a flagged-then-retired Post can be restored.
   */
  listFlaggedPosts(limit: number): Promise<Post[]>;

  /** Set a Post's status to `retired` (removing it from agent `query`). A no-op if absent; idempotent. */
  retirePost(id: string): Promise<void>;

  /** Set a Post's status back to `active`. The inverse of {@link retirePost}; a no-op if absent. */
  restorePost(id: string): Promise<void>;

  /** Look up a User by id in better-auth's `user` table, or null. Read-only name lookup. */
  getUser(id: string): Promise<User | null>;
};
