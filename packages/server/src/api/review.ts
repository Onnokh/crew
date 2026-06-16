import type { Context, Hono, MiddlewareHandler } from "hono";
import type { Post } from "../core/post.js";
import type { Deps } from "../deps.js";
import { MAX_LIMIT, retrieve } from "../search/retrieve.js";
import type { PostSort } from "../store/repository.js";
import { aggregateEvents } from "../trust/aggregate.js";

/** Coerce the `?sort=` query into a {@link PostSort}; anything else → newest. */
function parseSort(value: string | undefined): PostSort {
  return value === "views" || value === "confirms" ? value : "newest";
}

/**
 * The human review JSON API (slice 0013) — the async backstop for the
 * misinformation loop, rebuilt as JSON after 0010 retired the server-rendered
 * HTML. Mounts under `/api/review/*` on the same Hono app FastMCP exposes. The
 * READS are public — anyone can list recent Posts, list flagged Posts with their
 * confirm/flag/view counts, and search the corpus (the shared memory is open to
 * browse; you don't sign in to read it). The moderation WRITES — retire (drops a
 * Post from agent `query`) and restore — stay behind a session. The repository
 * already exposes every read/write this needs
 * (`listRecentPosts`, `listFlaggedPosts`, `getEventsForPosts`, `retirePost`,
 * `restorePost`); this layer adds the JSON shape the home page consumes, plus a
 * session gate on the two writes. Mounted before `mountConsole` so the SPA
 * catch-all never shadows it (see `server.ts`).
 *
 * Routes:
 *   GET  /api/review/recent   → { posts: ReviewRow[] }  most recent Posts (public)
 *   GET  /api/review/flagged  → { posts: ReviewRow[] }  Posts carrying ≥1 Flag (public)
 *   GET  /api/review/search   → { posts: ReviewRow[] }  ranked exactly as `query` (public)
 *   POST /api/review/:id/retire  → 204  drop from agent `query` results (session)
 *   POST /api/review/:id/restore → 204  bring it back (session)
 *
 * The two writes sit behind one session-auth middleware: ANY signed-in User
 * passes (no role check — this is post-hoc review, not a pre-publish gate);
 * a caller with no session gets 401. The reads carry no gate.
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
  // The gate for the two moderation writes: resolve the caller's session through
  // the better-auth instance and refuse anyone without one. No role check — any
  // signed-in User can moderate (the async human backstop, open to the team).
  // The reads below sit OUTSIDE this gate: browsing the shared memory is public.
  const requireSession: MiddlewareHandler = async (c, next) => {
    const session = await deps.authInstance.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
    await next();
  };

  // The two lists. Each hydrates its Posts into ReviewRows so the page gets the
  // counts inline (one batched events read per list, never k reads). `recent`
  // takes a `?sort=newest|views|confirms` (default newest) so the popularity
  // orders rank across the whole corpus in SQL, not within the fetched window.
  app.get("/api/review/recent", async (c) =>
    c.json({
      posts: await toRows(
        deps,
        await deps.repo.listRecentPosts(LIST_LIMIT, parseSort(c.req.query("sort"))),
      ),
    }),
  );
  app.get("/api/review/flagged", async (c) =>
    c.json({ posts: await toRows(deps, await deps.repo.listFlaggedPosts(LIST_LIMIT)) }),
  );

  // Search the corpus exactly the way an agent's `query` tool does: the same
  // `retrieve` pipeline (keyword + vector legs → RRF → trust/recency/repo
  // scoring), so the page surfaces and ranks Posts identically to MCP. An empty
  // `q` yields an empty list rather than the whole corpus — search is opt-in,
  // the Recent/Flagged tabs already cover "show me everything". `retrieve`
  // already returns hydrated, ranked results carrying every count a ReviewRow
  // needs, so this maps them straight across without a second events read.
  app.get("/api/review/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q === "") return c.json({ posts: [] });
    const results = await retrieve(deps.repo, deps.clock, {
      situation: q,
      limit: MAX_LIMIT,
    });
    const posts: ReviewRow[] = results.map((r) => ({
      id: r.post.id,
      title: r.post.title,
      situation: r.post.situation,
      body: r.post.body,
      environment: r.post.environment,
      repo: r.post.repo,
      status: r.post.status,
      createdAt: r.post.createdAt,
      authorName: r.authorName,
      confirms: r.confirms,
      flags: r.flags,
      views: r.views,
    }));
    return c.json({ posts });
  });

  // The human backstop. Both are idempotent no-ops for an unknown id (the
  // repository swallows it), so a stale page that retires a vanished Post just
  // gets a clean 204.
  app.post("/api/review/:id/retire", requireSession, async (c) =>
    retire(c, deps, true),
  );
  app.post("/api/review/:id/restore", requireSession, async (c) =>
    retire(c, deps, false),
  );
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
