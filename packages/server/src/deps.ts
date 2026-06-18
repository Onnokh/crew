import type { Authenticator } from "./auth/authenticator.js";
import type { Auth } from "./auth/better-auth.js";
import type { Clock } from "./platform/clock.js";
import type { PostRepository } from "./store/repository.js";

// The injected dependencies the server is built from; tests pass the same shape
// with fakes.
export type Deps = {
  auth: Authenticator;
  // The concrete better-auth instance, distinct from the `auth` seam: its
  // `handler` mounts the auth/session routes and its `api` is called by the
  // admin/review endpoints.
  authInstance: Auth;
  repo: PostRepository;
  clock: Clock;
};
