import type { PostEvent, NewPostEvent } from "../core/post-event.js";
import type { NewPost, Post } from "../core/post.js";
import type {
  ActivityRow,
  Candidate,
  ConversionStats,
  ConversionWindow,
  CoverageStats,
  CoverageWindow,
  NewRetrieval,
  PostsCreatedStats,
  RecentRetrievalDetail,
  RecentRetrievalRow,
  RepoPostCount,
  UserActivityStat,
  VecCandidate,
} from "./queries.js";

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
   * Vector (sqlite-vec) search over environment summaries; raw active candidates
   * capped at `limit`. This is a ranking boost for applicability, never a filter.
   */
  searchByEnvironmentVector(query: string, limit: number): Promise<VecCandidate[]>;

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

  /**
   * Persist one retrieval (a `query` call) plus its per-result score breakdown,
   * minting ids and writing the retrieval row and its result rows in one
   * transaction. Records EVERY query, including zero-result ones (no result
   * rows). Telemetry-only and additive — callers wrap it so a failure can't fail
   * the query (see tools/query.ts).
   */
  recordRetrieval(input: NewRetrieval): void;

  /**
   * The most recent Retrievals for the telemetry dashboard, newest first, capped
   * at `limit`. One row per `query`, carrying situation/result count/time.
   */
  listRecentRetrievals(limit: number): Promise<RecentRetrievalRow[]>;

  /**
   * The most recent Retrievals for the tuning view, newest first, capped at
   * `limit` and skipping the first `offset` rows, each carrying its returned
   * Posts (rank + full score breakdown) with a human-readable Post title (null if
   * the Post was retired/deleted). With `zeroResultsOnly`, only the gap rows
   * (`result_count = 0`) are returned. The converted? verdict is NOT here — derive
   * it from {@link conversionStats}.
   */
  listRecentRetrievalsDetailed(
    limit: number,
    offset?: number,
    zeroResultsOnly?: boolean,
  ): Promise<RecentRetrievalDetail[]>;

  /**
   * Total Retrievals for the recent-Retrievals pager. With `zeroResultsOnly`,
   * counts only the zero-result gap rows so the page count matches the filter.
   */
  retrievalsCount(zeroResultsOnly?: boolean): Promise<number>;

  /**
   * The unified activity feed, newest first, capped at `limit` and skipping the
   * first `offset` rows: recent searches, new Posts, and Confirm/Flag verdicts
   * merged into one time-sorted list. User ids are returned raw — resolve them
   * to names at the API.
   */
  recentActivity(limit: number, offset?: number): Promise<ActivityRow[]>;

  /** Total rows in the activity feed, for the paginated view's page count. */
  activityCount(): Promise<number>;

  /**
   * The earliest activity timestamp across searches, Posts, and verdicts, or
   * null when there is none. Backs the dashboard's "All time" range.
   */
  earliestActivityAt(): Promise<number | null>;

  /**
   * Per-user usage (posts authored + searches run) since `sinceMs`, ranked by
   * combined activity, capped at `limit`. User ids are returned raw — resolve
   * them to names at the API. Backs the dashboard's "top users" list (a rolling
   * window, not a lifetime tally).
   */
  userActivityStats(limit: number, sinceMs: number): Promise<UserActivityStat[]>;

  /**
   * Conversion attribution over Retrievals-with-results in `[from, to)`: classify
   * each as converted iff the same User who queried later recorded a Confirm on
   * one of its returned Posts, after the retrieval and within the attribution
   * window (last-touch). Window/range are read-time parameters; nothing is
   * stored. Consumed by PLO-49 (a rate over the range) and PLO-51 (did THIS
   * retrieval convert?).
   */
  conversionStats(window: ConversionWindow): Promise<ConversionStats>;

  /**
   * Coverage counts over the raw Retrievals in `[from, to)`: the total query
   * volume and how many returned zero Posts. The zero-result rate is
   * `zeroResults / total`. Range is read-time; nothing is stored or
   * pre-aggregated. Consumed by PLO-50 for the zero-result-rate and
   * query-volume panels (one call over the range, one per day for the trend).
   */
  coverageStats(window: CoverageWindow): Promise<CoverageStats>;

  /**
   * How many Posts were created in `[from, to)`, over the raw `posts` rows.
   * Range is read-time; nothing is stored or pre-aggregated. One call over the
   * range for the headline, one per day-wide bucket for the created-per-day trend.
   */
  postsCreatedStats(window: CoverageWindow): Promise<PostsCreatedStats>;

  /**
   * Posts grouped by their originating `repo`, busiest first, over every Post
   * in the corpus. Backs the team detail page's per-project breakdown.
   */
  postsByRepo(): Promise<RepoPostCount[]>;
};
