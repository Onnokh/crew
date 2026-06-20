import type { IncomingMessage } from "node:http";
import type { Principal } from "../core/user.js";

/**
 * The single identity seam. Returns the authenticated {@link Principal} — the
 * User AND the one Team their credential routes to — for a request, or `null`
 * when it carries no valid credential (Bearer API key or session cookie) OR
 * resolves to no Team. Production impl is {@link BetterAuthAuthenticator}.
 */
export type Authenticator = {
  authenticate(request: IncomingMessage): Promise<Principal | null>;
};
