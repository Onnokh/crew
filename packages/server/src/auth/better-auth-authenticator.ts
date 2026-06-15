import type { IncomingMessage } from "node:http";
import type { User } from "../core/user.js";
import type { PostRepository } from "../store/repository.js";
import type { Auth } from "./better-auth.js";
import type { Authenticator } from "./authenticator.js";

/**
 * The production {@link Authenticator}, backed by better-auth (see ADR 0003). It
 * resolves both caller shapes through one seam, and the rest of the application
 * never learns which one a given request used:
 *
 * - **Agents** present `Authorization: Bearer <api-key>`. We hand the raw key to
 *   the api-key plugin's `verifyApiKey`; a valid key carries a `referenceId` set
 *   to the owning User's id (a User may hold many keys — they all resolve to one
 *   identity, which is why trust counts Users, not keys). We verify the Bearer
 *   key ourselves rather than letting the plugin read its default `x-api-key`
 *   header, so the wire contract stays the Bearer scheme the agent plugin uses.
 * - **Humans (admins)** carry a better-auth session cookie. We replay the request
 *   headers into `getSession`, which returns the User (with `role`) directly.
 *
 * A request with neither a recognised key nor a valid session resolves to
 * `null`; the caller (the FastMCP `authenticate` hook, a page guard) turns that
 * into a 401. The repository is used only to resolve an api key's owner into a
 * display name/role — authentication itself never touches the store.
 */
export class BetterAuthAuthenticator implements Authenticator {
  constructor(
    private readonly auth: Auth,
    private readonly repo: PostRepository,
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
    // `referenceId` is the api-key plugin's owner link; we set it to the User id
    // at mint time, so it resolves the same identity for every one of a User's
    // keys. Read name/role from the canonical `user` table for attribution.
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
      role: session.user.role ?? null,
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
