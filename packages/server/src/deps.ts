import type { Authenticator } from "./auth/authenticator.js";
import type { Auth } from "./auth/better-auth.js";
import type { Clock } from "./platform/clock.js";
import type { IdGen } from "./platform/id-gen.js";
import type { ControlPlaneRepository } from "./store/control-plane-repository.js";
import type { TeamRepositoryResolver } from "./store/team-repository-resolver.js";

// The injected dependencies the server is built from; tests pass the same shape
// with fakes.
export type Deps = {
  auth: Authenticator;
  // The concrete better-auth instance, distinct from the `auth` seam: its
  // `handler` mounts the auth/session routes and its `api` is called by the
  // admin/review endpoints.
  authInstance: Auth;
  // Identity/tenancy reads over the control-plane DB (getUser, team routing).
  controlPlane: ControlPlaneRepository;
  // Opens-and-caches one corpus repository per Team, over the shared embedder.
  // A request resolves its repo from the caller's `teamId` via this resolver —
  // there is no single shared corpus `repo` anymore (ADR 0007/0008).
  teams: TeamRepositoryResolver;
  clock: Clock;
  // Mints prefixed opaque ids (e.g. a new Team's id) for control-plane writes.
  idGen: IdGen;
};
