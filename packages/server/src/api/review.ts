import type { Context, Hono } from "hono";
import type { Post } from "../core/post.js";
import type { Deps } from "../deps.js";
import { hydratePosts } from "../read/hydrate.js";
import type { PostRepository } from "../store/repository.js";
import { MAX_LIMIT, retrieve } from "../search/retrieve.js";
import type { PostSort } from "../store/repository.js";

/** Coerce the `?sort=` query into a {@link PostSort}; anything else → newest. */
function parseSort(value: string | undefined): PostSort {
  return value === "views" || value === "confirms" ? value : "newest";
}

/**
 * The human review JSON API under `/api/review/*`. Every route now operates on
 * the CALLER'S OWN Team (ADR 0008): the request's session resolves to a User,
 * the control plane resolves that User's Team, and the matching per-team corpus
 * repository serves the route. A request with no session — or one whose User has
 * no Team — is rejected (401). Author names resolve from the control plane, so a
 * missing/deleted author renders as `"unknown"`.
 *
 * Routes:
 *   GET  /api/review/recent   → { posts: ReviewRow[] }  most recent Posts
 *   GET  /api/review/flagged  → { posts: ReviewRow[] }  Posts carrying ≥1 Flag
 *   GET  /api/review/search   → { posts: ReviewRow[] }  ranked exactly as `query`
 *   DELETE /api/review/:id    → 204  permanently delete a Post (owner or admin)
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
  createdBy: string;
  createdAt: number;
  authorName: string;
  confirms: number;
  flags: number;
  views: number;
};

export function mountReview(app: Hono, deps: Deps): void {
  const getUser = (id: string) => deps.controlPlane.getUser(id);

  /**
   * Resolve the caller's session User AND their Team corpus repository. Returns
   * null for no session OR a User with no Team; the handler then answers 401.
   */
  async function callerContext(
    c: Context,
  ): Promise<{ repo: PostRepository; userId: string; isAdmin: boolean } | null> {
    const session = await deps.authInstance.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) return null;
    const team = deps.controlPlane.getTeamForUser(session.user.id);
    if (team === null) return null;
    return {
      repo: deps.teams.getRepository(team.id),
      userId: session.user.id,
      isAdmin: session.user.role === "admin",
    };
  }

  /** The repo half of {@link callerContext}, for the read-only list routes. */
  async function repoForCaller(c: Context): Promise<PostRepository | null> {
    return (await callerContext(c))?.repo ?? null;
  }

  // `recent` takes `?sort=newest|views|confirms` (default newest), ranked in SQL.
  app.get("/api/review/recent", async (c) => {
    const repo = await repoForCaller(c);
    if (!repo) return c.json({ error: "unauthenticated" }, 401);
    return c.json({
      posts: await toRows(
        repo,
        getUser,
        await repo.listRecentPosts(LIST_LIMIT, parseSort(c.req.query("sort"))),
      ),
    });
  });

  app.get("/api/review/flagged", async (c) => {
    const repo = await repoForCaller(c);
    if (!repo) return c.json({ error: "unauthenticated" }, 401);
    return c.json({
      posts: await toRows(repo, getUser, await repo.listFlaggedPosts(LIST_LIMIT)),
    });
  });

  // Search via the same `retrieve` pipeline `query` uses. Empty `q` → empty list.
  app.get("/api/review/search", async (c) => {
    const repo = await repoForCaller(c);
    if (!repo) return c.json({ error: "unauthenticated" }, 401);
    const q = (c.req.query("q") ?? "").trim();
    if (q === "") return c.json({ posts: [] });
    const results = await retrieve(repo, getUser, deps.clock, {
      situation: q,
      limit: MAX_LIMIT,
    });
    return c.json({ posts: results.map((r) => toReviewRow(r.result)) });
  });

  // Delete a Post. Allowed only for its author or an admin; 404 for an unknown id.
  app.delete("/api/review/:id", async (c) => {
    const ctx = await callerContext(c);
    if (!ctx) return c.json({ error: "unauthenticated" }, 401);
    const id = c.req.param("id");
    if (!id) return c.json({ error: "missing post id" }, 400);
    const post = await ctx.repo.getPost(id);
    if (!post) return c.json({ error: "not found" }, 404);
    if (!ctx.isAdmin && post.createdBy !== ctx.userId) {
      return c.json({ error: "forbidden" }, 403);
    }
    await ctx.repo.deletePost(id);
    return c.body(null, 204);
  });
}

/** Hydrate Posts (author names + event-log counts) then flatten to {@link ReviewRow}s. */
async function toRows(
  repo: PostRepository,
  getUser: (id: string) => ReturnType<Deps["controlPlane"]["getUser"]>,
  posts: Post[],
): Promise<ReviewRow[]> {
  const hydrated = await hydratePosts(repo, getUser, posts);
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
    createdBy: h.post.createdBy,
    createdAt: h.post.createdAt,
    authorName: h.authorName,
    confirms: h.confirms,
    flags: h.flags,
    views: h.views,
  };
}
