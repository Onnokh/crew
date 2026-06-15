import { Hono } from "hono";
import { customAlphabet } from "nanoid";
import type { Deps } from "../deps.js";
import type { Auth } from "../auth/better-auth.js";

/**
 * The admin user-management JSON API (slice 0012). Mounts under `/api/admin/*`
 * on the same Hono app FastMCP exposes, role-gated so only a User whose `role`
 * is `admin` reaches it — every endpoint resolves the caller's session via
 * `deps.authInstance.api.getSession` and refuses non-admins. Drives the console
 * `/admin` page: create User (one-time password), list Users with role +
 * api-key counts, mint/revoke api keys, ban User. Mounted before `mountConsole`
 * so the SPA catch-all never shadows it (see `server.ts`).
 *
 * Every mutation routes through better-auth's own `api` surface so no auth rule
 * is reimplemented here (see ADR 0003). Two seams that surface need a note:
 *
 * - **Admin-gated endpoints** (`createUser`, `listUsers`, `banUser`) read the
 *   caller's authority from the session, so we replay the request `headers` into
 *   them — the very headers we just gated on. The plugin re-checks `role` itself.
 * - **API keys link by `referenceId`** (= the owning User's id), and the api-key
 *   plugin's own `createApiKey`/`listApiKeys`/`deleteApiKey` are session-scoped to
 *   the *caller's* keys — they cannot mint, count, or revoke another User's keys.
 *   So we mint server-side (`createApiKey` with `body.userId`, no headers, which
 *   sets `referenceId` to that User) and count/list/revoke straight through the
 *   better-auth adapter (`auth.$context`) by `referenceId`/`id`. The adapter is
 *   the same store the plugin writes, so a key revoked this way stops verifying.
 */
export function mountAdmin(app: Hono, deps: Deps): void {
  const auth = deps.authInstance;
  const admin = new Hono();

  // The role gate, written once. Resolve the caller's session from the live
  // request headers: no session is a 401, a non-admin role is a 403. Stash the
  // headers on the context so the admin-gated better-auth calls can replay them.
  admin.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "Not signed in" }, 401);
    if (session.user.role !== "admin") {
      return c.json({ error: "Admin role required" }, 403);
    }
    await next();
  });

  // List Users with their role and live api-key count. The count comes from the
  // adapter (keyed by `referenceId`), not the session-scoped `listApiKeys`, so it
  // is correct for every User and not just the caller.
  admin.get("/users", async (c) => {
    const { users } = await auth.api.listUsers({
      query: { limit: 200, sortBy: "createdAt", sortDirection: "desc" },
      headers: c.req.raw.headers,
    });
    const adapter = await keyAdapter(auth);
    const rows = await Promise.all(
      users.map(async (u) => ({
        id: u.id,
        email: u.email,
        role: u.role ?? null,
        banned: u.banned ?? false,
        keyCount: await adapter.count(u.id),
      })),
    );
    return c.json({ users: rows });
  });

  // Create a User from an email alone: we generate a strong password and return
  // it ONCE. better-auth stores only its hash, so it can never be re-fetched —
  // the admin copies it here or resets it later. `name` defaults to the email so
  // attribution has something to render.
  admin.post("/users", async (c) => {
    const body: { email?: unknown } = await c.req
      .json()
      .catch(() => ({}) as { email?: unknown });
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) return c.json({ error: "An email is required" }, 400);

    const password = generatePassword();
    try {
      const { user } = await auth.api.createUser({
        body: { email, password, name: email },
        headers: c.req.raw.headers,
      });
      // The password is shown exactly once; never persisted in plaintext, never
      // returned again from any other endpoint.
      return c.json({ user: { id: user.id, email: user.email }, password }, 201);
    } catch (err) {
      return c.json({ error: messageOf(err, "Could not create the User") }, 400);
    }
  });

  // Mint an api key for a User and return the raw key ONCE (the plugin returns
  // the secret only at creation). Server-side mint (no headers) so `body.userId`
  // becomes the key's `referenceId` — the admin plugin forbids passing `userId`
  // on a cookie'd call, and a key must link to its owner, not to the admin.
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

  // Revoke a single api key by its id. Goes through the adapter (not the
  // session-scoped `deleteApiKey`) so an admin can revoke ANY User's key; the
  // deleted row stops `verifyApiKey` immediately.
  admin.delete("/keys/:keyId", async (c) => {
    const adapter = await keyAdapter(auth);
    await adapter.deleteById(c.req.param("keyId"));
    return c.body(null, 204);
  });

  // Ban a User: blocks login + sessions (better-auth) AND revokes every api key
  // they hold. `banUser` alone leaves keys verifying — agents authenticate by
  // key, not session — so we delete the User's `apikey` rows in the same step.
  // The `user` row stays, so their authored Posts remain attributed.
  admin.post("/users/:id/ban", async (c) => {
    const userId = c.req.param("id");
    try {
      await auth.api.banUser({
        body: { userId },
        headers: c.req.raw.headers,
      });
    } catch (err) {
      return c.json({ error: messageOf(err, "Could not ban the User") }, 400);
    }
    const adapter = await keyAdapter(auth);
    const revoked = await adapter.deleteAllFor(userId);
    return c.json({ banned: true, keysRevoked: revoked });
  });

  app.route("/api/admin", admin);
}

/**
 * A tiny seam over better-auth's storage adapter for the `apikey` model — the
 * only place admin code reaches past the plugin's session-scoped endpoints. Keys
 * link to their owner by `referenceId`, so count/list/delete all pivot on it (or
 * on the row id for a single revoke). The adapter is the same store the api-key
 * plugin writes, so anything removed here stops verifying.
 */
async function keyAdapter(auth: Auth) {
  const { adapter } = await auth.$context;
  return {
    count: (referenceId: string) =>
      adapter.count({
        model: "apikey",
        where: [{ field: "referenceId", value: referenceId }],
      }),
    deleteById: (id: string) =>
      adapter.delete({ model: "apikey", where: [{ field: "id", value: id }] }),
    deleteAllFor: (referenceId: string) =>
      adapter.deleteMany({
        model: "apikey",
        where: [{ field: "referenceId", value: referenceId }],
      }),
  };
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
