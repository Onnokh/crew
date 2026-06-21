import type { PostEvent } from "../core/post.js";
import type { Post } from "../core/post.js";
import type { SqliteRepository } from "../store/sqlite-repository.js";
import { aggregateEvents } from "../trust/aggregate.js";

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
 * Hydrate already-fetched Posts into {@link HydratedPost}s, preserving input
 * order. A Post whose author can't be resolved renders as `"unknown"`.
 */
export async function hydratePosts(
  repo: Pick<SqliteRepository, "getEventsForPosts" | "getUser">,
  posts: Post[],
): Promise<HydratedPost[]> {
  if (posts.length === 0) return [];

  // One batched read of every Post's events, grouped by Post (newest-first).
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
