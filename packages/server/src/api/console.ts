import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { Hono } from "hono";

/**
 * Serves the built console SPA from `dist/` as static assets, with a GET
 * catch-all falling back to `index.html` so client-route deep links load the
 * shell. Must mount AFTER auth and `/mcp` so it only catches what they didn't.
 * If `dist/` is absent, mounts nothing and returns `false` (boots without a build).
 */
export function mountConsole(app: Hono): boolean {
  const distDir = consoleDistDir();
  if (!existsSync(distDir)) {
    // eslint-disable-next-line no-console
    console.warn(
      `Console dist not found at ${distDir} — skipping static serving. ` +
        "Build it with `npm run build -w @crew/console` to serve the web UI.",
    );
    return false;
  }

  // `serveStatic`'s `root` must be CWD-relative with forward slashes (absolute
  // paths unsupported; the middleware can't read Windows back-slashes).
  const root = relative(process.cwd(), distDir).split("\\").join("/");

  // Cache policy that survives deploys (set after the response so it sticks —
  // serveStatic's own onFound runs too late to add headers). Vite content-hashes
  // everything under /assets/, so cache it immutably for a year; the un-hashed
  // HTML shell must revalidate every load so a deploy's new chunk names take
  // effect immediately instead of a stale shell pointing at deleted chunks.
  app.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("/*", async (c, next) => {
    await next();
    if (c.res.headers.get("Content-Type")?.includes("text/html")) {
      c.header("Cache-Control", "no-cache");
    }
  });

  app.use("/*", serveStatic({ root }));

  // A MISSING hashed asset must 404 — never fall through to the SPA shell.
  // Otherwise a request for a chunk that briefly doesn't exist (e.g. the window
  // during a deploy) gets index.html with `200 text/html`, which a CDN/browser
  // happily caches UNDER THE ASSET URL. After the deploy the real chunk exists,
  // but caches keep serving that HTML, and the module loader rejects it with
  // "Failed to fetch dynamically imported module". 404 keeps the cache clean.
  app.get("/assets/*", (c) => c.text("Not found", 404));

  // Client-route fallback: a non-asset GET that matched no file gets the SPA shell.
  app.get("/*", serveStatic({ root, path: "index.html" }));

  return true;
}

/**
 * Absolute path to the console's built assets. Overridable with
 * `CREW_CONSOLE_DIST` (used by the container image); defaults to the sibling
 * workspace package for local dev.
 */
function consoleDistDir(): string {
  const override = process.env.CREW_CONSOLE_DIST;
  if (override) {
    return isAbsolute(override) ? override : resolve(process.cwd(), override);
  }
  return resolve(process.cwd(), "../console/dist");
}
