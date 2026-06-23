import { Hono } from "hono";
import type { Deps } from "../deps.js";
import { keyAdapter, shortId } from "../auth/api-keys.js";

/**
 * Self-service JSON API under `/api/me/*` — the signed-in User acting on their
 * OWN account (ADR 0010). Authorization is the session itself: the User is
 * derived from the cookie, never from a path id, so there is no IDOR surface.
 * Any role may call these (unlike `/api/admin/*`, which is admin-gated).
 *
 * Self-management differs from the admin surface by design: password change
 * requires the current password (better-auth `changePassword`), whereas an
 * admin resets without one; and a User cannot edit their own display `name`
 * (it renders as the author on their Posts) — only an admin can.
 */
export function mountMe(app: Hono, deps: Deps): void {
  const auth = deps.authInstance;
  const me = new Hono();

  // Session gate: signed-in only. No role check — this is one's own account.
  me.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "Not signed in" }, 401);
    await next();
  });

  // The caller's own profile: identity (read-only here), Team, and key metadata.
  me.get("/", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const user = session!.user;
    const team = deps.controlPlane.getTeamForUser(user.id);
    const adapter = await keyAdapter(auth);
    return c.json({
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      role: user.role ?? null,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      keys: await adapter.list(user.id),
    });
  });

  // Change own password: requires the current one (guards a left-open session
  // from locking the real owner out). The user picks the new value — nothing is
  // returned, unlike the admin reset which generates and shows a secret once.
  me.post("/password", async (c) => {
    const body: { currentPassword?: unknown; newPassword?: unknown } = await c.req
      .json()
      .catch(() => ({}));
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword.trim() : "";
    if (!currentPassword) {
      return c.json({ error: "Current password is required" }, 400);
    }
    if (newPassword.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }
    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword },
        headers: c.req.raw.headers,
      });
      return c.body(null, 204);
    } catch (err) {
      return c.json(
        { error: messageOf(err, "Could not change the password") },
        400,
      );
    }
  });

  // Mint a key for the CALLER. Passing the session headers (and no `userId`)
  // makes better-auth set `referenceId` to the caller, so the key is always
  // one's own. The raw secret is returned ONCE.
  me.post("/keys", async (c) => {
    try {
      const key = await auth.api.createApiKey({
        body: { name: `console-${shortId()}` },
        headers: c.req.raw.headers,
      });
      return c.json({ id: key.id, key: key.key }, 201);
    } catch (err) {
      return c.json({ error: messageOf(err, "Could not mint the key") }, 400);
    }
  });

  // Revoke one of the caller's OWN keys. We confirm the key belongs to the
  // caller (it appears in their listing) before deleting — a foreign key id is
  // a 404, never a cross-account delete.
  me.delete("/keys/:keyId", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const userId = session!.user.id;
    const keyId = c.req.param("keyId");
    const adapter = await keyAdapter(auth);
    const own = await adapter.list(userId);
    if (!own.some((k) => k.id === keyId)) {
      return c.json({ error: "No such key" }, 404);
    }
    await adapter.deleteById(keyId);
    return c.body(null, 204);
  });

  app.route("/api/me", me);
}

/** Pull a human message off a better-auth APIError, falling back to `fallback`. */
function messageOf(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body?: { message?: unknown } }).body;
    if (body && typeof body.message === "string") return body.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
