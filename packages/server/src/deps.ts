import type { BetterAuthAuthenticator } from "./auth/better-auth-authenticator.js";
import type { Auth } from "./auth/better-auth.js";
import type { SqliteRepository } from "./store/sqlite-repository.js";

// The injected dependencies the server is built from; tests pass the same shape
// with fakes.
export type Deps = {
  // The concrete better-auth instance: its `handler` mounts the auth/session
  // routes and its `api` is called by the admin/review endpoints.
  authInstance: Auth;
  // The production identity resolver, backed by better-auth.
  auth: BetterAuthAuthenticator;
  repo: SqliteRepository;
};
