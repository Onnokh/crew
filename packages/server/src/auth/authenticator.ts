import type { IncomingMessage } from "node:http";
import type { User } from "../core/user.js";

/**
 * The single seam the whole application depends on for identity.
 *
 * Returns the authenticated {@link User} for a request, or `null` when the
 * request carries no valid credential. The week-one implementation parses a
 * static bearer token; the v1.1 implementation is backed by better-auth's
 * OAuth Provider plugin (see ADR 0002). Callers never know which is wired —
 * `buildServer(deps)` is the only place an implementation is named.
 */
export type Authenticator = {
  authenticate(request: IncomingMessage): Promise<User | null>;
};
