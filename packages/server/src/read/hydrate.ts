import type { PostEvent } from "../core/post-event.js";
import type { Post } from "../core/post.js";
import type { User } from "../core/user.js";
import type { PostRepository } from "../store/repository.js";
import { aggregateEvents } from "../trust/aggregate.js";

/**
 * Resolves a User id to their identity for author display. Backed by the
 * control-plane DB (per-team corpus DBs carry no `user` table); returns `null`
 * for a missing/deleted id, which renders as `"unknown"`.
 */
export type AuthorLookup = (id: string) => User | null;

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
  repo: Pick<PostRepository, "getEventsForPosts">,
  getUser: AuthorLookup,
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
    const author = getUser(post.createdBy);
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
