import { createAuthClient } from "better-auth/react";

/**
 * The single better-auth React client for the console. Do NOT call
 * `createAuthClient` elsewhere, or you get a second client with its own session
 * store that won't see sign-in/out from this one. `baseURL` uses
 * `window.location.origin` (not a bare relative path) because better-auth 1.6.x
 * rejects a base URL without a protocol.
 */
export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/auth`,
});

/** Reactive session hook: `data` is `null` when signed out, `{ user, session }` when signed in. */
export const { useSession } = authClient;
