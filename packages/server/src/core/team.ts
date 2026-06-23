/** The unit of knowledge isolation: owns its own corpus DB and its Users. */
export type Team = {
  /** Opaque id; also names the per-team corpus SQLite file (ADR 0007). */
  id: string;
  orgId: string;
  name: string;
  /**
   * Git hosts this Team accepts Posts from (e.g. `git.indicia.nl`). Empty means
   * accept everything — the default. The `post` tool matches a Post's repo host
   * against this list and rejects off-list origins (see guardrails/intake.ts).
   */
  intakeDomains: string[];
};
