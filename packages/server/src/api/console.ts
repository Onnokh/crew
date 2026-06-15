import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { Hono } from "hono";

/**
 * Serves the built console SPA (`packages/console/dist`) as static assets off the
 * same Hono app FastMCP exposes via `server.getApp()` — one app, one port (see
 * ADR 0004). `buildServer` calls this exactly once, AFTER `mountAuth` and the
 * `/mcp` transport, so this only ever catches what those didn't: real asset
 * requests (`/assets/*.js`, `/favicon.ico`) and client-route deep links
 * (`/admin`, `/review`, `/login`) that TanStack Router resolves in the browser.
 *
 * Two pieces, in order:
 *
 *  1. `serveStatic` streams a file from `dist/` when one matches the path.
 *  2. A GET catch-all fallback returns `dist/index.html` for everything else, so
 *     a deep link or a refresh on a client route loads the SPA shell instead of a
 *     404 — the SPA then routes client-side. The fallback is GET-only and runs
 *     last, so it can't shadow `/api/auth/*` (POST sign-in etc.) or `/mcp`.
 *
 * Dev-time tolerance: the server boots and the test suite runs without the
 * console ever being built. If `dist/` is absent we mount NOTHING and return
 * `false`, leaving the Hono app's own 404 in place — the agent transport and auth
 * routes are unaffected. Returns whether static serving was mounted.
 */
export function mountConsole(app: Hono): boolean {
  const distDir = consoleDistDir();
  if (!existsSync(distDir)) {
    // eslint-disable-next-line no-console
    console.warn(
      `Console dist not found at ${distDir} — skipping static serving. ` +
        "Build it with `pnpm --filter @soa/console build` to serve the web UI.",
    );
    return false;
  }

  // `serveStatic`'s `root` is resolved relative to the process CWD (absolute
  // paths are unsupported), so we hand it a CWD-relative path with forward
  // slashes — Node's path APIs give us back-slashes on Windows, which the static
  // middleware's URL-style joining doesn't understand.
  const root = relative(process.cwd(), distDir).split("\\").join("/");

  app.use("/*", serveStatic({ root }));

  // Client-route fallback: any GET that fell through serveStatic (i.e. no file on
  // disk matched) gets the SPA shell, so browser-side routes deep-link correctly.
  app.get("/*", serveStatic({ root, path: "index.html" }));

  return true;
}

/**
 * Absolute path to the console's built assets. Overridable with
 * `SOA_CONSOLE_DIST` for the container image, where the Vite output is copied to
 * a fixed location rather than sitting beside the server in the workspace (see
 * issue 0014). Default targets the sibling workspace package for local dev, where
 * the server's CWD is `packages/server`.
 */
function consoleDistDir(): string {
  const override = process.env.SOA_CONSOLE_DIST;
  if (override) {
    return isAbsolute(override) ? override : resolve(process.cwd(), override);
  }
  return resolve(process.cwd(), "../console/dist");
}
