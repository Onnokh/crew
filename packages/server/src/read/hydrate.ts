import type { PostEvent } from "../core/post-event.js";
import type { Post } from "../core/post.js";
import type { PostRepository } from "../store/repository.js";
import { aggregateEvents } from "../trust/aggregate.js";

/**
 * Shared Post hydration — the one place that turns a stored {@link Post} plus its
 * event log into the displayable shape both agent-facing and human-facing
 * surfaces need: the author's name, the confirm/flag counts, and the view tally.
 *
 * Its consumer is `search/retrieve` (the `query` tool's pipeline); the review
 * console's JSON endpoints (slice 0013) become the second caller, reusing this
 * same assembly rather than re-deriving the group-by-Post + aggregate +
 * author-lookup logic and risking drift. Keeping one home means bugs in "how a
 * Post's counts are computed for display" concentrate here.
 *
 * The events ride along on each {@link HydratedPost} so a caller that wants more
 * than counts (the `query` tool derives the few recent Notes) reuses the single
 * batched read rather than re-fetching; a counts-only caller ignores them.
 *
 * Counts are derived on read via `trust/aggregate`, never stored as a counter
 * (see TECH.md "Trust mechanics"); `views` is the Post's bare display counter.
 */

/**
 * A Post enriched for display: its resolved author name, derived confirm/flag
 * counts, view tally, and the raw event log the counts came from (newest first).
 */
export type HydratedPost = {
  post: Post;
  /** The name of the User who authored the Post; `"unknown"` if it can't resolve. */
  authorName: string;
  /** Number of Confirm events, derived from {@link events}. */
  confirms: number;
  /** Number of Flag events, derived from {@link events}. */
  flags: number;
  /** The Post's display-only popularity tally (a bare counter, not from events). */
  views: number;
  /** This Post's events, newest first — the single read the counts were derived from. */
  events: PostEvent[];
};

/**
 * Hydrate a list of already-fetched Posts into {@link HydratedPost}s, preserving
 * the input order. One batched {@link PostRepository.getEventsForPosts} reads
 * every Post's events; authors are resolved per id (sequential — the corpus is
 * team-scale, so the N+1 is not worth widening the store seam to batch). A Post
 * whose author can't be resolved renders as `"unknown"`.
 */
export async function hydratePosts(
  repo: Pick<PostRepository, "getEventsForPosts" | "getUser">,
  posts: Post[],
): Promise<HydratedPost[]> {
  if (posts.length === 0) return [];

  // One batched read of every Post's events, grouped by Post (newest-first order
  // preserved from the store, so callers can take the most recent events directly).
  const eventsByPost = new Map<string, PostEvent[]>();
  for (const event of await repo.getEventsForPosts(posts.map((p) => p.id))) {
    const list = eventsByPost.get(event.postId);
    if (list) list.push(event);
    else eventsByPost.set(event.postId, [event]);
  }

  const hydrated: HydratedPost[] = [];
  for (const post of posts) {
    const events = eventsByPost.get(post.id) ?? [];
    const agg = aggregateEvents(events);
    const author = await repo.getUser(post.createdBy);
    hydrated.push({
      post,
      authorName: author?.name ?? "unknown",
      confirms: agg.confirms,
      flags: agg.flags,
      views: post.views,
      events,
    });
  }
  return hydrated;
}
