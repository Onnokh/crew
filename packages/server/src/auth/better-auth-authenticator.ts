import type { IncomingMessage } from "node:http";
import type { Auth } from "./better-auth.js";
import type { SqliteRepository } from "../store/sqlite-repository.js";

/** A human team member; their agents all act under this identity. */
export type User = {
  id: string;
  name: string;
  /** From better-auth's admin plugin; `'admin'` gates the admin console. */
  role?: string | null;
};

/**
 * The production identity resolver, backed by better-auth. Agents present
 * `Authorization: Bearer <api-key>` (verified via `verifyApiKey`); humans carry
 * a session cookie (resolved via `getSession`). Neither → `null` → 401 upstream.
 * The repository is touched only to resolve a key's owner into name/role.
 */
export class BetterAuthAuthenticator {
  constructor(
    private readonly auth: Auth,
    private readonly repo: SqliteRepository,
  ) {}

  async authenticate(request: IncomingMessage): Promise<User | null> {
    const bearer = extractBearerToken(request.headers.authorization);
    if (bearer !== null) return this.fromApiKey(bearer);
    return this.fromSession(request);
  }

  /** Resolve an agent's Bearer API key to its owning User, or null. */
  private async fromApiKey(key: string): Promise<User | null> {
    const result = await this.auth.api.verifyApiKey({ body: { key } });
    if (!result.valid || !result.key) return null;
    // `referenceId` is the owning User's id; resolve name/role from `user`.
    return this.repo.getUser(result.key.referenceId);
  }

  /** Resolve a human's session cookie to the signed-in User, or null. */
  private async fromSession(request: IncomingMessage): Promise<User | null> {
    const session = await this.auth.api.getSession({
      headers: toHeaders(request.headers),
    });
    if (!session?.user) return null;
    return {
      id: session.user.id,
      name: session.user.name,
      role: (session.user as { role?: string | null }).role ?? null,
    };
  }
}

/** Parse `Authorization: Bearer <token>`; null for a missing/malformed header. */
function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/** Lift Node's `IncomingHttpHeaders` into the Fetch `Headers` better-auth reads. */
function toHeaders(incoming: IncomingMessage["headers"]): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}
