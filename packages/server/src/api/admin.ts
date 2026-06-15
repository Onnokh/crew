import type { Hono } from "hono";
import type { Deps } from "../deps.js";

/**
 * The admin user-management JSON API (slice 0012). Mounts under `/api/admin/*`
 * on the same Hono app FastMCP exposes, role-gated so only a User whose `role`
 * is `admin` reaches it — every endpoint resolves the caller's session via
 * `deps.authInstance.api.getSession` and refuses non-admins. Drives the console
 * `/admin` page: create User (one-time password), list Users with role +
 * api-key counts, mint/revoke api keys, ban User. Mounted before `mountConsole`
 * so the SPA catch-all never shadows it (see `server.ts`).
 *
 * Stub wired ahead of slice 0012 so the seam is conflict-free for concurrent
 * work; the slice fills in the routes.
 */
export function mountAdmin(app: Hono, deps: Deps): void {
  void app;
  void deps;
}
