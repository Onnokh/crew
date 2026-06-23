import type { Database } from "better-sqlite3";
import type { Team } from "../core/team.js";
import type { User } from "../core/user.js";

/**
 * The identity/tenancy read+bootstrap seam over the CONTROL-PLANE database
 * (ADR 0008). It is the source of truth for which Users exist, which Team each
 * belongs to, and the org/team/membership rows the router walks. Per-team corpus
 * DBs hold no `user` table, so author-name resolution comes through here.
 *
 * Author resolution returns `null` for an unknown id; callers render `"unknown"`.
 */
export class ControlPlaneRepository {
  constructor(private readonly raw: Database) {}

  /** Look up a User by id in better-auth's `user` table, or null. Read-only name lookup. */
  getUser(id: string): User | null {
    // Quoted identifier because `user` is a SQL keyword.
    const row = this.raw
      .prepare(`SELECT id, name, role FROM "user" WHERE id = ?`)
      .get(id) as { id: string; name: string; role: string | null } | undefined;
    return row ? { id: row.id, name: row.name, role: row.role } : null;
  }

  /**
   * Resolve the Team a User belongs to via their (1:1) membership, or null when
   * the User has no membership — a credential that resolves to no Team is then
   * rejected upstream (401).
   */
  getTeamForUser(userId: string): Team | null {
    const row = this.raw
      .prepare(
        `SELECT t.id AS id, t.org_id AS orgId, t.name AS name,
                t.intake_domains AS intakeDomains
           FROM team_membership m
           JOIN team t ON t.id = m.team_id
          WHERE m.user_id = ?`,
      )
      .get(userId) as TeamRow | undefined;
    return row ? rowToTeam(row) : null;
  }

  /** Insert an Org row (idempotent on id). */
  createOrg(id: string, name: string, createdAt: number): void {
    this.raw
      .prepare(
        `INSERT OR IGNORE INTO org (id, name, created_at) VALUES (?, ?, ?)`,
      )
      .run(id, name, createdAt);
  }

  /** Insert a Team row (idempotent on id). New Teams start with an empty
   * intake allowlist (accept everything); set it later via
   * {@link setTeamIntakeDomains}. */
  createTeam(team: Omit<Team, "intakeDomains">, createdAt: number): void {
    this.raw
      .prepare(
        `INSERT OR IGNORE INTO team (id, org_id, name, intake_domains, created_at)
         VALUES (?, ?, ?, '[]', ?)`,
      )
      .run(team.id, team.orgId, team.name, createdAt);
  }

  /**
   * Rename a Team — a DISPLAY-ONLY update of `name`. The Team's opaque id (which
   * names its corpus DB file) is never touched, so a rename never moves storage
   * or affects routing (ADR 0007). No-op if the id does not exist.
   */
  renameTeam(id: string, name: string): void {
    this.raw.prepare(`UPDATE team SET name = ? WHERE id = ?`).run(name, id);
  }

  /**
   * Replace a Team's intake allowlist (the git hosts it accepts Posts from).
   * Stored as a JSON array; an empty array restores "accept everything". No-op
   * if the id does not exist.
   */
  setTeamIntakeDomains(id: string, domains: string[]): void {
    this.raw
      .prepare(`UPDATE team SET intake_domains = ? WHERE id = ?`)
      .run(JSON.stringify(domains), id);
  }

  /** Every Team, newest first. The default Team (earliest) sorts last. */
  listTeams(): Array<Team & { createdAt: number }> {
    const rows = this.raw
      .prepare(
        `SELECT id, org_id AS orgId, name, intake_domains AS intakeDomains,
                created_at AS createdAt FROM team
          ORDER BY created_at DESC, id DESC`,
      )
      .all() as Array<TeamRow & { createdAt: number }>;
    return rows.map((r) => ({ ...rowToTeam(r), createdAt: r.createdAt }));
  }

  /** Look up a single Team by id, or null. */
  getTeam(id: string): Team | null {
    const row = this.raw
      .prepare(
        `SELECT id, org_id AS orgId, name, intake_domains AS intakeDomains
           FROM team WHERE id = ?`,
      )
      .get(id) as TeamRow | undefined;
    return row ? rowToTeam(row) : null;
  }

  /**
   * Delete a Team row by id. Callers must ensure the Team has no memberships
   * first (`team_membership.team_id` FK-references `team(id)` with no cascade);
   * the corpus DB file is dropped separately by the resolver. No-op if the id
   * does not exist.
   */
  deleteTeam(id: string): void {
    this.raw.prepare(`DELETE FROM team WHERE id = ?`).run(id);
  }

  /** How many Users belong to a Team (its membership count). */
  teamMemberCount(teamId: string): number {
    const row = this.raw
      .prepare(
        `SELECT COUNT(*) AS n FROM team_membership WHERE team_id = ?`,
      )
      .get(teamId) as { n: number };
    return row.n;
  }

  /**
   * Bind a User to a Team (their single Membership). Idempotent: a User already
   * having a membership is left untouched (the 1:1 PRIMARY KEY on user_id).
   */
  addMembership(userId: string, teamId: string, createdAt: number): void {
    this.raw
      .prepare(
        `INSERT OR IGNORE INTO team_membership (user_id, team_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .run(userId, teamId, createdAt);
  }

  /**
   * Remove a User's (1:1) Membership row. Idempotent — a no-op when the User has
   * no membership. Part of deleting a User: the membership must go before the
   * better-auth `user` row, since `team_membership.user_id` FK-references it with
   * no cascade. The User's authored Posts/events live in the team corpus and are
   * NOT touched here (their author simply stops resolving → "unknown").
   */
  removeMembership(userId: string): void {
    this.raw
      .prepare(`DELETE FROM team_membership WHERE user_id = ?`)
      .run(userId);
  }

  /** The first Team by creation order, or null on a fresh DB. Used to find the default Team. */
  firstTeam(): Team | null {
    const row = this.raw
      .prepare(
        `SELECT id, org_id AS orgId, name, intake_domains AS intakeDomains
           FROM team ORDER BY created_at ASC, id ASC LIMIT 1`,
      )
      .get() as TeamRow | undefined;
    return row ? rowToTeam(row) : null;
  }
}

/** A `team` row as the SELECTs above alias it (intake_domains is raw JSON). */
type TeamRow = {
  id: string;
  orgId: string;
  name: string;
  /** JSON array of host strings; NULL on rows predating migration 0002. */
  intakeDomains: string | null;
};

/** Map a raw team row to a {@link Team}, parsing the intake allowlist JSON
 * defensively — a NULL (pre-migration) or malformed value reads as empty. */
function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    intakeDomains: parseDomains(row.intakeDomains),
  };
}

function parseDomains(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((d): d is string => typeof d === "string")
      : [];
  } catch {
    return [];
  }
}
