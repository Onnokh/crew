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

  app.use("/*", serveStatic({ root }));

  // Client-route fallback: a GET that matched no file gets the SPA shell.
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
