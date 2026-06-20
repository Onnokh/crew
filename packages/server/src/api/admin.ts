import { Hono } from "hono";
import { customAlphabet } from "nanoid";
import type { Deps } from "../deps.js";
import type { Auth } from "../auth/better-auth.js";

/**
 * Admin user-management JSON API under `/api/admin/*`, role-gated to `admin`.
 * Mutations route through better-auth's own `api` surface. Admin-gated endpoints
 * (createUser/listUsers/removeUser) re-check `role`, so we replay the request
 * headers into them. API keys are server-side: mint via `createApiKey` with
 * `body.userId` (sets `referenceId`), and count/list/revoke through the
 * better-auth adapter so an admin can touch ANY User's keys, not just the caller's.
 *
 * Deleting a User is the single off-switch (CONTEXT.md "User"; ADR 0008): it
 * revokes the User's keys, removes their Membership, and removes the better-auth
 * `user` row (cascading sessions) so login stops and the email frees up. Their
 * authored Posts/events stay in the team corpus and render as an unknown author.
 */
export function mountAdmin(app: Hono, deps: Deps): void {
  const auth = deps.authInstance;
  const admin = new Hono();

  // Role gate: no session → 401, non-admin → 403.
  admin.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "Not signed in" }, 401);
    if (session.user.role !== "admin") {
      return c.json({ error: "Admin role required" }, 403);
    }
    await next();
  });

  // Keys come from the adapter (keyed by `referenceId`), never the secret. Each
  // row carries the User's Team (resolved via the control-plane membership), so
  // the console can show who belongs where.
  admin.get("/users", async (c) => {
    const { users } = await auth.api.listUsers({
      query: { limit: 200, sortBy: "createdAt", sortDirection: "desc" },
      headers: c.req.raw.headers,
    });
    const adapter = await keyAdapter(auth);
    const rows = await Promise.all(
      users.map(async (u) => {
        const team = deps.controlPlane.getTeamForUser(u.id);
        return {
          id: u.id,
          email: u.email,
          role: u.role ?? null,
          teamId: team?.id ?? null,
          teamName: team?.name ?? null,
          keys: await adapter.list(u.id),
        };
      }),
    );
    return c.json({ users: rows });
  });

  // Generate a strong password and return it ONCE; only its hash is stored. The
  // User is bound to exactly one Team at creation (ADR 0008): `teamId` picks it,
  // defaulting to the default (first) Team when omitted.
  admin.post("/users", async (c) => {
    const body: { email?: unknown; teamId?: unknown } = await c.req
      .json()
      .catch(() => ({}) as { email?: unknown; teamId?: unknown });
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) return c.json({ error: "An email is required" }, 400);

    // Resolve the requested Team (must exist); fall back to the default Team.
    const requestedTeamId =
      typeof body.teamId === "string" ? body.teamId.trim() : "";
    const team = requestedTeamId
      ? deps.controlPlane.getTeam(requestedTeamId)
      : deps.controlPlane.firstTeam();
    if (team === null) {
      return c.json({ error: "No such Team" }, 400);
    }

    const password = generatePassword();
    try {
      const { user } = await auth.api.createUser({
        body: { email, password, name: email },
        headers: c.req.raw.headers,
      });
      // A User must belong to exactly one Team for its keys to route (ADR 0008).
      deps.controlPlane.addMembership(user.id, team.id, deps.clock.now());
      return c.json({ user: { id: user.id, email: user.email }, password }, 201);
    } catch (err) {
      return c.json({ error: messageOf(err, "Could not create the User") }, 400);
    }
  });

  // Mint a key, returning the raw secret ONCE. Server-side (no headers) so
  // `body.userId` becomes the key's `referenceId` (its owner, not the admin).
  admin.post("/users/:id/keys", async (c) => {
    const userId = c.req.param("id");
    try {
      const key = await auth.api.createApiKey({
        body: { name: `console-${shortId()}`, userId },
      });
      return c.json({ id: key.id, key: key.key }, 201);
    } catch (err) {
      return c.json({ error: messageOf(err, "Could not mint the key") }, 400);
    }
  });

  // List every Team (including the auto-created default), newest first.
  admin.get("/teams", (c) => {
    const teams = deps.controlPlane.listTeams().map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
    }));
    return c.json({ teams });
  });

  // Create a Team: mint an opaque id, persist it under the default Org, then warm
  // its corpus DB through the resolver so it is provisioned and immediately
  // routable (ADR 0007/0008). No delete path is exposed (by design).
  admin.post("/teams", async (c) => {
    const body: { name?: unknown } = await c.req
      .json()
      .catch(() => ({}) as { name?: unknown });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "A team name is required" }, 400);

    // New Teams join the existing default Org (the first Team's org).
    const org = deps.controlPlane.firstTeam();
    if (org === null) {
      return c.json({ error: "No Org to attach the Team to" }, 400);
    }
    const id = deps.idGen.next("team");
    const createdAt = deps.clock.now();
    deps.controlPlane.createTeam({ id, orgId: org.orgId, name }, createdAt);
    // Materialize the corpus DB now so the Team is routable on first user assignment.
    deps.teams.getRepository(id);
    return c.json({ team: { id, name, createdAt } }, 201);
  });

  // Rename a Team — DISPLAY-ONLY. The opaque id (and thus the corpus file) is
  // never touched, so routing/storage are unaffected (ADR 0007).
  admin.patch("/teams/:id", async (c) => {
    const id = c.req.param("id");
    const body: { name?: unknown } = await c.req
      .json()
      .catch(() => ({}) as { name?: unknown });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "A team name is required" }, 400);
    if (deps.controlPlane.getTeam(id) === null) {
      return c.json({ error: "No such Team" }, 404);
    }
    deps.controlPlane.renameTeam(id, name);
    return c.json({ team: { id, name } });
  });

  // Revoke a single key by id, through the adapter so an admin can revoke ANY key.
  admin.delete("/keys/:keyId", async (c) => {
    const adapter = await keyAdapter(auth);
    await adapter.deleteById(c.req.param("keyId"));
    return c.body(null, 204);
  });

  // Delete a User — the single, irreversible off-switch (CONTEXT.md; ADR 0008).
  // 1) Revoke every API key the User holds (agents acting as them stop at once).
  // 2) Remove the Membership row BEFORE the user row — `team_membership.user_id`
  //    FK-references `user(id)` with no cascade, so it must go first.
  // 3) Remove the better-auth `user` row (cascades `session`/`account`) so login
  //    stops and the email frees up for reuse.
  // The User's authored Posts and Confirm/Flag events live in the team corpus and
  // are NOT touched — trust math is unchanged; the author now renders "unknown".
  admin.delete("/users/:id", async (c) => {
    const userId = c.req.param("id");
    const adapter = await keyAdapter(auth);
    const keysRevoked = await adapter.deleteAllFor(userId);
    deps.controlPlane.removeMembership(userId);
    try {
      await auth.api.removeUser({
        body: { userId },
        headers: c.req.raw.headers,
      });
    } catch (err) {
      return c.json({ error: messageOf(err, "Could not delete the User") }, 400);
    }
    return c.json({ deleted: true, keysRevoked });
  });

  app.route("/api/admin", admin);
}

/** Seam over better-auth's storage adapter for the `apikey` model. */
async function keyAdapter(auth: Auth) {
  const { adapter } = await auth.$context;
  return {
    // Safe key metadata only; the hashed `key` is never selected.
    list: async (referenceId: string): Promise<ApiKeyRow[]> => {
      const rows = await adapter.findMany<RawApiKey>({
        model: "apikey",
        where: [{ field: "referenceId", value: referenceId }],
      });
      return rows
        .map((k) => ({
          id: k.id,
          name: k.name ?? null,
          start: k.start ?? null,
          enabled: k.enabled ?? true,
          createdAt: toIso(k.createdAt),
          lastRequest: toIso(k.lastRequest),
        }))
        // Newest first; a never-used key (no createdAt) sorts last.
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    },
    deleteById: (id: string) =>
      adapter.delete({ model: "apikey", where: [{ field: "id", value: id }] }),
    deleteAllFor: (referenceId: string) =>
      adapter.deleteMany({
        model: "apikey",
        where: [{ field: "referenceId", value: referenceId }],
      }),
  };
}

/** The api-key columns we read; the rest (incl. the hash) is ignored. */
type RawApiKey = {
  id: string;
  name?: string | null;
  start?: string | null;
  enabled?: boolean | null;
  createdAt?: Date | string | number | null;
  lastRequest?: Date | string | number | null;
};

/** Safe key metadata as the listing returns it. */
type ApiKeyRow = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | null;
  lastRequest: string | null;
};

/** Normalize a better-auth date column (Date | epoch | ISO string) to an ISO string. */
function toIso(value: Date | string | number | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A URL-safe one-time password — long enough that it need never be memorised. */
const generatePassword = customAlphabet(
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789",
  20,
);

/** A short suffix to keep minted key names distinct in better-auth's listing. */
const shortId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

/** Pull a human message off a better-auth APIError, falling back to `fallback`. */
function messageOf(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body?: { message?: unknown } }).body;
    if (body && typeof body.message === "string") return body.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
