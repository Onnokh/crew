import type { IncomingMessage } from "node:http";
import type { User } from "../core/user.js";

/**
 * The single seam the whole application depends on for identity.
 *
 * Returns the authenticated {@link User} for a request, or `null` when the
 * request carries no valid credential. The production implementation is
 * {@link BetterAuthAuthenticator}, backed by better-auth: it resolves an agent's
 * Bearer API key OR a human's session cookie to the same {@link User} (see
 * ADR 0003, amending 0002). Callers never know which shape a request used —
 * `buildServer(deps)` is the only place an implementation is named.
 */
export type Authenticator = {
  authenticate(request: IncomingMessage): Promise<User | null>;
};
