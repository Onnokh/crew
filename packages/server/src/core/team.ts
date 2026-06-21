/** The unit of knowledge isolation: owns its own corpus DB and its Users. */
export type Team = {
  /** Opaque id; also names the per-team corpus SQLite file (ADR 0007). */
  id: string;
  orgId: string;
  name: string;
};
