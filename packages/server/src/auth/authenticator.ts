import type { IncomingMessage } from "node:http";
import type { User } from "../core/user.js";

/**
 * The single identity seam. Returns the authenticated {@link User} for a
 * request, or `null` when it carries no valid credential (Bearer API key or
 * session cookie). Production impl is {@link BetterAuthAuthenticator}.
 */
export type Authenticator = {
  authenticate(request: IncomingMessage): Promise<User | null>;
};
