import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { User } from "../core/user.js";
import type { Authenticator } from "./authenticator.js";

/**
 * Resolves a presented bearer token to a User, or null if no User owns it.
 *
 * The token arrives already hashed — this seam never sees raw tokens, and the
 * raw token is never stored (see TECH.md "Auth"). A later slice backs this with
 * the SQLite `users` table; until then any lookup function satisfies it.
 */
export type TokenStore = {
  findUserByTokenHash(tokenHash: string): Promise<User | null>;
};

/**
 * Week-one Authenticator: parse `Authorization: Bearer <token>`, hash the
 * token, and look the hash up via the injected {@link TokenStore}. Returns
 * null for a missing or malformed header so the caller can reject uniformly.
 */
export class TokenAuthenticator implements Authenticator {
  constructor(private readonly tokens: TokenStore) {}

  async authenticate(request: IncomingMessage): Promise<User | null> {
    const token = extractBearerToken(request.headers.authorization);
    if (token === null) return null;
    return this.tokens.findUserByTokenHash(hashToken(token));
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  if (!match) return null;
  const token = match[1]?.trim();
  return token ? token : null;
}
