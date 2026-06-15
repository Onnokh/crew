import { createAuthClient } from "better-auth/react";

/**
 * The single better-auth React client for the whole console — the one place auth
 * talks to the server (see ADR 0003/0004). Every page imports `authClient` from
 * here; do NOT call `createAuthClient` anywhere else, or you get a second client
 * with its own session store that won't see sign-in/out from this one.
 *
 * `baseURL` is the current origin + `/api/auth`, kept SAME-ORIGIN on purpose: in
 * production the SPA is served by the very Hono app that mounts better-auth (one
 * port — see ADR 0004), and in dev Vite proxies `/api` to the server (see
 * vite.config.ts). Either way the session cookie is first-party, so no CORS and
 * no `credentials` juggling. We resolve `window.location.origin` rather than pass
 * a bare relative path because better-auth 1.6.x rejects a base URL without a
 * protocol (it constructs a `URL` from it eagerly).
 *
 * Exposed surface (better-auth 1.6.x):
 *  - `authClient.signIn.email({ email, password })` — establishes the session.
 *  - `authClient.signOut()` — clears it.
 *  - `authClient.useSession()` — the reactive `{ data, isPending, error }` hook
 *    re-exported below as {@link useSession} for components and the route guard.
 */
export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/auth`,
});

/**
 * Reactive session hook. `data` is `null` when signed out, `{ user, session }`
 * when signed in; `isPending` is true on the first load while the session is
 * fetched. The route guard and the signed-in chrome both read this.
 */
export const { useSession } = authClient;
