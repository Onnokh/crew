import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { Deps } from "../deps.js";
import type { Auth } from "../auth/better-auth.js";

/**
 * Admin user-management JSON API under `/api/admin/*`, role-gated to `admin`.
 * Mutations route through better-auth's own `api` surface. Admin-gated endpoints
 * (createUser/listUsers/banUser) re-check `role`, so we replay the request
 * headers into them. API keys are server-side: mint via `createApiKey` with
 * `body.userId` (sets `referenceId`), and count/list/revoke through the
 * better-auth adapter so an admin can touch ANY User's keys, not just the caller's.
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

  // Keys come from the adapter (keyed by `referenceId`), never the secret.
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
        keys: await adapter.list(u.id),
      })),
    );
    return c.json({ users: rows });
  });

  // Generate a strong password and return it ONCE; only its hash is stored.
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

  // Revoke a single key by id, through the adapter so an admin can revoke ANY key.
  admin.delete("/keys/:keyId", async (c) => {
    const adapter = await keyAdapter(auth);
    await adapter.deleteById(c.req.param("keyId"));
    return c.body(null, 204);
  });

  // Ban blocks login/sessions but leaves keys verifying, so also delete the
  // User's `apikey` rows. The `user` row stays so authored Posts stay attributed.
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
function generatePassword(): string {
  return randomBytes(15).toString("base64url").slice(0, 20);
}

/** A short suffix to keep minted key names distinct in better-auth's listing. */
function shortId(): string {
  return randomBytes(4).toString("base64url").slice(0, 6);
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
