import type { Hono } from "hono";
import type { Auth } from "../auth/better-auth.js";

/**
 * Mounts better-auth's own routes (sign-in/out, session, the api-key and admin
 * endpoints) onto the same Hono app FastMCP exposes via `server.getApp()` — one
 * app, one port (see ADR 0003/0004). better-auth handles every request under its
 * base path with a single Fetch-standard `handler(Request): Response`, so we hand
 * it `c.req.raw` and return its `Response` verbatim; no auth logic is
 * reimplemented here.
 *
 * The base path (`/api/auth`) is disjoint from `/mcp` and the console's static
 * assets, so route precedence is unambiguous — this catch-all only ever sees
 * better-auth's own paths. `buildServer` calls this exactly once, mirroring how
 * `registerTools` is the one place the MCP tools are wired.
 */
export function mountAuth(app: Hono, auth: Auth): void {
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
}
