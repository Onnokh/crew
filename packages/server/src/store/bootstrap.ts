import type { ControlPlaneRepository } from "./control-plane-repository.js";
import type { Clock } from "../platform/clock.js";
import type { IdGen } from "../platform/id-gen.js";

/** The fixed ids/names for the auto-created default Org and Team on a fresh deploy. */
export const DEFAULT_ORG_NAME = "Default Org";
export const DEFAULT_TEAM_NAME = "Default Team";

/**
 * Ensure a default Org + Team exist and return the default Team id. Idempotent:
 * on a DB that already has a Team, returns the first Team unchanged (a later boot
 * never creates a second default). A fresh deploy thus boots with one Team that
 * the seeded admin (and console-created Users) are made members of.
 */
export function ensureDefaultOrgAndTeam(
  controlPlane: ControlPlaneRepository,
  idGen: IdGen,
  clock: Clock,
): string {
  const existing = controlPlane.firstTeam();
  if (existing !== null) return existing.id;

  const now = clock.now();
  const orgId = idGen.next("org");
  const teamId = idGen.next("team");
  controlPlane.createOrg(orgId, DEFAULT_ORG_NAME, now);
  controlPlane.createTeam(
    { id: teamId, orgId, name: DEFAULT_TEAM_NAME },
    now,
  );
  return teamId;
}
