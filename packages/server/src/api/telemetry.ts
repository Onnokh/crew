import { Hono } from "hono";
import type { Deps } from "../deps.js";

/**
 * Retrieval-telemetry JSON API under `/api/telemetry/*`, role-gated to `admin`
 * (same gate as `/api/admin/*`). Backs the telemetry dashboard's panels. PLO-48
 * ships the recent-Retrievals read; PLO-49/50/51 add their own reads here
 * alongside it (conversion rate, zero-result/volume, tuning detail).
 *
 * Routes:
 *   GET /api/telemetry/recent  → { retrievals: RetrievalRow[] }  most recent queries
 */
export function mountTelemetry(app: Hono, deps: Deps): void {
  const telemetry = new Hono();

  // Role gate: no session → 401, non-admin → 403 (mirrors api/admin.ts).
  telemetry.use("*", async (c, next) => {
    const session = await deps.authInstance.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) return c.json({ error: "Not signed in" }, 401);
    if (session.user.role !== "admin") {
      return c.json({ error: "Admin role required" }, 403);
    }
    await next();
  });

  telemetry.get("/recent", async (c) => {
    const rows = await deps.repo.listRecentRetrievals(LIST_LIMIT);
    return c.json({ retrievals: rows.map(toRetrievalRow) });
  });

  app.route("/api/telemetry", telemetry);
}

const LIST_LIMIT = 50;

/** A Retrieval flattened to what the dashboard's recent-Retrievals panel renders. */
export type RetrievalRow = {
  id: string;
  situation: string;
  repo: string | null;
  resultCount: number;
  createdAt: number;
};

function toRetrievalRow(r: {
  id: string;
  situation: string;
  repo: string | null;
  resultCount: number;
  createdAt: number;
}): RetrievalRow {
  return {
    id: r.id,
    situation: r.situation,
    repo: r.repo,
    resultCount: r.resultCount,
    createdAt: r.createdAt,
  };
}
