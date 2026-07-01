import { Hono } from "hono";
import type { Deps } from "../deps.js";
import type { RepoPostCount } from "../store/queries.js";
import type { UserUsageItem } from "./telemetry.js";

/**
 * User-facing community JSON API under `/api/community/*`. The member-visible
 * counterpart to the admin-only `/api/telemetry/*`: it exposes the same corpus
 * aggregates (the Hall of Legends ranking and the per-project post breakdown)
 * but is gated on the session ALONE — any signed-in role may read it, scoped to
 * the caller's OWN Team (resolved from their Membership, never a path id, so
 * there is no cross-Team leak).
 *
 * Routes:
 *   GET /api/community/legends → { users: UserUsageItem[], projects: RepoPostCount[] }
 */
export function mountCommunity(app: Hono, deps: Deps): void {
  const community = new Hono<{ Variables: { teamId: string } }>();

  // Session gate: signed-in only, any role (unlike /api/telemetry's admin gate).
  // The Team is the caller's own — the data belongs to the Team they're in.
  community.use("*", async (c, next) => {
    const session = await deps.authInstance.api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user) return c.json({ error: "Not signed in" }, 401);
    const team = deps.controlPlane.getTeamForUser(session.user.id);
    if (team === null) return c.json({ error: "User has no Team" }, 403);
    c.set("teamId", team.id);
    await next();
  });

  // Hall of Legends + per-project post counts for the caller's Team. Top users
  // are the busiest over the last HALL_OF_LEGENDS_DAYS (matching the admin
  // overview's window); projects are every Post in the corpus grouped by repo.
  community.get("/legends", async (c) => {
    const repo = deps.teams.getRepository(c.get("teamId"));
    const since = deps.clock.now() - HALL_OF_LEGENDS_DAYS * DAY_MS;
    const stats = await repo.userActivityStats(USER_LIMIT, since);

    const users: UserUsageItem[] = stats.map((s) => ({
      userId: s.userId,
      name: deps.controlPlane.getUser(s.userId)?.name ?? null,
      team: deps.controlPlane.getTeamForUser(s.userId)?.name ?? null,
      lastSeen: s.lastSeen,
      posts: s.posts,
      searches: s.searches,
      total: s.total,
    }));
    const projects: RepoPostCount[] = await repo.postsByRepo();

    return c.json({ users, projects });
  });

  app.route("/api/community", community);
}

const USER_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Rolling window for the Hall of Legends top-users ranking (last 30 days). */
const HALL_OF_LEGENDS_DAYS = 30;
