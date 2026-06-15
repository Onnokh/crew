import type { Hono } from "hono";
import type { Deps } from "../deps.js";

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
 * Stub wired ahead of slice 0013 so the seam is conflict-free for concurrent
 * work; the slice fills in the routes.
 */
export function mountReview(app: Hono, deps: Deps): void {
  void app;
  void deps;
}
