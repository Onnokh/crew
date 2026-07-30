import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { Hono } from "hono";

/** Serves the public marketing SPA at the site root. */
export function mountMarketing(app: Hono): boolean {
  const distDir = marketingDistDir();
  if (!existsSync(distDir)) {
    // eslint-disable-next-line no-console
    console.warn(
      `Marketing dist not found at ${distDir} — skipping public site serving. ` +
        "Build it with `npm run build:marketing` to serve the public site.",
    );
    return false;
  }

  const root = relative(process.cwd(), distDir).split("\\").join("/");

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

  // A missing marketing asset must remain a 404 instead of becoming HTML.
  app.get("/assets/*", (c) => c.text("Not found", 404));

  // Client-side marketing routes fall back to the shell.
  app.get("/*", serveStatic({ root, path: "index.html" }));

  return true;
}

function marketingDistDir(): string {
  const override = process.env.CREW_MARKETING_DIST;
  if (override) {
    return isAbsolute(override) ? override : resolve(process.cwd(), override);
  }
  return resolve(process.cwd(), "../marketing/dist");
}
