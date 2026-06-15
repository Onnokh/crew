import type { Context, Hono, MiddlewareHandler } from "hono";
import type { Post } from "../core/post.js";
import type { Deps } from "../deps.js";
import { aggregateEvents } from "../trust/aggregate.js";

/**
 * The human review JSON API (slice 0013) — the async backstop for the
 * misinformation loop, rebuilt as JSON after 0010 retired the server-rendered
 * HTML. Mounts under `/api/review/*` on the same Hono app FastMCP exposes, open
 * to any signed-in User (not admin-gated): list recent Posts, list flagged Posts
 * with their confirm/flag/view counts, retire (drops a Post from agent `query`)
 * and restore. The repository already exposes every read/write this needs
 * (`listRecentPosts`, `listFlaggedPosts`, `getEventsForPosts`, `retirePost`,
 * `restorePost`); this layer adds session auth + the JSON shape the `/review`
 * console page consumes. Mounted before `mountConsole` so the SPA catch-all
 * never shadows it (see `server.ts`).
 *
 * Routes:
 *   GET  /api/review/recent   → { posts: ReviewRow[] }  most recent Posts
 *   GET  /api/review/flagged  → { posts: ReviewRow[] }  Posts carrying ≥1 Flag
 *   POST /api/review/:id/retire  → 204  drop from agent `query` results
 *   POST /api/review/:id/restore → 204  bring it back
 *
 * Every route sits behind one session-auth middleware: ANY signed-in User
 * passes (no role check — this is post-hoc review, not a pre-publish gate);
 * a caller with no session gets 401.
 */

/** How many Posts each section lists; a review page wants recency, not the corpus. */
const LIST_LIMIT = 50;

/**
 * A Post flattened to exactly what the `/review` page renders, with its
 * confirm/flag counts derived from the event log (the same `trust/aggregate`
 * the agent surfaces use — counts are never a stored counter) and its view
 * tally read off the Post's denormalized `views`. The wire is the type boundary
 * (ADR 0004): the console mirrors this shape as its `<T>`, no shared TS package.
 */
export type ReviewRow = {
  id: string;
  title: string;
  situation: string;
  body: string;
  environment: string;
  repo: string;
  status: Post["status"];
  createdAt: number;
  authorName: string;
  confirms: number;
  flags: number;
  views: number;
};

export function mountReview(app: Hono, deps: Deps): void {
  // One gate for the whole surface: resolve the caller's session through the
  // better-auth instance and refuse anyone without one. No role check — any
  // signed-in User reaches review (the async human backstop, open to the team).
  const requireSession: MiddlewareHandler = async (c, next) => {
    const session = await deps.authInstance.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
    await next();
  };
  app.use("/api/review/*", requireSession);

  // The two lists. Each hydrates its Posts into ReviewRows so the page gets the
  // counts inline (one batched events read per list, never k reads).
  app.get("/api/review/recent", async (c) =>
    c.json({ posts: await toRows(deps, await deps.repo.listRecentPosts(LIST_LIMIT)) }),
  );
  app.get("/api/review/flagged", async (c) =>
    c.json({ posts: await toRows(deps, await deps.repo.listFlaggedPosts(LIST_LIMIT)) }),
  );

  // The human backstop. Both are idempotent no-ops for an unknown id (the
  // repository swallows it), so a stale page that retires a vanished Post just
  // gets a clean 204.
  app.post("/api/review/:id/retire", async (c) => retire(c, deps, true));
  app.post("/api/review/:id/restore", async (c) => retire(c, deps, false));
}

/** Retire (`retired = true`) or restore a Post by route param, returning 204. */
async function retire(c: Context, deps: Deps, retired: boolean): Promise<Response> {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing post id" }, 400);
  if (retired) await deps.repo.retirePost(id);
  else await deps.repo.restorePost(id);
  return c.body(null, 204);
}

/**
 * Hydrate a list of Posts into {@link ReviewRow}s: resolve each author's name and
 * collapse its event log into confirm/flag counts via `trust/aggregate` (the same
 * pure aggregation the `query` tool uses — counts are derived on read, never a
 * stored counter). Views come straight off the Post's denormalized `views`
 * counter (a display-only popularity signal, not a trust signal). One batched
 * `getEventsForPosts` read covers the whole list.
 */
async function toRows(deps: Deps, posts: Post[]): Promise<ReviewRow[]> {
  if (posts.length === 0) return [];

  const events = await deps.repo.getEventsForPosts(posts.map((p) => p.id));
  const byPost = new Map<string, typeof events>();
  for (const event of events) {
    const list = byPost.get(event.postId);
    if (list) list.push(event);
    else byPost.set(event.postId, [event]);
  }

  const rows: ReviewRow[] = [];
  for (const post of posts) {
    const agg = aggregateEvents(byPost.get(post.id) ?? []);
    const author = await deps.repo.getUser(post.createdBy);
    rows.push({
      id: post.id,
      title: post.title,
      situation: post.situation,
      body: post.body,
      environment: post.environment,
      repo: post.repo,
      status: post.status,
      createdAt: post.createdAt,
      authorName: author?.name ?? "unknown",
      confirms: agg.confirms,
      flags: agg.flags,
      views: post.views,
    });
  }
  return rows;
}
