import type { Context, Hono, MiddlewareHandler } from "hono";
import type { Post } from "../core/post.js";
import type { Deps } from "../deps.js";
import { hydratePosts } from "../read/hydrate.js";
import { MAX_LIMIT, retrieve } from "../search/retrieve.js";
import type { PostSort } from "../store/repository.js";

/** Coerce the `?sort=` query into a {@link PostSort}; anything else → newest. */
function parseSort(value: string | undefined): PostSort {
  return value === "views" || value === "confirms" ? value : "newest";
}

/**
 * The human review JSON API under `/api/review/*`. Reads (recent, flagged,
 * search) are public; the moderation writes (retire/restore) sit behind a
 * session — any signed-in User passes, no role check.
 *
 * Routes:
 *   GET  /api/review/recent   → { posts: ReviewRow[] }  most recent Posts
 *   GET  /api/review/flagged  → { posts: ReviewRow[] }  Posts carrying ≥1 Flag
 *   GET  /api/review/search   → { posts: ReviewRow[] }  ranked exactly as `query`
 *   POST /api/review/:id/retire  → 204  drop from agent `query` results
 *   POST /api/review/:id/restore → 204  bring it back
 */

const LIST_LIMIT = 50;

/** A Post flattened to what the `/review` page renders. */
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
  // Gate for the writes: any signed-in User passes, no session → 401. Reads are public.
  const requireSession: MiddlewareHandler = async (c, next) => {
    const session = await deps.authInstance.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) return c.json({ error: "unauthenticated" }, 401);
    await next();
  };

  // `recent` takes `?sort=newest|views|confirms` (default newest), ranked in SQL.
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

  // Search via the same `retrieve` pipeline `query` uses. Empty `q` → empty list.
  app.get("/api/review/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q === "") return c.json({ posts: [] });
    const results = await retrieve(deps.repo, deps.clock, {
      situation: q,
      limit: MAX_LIMIT,
    });
    return c.json({ posts: results.map(toReviewRow) });
  });

  // Idempotent no-ops for an unknown id (the repository swallows it).
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

/** Hydrate Posts (author names + event-log counts) then flatten to {@link ReviewRow}s. */
async function toRows(deps: Deps, posts: Post[]): Promise<ReviewRow[]> {
  const hydrated = await hydratePosts(deps.repo, posts);
  return hydrated.map(toReviewRow);
}

/** Flatten a hydrated Post (from `hydratePosts` or `retrieve`) into a {@link ReviewRow}. */
function toReviewRow(h: {
  post: Post;
  authorName: string;
  confirms: number;
  flags: number;
  views: number;
}): ReviewRow {
  return {
    id: h.post.id,
    title: h.post.title,
    situation: h.post.situation,
    body: h.post.body,
    environment: h.post.environment,
    repo: h.post.repo,
    status: h.post.status,
    createdAt: h.post.createdAt,
    authorName: h.authorName,
    confirms: h.confirms,
    flags: h.flags,
    views: h.views,
  };
}
