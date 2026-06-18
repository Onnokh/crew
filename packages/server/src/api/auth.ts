import type { Hono } from "hono";
import type { Auth } from "../auth/better-auth.js";

/** Mount better-auth's own routes under `/api/auth/*`, handing each request to its handler. */
export function mountAuth(app: Hono, auth: Auth): void {
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
}
