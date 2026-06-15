import type { Authenticator } from "./auth/authenticator.js";
import type { Auth } from "./auth/better-auth.js";
import type { Clock } from "./platform/clock.js";
import type { PostRepository } from "./store/repository.js";

/**
 * The full set of injected dependencies the server is built from. Every seam
 * the application depends on appears here as an interface; `buildServer(deps)`
 * (server.ts) is the only composition root, and tests pass the same shape with
 * fakes. Later slices add the embedder and search/trust wiring; the IdGen seam
 * is consumed by the repository, so it is injected there at construction rather
 * than appearing here.
 *
 * The Clock appears here too: the `query` tool needs "now" to render Post ages
 * in the provenance line, independent of the repository that also consumes it.
 */
export type Deps = {
  auth: Authenticator;
  /**
   * The better-auth instance itself (see ADR 0003). Distinct from `auth`, the
   * {@link Authenticator} seam the tools resolve identity through: this is the
   * concrete server whose `handler` mounts the auth/session routes on the Hono
   * app and whose `api` the admin/review endpoints call in later slices. Kept in
   * Deps so `buildServer` — the one composition root — wires the routes.
   */
  authInstance: Auth;
  repo: PostRepository;
  clock: Clock;
};
